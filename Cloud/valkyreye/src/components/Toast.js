import { useEffect, useState } from "react";

const WITH_ACTION_MS = 15_000;
const PLAIN_MS = 4_000;

/**
 * Aviso na parte inferior da tela. Some sozinho, exceto enquanto o ponteiro
 * ou o foco estiverem nele, durante uma ação ou quando há erro.
 */
export default function Toast({ message, error, action, busy, onDismiss }) {
  const [paused, setPaused] = useState(false);
  const hasAction = Boolean(action);

  useEffect(() => {
    if (paused || busy || error) return undefined;
    const timer = setTimeout(onDismiss, hasAction ? WITH_ACTION_MS : PLAIN_MS);
    return () => clearTimeout(timer);
  }, [paused, busy, error, hasAction, onDismiss]);

  return (
    <div
      className="toast"
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="toast-body">
        <span>{message}</span>
        {error && <span className="toast-error">Falha ao desfazer: {error}</span>}
      </div>
      {action && (
        <button type="button" className="btn btn-primary" onClick={action.onClick} disabled={busy}>
          {busy ? "Desfazendo…" : action.label}
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        onClick={onDismiss}
        disabled={busy}
        aria-label="Fechar aviso"
        title="Fechar"
      >
        ×
      </button>
    </div>
  );
}
