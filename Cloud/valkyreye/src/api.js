// Em desenvolvimento, o servidor do React encaminha estas rotas para a API
// (campo "proxy" do package.json). Em outro ambiente, defina
// REACT_APP_API_URL, ex.: http://servidor:8080
const BASE_URL = process.env.REACT_APP_API_URL ?? "";

async function request(path, { body, ...options } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.erro ?? `API respondeu ${response.status}`);
  }
  return response.json();
}

export function fetchRadares(signal) {
  return request("/radares", { signal });
}

export function updateRadar(id, { distancia, direcao }) {
  return request(`/radares/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { distancia, direcao },
  });
}
