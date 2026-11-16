#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>

const float frequenciaLoRa = 915.0f;  // Same frequency as ScannerLoRa.ino
SX1262 radio = new Module(8, 14, 12, 13);  // Heltec WiFi LoRa 32 V3

void setup() {
  Serial.begin(9600);
  SPI.begin(9, 11, 10, 8);

  int estado = radio.begin(frequenciaLoRa, 125.0, 7, 5,
      RADIOLIB_SX126X_SYNC_WORD_PRIVATE, 10, 8, 1.8);
  if (estado != RADIOLIB_ERR_NONE) {
    Serial.printf("Erro ao iniciar LoRa: %d\n", estado);
    while (true) delay(1000);
  }

  Serial.println("Aguardando deteccoes...");
}

void loop() {
  String mensagem;
  int estado = radio.receive(mensagem);
  if (estado != RADIOLIB_ERR_NONE) {
    if (estado != RADIOLIB_ERR_RX_TIMEOUT) {
      Serial.printf("Erro na recepcao LoRa: %d\n", estado);
    }
    return;
  }

  int setor;
  float distancia;
  char extra;
  if (sscanf(mensagem.c_str(), "DETECT,%d,%f%c", &setor, &distancia, &extra) == 2
      && setor >= 0 && setor <= 6) {
    Serial.printf("Setor %d (%d graus) | Distancia: %.1f cm\n",
        setor, setor * 30, distancia);
  }
}
