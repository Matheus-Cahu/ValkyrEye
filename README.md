# ValkyrEye

Sistema experimental de monitoramento com pontos de detecção, rádio LoRa, um
Raspberry Pi, um drone com câmera e análise de imagens na nuvem.

## Como funciona

1. Cada ponto de detecção usa um ESP32 com LoRa, um HC-SR04 e um servo para
   observar um setor e emitir um alerta quando identifica uma mudança relevante
   de distância.
2. Um segundo ESP32 com LoRa recebe o alerta e o entrega ao Raspberry Pi.
3. O Raspberry Pi recebe o alerta por USB/serial, associa o identificador do
   sensor a um setor calibrado e prepara a missão do DJI Tello.
4. O Tello decola automaticamente de uma base fixa, observa o setor e pousa.
   O Raspberry Pi envia as imagens
   e os metadados para análise na nuvem.
5. A análise classifica o conteúdo como pessoa, animal, outro objeto ou
   inconclusivo, sempre preservando as imagens para revisão quando necessário.

O HC-SR04 mede distância na direção em que está apontado. Ele não fornece uma
posição exata nem identifica o tipo de objeto; a câmera e a análise de imagens
são necessárias para essas etapas.

## Organização

- [Radar](Radar/README.md): detecção, mensagens LoRa e receptor da central.
- [Drone](Drone/README.md): coordenação de voo e captura no Raspberry Pi.
- [Cloud](Cloud/README.md): recebimento, armazenamento e análise das imagens.
- [Arquitetura e contrato de eventos](docs/ARQUITETURA.md): fluxo, dados e
  sequência de implementação.

O projeto está na fase de definição da arquitetura. A direção de observação e
as condições de voo ainda precisam ser calibradas no local.
