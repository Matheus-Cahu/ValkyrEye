-- Executado pelo PostgreSQL apenas na primeira inicialização do volume.

CREATE TABLE radares (
    -- Mesmo identificador enviado pelo sensor (sensor_id), ex.: "radar-01".
    id        TEXT PRIMARY KEY
              CHECK (id ~ '^[A-Za-z0-9_-]{1,64}$'),
    -- Posição do radar em relação ao servidor central (coordenadas polares):
    -- distância em metros.
    distancia DOUBLE PRECISION NOT NULL CHECK (distancia > 0),
    -- Direção em graus a partir do norte, no sentido horário (90 = leste).
    direcao   DOUBLE PRECISION NOT NULL CHECK (direcao >= 0 AND direcao < 360)
);

CREATE TABLE ocorrencias (
    id          BIGSERIAL PRIMARY KEY,
    radar       TEXT NOT NULL
                REFERENCES radares (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
    analisada   BOOLEAN NOT NULL DEFAULT false,
    -- Vetor de tuplas [ângulo_graus, distância_cm], ex.: [[45, 310], [50, 185]].
    -- O formato de cada tupla é validado pela API.
    assinatura  JSONB NOT NULL CHECK (jsonb_typeof(assinatura) = 'array')
);

CREATE INDEX ocorrencias_radar_timestamp_idx ON ocorrencias (radar, "timestamp" DESC);
CREATE INDEX ocorrencias_pendentes_idx ON ocorrencias ("timestamp") WHERE NOT analisada;
