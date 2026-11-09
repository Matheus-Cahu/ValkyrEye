# Conexão Wi-Fi

`WiFiConnection.ino` é o sketch Arduino para buscar redes próximas e conectar
a uma rede escolhida pelo Monitor Serial. Se a rede for protegida, o sketch
solicita a senha antes de iniciar a conexão.

Use a placa correspondente à revisão Heltec na IDE do Arduino e abra o Monitor
Serial em **115200 baud**, com final de linha **Nova linha**. Envie o número da
rede desejada; depois da conexão, o sketch mostra o IP e o gateway da placa.
Envie `R` para procurar redes e selecionar outra.

## Envio de dados simulados

Após conectar ao Wi-Fi, o sketch solicita somente **IP:porta** no Monitor
Serial, por exemplo `10.56.119.91:3000`. O prefixo `http://` e as rotas ficam
no código. O endereço é validado e fica em RAM: será solicitado novamente
ao reiniciar ou escolher/reconectar uma rede. Ele consulta
`GET /radares/mock-radar-01` e, se receber 404, cadastra esse radar com
`POST /radares`. A distância 100 e a direção 0 desse cadastro são fictícias.

Envia imediatamente e depois a cada 10 segundos após terminar a tentativa:

```json
{"radar":"mock-radar-01","analisada":false,"assinatura":[[0,120],[30,85],[60,200],[90,50],[120,310],[150,190],[180,240]]}
```

A rota é `POST /ocorrencias`. Cada amostra tem sete ângulos entre 0 e 180 graus
e distâncias aleatórias entre 20 e 400 cm. O servidor define o horário. HTTP
201 confirma a criação; o Monitor Serial imprime o JSON enviado e a resposta.
Consulte `GET /ocorrencias?radar=mock-radar-01` para conferir os registros.

O contrato atual da API não tem um campo `simulated`; o identificador
`mock-radar-01` distingue os dados de teste e deve ser reservado para isso.
Cada envio cria uma nova ocorrência. Em falha de transporte, o sketch segue
para uma nova amostra no ciclo seguinte: ele não mantém fila nem garantia de
entrega. A entrada serial e a consulta HTTP são bloqueantes.

O Docker Compose publica porta 8080 por padrão. Para usar a porta externa 3000,
configure `API_PORT=3000` no `.env` do servidor e recrie o serviço `api`.
O IP privado precisa estar acessível pela rede da placa.

O sketch ainda precisa ser compilado na IDE e validado na placa; não foi feito
envio real ao servidor neste ambiente. Abra `WiFiConnection.ino` na IDE; caso
ela solicite uma pasta de mesmo nome, aceite a criação dessa pasta.
