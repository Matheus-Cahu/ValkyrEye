import { Router } from "express";
import { pool } from "../db.js";
import {
  badRequest,
  boolean,
  notFound,
  optional,
  parseBody,
  positiveIntegerParam,
  radarId,
  timestamp,
} from "../http.js";

const MAX_LEITURAS = 1000;

/** Assinatura: vetor de tuplas [ângulo_graus, distância_cm]. */
function assinatura(value, name) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LEITURAS) {
    throw badRequest(`${name} deve ser um vetor com 1 a ${MAX_LEITURAS} tuplas`);
  }
  value.forEach((tupla, i) => {
    const valid =
      Array.isArray(tupla) &&
      tupla.length === 2 &&
      tupla.every((n) => typeof n === "number" && Number.isFinite(n)) &&
      tupla[0] >= 0 && tupla[0] <= 360 &&
      tupla[1] >= 0;
    if (!valid) {
      throw badRequest(
        `${name}[${i}] deve ser [ângulo entre 0 e 360, distância não negativa]`
      );
    }
  });
  return value;
}

const fields = {
  radar: radarId,
  timestamp: optional(timestamp),
  analisada: optional(boolean),
  assinatura,
};

const COLUMNS = 'id, radar, "timestamp", analisada, assinatura';

export const ocorrencias = Router();

// Filtros opcionais: ?radar=radar-01&analisada=false&limit=50&offset=0
ocorrencias.get("/", async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.radar !== undefined) {
    params.push(radarId(req.query.radar, "radar"));
    conditions.push(`radar = $${params.length}`);
  }
  if (req.query.analisada !== undefined) {
    if (!["true", "false"].includes(req.query.analisada)) {
      throw badRequest("analisada deve ser true ou false");
    }
    params.push(req.query.analisada === "true");
    conditions.push(`analisada = $${params.length}`);
  }
  const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw badRequest("limit deve estar entre 1 e 500");
  }
  if (!Number.isInteger(offset) || offset < 0) throw badRequest("offset inválido");
  params.push(limit, offset);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM ocorrencias ${where} ` +
      `ORDER BY "timestamp" DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

ocorrencias.get("/:id", async (req, res) => {
  const id = positiveIntegerParam(req.params.id);
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM ocorrencias WHERE id = $1`, [id]);
  if (!rows.length) throw notFound("Ocorrência não encontrada");
  res.json(rows[0]);
});

ocorrencias.post("/", async (req, res) => {
  const o = parseBody(req.body, fields);
  const { rows } = await pool.query(
    'INSERT INTO ocorrencias (radar, "timestamp", analisada, assinatura) ' +
      "VALUES ($1, COALESCE($2, now()), COALESCE($3, false), $4) " +
      `RETURNING ${COLUMNS}`,
    [o.radar, o.timestamp ?? null, o.analisada ?? null, JSON.stringify(o.assinatura)]
  );
  res.status(201).location(`/ocorrencias/${rows[0].id}`).json(rows[0]);
});

ocorrencias.patch("/:id", async (req, res) => {
  const id = positiveIntegerParam(req.params.id);
  const changes = parseBody(req.body, fields, { partial: true });
  // Nomes de coluna vêm da lista fixa de campos, nunca do cliente.
  const columns = Object.keys(changes);
  const assignments = columns.map((column, i) => `"${column}" = $${i + 2}`);
  const values = columns.map((column) =>
    column === "assinatura" ? JSON.stringify(changes[column]) : changes[column]
  );
  const { rows } = await pool.query(
    `UPDATE ocorrencias SET ${assignments.join(", ")} WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, ...values]
  );
  if (!rows.length) throw notFound("Ocorrência não encontrada");
  res.json(rows[0]);
});

ocorrencias.delete("/:id", async (req, res) => {
  const id = positiveIntegerParam(req.params.id);
  const { rowCount } = await pool.query("DELETE FROM ocorrencias WHERE id = $1", [id]);
  if (!rowCount) throw notFound("Ocorrência não encontrada");
  res.status(204).end();
});
