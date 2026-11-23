# Radar

## Sketches disponíveis

- `ScannerLoRa.ino`: leitura do HC-SR04 com servo e envio dos alertas LoRa.
- [receptor](receptor/README.md): central integrada, recebe os alertas LoRa,
  imprime-os na serial e envia as leituras reais à API por Wi-Fi/HTTP.
- [WiFiConnection](Conexoes/WiFi/README.md): teste de conexão e envio de dados
  simulados à API.

Para a central conectada à plataforma, carregue o sketch
`receptor/receptor.ino`. Cada sketch deve ser compilado
separadamente; o arquivo ScannerLoRa na raiz precisa ficar
em uma pasta de mesmo nome quando abertos como projetos na IDE do Arduino.

Firmware dos pontos de detecção (ESP32 LoRa, HC-SR04 e servo) e da central
receptora LoRa. O [contrato lógico do alerta](../docs/ARQUITETURA.md) define os
campos que devem chegar ao Raspberry Pi.

Primeira entrega: medir e filtrar distâncias, calibrar o ângulo do servo,
transmitir alertas com número de sequência e confirmar o recebimento na central.
