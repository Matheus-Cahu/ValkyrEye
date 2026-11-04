import express from "express";
import { pool } from "./db.js";
import { errorHandler } from "./http.js";
import { ocorrencias } from "./routes/ocorrencias.js";
import { radares } from "./routes/radares.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.get("/health", async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

app.use("/radares", radares);
app.use("/ocorrencias", ocorrencias);

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada" }));
app.use(errorHandler);

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`API ValkyrEye ouvindo na porta ${port}`);
});

const shutdown = () => {
  server.close(() => pool.end().finally(() => process.exit(0)));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
