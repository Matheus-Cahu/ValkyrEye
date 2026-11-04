import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./RadarMap.css";
import { MAX_ZOOM, MIN_ZOOM, usePanZoom } from "./usePanZoom";

// O mapa é desenhado em pixels de tela. Ícones e textos têm tamanho fixo;
// só as distâncias acompanham o zoom.

/** Fração do menor lado da tela ocupada pelo radar mais distante ao ajustar. */
const FIT_FRACTION = 0.46;
/** Espaçamento aproximado, em pixels, entre anéis de distância. */
const RING_SPACING_PX = 80;
const MAX_RINGS = 80;
const FALLBACK_SIZE = { width: 800, height: 600 };

/** Arredonda para cima até 1, 2 ou 5 × 10^n, para os anéis terem valores redondos. */
function niceCeil(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value * (1 - 1e-9));
  return step * magnitude;
}

/**
 * Converte distância e direção (graus a partir do norte, sentido horário)
 * em coordenadas de tela relativas à central, com `scale` pixels por metro.
 * Y cresce para baixo, então o norte é -Y.
 */
export function toMapPoint(distancia, direcao, scale) {
  const rad = (direcao * Math.PI) / 180;
  return {
    x: distancia * Math.sin(rad) * scale,
    y: -distancia * Math.cos(rad) * scale,
  };
}

function formatDistance(meters) {
  if (meters >= 1000) {
    return `${Number((meters / 1000).toFixed(2)).toLocaleString("pt-BR")} km`;
  }
  return `${Number(meters.toFixed(1)).toLocaleString("pt-BR")} m`;
}

function useElementSize(ref) {
  const [size, setSize] = useState(FALLBACK_SIZE);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setSize({ width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function House() {
  return (
    <g className="map-house">
      <title>Servidor central</title>
      <circle r="34" className="map-house-halo" />
      <path d="M -21 -2 L 0 -21 L 21 -2 L 15 -2 L 15 19 L -15 19 L -15 -2 Z" />
      <rect x="-5" y="6" width="10" height="13" className="map-house-door" />
    </g>
  );
}

// Fica no canto da tela, fora do SVG, e não gira com o mapa.
function NorthPointer() {
  return (
    <div className="map-north" title="Norte">
      <svg viewBox="-14 0 28 48" aria-hidden="true">
        <path d="M 0 0 L 13 46 L 0 37 L -13 46 Z" />
      </svg>
      <span>N</span>
    </div>
  );
}

/** Eixos e anéis de distância, com passo escolhido conforme o zoom. */
function Grid({ size, origin, k }) {
  const step = niceCeil(RING_SPACING_PX / k);
  // Distância da central até o canto mais afastado da tela, em metros.
  const reach =
    Math.max(
      ...[
        [0, 0],
        [size.width, 0],
        [0, size.height],
        [size.width, size.height],
      ].map(([cx, cy]) => Math.hypot(cx - origin.x, cy - origin.y))
    ) / k;
  // Distância da central até o ponto mais próximo da tela (0 se estiver visível).
  const near =
    Math.hypot(
      Math.max(0, -origin.x, origin.x - size.width),
      Math.max(0, -origin.y, origin.y - size.height)
    ) / k;
  const first = Math.max(1, Math.floor(near / step));
  const last = Math.min(Math.ceil(reach / step), first + MAX_RINGS);

  const rings = [];
  for (let i = first; i <= last; i += 1) rings.push(i * step);

  return (
    <g className="map-grid">
      <line x1={origin.x} y1="0" x2={origin.x} y2={size.height} />
      <line x1="0" y1={origin.y} x2={size.width} y2={origin.y} />
      {rings.map((distance) => {
        const r = distance * k;
        return (
          <g key={distance}>
            <circle cx={origin.x} cy={origin.y} r={r} />
            {/* Rótulo a sudeste, longe do eixo norte onde costumam ficar radares. */}
            <text x={origin.x + r * Math.SQRT1_2 + 6} y={origin.y + r * Math.SQRT1_2 + 16}>
              {formatDistance(distance)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function RadarPoint({ radar, origin, k }) {
  const { x, y } = toMapPoint(radar.distancia, radar.direcao, k);
  return (
    <g className="map-radar" transform={`translate(${origin.x + x} ${origin.y + y})`}>
      <title>
        {`${radar.id}\nDistância: ${formatDistance(radar.distancia)}\nDireção: ${radar.direcao}°`}
      </title>
      <circle r="20" className="map-radar-hit" />
      <circle r="11" className="map-radar-dot" />
      <text y="32" textAnchor="middle">{radar.id}</text>
    </g>
  );
}

function ZoomControls({ onZoomIn, onZoomOut, onFit }) {
  return (
    <div className="map-controls">
      <button type="button" onClick={onZoomIn} aria-label="Aproximar" title="Aproximar">+</button>
      <button type="button" onClick={onZoomOut} aria-label="Afastar" title="Afastar">−</button>
      <button type="button" onClick={onFit} aria-label="Ajustar aos radares" title="Ajustar aos radares">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </button>
    </div>
  );
}

export default function RadarMap({ radares }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const size = useElementSize(containerRef);
  const { view, setView, zoomAt, dragging, handlers } = usePanZoom(svgRef, size);
  const userMoved = useRef(false);

  const maxDistance = Math.max(0, ...radares.map((r) => r.distancia));

  const fit = useCallback(() => {
    const target = niceCeil(maxDistance || 100);
    const k = (Math.min(size.width, size.height) * FIT_FRACTION) / target;
    setView({ x: 0, y: 0, k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k)) });
  }, [maxDistance, size.width, size.height, setView]);

  // Ajusta automaticamente até o usuário mexer no mapa.
  useEffect(() => {
    if (!userMoved.current) fit();
  }, [fit]);

  const markMoved = (handler) => (event) => {
    userMoved.current = true;
    handler?.(event);
  };

  const center = [size.width / 2, size.height / 2];
  const origin = { x: size.width / 2 + view.x, y: size.height / 2 + view.y };

  return (
    <div className="radar-map" ref={containerRef}>
      <svg
        ref={svgRef}
        className={`radar-map-svg${dragging ? " is-dragging" : ""}`}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="application"
        tabIndex={0}
        aria-label={`Mapa com ${radares.length} radares ao redor do servidor central. Arraste para mover, use a roda do mouse ou + e − para zoom e as setas para deslocar.`}
        onPointerDown={markMoved(handlers.onPointerDown)}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
        onDoubleClick={markMoved(handlers.onDoubleClick)}
        onKeyDown={markMoved(handlers.onKeyDown)}
        onWheel={() => {
          userMoved.current = true;
        }}
      >
        <Grid size={size} origin={origin} k={view.k} />
        <g transform={`translate(${origin.x} ${origin.y})`}>
          <House />
        </g>
        {radares.map((radar) => (
          <RadarPoint key={radar.id} radar={radar} origin={origin} k={view.k} />
        ))}
      </svg>
      <NorthPointer />
      <ZoomControls
        onZoomIn={markMoved(() => zoomAt(...center, 1.5))}
        onZoomOut={markMoved(() => zoomAt(...center, 1 / 1.5))}
        onFit={() => {
          userMoved.current = false;
          fit();
        }}
      />
    </div>
  );
}
