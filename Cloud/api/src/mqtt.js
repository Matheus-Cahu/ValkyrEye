import mqtt from "mqtt";
import { HttpError, badRequest, optional, parseBody, radarId, timestamp } from "./http.js";
import { assinatura, inserirOcorrencia } from "./routes/ocorrencias.js";

// Os radares publicam em valkyreye/radares/<id>/ocorrencias com QoS 1.
// Corpo: {"assinatura": [[ângulo, distância_cm], ...], "timestamp"?: ISO 8601}
const TOPIC = "valkyreye/radares/+/ocorrencias";
const TOPIC_PATTERN = /^valkyreye\/radares\/([^/]+)\/ocorrencias$/;
const fields = { timestamp: optional(timestamp), assinatura };

// Espera após uma falha temporária (ex.: banco fora do ar) antes de reconectar.
const RETRY_DELAY_MS = 5000;

// Violações que se repetiriam em qualquer nova tentativa.
const PERMANENT_PG_ERRORS = {
  "23503": "radar não cadastrado",
  "23514": "valor rejeitado pelo banco de dados",
  "22P02": "valor rejeitado pelo banco de dados",
};

let client = null;

export function mqttStatus() {
  if (!client) return "desativado";
  return client.connected ? "conectado" : "desconectado";
}

async function processar({ topic, payload }) {
  try {
    const radar = radarId(TOPIC_PATTERN.exec(topic)?.[1], "radar do tópico");
    let body;
    try {
      body = JSON.parse(payload.toString("utf8"));
    } catch {
      throw badRequest("JSON inválido");
    }
    const row = await inserirOcorrencia({ radar, ...parseBody(body, fields) });
    console.log(`MQTT: ocorrência ${row.id} do radar ${radar} registrada`);
  } catch (err) {
    const motivo =
      err instanceof HttpError ? err.message : PERMANENT_PG_ERRORS[err.code];
    if (!motivo) throw err;
    // Erro do conteúdo: confirma a mensagem para o broker não reenviá-la.
    console.warn(`MQTT: mensagem descartada em ${topic}: ${motivo}`);
  }
}

/** Conecta ao broker se MQTT_URL estiver definida; devolve o cliente ou null. */
export function startMqtt() {
  const url = process.env.MQTT_URL;
  if (!url) {
    console.log("MQTT_URL não definida: recebimento via MQTT desativado");
    return null;
  }

  client = mqtt.connect(url, {
    clientId: process.env.MQTT_CLIENT_ID || "valkyreye-api",
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    // Sessão persistente: mensagens publicadas com a API fora do ar ficam
    // guardadas no broker e chegam na reconexão.
    clean: false,
    reconnectPeriod: 5000,
    resubscribe: false, // a assinatura é refeita no evento "connect"
  });

  // O mqtt.js só envia o PUBACK depois deste callback, então a mensagem só é
  // confirmada ao broker quando já está no banco (ou foi descartada).
  // Em falha temporária a conexão é derrubada sem PUBACK; na reconexão o
  // broker reenvia a mensagem pendente (sessão persistente).
  client.handleMessage = (packet, callback) => {
    processar(packet).then(
      () => callback(),
      (err) => {
        console.error(
          `MQTT: falha ao gravar mensagem de ${packet.topic} (${err.code ?? err.message}); ` +
            `nova tentativa em ${RETRY_DELAY_MS / 1000} s`
        );
        setTimeout(() => client.stream?.destroy(), RETRY_DELAY_MS);
      }
    );
  };

  client.on("connect", () => {
    console.log(`MQTT: conectado a ${url}`);
    client.subscribe(TOPIC, { qos: 1 }, (err, granted) => {
      // Um erro com a conexão já fechada é refeito no próximo "connect".
      if ((err && client.connected) || granted?.some((g) => g.qos === 128)) {
        console.error(`MQTT: assinatura de ${TOPIC} recusada`, err ?? "");
      }
    });
  });
  client.on("error", (err) => console.error("MQTT:", err.message));
  client.on("offline", () => console.warn("MQTT: desconectado, tentando novamente"));

  return client;
}
