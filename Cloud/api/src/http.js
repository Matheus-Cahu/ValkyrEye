export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (message) => new HttpError(404, message);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Valida o corpo de uma requisição. `fields` mapeia nome -> validador, que
 * recebe o valor e devolve o valor normalizado ou lança badRequest.
 * Em modo parcial (PATCH), campos ausentes são ignorados, mas ao menos um é
 * exigido.
 */
export function parseBody(body, fields, { partial = false } = {}) {
  if (!isObject(body)) throw badRequest("Corpo deve ser um objeto JSON");
  const unknown = Object.keys(body).filter((key) => !(key in fields));
  if (unknown.length) throw badRequest(`Campos desconhecidos: ${unknown.join(", ")}`);

  const result = {};
  for (const [name, validate] of Object.entries(fields)) {
    if (body[name] === undefined) {
      if (!partial && !validate.optional) throw badRequest(`Campo obrigatório: ${name}`);
      continue;
    }
    result[name] = validate(body[name], name);
  }
  if (partial && Object.keys(result).length === 0) {
    throw badRequest("Informe ao menos um campo para atualizar");
  }
  return result;
}

export function optional(validate) {
  const wrapped = (value, name) => validate(value, name);
  wrapped.optional = true;
  return wrapped;
}

export function finiteNumber({ min = -Infinity, max = Infinity, minExclusive = false, maxExclusive = false } = {}) {
  return (value, name) => {
    const ok =
      typeof value === "number" &&
      Number.isFinite(value) &&
      (minExclusive ? value > min : value >= min) &&
      (maxExclusive ? value < max : value <= max);
    if (!ok) throw badRequest(`${name} inválido`);
    return value;
  };
}

export function boolean(value, name) {
  if (typeof value !== "boolean") throw badRequest(`${name} deve ser booleano`);
  return value;
}

export function timestamp(value, name) {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw badRequest(`${name} deve ser uma data ISO 8601`);
  }
  return date.toISOString();
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function radarId(value, name = "id") {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw badRequest(`${name} deve ter de 1 a 64 caracteres entre letras, números, - e _`);
  }
  return value;
}

export function positiveIntegerParam(value, name = "id") {
  if (!/^[1-9][0-9]{0,18}$/.test(value)) throw badRequest(`${name} inválido`);
  return value;
}

/** Converte violações de restrição do PostgreSQL em respostas HTTP. */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ erro: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "JSON inválido" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ erro: "Corpo da requisição grande demais" });
  }
  switch (err.code) {
    case "23505":
      return res.status(409).json({ erro: "Registro já existe" });
    case "23503":
      return res.status(409).json({
        erro: err.constraint?.includes("radar")
          ? "Radar inexistente ou com ocorrências associadas"
          : "Violação de referência",
      });
    case "23514":
    case "22P02":
      return res.status(400).json({ erro: "Valor rejeitado pelo banco de dados" });
    default:
      console.error(err);
      return res.status(500).json({ erro: "Erro interno" });
  }
}
