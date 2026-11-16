# Radar

## Sketches disponíveis

- `ScannerLoRa.ino`: leitura do HC-SR04 com servo e envio dos alertas LoRa.
- `ReceptorLoRa.ino`: receptor simples que imprime os alertas na serial.
- [ReceptorLoRaAPI](Conexoes/ReceptorLoRaAPI/README.md): central integrada,
  recebe LoRa e envia as leituras reais à API por Wi-Fi/HTTP.
- [WiFiConnection](Conexoes/WiFi/README.md): teste de conexão e envio de dados
  simulados à API.

Para a central conectada à plataforma, carregue o sketch
`Conexoes/ReceptorLoRaAPI/ReceptorLoRaAPI.ino`. Cada sketch deve ser compilado
separadamente; os arquivos ScannerLoRa e ReceptorLoRa na raiz precisam ficar
em pastas de mesmo nome quando abertos como projetos na IDE do Arduino.

Firmware dos pontos de detecção (ESP32 LoRa, HC-SR04 e servo) e da central
receptora LoRa. O [contrato lógico do alerta](../docs/ARQUITETURA.md) define os
campos que devem chegar ao Raspberry Pi.

Primeira entrega: medir e filtrar distâncias, calibrar o ângulo do servo,
transmitir alertas com número de sequência e confirmar o recebimento na central.
