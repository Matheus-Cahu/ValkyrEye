import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { fetchOcorrencias, fetchRadares, updateOcorrencia, updateRadar } from "./api";
import RadarMap from "./components/RadarMap";
import Toast from "./components/Toast";
import { satelliteRadius, useGeolocation, useSatelliteImage } from "./useSatellite";

const REFRESH_MS = 10_000;

function useRadares() {
  const [state, setState] = useState({ radares: [], error: null, updatedAt: null, loading: true });
  // Incrementado a cada alteração local; descarta consultas iniciadas antes
  // dela, que trariam a posição antiga de volta.
  const revision = useRef(0);

  useEffect(() => {
    let controller;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const startedAt = revision.current;
      try {
        const radares = await fetchRadares(controller.signal);
        if (startedAt !== revision.current) return;
        setState({ radares, error: null, updatedAt: new Date(), loading: false });
      } catch (err) {
        if (err.name === "AbortError") return;
        // Mantém os últimos radares conhecidos e mostra o erro.
        setState((prev) => ({ ...prev, error: err.message, loading: false }));
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller?.abort();
    };
  }, []);

  /** Grava a posição de um radar e aplica a resposta da API na lista. */
  const moveRadar = useCallback(async (id, position) => {
    revision.current += 1;
    const saved = await updateRadar(id, position);
    revision.current += 1;
    setState((prev) => ({
      ...prev,
      radares: prev.radares.map((r) => (r.id === saved.id ? saved : r)),
    }));
    return saved;
  }, []);

  return { ...state, moveRadar };
}

/** Situação da camada de satélite, enquanto ela não pode ser mostrada. */
function satelliteNote(location, image) {
  if (location.status === "pending") return "Obtendo sua localização para a imagem de satélite…";
  if (location.status === "error") return `Sem imagem de satélite: ${location.error}`;
  if (image.status === "error") return `Sem imagem de satélite: ${image.error}`;
  if (image.status === "loading" && !image.href) return "Carregando imagem de satélite…";
  return null;
}

/**
 * Ocorrências ainda não analisadas, agrupadas por radar (mais recentes
 * primeiro), consultadas junto com os radares.
 */
function useOcorrenciasPendentes() {
  const [pending, setPending] = useState([]);
  // Mesmo papel do contador em useRadares: ignora consultas anteriores a
  // uma marcação local, que trariam de volta ocorrências já analisadas.
  const revision = useRef(0);

  useEffect(() => {
    let controller;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const startedAt = revision.current;
      try {
        const rows = await fetchOcorrencias({ analisada: false, limit: 500 }, controller.signal);
        if (startedAt === revision.current) setPending(rows);
      } catch (err) {
        // Mantém os alertas conhecidos; a falha da API já aparece no status.
        if (err.name !== "AbortError") console.error(err);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller?.abort();
    };
  }, []);

  const markAnalyzed = useCallback(async (ids) => {
    revision.current += 1;
    const results = await Promise.allSettled(
      ids.map((id) => updateOcorrencia(id, { analisada: true }))
    );
    revision.current += 1;
    const done = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
    setPending((prev) => prev.filter((o) => !done.has(o.id)));
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  }, []);

  const byRadar = useMemo(() => {
    const groups = {};
    for (const o of pending) (groups[o.radar] ??= []).push(o);
    return groups;
  }, [pending]);

  return { byRadar, markAnalyzed };
}

function Status({ radares, error, updatedAt, loading }) {
  if (loading) return <span className="status">Carregando…</span>;
  if (error) {
    return (
      <span className="status status-error" role="alert">
        Falha ao consultar a API: {error}
      </span>
    );
  }
  return (
    <span className="status">
      {radares.length} {radares.length === 1 ? "radar" : "radares"} · atualizado às{" "}
      {updatedAt.toLocaleTimeString("pt-BR")}
    </span>
  );
}

export default function App() {
  const { moveRadar, ...state } = useRadares();
  const ocorrencias = useOcorrenciasPendentes();
  // { key, message, undo?: { id, from }, busy?, error? }
  const [toast, setToast] = useState(null);
  // Estável entre renders, para a atualização periódica não reiniciar o prazo do aviso.
  const dismissToast = useCallback(() => setToast(null), []);

  const [showSatellite, setShowSatellite] = useState(true);
  const location = useGeolocation();
  const maxDistance = Math.max(0, ...state.radares.map((r) => r.distancia));
  const satellite = useSatelliteImage(
    location.coords,
    satelliteRadius(maxDistance),
    showSatellite && !state.loading
  );
  const note = showSatellite ? satelliteNote(location, satellite) : null;

  const reposition = async (id, from, to) => {
    await moveRadar(id, to);
    setToast({ key: Date.now(), message: `${id} reposicionado.`, undo: { id, from } });
  };

  const undoReposition = async () => {
    const { id, from } = toast.undo;
    setToast((t) => ({ ...t, busy: true, error: null }));
    try {
      await moveRadar(id, from);
      setToast({ key: Date.now(), message: `Reposicionamento de ${id} desfeito.` });
    } catch (err) {
      setToast((t) => ({ ...t, busy: false, error: err.message }));
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          {/* Decorativo: o nome ao lado já identifica o projeto. */}
          <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="" width="32" height="32" />
          <h1>ValkyrEye</h1>
        </div>
        <Status {...state} />
      </header>
      <main className="app-map">
        <RadarMap
          radares={state.radares}
          onReposition={reposition}
          alerts={ocorrencias.byRadar}
          onMarkAnalyzed={ocorrencias.markAnalyzed}
          satellite={showSatellite && satellite.href ? satellite : null}
          satelliteControl={{
            active: showSatellite,
            busy: showSatellite && (location.status === "pending" || satellite.status === "loading"),
            onToggle: () => setShowSatellite((v) => !v),
          }}
        />
        {note && (
          <p className="map-note" role="status">
            {note}
          </p>
        )}
        {showSatellite && satellite.href && (
          <p className="map-attribution">
            Contém dados modificados do Copernicus Sentinel · Google Earth Engine
          </p>
        )}
        {!state.loading && !state.error && state.radares.length === 0 && (
          <p className="map-empty">Nenhum radar cadastrado.</p>
        )}
        <ul className="map-legend" aria-label="Legenda">
          <li><span className="legend-house" aria-hidden="true" />Servidor central</li>
          <li><span className="legend-radar" aria-hidden="true" />Radar</li>
          <li><span className="legend-alert" aria-hidden="true" />Ocorrência pendente</li>
          <li><span className="legend-north" aria-hidden="true" />Norte</li>
        </ul>
        {toast && (
          <Toast
            key={toast.key}
            message={toast.message}
            error={toast.error}
            action={toast.undo && { label: "Desfazer reposicionamento", onClick: undoReposition }}
            busy={toast.busy}
            onDismiss={dismissToast}
          />
        )}
      </main>
    </div>
  );
}
