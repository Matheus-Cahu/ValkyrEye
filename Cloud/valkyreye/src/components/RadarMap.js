import "./RadarMap.css";

// Sistema de coordenadas do SVG: a central fica em (0, 0) e o mapa vai de
// -VIEW a +VIEW nos dois eixos. Y cresce para baixo, então o norte é -Y.
const VIEW = 500;
const PLOT_RADIUS = 420;
const RING_COUNT = 4;
const AXIS = VIEW * 20;

/** Arredonda para cima até 1, 2 ou 5 × 10^n, para os anéis terem valores redondos. */
function niceCeil(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value);
  return step * magnitude;
}

/**
 * Converte distância e direção (graus a partir do norte, sentido horário)
 * em coordenadas do mapa.
 */
export function toMapPoint(distancia, direcao, scale) {
  const rad = (direcao * Math.PI) / 180;
  return {
    x: distancia * Math.sin(rad) * scale,
    y: -distancia * Math.cos(rad) * scale,
  };
}

function formatDistance(value) {
  return `${Number(value.toFixed(1)).toLocaleString("pt-BR")} m`;
}

function House() {
  return (
    <g className="map-house" aria-label="Servidor central">
      <title>Servidor central</title>
      <circle r="30" className="map-house-halo" />
      <path d="M -18 -2 L 0 -18 L 18 -2 L 13 -2 L 13 16 L -13 16 L -13 -2 Z" />
      <rect x="-4" y="5" width="8" height="11" className="map-house-door" />
    </g>
  );
}

// Fica no canto da tela, fora do SVG, para não depender da proporção do mapa.
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

function RangeRings({ maxDistance, scale }) {
  const step = maxDistance / RING_COUNT;
  return (
    <g className="map-rings">
      {/* Mais longos que o viewBox para cruzarem a tela inteira. */}
      <line x1="0" y1={-AXIS} x2="0" y2={AXIS} />
      <line x1={-AXIS} y1="0" x2={AXIS} y2="0" />
      {Array.from({ length: RING_COUNT }, (_, i) => {
        const distance = step * (i + 1);
        const r = distance * scale;
        return (
          <g key={i}>
            <circle r={r} />
            {/* Rótulo a sudeste, longe do eixo norte onde costumam ficar radares. */}
            <text x={r * Math.SQRT1_2 + 6} y={r * Math.SQRT1_2 + 16}>
              {formatDistance(distance)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function RadarPoint({ radar, scale }) {
  const { x, y } = toMapPoint(radar.distancia, radar.direcao, scale);
  return (
    <g className="map-radar" transform={`translate(${x} ${y})`}>
      <title>
        {`${radar.id}\nDistância: ${formatDistance(radar.distancia)}\nDireção: ${radar.direcao}°`}
      </title>
      <circle r="18" className="map-radar-hit" />
      <circle r="9" className="map-radar-dot" />
      <text y="28" textAnchor="middle">{radar.id}</text>
    </g>
  );
}

export default function RadarMap({ radares }) {
  const maxDistance = niceCeil(Math.max(0, ...radares.map((r) => r.distancia)));
  const scale = PLOT_RADIUS / maxDistance;

  return (
    <div className="radar-map">
      <svg
        className="radar-map-svg"
        viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Mapa com ${radares.length} radares ao redor do servidor central`}
      >
        <RangeRings maxDistance={maxDistance} scale={scale} />
        <House />
        {radares.map((radar) => (
          <RadarPoint key={radar.id} radar={radar} scale={scale} />
        ))}
      </svg>
      <NorthPointer />
    </div>
  );
}
