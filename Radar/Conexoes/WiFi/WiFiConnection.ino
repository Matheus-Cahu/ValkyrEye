#include <WiFi.h>

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

void setup() {
  Serial.begin(115200);
  delay(1500);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.setMinSecurity(WIFI_AUTH_OPEN);
  Serial.println("ValkyrEye | Arquivo de conexao Wi-Fi");
}

void loop() {
  if (!connectToSelectedNetwork()) return;
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
    delay(100);
  }
  Serial.println("Conexao perdida. Reiniciando a busca.");
}
