#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <esp_system.h>

String apiBaseUrl;
const char* MOCK_RADAR_ID = "mock-radar-01";
const unsigned long SEND_INTERVAL_MS = 10000;

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

bool prepareMockRadar() {
  String path = String("/radares/") + MOCK_RADAR_ID;
  int status = apiRequest("GET", path);
  if (status == 200) return true;
  if (status != 404) return false;
  // Cadastro dedicado ao teste. Distancia e direcao da base sao ficticias.
  String payload = String("{\"id\":\"") + MOCK_RADAR_ID +
    "\",\"distancia\":100,\"direcao\":0}";
  return apiRequest("POST", "/radares", payload) == 201;
}

void sendMockData() {
  String signature = "[";
  for (int angle = 0; angle <= 180; angle += 30) {
    if (angle > 0) signature += ",";
    unsigned long distance = 20 + esp_random() % 381;
    signature += "[" + String(angle) + "," + String(distance) + "]";
  }
  signature += "]";
  // A API define timestamp no servidor. O ID distingue os dados simulados.
  String payload = String("{\"radar\":\"") + MOCK_RADAR_ID +
    "\",\"analisada\":false,\"assinatura\":" + signature + "}";
  Serial.println("Enviando dados SIMULADOS: angulo em graus, distancia em cm.");
  int status = apiRequest("POST", "/ocorrencias", payload);
  if (status == 201) Serial.println("Ocorrencia simulada salva na plataforma.");
  else Serial.println("Envio sem confirmacao. Confira a resposta HTTP acima.");
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
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.setMinSecurity(WIFI_AUTH_OPEN);
  Serial.println("ValkyrEye | Wi-Fi e envio de dados SIMULADOS");
}

void loop() {
  if (!connectToSelectedNetwork()) return;
  requestServerAddress();
  bool radarReady = false;
  // Permite a primeira tentativa imediatamente apos conectar.
  unsigned long lastSend = millis() - SEND_INTERVAL_MS;
  Serial.println("Digite R e pressione Enviar para selecionar outra rede.");
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
      if (!radarReady) radarReady = prepareMockRadar();
      if (radarReady) sendMockData();
      else Serial.println("Cadastro do radar mock indisponivel; nova tentativa em 10 s.");
      lastSend = millis();
    }
    delay(100);
  }
  Serial.println("Conexao perdida. Reiniciando a busca.");
}
