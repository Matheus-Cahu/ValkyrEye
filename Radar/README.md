# Radar

Firmware dos pontos de detecção (ESP32 LoRa, HC-SR04 e servo) e da central
receptora LoRa. O [contrato lógico do alerta](../docs/ARQUITETURA.md) define os
campos que devem chegar ao Raspberry Pi.

Primeira entrega: medir e filtrar distâncias, calibrar o ângulo do servo,
transmitir alertas com número de sequência e confirmar o recebimento na central.
