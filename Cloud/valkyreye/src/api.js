// Em desenvolvimento, o servidor do React encaminha estas rotas para a API
// (campo "proxy" do package.json). Em outro ambiente, defina
// REACT_APP_API_URL, ex.: http://servidor:8080
const BASE_URL = process.env.REACT_APP_API_URL ?? "";

export async function fetchRadares(signal) {
  const response = await fetch(`${BASE_URL}/radares`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.erro ?? `API respondeu ${response.status}`);
  }
  return response.json();
}
