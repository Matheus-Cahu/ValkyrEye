import { readFile } from "node:fs/promises";
import ee from "@google/earthengine";
import { HttpError } from "./http.js";

// Imagens de satélite via Google Earth Engine, autenticado com uma conta de
// serviço. A chave nunca sai do servidor: o navegador recebe só o PNG.
//
// GEE_PRIVATE_KEY_FILE  caminho do JSON da chave da conta de serviço
// GEE_PROJECT           projeto do Google Cloud registrado no Earth Engine
//                       (padrão: project_id da chave)

const EARTH_RADIUS_M = 6378137;
const IMAGE_SIZE_PX = 1024;
const LOOKBACK_MONTHS = 12;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 32;

let ready = null;

function initialize() {
  ready ??= (async () => {
    const file = process.env.GEE_PRIVATE_KEY_FILE;
    if (!file) {
      throw new HttpError(503, "Imagens de satélite não configuradas (GEE_PRIVATE_KEY_FILE)");
    }
    let key;
    try {
      key = JSON.parse(await readFile(file, "utf8"));
    } catch (err) {
      throw new HttpError(503, `Chave do Earth Engine ilegível em ${file}: ${err.message}`);
    }
    const project = process.env.GEE_PROJECT || key.project_id;
    await new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(
        key,
        () => ee.initialize(null, null, resolve, reject, null, project),
        reject
      );
    }).catch((err) => {
      throw new HttpError(502, `Falha ao autenticar no Earth Engine: ${err?.message ?? err}`);
    });
  })().catch((err) => {
    ready = null; // permite nova tentativa após corrigir a configuração
    throw err;
  });
  return ready;
}

/**
 * Quadrado de lado 2·raio metros centrado em (lat, lon), em graus.
 * Em Web Mercator ele continua quadrado, então a imagem tem pixels quadrados
 * e escala uniforme em metros (aproximação válida para alguns quilômetros).
 */
function squareAround(lat, lon, raio) {
  const dLat = ((raio / EARTH_RADIUS_M) * 180) / Math.PI;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/** Mosaico Sentinel-2 (10 m) sem nuvens, mediana dos últimos meses. */
function sentinelComposite(region) {
  const end = ee.Date(Date.now());
  const start = end.advance(-LOOKBACK_MONTHS, "month");
  // Classes da camada SCL: 3 sombra de nuvem, 8–10 nuvens e cirros.
  const maskClouds = (image) => {
    const scl = image.select("SCL");
    const clear = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10));
    // Reamostra antes do median(): o mosaico perde a projeção nativa (10 m) e
    // passa a ter pixels de 1°, que um resample posterior borraria por inteiro.
    return image.updateMask(clear).resample("bilinear");
  };
  return ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(region)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
    .map(maskClouds)
    .select(["B4", "B3", "B2"])
    .median();
}

function thumbnailUrl(lat, lon, raio) {
  const region = ee.Geometry.Rectangle(squareAround(lat, lon, raio), null, false);
  const image = sentinelComposite(region).visualize({
    bands: ["B4", "B3", "B2"],
    min: 0,
    max: 3000,
    gamma: 1.3,
  });
  return new Promise((resolve, reject) => {
    image.getThumbURL(
      {
        region,
        crs: "EPSG:3857",
        dimensions: `${IMAGE_SIZE_PX}x${IMAGE_SIZE_PX}`,
        format: "png",
      },
      (url, error) => (error ? reject(new Error(error)) : resolve(url))
    );
  });
}

async function download(lat, lon, raio) {
  await initialize();
  let url;
  try {
    url = await thumbnailUrl(lat, lon, raio);
  } catch (err) {
    throw new HttpError(502, `Earth Engine: ${err.message}`);
  }
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(502, `Earth Engine respondeu ${response.status} ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// Promessas em andamento ou concluídas, por posição arredondada (~10 m) e raio.
const cache = new Map();

/** PNG de IMAGE_SIZE_PX² cobrindo o quadrado de lado 2·raio em torno do ponto. */
export function satelliteImage(lat, lon, raio) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${raio}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.png;

  const png = download(Number(lat.toFixed(4)), Number(lon.toFixed(4)), raio);
  cache.delete(key);
  cache.set(key, { png, expires: Date.now() + CACHE_TTL_MS });
  png.catch(() => {
    if (cache.get(key)?.png === png) cache.delete(key);
  });
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return png;
}
