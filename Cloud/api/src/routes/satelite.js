import { Router } from "express";
import { satelliteImage } from "../earthengine.js";
import { badRequest } from "../http.js";

export const RAIO_MIN = 100;
export const RAIO_MAX = 20000;

function numberParam(value, name, min, max) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < min || number > max) {
    throw badRequest(`${name} deve ser um número entre ${min} e ${max}`);
  }
  return number;
}

export const satelite = Router();

/**
 * GET /satelite?lat=&lon=&raio=
 * PNG quadrado, norte para cima, cobrindo `raio` metros para cada lado do ponto.
 */
satelite.get("/", async (req, res) => {
  const lat = numberParam(req.query.lat, "lat", -85, 85);
  const lon = numberParam(req.query.lon, "lon", -180, 180);
  const raio = Math.round(numberParam(req.query.raio, "raio", RAIO_MIN, RAIO_MAX));
  const png = await satelliteImage(lat, lon, raio);
  res
    .type("png")
    .set("Cache-Control", "private, max-age=3600")
    .set("X-Fonte", "Copernicus Sentinel-2 via Google Earth Engine")
    .send(png);
});
