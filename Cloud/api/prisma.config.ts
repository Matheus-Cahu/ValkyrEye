import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Reaproveita as credenciais do docker-compose (Cloud/.env).
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) {
    throw new Error("Defina POSTGRES_PASSWORD em Cloud/.env ou DATABASE_URL");
  }
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "valkyreye");
  const db = encodeURIComponent(process.env.POSTGRES_DB ?? "valkyreye");
  const port = process.env.POSTGRES_PORT ?? "5432";
  return `postgresql://${user}:${encodeURIComponent(password)}@localhost:${port}/${db}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: databaseUrl() },
});
