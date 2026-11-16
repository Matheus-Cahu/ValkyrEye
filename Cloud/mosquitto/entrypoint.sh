#!/bin/sh
# Gera o arquivo de senhas a partir das variáveis de ambiente e inicia o broker.
set -eu

: "${MQTT_RADAR_PASSWORD:?Defina MQTT_RADAR_PASSWORD no arquivo .env}"
: "${MQTT_API_PASSWORD:?Defina MQTT_API_PASSWORD no arquivo .env}"

DATA=/mosquitto/data
umask 077
rm -f "$DATA/passwd"
mosquitto_passwd -c -b "$DATA/passwd" radar "$MQTT_RADAR_PASSWORD"
mosquitto_passwd -b "$DATA/passwd" valkyreye-api "$MQTT_API_PASSWORD"
# Cópia local da ACL para que o dono e as permissões sejam os do broker.
cp /mosquitto/config/acl "$DATA/acl"
chown -R mosquitto:mosquitto "$DATA"

exec mosquitto -c /mosquitto/config/mosquitto.conf
