// Formatação dos campos posicionais em pt-BR.

export function formatDirection(degrees) {
  return `${Number(degrees.toFixed(1)).toLocaleString("pt-BR")}°`;
}

export function formatDistance(meters) {
  if (meters >= 1000) {
    return `${Number((meters / 1000).toFixed(3)).toLocaleString("pt-BR")} km`;
  }
  return `${Number(meters.toFixed(1)).toLocaleString("pt-BR")} m`;
}
