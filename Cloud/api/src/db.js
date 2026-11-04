import pg from "pg";

// Configuração lida das variáveis padrão do libpq:
// PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
export const pool = new pg.Pool({ max: 10 });

pool.on("error", (err) => {
  console.error("Erro em conexão ociosa do PostgreSQL", err);
});
