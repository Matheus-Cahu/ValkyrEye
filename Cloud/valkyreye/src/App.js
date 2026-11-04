import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { fetchRadares, updateRadar } from "./api";
import RadarMap from "./components/RadarMap";
import Toast from "./components/Toast";

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
  // { key, message, undo?: { id, from }, busy?, error? }
  const [toast, setToast] = useState(null);
  // Estável entre renders, para a atualização periódica não reiniciar o prazo do aviso.
  const dismissToast = useCallback(() => setToast(null), []);

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
        <h1>ValkyrEye</h1>
        <Status {...state} />
      </header>
      <main className="app-map">
        <RadarMap radares={state.radares} onReposition={reposition} />
        {!state.loading && !state.error && state.radares.length === 0 && (
          <p className="map-empty">Nenhum radar cadastrado.</p>
        )}
        <ul className="map-legend" aria-label="Legenda">
          <li><span className="legend-house" aria-hidden="true" />Servidor central</li>
          <li><span className="legend-radar" aria-hidden="true" />Radar</li>
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
