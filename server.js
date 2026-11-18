require("dotenv").config();

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const records = require("./lib/records");

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 64 * 1024;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("La solicitud es demasiado grande.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("El cuerpo debe ser un JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/registros/exportar" && request.method === "GET") {
    const month = url.searchParams.get("mes") || "";
    const workbook = await records.exportMonthlyWorkbook(month);
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bitacora_${month}.xlsx"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    return response.end(workbook);
  }

  if (url.pathname === "/api/registros" && request.method === "GET") {
    return sendJson(response, 200, await records.readEntries());
  }

  if (url.pathname === "/api/registros" && request.method === "POST") {
    const entry = await records.createEntry(await readJson(request));
    return sendJson(response, 201, entry);
  }

  const match = url.pathname.match(/^\/api\/registros\/([0-9a-f-]{36})$/i);
  if (!match) return sendJson(response, 404, { message: "No se encontró el recurso solicitado." });
  const id = match[1];

  if (request.method === "PUT") {
    const updated = await records.updateEntry(id, await readJson(request));
    return updated
      ? sendJson(response, 200, updated)
      : sendJson(response, 404, { message: "El registro ya no existe." });
  }

  if (request.method === "DELETE") {
    const deleted = await records.deleteEntry(id);
    return deleted
      ? sendJson(response, 200, { message: "Registro eliminado." })
      : sendJson(response, 404, { message: "El registro ya no existe." });
  }

  response.writeHead(405, { Allow: "GET, POST, PUT, DELETE" });
  return response.end();
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    try {
      const authorization = request.headers.authorization || "";
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (!match) {
        return sendJson(response, 401, { message: "Inicia sesión para acceder a la bitácora." });
      }
      await records.verifyIdToken(match[1]);
      return await handleApi(request, response, url);
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) console.error("Error en la API:", error);
      return sendJson(response, error.statusCode || 500, {
        message: error.statusCode ? error.message : "Ocurrió un error al procesar la solicitud."
      });
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }
  let requestedPath;
  try {
    requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    return response.end();
  }
  const filePath = path.resolve(DIST_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${DIST_DIR}${path.sep}`)) {
    response.writeHead(403);
    return response.end();
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    return response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("No se encontró el archivo.");
    }
    console.error("Error al servir la aplicación:", error);
    response.writeHead(500);
    return response.end();
  }
}

async function start() {
  records.initializeFirebase();

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error("Error inesperado:", error);
      if (!response.headersSent) sendJson(response, 500, { message: "Ocurrió un error inesperado." });
      else response.destroy();
    });
  });
  server.listen(PORT, () => {
    console.log(`Bitácora disponible en http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar Bitácora:", error);
  process.exitCode = 1;
});
