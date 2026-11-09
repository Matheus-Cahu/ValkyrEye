// Desenho da assinatura de uma ocorrência: o radar no centro e, ao redor,
// um arco por leitura. O vetor [ângulo_graus, distância_cm] é dividido em
// fatias iguais de 360°/n, na ordem recebida, começando no topo e seguindo
// no sentido horário. Cada arco azul fica à distância medida do centro;
// leituras com distância 0 (sem eco) deixam a fatia vazia.

const SIZE = 220;
const C = SIZE / 2;
const R_OUTER = 96;
const R_RADAR = 9;
const R_INNER = R_RADAR + 5;
/** Alcance mínimo da escala: o do HC-SR04. */
const MIN_RANGE_CM = 400;

function polar(r, degrees) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

const fmt = (n) => Number(n.toFixed(2)).toString();

function arc(r, a0, a1) {
  if (a1 - a0 >= 359.999) {
    // Um arco SVG não fecha um círculo; usa dois semicírculos.
    const [x0, y0] = polar(r, 0);
    const [x1, y1] = polar(r, 180);
    return `M ${fmt(x0)} ${fmt(y0)} A ${r} ${r} 0 1 1 ${fmt(x1)} ${fmt(y1)} A ${r} ${r} 0 1 1 ${fmt(x0)} ${fmt(y0)}`;
  }
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${fmt(x0)} ${fmt(y0)} A ${fmt(r)} ${fmt(r)} 0 ${large} 1 ${fmt(x1)} ${fmt(y1)}`;
}

/** Fatia de anel entre os raios r0 e r1, de a0 a a1 graus. */
function sector(r0, r1, a0, a1) {
  if (a1 - a0 >= 359.999) return `${arc(r1, 0, 360)} ${arc(r0, 0, 360)}`;
  const [xi1, yi1] = polar(r0, a1);
  const [xi0, yi0] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return (
    `${arc(r1, a0, a1)} L ${fmt(xi1)} ${fmt(yi1)} ` +
    `A ${r0} ${r0} 0 ${large} 0 ${fmt(xi0)} ${fmt(yi0)} Z`
  );
}

export function formatCm(cm) {
  if (cm < 100) return `${Number(cm.toFixed(1)).toLocaleString("pt-BR")} cm`;
  return `${Number((cm / 100).toFixed(2)).toLocaleString("pt-BR")} m`;
}

/** Escala radial: alcance (cm) arredondado a 100 cm e passo dos anéis. */
export function signatureScale(assinatura) {
  const farthest = Math.max(0, ...assinatura.map(([, d]) => d));
  const range = Math.max(MIN_RANGE_CM, Math.ceil(farthest / 100) * 100);
  const step = [100, 200, 500, 1000, 2000, 5000].find((s) => range / s <= 5) ?? range;
  return { range, step };
}

export default function SignatureView({ assinatura }) {
  const n = assinatura.length;
  const slice = 360 / n;
  const gap = Math.min(slice * 0.15, 2);
  const { range, step } = signatureScale(assinatura);
  const radius = (cm) => R_INNER + (Math.min(cm, range) / range) * (R_OUTER - R_INNER);

  const rings = [];
  for (let d = step; d <= range; d += step) rings.push(d);

  const hits = assinatura.filter(([, d]) => d > 0);
  const nearest = hits.reduce((best, t) => (!best || t[1] < best[1] ? t : best), null);
  const summary = nearest
    ? `${n} ${n === 1 ? "leitura" : "leituras"}; mais próxima a ${formatCm(nearest[1])}, ${nearest[0]}°`
    : `${n} ${n === 1 ? "leitura" : "leituras"}, nenhum eco`;

  return (
    <figure className="signature">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Assinatura: ${summary}`}>
        {assinatura.map(([, d], i) => {
          const a0 = i * slice + gap / 2;
          const a1 = (i + 1) * slice - gap / 2;
          return (
            <path
              key={`s${i}`}
              className={`signature-slice${d > 0 ? " is-hit" : ""}`}
              d={sector(R_INNER, R_OUTER, a0, a1)}
            />
          );
        })}
        {rings.map((d) => (
          <circle key={d} className="signature-ring" cx={C} cy={C} r={radius(d)} />
        ))}
        {assinatura.map(([angle, d], i) =>
          d > 0 ? (
            <path
              key={`a${i}`}
              className="signature-arc"
              d={arc(radius(d), i * slice + gap / 2, (i + 1) * slice - gap / 2)}
            >
              <title>{`${angle}°: ${formatCm(d)}`}</title>
            </path>
          ) : null
        )}
        {/* Rótulos por último, para ficarem por cima dos arcos. */}
        {rings.map((d) => (
          <text key={`l${d}`} className="signature-ring-label" x={C + 3} y={C - radius(d) + 10}>
            {formatCm(d)}
          </text>
        ))}
        <circle className="signature-radar" cx={C} cy={C} r={R_RADAR} />
      </svg>
      <figcaption>{summary}</figcaption>
    </figure>
  );
}
