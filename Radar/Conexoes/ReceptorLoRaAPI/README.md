# Receptor LoRa com envio à API

Sketch integrado da central **Heltec WiFi LoRa 32 V3 (SX1262)**. Recebe as
mensagens de `Radar/ScannerLoRa.ino`, imprime setor/ângulo/distância no Monitor
Serial e envia as leituras reais por HTTP à plataforma.

## Preparação na IDE do Arduino

1. Instale a biblioteca **RadioLib 7.4.0** no Gerenciador de Bibliotecas. Essa
   versão usa a assinatura de `radio.begin(...)` adotada pelo scanner atual.
2. Selecione **Heltec WiFi LoRa 32 V3** e a porta da placa receptora.
3. Abra **ReceptorLoRaAPI.ino**, nesta pasta de mesmo nome, compile e carregue.
4. Abra o Monitor Serial em **115200 baud**, com final de linha **Nova linha**.
5. Escolha a rede pelo número e informe a senha quando solicitada. Use uma
   rede aberta ou com senha pessoal; redes empresariais exigem outra configuração.
6. Informe somente `IP:porta`, por exemplo `10.56.119.91:3000`. O sketch monta
   o prefixo `http://` e acrescenta as rotas automaticamente.
7. Cadastre na plataforma o radar **radar-01**, com sua distância e direção
   reais. Ajuste `RADAR_ID` no sketch caso o cadastro use outro identificador.
   O receptor verifica esse cadastro antes de enviar ocorrências.
8. Ligue a placa transmissora com o sketch ScannerLoRa e provoque uma detecção.
   Confira a mensagem LoRa na serial e HTTP **201** após o envio à plataforma.

Envie `R` no Monitor Serial para escolher outra rede e informar novamente o
servidor. SSID, senha e endereço são solicitados novamente após reiniciar.

## Mensagens e conversão

O rádio usa os mesmos parâmetros do scanner: 915 MHz, largura de banda 125 kHz,
SF7, CR 4/5, sync word privado, preâmbulo 8, TCXO 1,8 V. Confirme que a frequência
corresponde ao hardware de ambas as placas. Pinos da V3:

| Função | GPIO |
| --- | --- |
| NSS | 8 |
| SCK | 9 |
| MOSI | 10 |
| MISO | 11 |
| RESET | 12 |
| BUSY | 13 |
| DIO1 | 14 |

Exemplo recebido: `DETECT,2,85.4`. O setor 2 corresponde a 60 graus e a distância
é medida em centímetros. Mensagens fora do formato, setores fora de 0–6 ou
distâncias não finitas/não positivas são descartados. Para cada detecção válida:

```http
POST /ocorrencias
Content-Type: application/json
```

```json
{"radar":"radar-01","analisada":false,"assinatura":[[60,85.4]]}
```

Cada ocorrência contém somente o setor detectado. Os demais setores não são
inventados nem preenchidos com leituras antigas. O timestamp é atribuído pelo
servidor no momento da gravação, não no momento de recepção pelo rádio.

## Fila e limites

- Uma tarefa FreeRTOS recebe LoRa enquanto o loop principal trata Wi-Fi,
  configuração serial e HTTP. Não há requisições de rede dentro de interrupções.
- A fila armazena até **32 detecções em RAM**. Quando cheia, descarta leituras
  novas e registra `FILA CHEIA` na serial. Reiniciar a placa perde a fila.
- Envia uma detecção por ciclo, com intervalo de **10 segundos após a tentativa**.
  Se o transmissor gerar alertas mais rápido, a fila pode lotar. O parâmetro
  `SEND_INTERVAL_MS` controla essa espera.
- Cadastro indisponível mantém a leitura na fila. Falhas de transporte, HTTP
  408/429 e erros de servidor também mantêm a leitura para nova tentativa.
  Outros erros HTTP 4xx descartam a leitura rejeitada, com aviso na serial.
- Uma resposta perdida após gravação pode causar duplicata ao reenviar. A API
  e a mensagem LoRa atuais não têm identificador de evento para deduplicação.
- A mensagem LoRa atual não informa a origem: **este sketch pressupõe um único
  transmissor**, associado a `RADAR_ID`. Vários sensores exigirão incluir o ID
  no protocolo. Não há confirmação/retransmissão no protocolo de rádio atual.
- Pacotes de rádio podem se perder por interferência ou pelos intervalos de
  processamento; a tarefa separada não garante entrega.

O IP informado precisa estar acessível pela rede Wi-Fi da placa. No Docker do
projeto, a porta externa padrão da API é 8080; para usar 3000, ajuste
`API_PORT=3000` no `.env` do servidor e recrie o serviço da API.

## Validação

O contrato foi conferido com o código local da API e os parâmetros de rádio
com o scanner. A compilação passou para `esp32:esp32:heltec_wifi_lora_32_V3`,
com o pacote ESP32 3.3.12 e RadioLib 7.4.0: 957407 bytes de programa (28%) e
47396 bytes de memória global (14%). A RadioLib usada na checagem foi instalada
em uma pasta temporária; instale-a também na IDE para carregar o sketch.

O fluxo físico LoRa → Wi-Fi → API ainda precisa ser validado nas duas placas.
Não houve gravação de firmware nem envio de ocorrências ao servidor nesta checagem.
