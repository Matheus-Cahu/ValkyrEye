import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_ZOOM = 0.005; // pixels por metro
export const MAX_ZOOM = 50;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Câmera do mapa. `view.x`/`view.y` deslocam a central em pixels a partir do
 * centro da tela; `view.k` é a escala em pixels por metro.
 *
 * Arrastar com mouse, toque ou caneta move o mapa; roda do mouse, pinça e
 * duplo clique aplicam zoom em torno do ponteiro.
 */
export function usePanZoom(targetRef, size) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map());
  const [dragging, setDragging] = useState(false);

  /** Zoom por `factor` mantendo fixo o ponto (px, py) da tela. */
  const zoomAt = useCallback(
    (px, py, factor) => {
      setView((v) => {
        const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
        const f = k / v.k;
        const rx = px - size.width / 2;
        const ry = py - size.height / 2;
        return { k, x: rx - (rx - v.x) * f, y: ry - (ry - v.y) * f };
      });
    },
    [size.width, size.height]
  );

  const panBy = useCallback((dx, dy) => {
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);

  const localPoint = (event) => {
    const rect = targetRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  // A roda precisa de listener não passivo para impedir a rolagem da página.
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      // deltaMode 1 = linhas (Firefox); normaliza para pixels.
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [targetRef, zoomAt]);

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event));
    setDragging(true);
  };

  const onPointerMove = (event) => {
    const map = pointers.current;
    const previous = map.get(event.pointerId);
    if (!previous) return;
    const current = localPoint(event);

    if (map.size === 1) {
      panBy(current.x - previous.x, current.y - previous.y);
    } else if (map.size === 2) {
      const [, other] = [...map].find(([id]) => id !== event.pointerId);
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(current.x - other.x, current.y - other.y);
      const mid = { x: (current.x + other.x) / 2, y: (current.y + other.y) / 2 };
      panBy((current.x - previous.x) / 2, (current.y - previous.y) / 2);
      if (before > 0) zoomAt(mid.x, mid.y, after / before);
    }
    map.set(event.pointerId, current);
  };

  const onPointerEnd = (event) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  };

  const onDoubleClick = (event) => {
    const p = localPoint(event);
    zoomAt(p.x, p.y, event.shiftKey ? 0.5 : 2);
  };

  const onKeyDown = (event) => {
    const step = 60;
    const center = [size.width / 2, size.height / 2];
    const actions = {
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      "+": () => zoomAt(...center, 1.5),
      "=": () => zoomAt(...center, 1.5),
      "-": () => zoomAt(...center, 1 / 1.5),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return {
    view,
    setView,
    zoomAt,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onDoubleClick,
      onKeyDown,
    },
  };
}
