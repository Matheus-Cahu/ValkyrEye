import { useEffect, useRef } from "react";
import { formatDirection, formatDistance } from "./format";

const WIDTH = 252;
const MARGIN = 12;
/** Espaço mínimo acima do radar para a janela abrir em cima dele. */
const ROOM_ABOVE = 210;

/**
 * Janela ancorada sobre um radar. Abre acima do ponto ou, perto do topo da
 * tela, abaixo dele; fica sempre dentro da largura do mapa.
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
}) {
  const editing = edit?.id === radar.id;
  const pinRef = useRef(null);
  const editRef = useRef(null);

  // Leva o foco para a ação principal de cada etapa.
  useEffect(() => {
    (editing ? pinRef : editRef).current?.focus({ preventScroll: true });
  }, [editing, radar.id]);

  const half = WIDTH / 2;
  const left = Math.min(
    Math.max(anchor.x, half + MARGIN),
    Math.max(half + MARGIN, containerSize.width - half - MARGIN)
  );
  const below = anchor.y < ROOM_ABOVE;
  const style = {
    left,
    top: below ? anchor.y + 44 : anchor.y - 26,
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
  );
}
