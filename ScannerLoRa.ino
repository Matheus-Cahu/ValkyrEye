#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>
#include <ESP32Servo.h>

// Heltec WiFi LoRa 32 V3. Match the frequency to your board and receiver.
const float frequenciaLoRa = 915.0f;  // Example in MHz
const int DisparoPulso = 5;
const int RecebePulso = 6;  // Use a voltage divider for the 5 V ECHO signal.
const int servoPin = 4;
const int alcanceMaximo = 400;  // cm
const int delta = 3;           // cm below the calibrated distance
const int setores = 7;

int distancias[setores];
Servo scanner;
SX1262 radio = new Module(8, 14, 12, 13);  // NSS, DIO1, RESET, BUSY

float medirSetor(int setor) {
  scanner.write(setor * 30);
  delay(300);

  digitalWrite(DisparoPulso, LOW);
  delayMicroseconds(2);
  digitalWrite(DisparoPulso, HIGH);
  delayMicroseconds(10);
  digitalWrite(DisparoPulso, LOW);

  unsigned long tempoEco = pulseIn(RecebePulso, HIGH, 30000);
  if (tempoEco == 0) return alcanceMaximo;

  return tempoEco * 0.0343f / 2.0f;
}

void verificarSetor(int setor) {
  float distancia = medirSetor(setor);
  if (distancia < distancias[setor] - delta) {
    char aviso[32];
    snprintf(aviso, sizeof(aviso), "DETECT,%d,%.1f", setor, distancia);

    int estado = radio.transmit(aviso);
    if (estado == RADIOLIB_ERR_NONE) {
      Serial.println(aviso);
    } else {
      Serial.printf("Erro no envio LoRa: %d\n", estado);
    }
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(DisparoPulso, OUTPUT);
  pinMode(RecebePulso, INPUT);

  SPI.begin(9, 11, 10, 8);  // SCK, MISO, MOSI, NSS
  int estado = radio.begin(frequenciaLoRa, 125.0, 7, 5,
      RADIOLIB_SX126X_SYNC_WORD_PRIVATE, 10, 8, 1.8);
  if (estado != RADIOLIB_ERR_NONE) {
    Serial.printf("Erro ao iniciar LoRa: %d\n", estado);
    while (true) delay(1000);
  }

  scanner.attach(servoPin);
  for (int i = 0; i < setores; i++) {
    float distancia = medirSetor(i);
    distancias[i] = distancia > alcanceMaximo ? alcanceMaximo : distancia;
  }
}

void loop() {
  for (int i = 0; i < setores; i++) {
    verificarSetor(i);
  }
  for (int i = setores - 2; i >= 0; i--) {
    verificarSetor(i);
  }
  delay(500);
}
