import { Router } from "express";
import { pool } from "../db.js";
import { finiteNumber, notFound, parseBody, radarId } from "../http.js";

const fields = {
  id: radarId,
  distancia: finiteNumber({ min: 0, minExclusive: true }),
  direcao: finiteNumber({ min: 0, max: 360, maxExclusive: true }),
};
const { id: _id, ...updatableFields } = fields;

export const radares = Router();

radares.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, distancia, direcao FROM radares ORDER BY id"
  );
  res.json(rows);
});

radares.get("/:id", async (req, res) => {
  const id = radarId(req.params.id);
  const { rows } = await pool.query(
    "SELECT id, distancia, direcao FROM radares WHERE id = $1",
    [id]
  );
  if (!rows.length) throw notFound("Radar não encontrado");
  res.json(rows[0]);
});

radares.post("/", async (req, res) => {
  const radar = parseBody(req.body, fields);
  const { rows } = await pool.query(
    "INSERT INTO radares (id, distancia, direcao) VALUES ($1, $2, $3) " +
      "RETURNING id, distancia, direcao",
    [radar.id, radar.distancia, radar.direcao]
  );
  res.status(201).location(`/radares/${encodeURIComponent(radar.id)}`).json(rows[0]);
});

radares.patch("/:id", async (req, res) => {
  const id = radarId(req.params.id);
  const changes = parseBody(req.body, updatableFields, { partial: true });
  // Nomes de coluna vêm da lista fixa de campos, nunca do cliente.
  const columns = Object.keys(changes);
  const assignments = columns.map((column, i) => `${column} = $${i + 2}`);
  const { rows } = await pool.query(
    `UPDATE radares SET ${assignments.join(", ")} WHERE id = $1 ` +
      "RETURNING id, distancia, direcao",
    [id, ...columns.map((column) => changes[column])]
  );
  if (!rows.length) throw notFound("Radar não encontrado");
  res.json(rows[0]);
});

radares.delete("/:id", async (req, res) => {
  const id = radarId(req.params.id);
  const { rowCount } = await pool.query("DELETE FROM radares WHERE id = $1", [id]);
  if (!rowCount) throw notFound("Radar não encontrado");
  res.status(204).end();
});
