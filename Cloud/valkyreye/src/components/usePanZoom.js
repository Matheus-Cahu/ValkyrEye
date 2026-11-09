import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_ZOOM = 0.005; // pixels por metro
export const MAX_ZOOM = 50;

/** Deslocamento máximo, em pixels, para um gesto ainda contar como toque. */
const TAP_TOLERANCE_PX = 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Câmera do mapa. `view.x`/`view.y` deslocam a central em pixels a partir do
 * centro da tela; `view.k` é a escala em pixels por metro.
 *
 * Arrastar com mouse, toque ou caneta move o mapa; roda do mouse, pinça e
 * duplo clique aplicam zoom em torno do ponteiro. Um toque sem arrasto chama
 * `onTap({ point, target })`: o ponto em coordenadas do elemento e o alvo do
 * pointerdown (a captura do ponteiro redireciona o pointerup para o SVG).
 */
export function usePanZoom(targetRef, size, { onTap } = {}) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map());
  const gesture = useRef({ start: null, target: null, moved: false });
  const [dragging, setDragging] = useState(false);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

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
    const point = localPoint(event);
    if (pointers.current.size === 0) {
      gesture.current = { start: point, target: event.target, moved: false };
    } else {
      gesture.current.moved = true; // multitoque nunca é um toque simples
    }
    pointers.current.set(event.pointerId, point);
    setDragging(true);
  };

  const onPointerMove = (event) => {
    const map = pointers.current;
    const previous = map.get(event.pointerId);
    if (!previous) return;
    const current = localPoint(event);
    const { start } = gesture.current;
    if (start && Math.hypot(current.x - start.x, current.y - start.y) > TAP_TOLERANCE_PX) {
      gesture.current.moved = true;
    }

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
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size > 0) return;
    setDragging(false);
    if (event.type === "pointerup" && !gesture.current.moved) {
      onTapRef.current?.({ point: localPoint(event), target: gesture.current.target });
    }
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
