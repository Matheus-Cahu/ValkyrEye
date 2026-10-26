# Arquitetura inicial

## Fluxo de dados

```text
HC-SR04 + servo
      │
ESP32 do sensor ── LoRa ──> ESP32 da central ── USB/serial ──> Raspberry Pi
                                                                      │
                                                    Wi-Fi: DJI Tello + câmera
                                                                      │
                                                        imagens + metadados
                                                                      │
                                                            serviço na nuvem
```

O ESP32 do sensor filtra leituras instáveis antes de emitir um alerta. A central
confirma o recebimento pelo rádio. O Raspberry Pi elimina alertas duplicados,
consulta o cadastro de sensores e coordena a resposta. A central envia um
registro por linha via USB/serial. O formato físico da mensagem LoRa e a taxa
serial serão fechados com os modelos de ESP32 escolhidos.

### Perfil de voo inicial: Tello comum

O Raspberry Pi se conecta ao Wi-Fi do Tello. O SDK usa comandos UDP para
decolagem, rotação, pouso e ativação do vídeo. O primeiro perfil assume uma
base de decolagem fixa e uma orientação inicial reproduzível. Cada sensor é
associado a um **setor visível a partir dessa base** e a uma rotação relativa
calibrada. O Tello decola, gira, captura imagens da câmera frontal e pousa.

O Tello comum não oferece navegação por coordenadas GPS nem câmera em gimbal.
Uma direção geográfica registrada no sensor, sozinha, não vira uma rota de voo
até o alvo. Para observar sensores fora da vista da base serão necessários
outro método de localização e rotas validadas, ou outro drone. Recursos de
mission pads pertencem ao Tello EDU e não são pressupostos aqui.

Como o Pi usa Wi-Fi para controlar e receber vídeo do Tello, o upload à nuvem
precisa de outra conexão (Ethernet, celular ou segundo adaptador Wi-Fi) ou ser
feito depois do pouso e da troca de rede.

## Cadastro necessário para cada sensor

| Campo | Uso |
| --- | --- |
| `sensor_id` | Identifica o ponto de detecção. |
| Latitude, longitude e altura | Localiza o sensor no mapa. |
| Orientação da montagem | Converte o ângulo do servo em direção geográfica. |
| Limites de varredura | Define o setor observado. |
| Limiares de distância e tempo | Reduz disparos por uma leitura isolada. |
| Setor visível da base | Permite verificar se a câmera do Tello pode observar o local. |
| Rotação relativa do Tello | Orienta a câmera após decolagem na base fixa. |

O ângulo do servo é relativo à montagem. Para apontar a câmera, o Pi precisa
combinar esse ângulo com a orientação calibrada do sensor e com a orientação
inicial do Tello na base. A distância ultrassônica fornece apenas uma
estimativa de alcance; ela não permite definir um ponto exato para o alvo.

## Contrato lógico do alerta (versão 1)

Este é o conteúdo lógico a transportar. O empacotamento para LoRa pode ser
compactado depois, sem alterar o significado dos campos.

```json
{
  "version": 1,
  "sensor_id": "radar-01",
  "sequence": 42,
  "servo_angle_deg": 73,
  "distance_cm": 185,
  "baseline_cm": 310,
  "battery_mv": 4050
}
```

- A chave `sensor_id` + `sequence` identifica um alerta para deduplicação.
- A central acrescenta o horário de recebimento. O sensor só fornece horário
  próprio se houver sincronização de relógio.
- A central confirma o recebimento ao sensor. O sensor pode retransmitir após
  um prazo, sempre com o mesmo número de sequência.
- A aplicação registra intensidade do sinal e erros de comunicação na central
  quando esses dados estiverem disponíveis.
- Mensagens devem ter validação de versão, tamanho e integridade. A proteção
  contra alertas falsificados será definida junto com o formato do rádio.

## Resposta a um alerta

1. **Receber:** validar mensagem, registrar evento e descartar duplicatas.
2. **Conferir:** checar sensor cadastrado, distância, setor, alertas recentes,
   condições do drone e disponibilidade do operador.
3. **Preparar missão:** verificar se o sensor corresponde a um setor visível da
   base e carregar a rotação relativa calibrada para o Tello.
4. **Voar automaticamente:** após condições de segurança e habilitação do
   sistema, decolar, girar, registrar imagens e pousar. Um operador deve poder
   interromper a operação e comandar o pouso.
5. **Capturar:** associar fotos ou vídeos ao alerta, à posição do drone e ao
   horário da captura. No Tello, as imagens vêm do fluxo de vídeo recebido
   pelo Pi, não de um cartão no drone.
6. **Enviar:** guardar localmente até a nuvem confirmar o recebimento; repetir
   uploads interrompidos sem criar eventos duplicados.
7. **Analisar:** classificar como `pessoa`, `animal`, `outro` ou `inconclusivo`,
   com pontuação e revisão humana para resultados incertos.

Estados sugeridos para o coordenador do Pi: `DESARMADO`, `OCIOSO`,
`ALERTA_RECEBIDO`, `VALIDANDO`, `DECOLANDO`, `OBSERVANDO`, `POUSANDO`, `ENVIANDO`
e `FINALIZADO`/`FALHA`. Um segundo alerta durante um voo entra em fila ou é
agregado ao evento em curso; ele não inicia outra decolagem simultânea.

## Condições para operação em campo

Antes de cada voo, conferir bateria, conexão e estado do Tello, área permitida,
obstáculos, iluminação, vento e disponibilidade de uma área livre para pouso.
O sistema inicia desarmado; uma pessoa habilita a operação no local, e os
alertas válidos passam a disparar decolagens automáticas. Bateria baixa, perda
de conexão ou falha de câmera impedem uma nova decolagem. Uma falha durante o
voo exige tentativa de pouso e alerta ao operador; não se deve presumir um
retorno por GPS. A parada de emergência corta os motores e só deve ser usada
quando pousar não for possível.

O upload e a classificação são posteriores à captura: uma indisponibilidade da
nuvem não deve impedir o retorno do drone. Imagens e resultados precisam de
regras de acesso e retenção adequadas ao local de operação.

## Sequência de implementação

1. **Radar:** leituras com filtragem, calibração do servo e alerta LoRa com
   confirmação e retransmissão.
2. **Central:** receptor LoRa, validação da mensagem e passagem ao Pi.
3. **Pi sem voo:** cadastro de sensores, deduplicação, registro de eventos e
   simulação do fluxo completo com imagens de exemplo.
4. **Drone:** conectar o Pi ao Tello, capturar vídeo, calibrar a base e os
   setores, e validar uma missão curta em ambiente controlado antes de armar
   as decolagens por alerta.
5. **Nuvem:** receber imagens, registrar metadados e acrescentar classificação.
6. **Campo:** calibrar setores, ajustar limiares e medir falsos alertas, alcance
   do rádio, tempo de resposta e qualidade das imagens.

## Decisões pendentes

- Modelo do ESP32 LoRa e frequência/região de operação.
- Modelo exato do Tello (comum ou EDU) e versão do firmware.
- Identificação da porta USB/serial e velocidade configurada na central.
- Posição da base, orientação inicial, setores visíveis e área de pouso.
- Conexão de rede para upload após ou durante o voo.
- Provedor de nuvem e destino de armazenamento das imagens.

## Referências do Tello

- [Documentação oficial do Tello SDK 1.3](https://dl-cdn.ryzerobotics.com/downloads/tello/20180910/Tello%20SDK%20Documentation%20EN_1.3.pdf): comandos de voo e vídeo.
- [Manual oficial do Tello](https://dl-cdn.ryzerobotics.com/downloads/Tello/20180404/Tello_User_Manual_V1.2_EN.pdf): posicionamento visual e condições de operação.
- [DJITelloPy](https://github.com/damiafuentes/DJITelloPy): biblioteca Python que implementa o SDK e distingue recursos do Tello EDU.
