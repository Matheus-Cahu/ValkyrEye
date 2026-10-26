# Drone

Coordenador no Raspberry Pi para receber alertas da central por USB/serial,
consultar o cadastro de sensores e comandar o DJI Tello por Wi-Fi. O primeiro
perfil de missão é decolar de uma base fixa, girar para um setor calibrado,
capturar imagens da câmera frontal e pousar automaticamente.

O Tello comum não fornece navegação por GPS para ir até a posição de um sensor.
O cadastro precisa guardar a rotação relativa a uma orientação de partida
reproduzível. Captura e upload acontecem no Pi; o envio à nuvem pode usar uma
segunda conexão de rede ou ocorrer após o pouso.

## Primeiro serviço do Pi

O arquivo [coordinator.py](coordinator.py) lê uma linha JSON por alerta da
central serial. Ele valida o sensor, elimina duplicatas em SQLite e calcula a
rotação do Tello a partir do ângulo do servo. Em voo, guarda fotos JPEG e um
arquivo JSON de metadados na pasta `outbox/`. O upload ainda depende da escolha
do serviço de nuvem.

No Raspberry Pi, instale as dependências de [requirements.txt](requirements.txt)
e copie [config.example.json](config.example.json) para `config.json`. Ajuste a
porta serial, cadastre cada sensor e calibre a orientação inicial da base.
`yaw_at_servo_zero_deg` é a rotação do Tello a partir dessa orientação quando
o servo está em `servo_zero_deg`; `servo_direction` vale `1` ou `-1` conforme o
sentido da montagem. Confirme também que o setor está visível pela câmera.

```bash
python -m pip install -r requirements.txt
cp config.example.json config.json
python coordinator.py --config config.json
```

Sem `--arm`, o serviço apenas simula e registra os alertas. Para habilitar
decolagens automáticas, defina `flight_area_ready: true` e `calibrated: true`
para os sensores verificados, conecte o Pi ao Wi-Fi do Tello e inicie:

```bash
python coordinator.py --config config.json --arm
```

Um alerta recebido em simulação fica registrado como simulado e não decola ao
ser retransmitido com o mesmo número de sequência. Para uma nova missão, o
sensor deve emitir um novo alerta. A central deve emitir uma linha UTF-8 JSON
por alerta, terminada em `\n`, com o [contrato definido aqui](../docs/ARQUITETURA.md).
O programa também aceita `--stdin` para simulação sem porta serial.

O fluxo e as condições de operação estão em [Arquitetura](../docs/ARQUITETURA.md).
