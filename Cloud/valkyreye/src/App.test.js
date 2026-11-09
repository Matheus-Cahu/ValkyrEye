import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { fromMapPoint, toMapPoint } from "./components/RadarMap";
import { satelliteRadius } from "./useSatellite";

const radares = [
  { id: "radar-01", distancia: 100, direcao: 0 },
  { id: "radar-02", distancia: 50, direcao: 90 },
];

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  global.fetch = jest.fn((url, options = {}) => {
    if (options.method === "PATCH") {
      const id = decodeURIComponent(url.split("/").pop());
      return Promise.resolve(jsonResponse({ id, ...JSON.parse(options.body) }));
    }
    return Promise.resolve(jsonResponse(radares));
  });
});

const patchCalls = () =>
  global.fetch.mock.calls
    .filter(([, options]) => options?.method === "PATCH")
    .map(([url, options]) => [url, JSON.parse(options.body)]);

/** Toque sem arrasto. No jsdom o SVG fica em (0, 0) e mede 800x600. */
function tap(element, x, y) {
  const map = screen.getByRole("application");
  fireEvent.pointerDown(element, { pointerId: 7, button: 0, clientX: x, clientY: y });
  fireEvent.pointerUp(map, { pointerId: 7, clientX: x, clientY: y });
}

// Com o ajuste inicial, 100 m ocupam 600 × 0,46 = 276 px; a central fica em (400, 300).
const PX_PER_M = 2.76;

test("mostra a central e um ponto por radar", async () => {
  render(<App />);
  expect(await screen.findByText("radar-01")).toBeInTheDocument();
  expect(screen.getByText("radar-02")).toBeInTheDocument();
  expect(screen.getByText(/2 radares/)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/radares", expect.anything());
});

test("mostra erro da API", async () => {
  global.fetch.mockResolvedValue(jsonResponse({ erro: "Erro interno" }, 500));
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

test.each([
  [0, -10, 10, 0],
  [10, 0, 10, 90],
  [0, 10, 10, 180],
  [-10, 0, 10, 270],
  [-0.001, -10, 10, 0], // 359,99° arredonda para 0°, nunca 360°
])("ponto (%d, %d) vira %d m a %d°", (dx, dy, distancia, direcao) => {
  expect(fromMapPoint(dx, dy, 1)).toEqual({ distancia, direcao });
});

test("reposiciona um radar, grava na API e desfaz", async () => {
  render(<App />);
  const label = await screen.findByText("radar-01");

  // Clicar no radar abre a janela com os campos.
  tap(label, 400, 24);
  const dialog = screen.getByRole("dialog", { name: "Radar radar-01" });
  expect(within(dialog).getByText("100 m")).toBeInTheDocument();
  expect(within(dialog).getByText("0°")).toBeInTheDocument();

  // Reposicionar e tocar 50 m a leste da central.
  fireEvent.click(within(dialog).getByRole("button", { name: "Reposicionar" }));
  tap(screen.getByRole("application"), 400 + 50 * PX_PER_M, 300);
  expect(within(dialog).getByText("50 m")).toBeInTheDocument();
  expect(within(dialog).getByText("90°")).toBeInTheDocument();
  expect(patchCalls()).toHaveLength(0);

  fireEvent.click(within(dialog).getByRole("button", { name: "Fixar posição" }));
  expect(await screen.findByText("radar-01 reposicionado.")).toBeInTheDocument();
  expect(patchCalls()).toEqual([["/radares/radar-01", { distancia: 50, direcao: 90 }]]);
  expect(screen.getByRole("button", { name: "Reposicionar" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Desfazer reposicionamento" }));
  expect(await screen.findByText("Reposicionamento de radar-01 desfeito.")).toBeInTheDocument();
  expect(patchCalls()[1]).toEqual(["/radares/radar-01", { distancia: 100, direcao: 0 }]);
  const restored = screen.getByRole("dialog", { name: "Radar radar-01" });
  expect(within(restored).getByText("100 m")).toBeInTheDocument();
});

test("arrastar o radar em edição move o radar, não o mapa", async () => {
  render(<App />);
  const label = await screen.findByText("radar-01");
  tap(label, 400, 24);
  fireEvent.click(screen.getByRole("button", { name: "Reposicionar" }));

  const radar = label.closest("[data-radar-id]");
  const house = document.querySelector(".map-house").parentNode.getAttribute("transform");
  fireEvent.pointerDown(radar, { pointerId: 3, button: 0, clientX: 400, clientY: 24 });
  // 25 m = 69 px: inteiro, porque o MouseEvent do jsdom trunca clientX/clientY.
  fireEvent.pointerMove(radar, { pointerId: 3, clientX: 400, clientY: 300 - 25 * PX_PER_M });
  fireEvent.pointerUp(radar, { pointerId: 3 });

  expect(document.querySelector(".map-house").parentNode.getAttribute("transform")).toBe(house);
  const dialog = screen.getByRole("dialog", { name: "Radar radar-01" });
  expect(within(dialog).getByText("25 m")).toBeInTheDocument();
});

test("falha ao gravar mantém a edição e mostra o erro; Esc cancela", async () => {
  render(<App />);
  const label = await screen.findByText("radar-01");
  global.fetch.mockImplementation((url, options = {}) =>
    Promise.resolve(
      options.method === "PATCH"
        ? jsonResponse({ erro: "Valor rejeitado pelo banco de dados" }, 400)
        : jsonResponse(radares)
    )
  );
  tap(label, 400, 24);
  fireEvent.click(screen.getByRole("button", { name: "Reposicionar" }));
  tap(screen.getByRole("application"), 400 + 50 * PX_PER_M, 300);
  fireEvent.click(screen.getByRole("button", { name: "Fixar posição" }));

  expect(await screen.findByText(/Valor rejeitado/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Fixar posição" })).toBeEnabled();
  expect(screen.queryByText(/reposicionado\./)).not.toBeInTheDocument();

  fireEvent.keyDown(document, { key: "Escape" });
  const dialog = screen.getByRole("dialog", { name: "Radar radar-01" });
  await waitFor(() => expect(within(dialog).getByText("100 m")).toBeInTheDocument());
  expect(within(dialog).getByRole("button", { name: "Reposicionar" })).toBeInTheDocument();
});

describe("imagem de satélite", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn((success) =>
          success({ coords: { latitude: -23.16, longitude: -45.79, accuracy: 10 } })
        ),
      },
    });
    URL.createObjectURL = jest.fn(() => "blob:satelite");
    URL.revokeObjectURL = jest.fn();
    const radaresFetch = global.fetch;
    global.fetch = jest.fn((url, options) =>
      url.startsWith("/satelite")
        ? Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob()) })
        : radaresFetch(url, options)
    );
  });

  afterEach(() => {
    delete navigator.geolocation;
  });

  test("pede a região da localização atual e a desenha centrada na central", async () => {
    render(<App />);
    await screen.findByText("radar-01");
    await waitFor(() => expect(document.querySelector(".map-satellite")).not.toBeNull());

    // Radar mais distante a 100 m: 2 × 100 = 200 m, elevado ao mínimo de 3 km.
    expect(global.fetch).toHaveBeenCalledWith(
      "/satelite?lat=-23.16000&lon=-45.79000&raio=3000",
      expect.anything()
    );
    const image = document.querySelector(".map-satellite");
    expect(image.getAttribute("href")).toBe("blob:satelite");
    // 3 km para cada lado a 2,76 px/m, com a central em (400, 300).
    expect(Number(image.getAttribute("width"))).toBeCloseTo(6000 * PX_PER_M);
    expect(Number(image.getAttribute("x"))).toBeCloseTo(400 - 3000 * PX_PER_M);
    expect(Number(image.getAttribute("y"))).toBeCloseTo(300 - 3000 * PX_PER_M);

    fireEvent.click(screen.getByRole("button", { name: "Ocultar imagem de satélite" }));
    expect(document.querySelector(".map-satellite")).toBeNull();
  });

  test.each([
    [0, 3000],
    [1500, 3000],
    [1600, 5000],
    [4000, 10000],
    [50000, 20000],
  ])("radar mais distante a %d m pede raio de %d m", (maxDistance, raio) => {
    expect(satelliteRadius(maxDistance)).toBe(raio);
  });

  test("informa quando a localização é negada", async () => {
    navigator.geolocation.getCurrentPosition.mockImplementation((_, fail) => fail({ code: 1 }));
    render(<App />);
    expect(await screen.findByText(/Permissão de localização negada/)).toBeInTheDocument();
  });
});
