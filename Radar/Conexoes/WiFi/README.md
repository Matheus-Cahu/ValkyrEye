# Conexão Wi-Fi

`WiFiConnection.ino` é o sketch Arduino para buscar redes próximas e conectar
a uma rede escolhida pelo Monitor Serial. Se a rede for protegida, o sketch
solicita a senha antes de iniciar a conexão.

Use a placa correspondente à revisão Heltec na IDE do Arduino e abra o Monitor
Serial em **115200 baud**, com final de linha **Nova linha**. Envie o número da
rede desejada; depois da conexão, o sketch mostra o IP e o gateway da placa.
Envie `R` para procurar redes e selecionar outra.

Este arquivo testa somente a conexão Wi-Fi. Ele não consulta `/health` nem envia
eventos à API.
