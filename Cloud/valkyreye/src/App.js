import { useEffect, useState } from "react";
import "./App.css";
import { fetchRadares } from "./api";
import RadarMap from "./components/RadarMap";

const REFRESH_MS = 10_000;

function useRadares() {
  const [state, setState] = useState({ radares: [], error: null, updatedAt: null, loading: true });

  useEffect(() => {
    let controller;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const radares = await fetchRadares(controller.signal);
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

  return state;
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
  const state = useRadares();

  return (
    <div className="app">
      <header className="app-header">
        <h1>ValkyrEye</h1>
        <Status {...state} />
      </header>
      <main className="app-map">
        <RadarMap radares={state.radares} />
        {!state.loading && !state.error && state.radares.length === 0 && (
          <p className="map-empty">Nenhum radar cadastrado.</p>
        )}
        <ul className="map-legend" aria-label="Legenda">
          <li><span className="legend-house" aria-hidden="true" />Servidor central</li>
          <li><span className="legend-radar" aria-hidden="true" />Radar</li>
          <li><span className="legend-north" aria-hidden="true" />Norte</li>
        </ul>
      </main>
    </div>
  );
}
