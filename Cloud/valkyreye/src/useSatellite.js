import { useEffect, useState } from "react";
import { fetchSatelite } from "./api";

/** Dentro dos limites aceitos pela rota /satelite (100 m a 20 km). */
const RAIO_MIN = 3000;
const RAIO_MAX = 20000;

/**
 * Raio da imagem: pelo menos 3 km ou o dobro do radar mais distante,
 * arredondado para 1, 2 ou 5 × 10^n, para que mover um radar só peça outra
 * imagem ao mudar de faixa.
 */
export function satelliteRadius(maxDistance) {
  const value = 2 * maxDistance;
  if (value <= RAIO_MIN) return RAIO_MIN;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value * (1 - 1e-9));
  return Math.min(RAIO_MAX, step * magnitude);
}

/**
 * Posição atual do navegador, lida uma vez. Supõe-se que o operador está
 * junto à central, então ela vira o centro do mapa.
 * status: "pending" | "ok" | "error"
 */
export function useGeolocation() {
  const [state, setState] = useState(() =>
    typeof navigator !== "undefined" && navigator.geolocation
      ? { status: "pending" }
      : { status: "error", error: "Navegador sem geolocalização" }
  );

  useEffect(() => {
    if (state.status !== "pending") return undefined;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (active) {
          setState({
            status: "ok",
            coords: { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy },
          });
        }
      },
      (err) => {
        if (!active) return;
        const messages = {
          1: "Permissão de localização negada",
          2: "Localização indisponível",
          3: "Tempo esgotado ao obter a localização",
        };
        setState({ status: "error", error: messages[err.code] ?? err.message });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 }
    );
    return () => {
      active = false;
    };
  }, [state.status]);

  return state;
}

/**
 * Imagem de satélite em torno de `coords` cobrindo `raio` metros para cada
 * lado. Devolve { status, href?, raio?, error? }; href é um object URL.
 */
export function useSatelliteImage(coords, raio, enabled) {
  const [state, setState] = useState({ status: "idle" });
  const lat = coords?.lat;
  const lon = coords?.lon;

  useEffect(() => {
    if (!enabled || lat === undefined) return undefined;
    const controller = new AbortController();
    let href;
    // Mantém a imagem anterior visível enquanto a nova carrega.
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    fetchSatelite({ lat, lon, raio }, controller.signal)
      .then((blob) => {
        href = URL.createObjectURL(blob);
        setState({ status: "ok", href, raio });
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", error: err.message });
      });
    return () => {
      controller.abort();
      // Libera a imagem quando outra a substitui; o próximo efeito a carrega.
      if (href) setTimeout(() => URL.revokeObjectURL(href), 60_000);
    };
  }, [lat, lon, raio, enabled]);

  return state;
}
