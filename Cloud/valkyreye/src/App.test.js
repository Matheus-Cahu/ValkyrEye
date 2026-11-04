import { fireEvent, render, screen } from "@testing-library/react";
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

test("zoom pelos botões muda a escala dos anéis e ajustar restaura", async () => {
  render(<App />);
  await screen.findByText("radar-01");
  // 800x600 (tamanho padrão no jsdom): 100 m ajustados em 276 px, anéis de 50 m.
  expect(screen.getByText("50 m")).toBeInTheDocument();
  expect(screen.queryByText("10 m")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
  fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
  fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
  // Zoom 3,375×: o passo dos anéis cai para 10 m.
  expect(screen.getByText("10 m")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ajustar aos radares" }));
  expect(screen.queryByText("10 m")).not.toBeInTheDocument();
  expect(screen.getByText("50 m")).toBeInTheDocument();
});

test("arrastar desloca o mapa", async () => {
  render(<App />);
  const label = await screen.findByText("radar-01");
  const position = () =>
    label.closest("g").getAttribute("transform").match(/-?[\d.]+/g).map(Number);
  const [x0, y0] = position();
  const map = screen.getByRole("application");
  fireEvent.pointerDown(map, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(map, { pointerId: 1, clientX: 160, clientY: 130 });
  fireEvent.pointerUp(map, { pointerId: 1 });
  const [x1, y1] = position();
  expect(x1 - x0).toBeCloseTo(60);
  expect(y1 - y0).toBeCloseTo(30);
});
