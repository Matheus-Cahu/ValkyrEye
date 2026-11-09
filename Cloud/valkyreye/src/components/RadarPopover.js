import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchOcorrencias } from "../api";
import { formatDirection, formatDistance } from "./format";
import SignatureView from "./SignatureView";

const WIDTH = 252;
const MARGIN = 12;
/** Distância do topo da janela aberta para cima até o ponto do radar. */
const OFFSET_ABOVE = 26;
/** Preenchimento vertical e borda da janela (ver .radar-popover). */
const PADDING_Y = 28;

const formatTime = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

/**
 * Ocorrência a mostrar: a pendente mais recente ou, sem pendentes, a última
 * registrada (consultada na API). `undefined` enquanto carrega.
 */
function useShownOcorrencia(radarId, pending) {
  const [last, setLast] = useState({ radarId: null, ocorrencia: undefined });
  const hasPending = pending.length > 0;

  useEffect(() => {
    if (hasPending) return undefined;
    const controller = new AbortController();
    fetchOcorrencias({ radar: radarId, limit: 1 }, controller.signal)
      .then((rows) => setLast({ radarId, ocorrencia: rows[0] ?? null }))
      .catch((err) => {
        if (err.name !== "AbortError") setLast({ radarId, ocorrencia: null, error: err.message });
      });
    return () => controller.abort();
  }, [radarId, hasPending]);

  if (hasPending) return { ocorrencia: pending[0] };
  return last.radarId === radarId ? last : { ocorrencia: undefined };
}

function OcorrenciaSection({ radarId, pending, onMarkAnalyzed }) {
  const { ocorrencia, error } = useShownOcorrencia(radarId, pending);
  const [marking, setMarking] = useState({ busy: false, error: null });

  if (ocorrencia === undefined) {
    return <p className="radar-popover-hint">Carregando ocorrências…</p>;
  }
  if (ocorrencia === null) {
    return (
      <p className="radar-popover-hint">
        {error ? `Falha ao consultar ocorrências: ${error}` : "Nenhuma ocorrência registrada."}
      </p>
    );
  }

  const mark = async () => {
    setMarking({ busy: true, error: null });
    try {
      await onMarkAnalyzed(pending.map((o) => o.id));
      setMarking({ busy: false, error: null });
    } catch (err) {
      setMarking({ busy: false, error: err.message });
    }
  };

  return (
    <section className="radar-popover-ocorrencia" aria-label="Ocorrência">
      <div className="ocorrencia-header">
        <span className={`ocorrencia-badge${ocorrencia.analisada ? "" : " is-pending"}`}>
          {ocorrencia.analisada ? "Analisada" : "Pendente"}
        </span>
        <time dateTime={ocorrencia.timestamp}>{formatTime(ocorrencia.timestamp)}</time>
      </div>
      {pending.length > 1 && (
        <p className="radar-popover-hint">
          {pending.length} ocorrências pendentes; mostrando a mais recente.
        </p>
      )}
      <SignatureView assinatura={ocorrencia.assinatura} />
      {marking.error && (
        <p className="radar-popover-error" role="alert">
          Não foi possível marcar: {marking.error}
        </p>
      )}
      {pending.length > 0 && (
        <button
          type="button"
          className="btn btn-block"
          onClick={mark}
          disabled={marking.busy}
        >
          {marking.busy
            ? "Marcando…"
            : pending.length === 1
              ? "Marcar como analisada"
              : `Marcar ${pending.length} como analisadas`}
        </button>
      )}
    </section>
  );
}

/**
 * Janela ancorada sobre um radar. Abre acima do ponto ou, se não couber,
 * abaixo dele; fica sempre dentro da largura do mapa. `pending` são as
 * ocorrências não analisadas do radar, mais recentes primeiro.
 */
export default function RadarPopover({
  radar,
  anchor,
  containerSize,
  edit,
  onClose,
  onStartEdit,
  onCancelEdit,
  onPin,
  pending = [],
  onMarkAnalyzed,
}) {
  const editing = edit?.id === radar.id;
  const pinRef = useRef(null);
  const editRef = useRef(null);
  const contentRef = useRef(null);
  const [height, setHeight] = useState(210);

  // A altura muda com a assinatura; mede o conteúdo inteiro (sem o limite de
  // altura) para decidir se a janela cabe acima do radar.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return undefined;
    const update = () => setHeight((el.offsetHeight || 184) + PADDING_Y);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Leva o foco para a ação principal de cada etapa.
  useEffect(() => {
    (editing ? pinRef : editRef).current?.focus({ preventScroll: true });
  }, [editing, radar.id]);

  const half = WIDTH / 2;
  const left = Math.min(
    Math.max(anchor.x, half + MARGIN),
    Math.max(half + MARGIN, containerSize.width - half - MARGIN)
  );
  const roomAbove = anchor.y - OFFSET_ABOVE - MARGIN;
  const roomBelow = containerSize.height - anchor.y - 44 - MARGIN;
  const below = roomAbove < height && roomBelow > roomAbove;
  const style = {
    left,
    top: below ? anchor.y + 44 : anchor.y - OFFSET_ABOVE,
    width: WIDTH,
    transform: `translate(-50%, ${below ? "0" : "-100%"})`,
  };
  // Seta apontando para o radar, mesmo quando a janela é deslocada para caber.
  const arrowLeft = Math.min(Math.max(anchor.x - left + half, 16), WIDTH - 16);

  return (
    <div
      className={`radar-popover${below ? " is-below" : ""}`}
      style={style}
      role="dialog"
      aria-label={`Radar ${radar.id}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="radar-popover-arrow" style={{ left: arrowLeft }} aria-hidden="true" />
      {/* Rola por dentro quando não cabe na tela; a seta fica fora da rolagem. */}
      <div
        className="radar-popover-body"
        style={{ maxHeight: Math.max(160, (below ? roomBelow : roomAbove) - PADDING_Y) }}
      >
        <div ref={contentRef}>
          <div className="radar-popover-header">
            <h2>{radar.id}</h2>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              disabled={edit?.saving}
              aria-label="Fechar"
              title="Fechar"
            >
              ×
            </button>
          </div>

          {editing && (
            <p className="radar-popover-hint">
              Arraste o radar ou toque no mapa para escolher a nova posição.
            </p>
          )}

          <dl className="radar-popover-fields">
            <dt>Distância</dt>
            <dd>{formatDistance(radar.distancia)}</dd>
            <dt>Direção</dt>
            <dd>{formatDirection(radar.direcao)}</dd>
            {editing && (
              <>
                <dt className="was">Antes</dt>
                <dd className="was">
                  {formatDistance(edit.original.distancia)} · {formatDirection(edit.original.direcao)}
                </dd>
              </>
            )}
          </dl>

          {editing && edit.error && (
            <p className="radar-popover-error" role="alert">
              Não foi possível salvar: {edit.error}
            </p>
          )}

          {!editing && (
            <OcorrenciaSection radarId={radar.id} pending={pending} onMarkAnalyzed={onMarkAnalyzed} />
          )}

          <div className="radar-popover-actions">
            {editing ? (
              <>
                <button type="button" className="btn" onClick={onCancelEdit} disabled={edit.saving}>
                  Cancelar
                </button>
                <button
                  ref={pinRef}
                  type="button"
                  className="btn btn-primary"
                  onClick={onPin}
                  disabled={edit.saving}
                >
                  {edit.saving ? "Salvando…" : "Fixar posição"}
                </button>
              </>
            ) : (
              <button
                ref={editRef}
                type="button"
                className="btn btn-primary btn-block"
                onClick={onStartEdit}
              >
                Reposicionar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
