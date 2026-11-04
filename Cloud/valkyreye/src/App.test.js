import { render, screen } from "@testing-library/react";
import App from "./App";
import { toMapPoint } from "./components/RadarMap";

const radares = [
  { id: "radar-01", distancia: 100, direcao: 0 },
  { id: "radar-02", distancia: 50, direcao: 90 },
];

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(radares),
  });
});

test("mostra a central e um ponto por radar", async () => {
  render(<App />);
  expect(await screen.findByText("radar-01")).toBeInTheDocument();
  expect(screen.getByText("radar-02")).toBeInTheDocument();
  expect(screen.getByText(/2 radares/)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/radares", expect.anything());
});

test("mostra erro da API", async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ erro: "Erro interno" }),
  });
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Erro interno");
});

test.each([
  [0, 0, -10],    // norte: para cima
  [90, 10, 0],    // leste: para a direita
  [180, 0, 10],   // sul: para baixo
  [270, -10, 0],  // oeste: para a esquerda
])("direção %i° vira (%i, %i)", (direcao, x, y) => {
  const point = toMapPoint(10, direcao, 1);
  expect(point.x).toBeCloseTo(x);
  expect(point.y).toBeCloseTo(y);
});
