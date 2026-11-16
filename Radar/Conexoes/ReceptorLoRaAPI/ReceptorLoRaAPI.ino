#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <cmath>

// Mesmo hardware e parametros de Radar/ScannerLoRa.ino.
const float frequenciaLoRa = 915.0f;
SX1262 radio = new Module(8, 14, 12, 13);
const char* RADAR_ID = "radar-01";  // Cadastre este ID na plataforma.
const unsigned long SEND_INTERVAL_MS = 10000;
const UBaseType_t QUEUE_SIZE = 32;

struct Detection {
  int sector;
  float distance;
  unsigned long receivedMs;
};

QueueHandle_t detectionQueue;
String apiBaseUrl;

int apiRequest(const char* method, const String& path, const String& payload = "") {
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, apiBaseUrl + path)) {
    Serial.println("Falha ao iniciar HTTP.");
    return -1;
  }
  http.setConnectTimeout(3000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  Serial.printf("%s %s%s\n", method, apiBaseUrl.c_str(), path.c_str());
  if (payload.length()) Serial.println(payload);
  int status = String(method) == "GET" ? http.GET() : http.POST(payload);
  Serial.printf("HTTP: %d\n", status);
  if (status > 0) Serial.println(http.getString().substring(0, 1000));
  else Serial.println(HTTPClient::errorToString(status));
  http.end();
  return status;
}


// Apenas esta tarefa acessa o radio. HTTP e entrada serial rodam no loop().
void receiveLoRaTask(void*) {
  while (true) {
    String message;
    int status = radio.receive(message);
    if (status == RADIOLIB_ERR_NONE) {
      message.trim();
      Detection detection;
      char extra;
      if (message.length() <= 64 &&
          sscanf(message.c_str(), "DETECT,%d,%f%c",
                 &detection.sector, &detection.distance, &extra) == 2 &&
          detection.sector >= 0 && detection.sector <= 6 &&
          std::isfinite(detection.distance) && detection.distance > 0) {
        detection.receivedMs = millis();
        Serial.printf("LoRa | Setor %d (%d graus) | Distancia %.1f cm\n",
          detection.sector, detection.sector * 30, detection.distance);
        if (xQueueSend(detectionQueue, &detection, 0) != pdPASS) {
          Serial.println("FILA CHEIA: leitura nova descartada.");
        }
      } else {
        Serial.print("Mensagem LoRa invalida: ");
        Serial.println(message);
      }
    } else if (status != RADIOLIB_ERR_RX_TIMEOUT) {
      Serial.printf("Erro na recepcao LoRa: %d\n", status);
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

bool checkRadar() {
  int status = apiRequest("GET", String("/radares/") + RADAR_ID);
  if (status == 404) {
    Serial.printf("Cadastre o radar %s na plataforma com distancia/direcao reais.\n", RADAR_ID);
  }
  return status == 200;
}

void sendQueuedDetection() {
  Detection detection;
  if (xQueuePeek(detectionQueue, &detection, 0) != pdPASS) return;
  if (!checkRadar()) return;

  // Uma ocorrencia por deteccao; nao preenche setores sem leituras recebidas.
  String payload = String("{\"radar\":\"") + RADAR_ID +
    "\",\"analisada\":false,\"assinatura\":[[" +
    String(detection.sector * 30) + "," + String(detection.distance, 1) + "]]}";
  Serial.printf("Fila: %u | Idade da leitura: %lu ms\n",
    (unsigned int)uxQueueMessagesWaiting(detectionQueue),
    millis() - detection.receivedMs);
  int status = apiRequest("POST", "/ocorrencias", payload);
  if (status == 201) {
    xQueueReceive(detectionQueue, &detection, 0);
    Serial.println("Deteccao LoRa salva na plataforma.");
  } else if (status >= 400 && status < 500 && status != 408 && status != 429) {
    // Erros permanentes nao devem bloquear toda a fila.
    xQueueReceive(detectionQueue, &detection, 0);
    Serial.println("Leitura descartada apos rejeicao HTTP. Confira a resposta.");
  } else {
    Serial.println("Leitura mantida na fila; nova tentativa em 10 s.");
  }
}

String readSerialLine() {
  String value;
  while (true) {
    if (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') return value;
      if (c != '\r' && value.length() < 128) value += c;
    }
    delay(10);
  }
}

bool connectToSelectedNetwork() {
  WiFi.disconnect();
  delay(200);
  Serial.println("Procurando redes Wi-Fi...");
  int count = WiFi.scanNetworks();
  if (count <= 0) {
    Serial.println("Nenhuma rede encontrada ou erro na varredura.");
    WiFi.scanDelete();
    delay(5000);
    return false;
  }

  Serial.println("Numero | Rede | Sinal | Seguranca");
  for (int i = 0; i < count; i++) {
    Serial.printf("%d | %s | %d dBm | %s\n", i + 1,
      WiFi.SSID(i).c_str(), WiFi.RSSI(i),
      WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "Aberta" : "Protegida");
  }

  Serial.println("Digite o numero da rede e pressione Enviar:");
  String choice = readSerialLine();
  choice.trim();
  bool digitsOnly = choice.length() > 0;
  for (unsigned int i = 0; i < choice.length(); i++) {
    if (choice[i] < '0' || choice[i] > '9') digitsOnly = false;
  }
  long number = choice.toInt();
  if (!digitsOnly || number < 1 || number > count) {
    Serial.println("Escolha invalida.");
    WiFi.scanDelete();
    return false;
  }

  int index = number - 1;
  String ssid = WiFi.SSID(index);
  bool secured = WiFi.encryptionType(index) != WIFI_AUTH_OPEN;
  WiFi.scanDelete();
  String password;
  if (secured) {
    Serial.println("Digite a senha da rede e pressione Enviar:");
    password = readSerialLine();
  } else {
    Serial.println("Rede aberta; senha nao necessaria.");
  }

  Serial.printf("Conectando a %s...\n", ssid.c_str());
  if (secured) WiFi.begin(ssid.c_str(), password.c_str());
  else WiFi.begin(ssid.c_str());

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFalha na conexao. Confira a senha e o sinal.");
    delay(2000);
    return false;
  }

  Serial.println("\nConectado!");
  Serial.print("IP da placa: ");
  Serial.println(WiFi.localIP());
  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());
  return true;
}

bool validNumber(const String& value, unsigned long maximum) {
  if (value.length() == 0 || value.length() > 5) return false;
  unsigned long number = 0;
  for (unsigned int i = 0; i < value.length(); i++) {
    if (value[i] < '0' || value[i] > '9') return false;
    number = number * 10 + (value[i] - '0');
    if (number > maximum) return false;
  }
  return true;
}

bool validServerAddress(const String& address) {
  int colon = address.indexOf(':');
  if (colon < 1 || address.indexOf(':', colon + 1) != -1) return false;
  String port = address.substring(colon + 1);
  if (!validNumber(port, 65535) || port.toInt() == 0) return false;
  String ip = address.substring(0, colon);
  int start = 0;
  for (int octet = 0; octet < 4; octet++) {
    int end = ip.indexOf('.', start);
    if (octet < 3 && end == -1) return false;
    if (octet == 3) {
      if (end != -1) return false;
      end = ip.length();
    }
    String part = ip.substring(start, end);
    if (part.length() > 3 || !validNumber(part, 255)) return false;
    start = end + 1;
  }
  return true;
}

void requestServerAddress() {
  while (true) {
    Serial.println("Digite somente IP:porta, por exemplo 10.56.119.91:3000:");
    String address = readSerialLine();
    address.trim();
    if (!validServerAddress(address)) {
      Serial.println("Endereco invalido. Use quatro numeros de 0 a 255 e porta de 1 a 65535.");
      continue;
    }
    apiBaseUrl = "http://" + address;
    Serial.print("Servidor configurado: ");
    Serial.println(apiBaseUrl);
    return;
  }
}


void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("ValkyrEye | Receptor LoRa -> API HTTP");
  detectionQueue = xQueueCreate(QUEUE_SIZE, sizeof(Detection));
  if (detectionQueue == nullptr) {
    Serial.println("Falha ao criar fila.");
    while (true) delay(1000);
  }

  SPI.begin(9, 11, 10, 8);
  int status = radio.begin(frequenciaLoRa, 125.0, 7, 5,
    RADIOLIB_SX126X_SYNC_WORD_PRIVATE, 10, 8, 1.8);
  if (status != RADIOLIB_ERR_NONE) {
    Serial.printf("Erro ao iniciar LoRa: %d\n", status);
    while (true) delay(1000);
  }
  if (xTaskCreate(receiveLoRaTask, "LoRaRX", 8192, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("Falha ao criar tarefa LoRa.");
    while (true) delay(1000);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.setMinSecurity(WIFI_AUTH_OPEN);
}

void loop() {
  if (!connectToSelectedNetwork()) return;
  requestServerAddress();
  unsigned long lastSend = millis() - SEND_INTERVAL_MS;
  Serial.println("Digite R e Enviar para reconfigurar Wi-Fi e servidor.");
  while (WiFi.status() == WL_CONNECTED) {
    if (Serial.available()) {
      String command = readSerialLine();
      command.trim();
      if (command.equalsIgnoreCase("R")) {
        WiFi.disconnect();
        return;
      }
    }
    if (millis() - lastSend >= SEND_INTERVAL_MS) {
      if (uxQueueMessagesWaiting(detectionQueue) > 0) sendQueuedDetection();
      lastSend = millis();
    }
    delay(20);
  }
  Serial.println("Wi-Fi desconectado. Leituras LoRa continuam entrando na fila.");
}
