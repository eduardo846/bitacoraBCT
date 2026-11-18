const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const ExcelJS = require("exceljs");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "registros.json");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 64 * 1024;
const ACTIVITIES = new Set([
  "Desarrollo",
  "Reuniones",
  "Almuerzo",
  "Cita Médica",
  "Vacaciones o Feriado",
  "Soporte",
  "Otro"
]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};
let writeQueue = Promise.resolve();

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function withWriteLock(operation) {
  const result = writeQueue.then(operation);
  writeQueue = result.catch(() => {});
  return result;
}

async function readEntries() {
  const contents = await fs.readFile(DATA_FILE, "utf8");
  const entries = JSON.parse(contents);
  if (!Array.isArray(entries)) {
    throw new Error("El archivo de registros debe contener una lista.");
  }
  return entries;
}

async function saveEntries(entries) {
  const tempFile = path.join(DATA_DIR, `registros.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tempFile, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    await fs.rename(tempFile, DATA_FILE);
  } catch (error) {
    await fs.rm(tempFile, { force: true });
    throw error;
  }
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

function validateEntry(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "El registro debe ser un objeto válido." };
  }

  const fields = {
    consultor: { max: 100, label: "El consultor" },
    cliente: { max: 100, label: "El cliente" },
    proyecto: { max: 160, label: "El proyecto o requerimiento" },
    pais: { max: 100, label: "El país" },
    descripcion: { max: 1000, label: "La descripción" }
  };
  const value = {};
  for (const [field, rules] of Object.entries(fields)) {
    const text = typeof body[field] === "string" ? body[field].trim() : "";
    if (text.length < 1 || text.length > rules.max) {
      return { error: `${rules.label} es obligatorio y debe tener hasta ${rules.max} caracteres.` };
    }
    value[field] = text;
  }

  const fecha = typeof body.fecha === "string" ? body.fecha : "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    ? new Date(`${fecha}T00:00:00Z`)
    : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== fecha) {
    return { error: "Indica una fecha válida." };
  }

  const actividad = typeof body.actividad === "string" ? body.actividad : "";
  if (!ACTIVITIES.has(actividad)) {
    return { error: "Selecciona una actividad válida." };
  }

  const horaInicio = typeof body.horaInicio === "string" ? body.horaInicio : "";
  const horaFin = typeof body.horaFin === "string" ? body.horaFin : "";
  const isValidTime = (time) => {
    const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const startMinutes = isValidTime(horaInicio);
  const endMinutes = isValidTime(horaFin);
  if (startMinutes === null || endMinutes === null) {
    return { error: "Indica horas válidas en formato de 24 horas." };
  }

  const elapsedMinutes = endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : 24 * 60 - startMinutes + endMinutes;
  return {
    value: {
      ...value,
      fecha,
      actividad,
      horaInicio,
      horaFin,
      tiempo: Math.round((elapsedMinutes / 60) * 100) / 100
    }
  };
}

function excelTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60 + minutes) / 1440;
}

function activityFill(activity) {
  if (activity === "Vacaciones o Feriado") return "FFA9D18E";
  if (activity === "Almuerzo" || activity === "Cita Médica") return "FFF4A340";
  if (activity === "Reuniones") return "FFFFE699";
  return "FFFFD966";
}

async function createMonthlyWorkbook(entries, month) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bitácora";
  workbook.subject = `Registro de actividades de ${month}`;
  workbook.title = `Bitácora ${month}`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Bitácora ${month}`, {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    }
  });
  sheet.columns = [
    { header: "Consultor", key: "consultor", width: 23 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Cliente", key: "cliente", width: 20 },
    { header: "Proyecto / Requerimiento", key: "proyecto", width: 30 },
    { header: "País", key: "pais", width: 17 },
    { header: "Actividad", key: "actividad", width: 23 },
    { header: "Descripción", key: "descripcion", width: 48 },
    { header: "Hora inicio", key: "horaInicio", width: 14 },
    { header: "Hora fin", key: "horaFin", width: 14 },
    { header: "Tiempo", key: "tiempo", width: 12 }
  ];

  const header = sheet.getRow(1);
  header.height = 32;
  header.eachCell((cell) => {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0872C5" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF303030" } },
      bottom: { style: "thin", color: { argb: "FF303030" } },
      left: { style: "thin", color: { argb: "FF303030" } },
      right: { style: "thin", color: { argb: "FF303030" } }
    };
  });

  const sortedEntries = entries
    .filter((entry) => entry.fecha.startsWith(month))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.horaInicio.localeCompare(b.horaInicio));

  for (const entry of sortedEntries) {
    const row = sheet.addRow([
      entry.consultor,
      new Date(`${entry.fecha}T00:00:00.000Z`),
      entry.cliente,
      entry.proyecto,
      entry.pais,
      entry.actividad,
      entry.descripcion,
      excelTime(entry.horaInicio),
      excelTime(entry.horaFin),
      entry.tiempo
    ]);
    row.height = Math.max(24, Math.min(60, Math.ceil(entry.descripcion.length / 45) * 14));
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: activityFill(entry.actividad) } };
      cell.font = { name: "Arial", size: 10, color: { argb: "FF202020" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF4A4437" } },
        bottom: { style: "thin", color: { argb: "FF4A4437" } },
        left: { style: "thin", color: { argb: "FF4A4437" } },
        right: { style: "thin", color: { argb: "FF4A4437" } }
      };
    });
    row.getCell(2).numFmt = "d/m/yyyy";
    row.getCell(8).numFmt = "hh:mm";
    row.getCell(9).numFmt = "hh:mm";
    row.getCell(10).numFmt = "0.00";

    if (entry.cliente.trim().toLocaleUpperCase("es") === "NOVACOMP") {
      for (const column of [3, 4]) {
        const cell = row.getCell(column);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF1F12" } };
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF202020" } };
      }
    }
  }

  sheet.autoFilter = { from: "A1", to: `J${Math.max(1, sheet.rowCount)}` };
  sheet.pageSetup.printArea = `A1:J${Math.max(1, sheet.rowCount)}`;
  return workbook.xlsx.writeBuffer();
}

async function handleApi(request, response, url) {
  const isCollection = url.pathname === "/api/registros";

  if (url.pathname === "/api/registros/exportar" && request.method === "GET") {
    const month = url.searchParams.get("mes") || "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return sendJson(response, 400, { message: "Indica el mes de consulta en formato AAAA-MM." });
    }
    const entries = (await readEntries()).filter((entry) => entry.fecha.startsWith(month));
    if (entries.length === 0) {
      return sendJson(response, 404, { message: "No hay registros para el mes seleccionado." });
    }

    const workbook = await createMonthlyWorkbook(entries, month);
    response.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bitacora_${month}.xlsx"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    return response.end(Buffer.from(workbook));
  }

  if (isCollection && request.method === "GET") {
    return sendJson(response, 200, await readEntries());
  }

  if (isCollection && request.method === "POST") {
    const body = await readJson(request);
    const validated = validateEntry(body);
    if (validated.error) return sendJson(response, 400, { message: validated.error });

    const created = await withWriteLock(async () => {
      const entries = await readEntries();
      const entry = { id: randomUUID(), ...validated.value, createdAt: new Date().toISOString() };
      entries.unshift(entry);
      await saveEntries(entries);
      return entry;
    });
    return sendJson(response, 201, created);
  }

  const match = url.pathname.match(/^\/api\/registros\/([0-9a-f-]{36})$/i);
  if (!match) return sendJson(response, 404, { message: "No se encontró el recurso solicitado." });
  const id = match[1];

  if (request.method === "PUT") {
    const body = await readJson(request);
    const validated = validateEntry(body);
    if (validated.error) return sendJson(response, 400, { message: validated.error });

    const updated = await withWriteLock(async () => {
      const entries = await readEntries();
      const index = entries.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      entries[index] = { ...entries[index], ...validated.value, updatedAt: new Date().toISOString() };
      await saveEntries(entries);
      return entries[index];
    });
    return updated
      ? sendJson(response, 200, updated)
      : sendJson(response, 404, { message: "El registro ya no existe." });
  }

  if (request.method === "DELETE") {
    const deleted = await withWriteLock(async () => {
      const entries = await readEntries();
      const remaining = entries.filter((entry) => entry.id !== id);
      if (remaining.length === entries.length) return false;
      await saveEntries(remaining);
      return true;
    });
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
      return await handleApi(request, response, url);
    } catch (error) {
      console.error("Error en la API:", error);
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
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
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
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(DATA_FILE, "[]\n", { encoding: "utf8", flag: "wx" }).catch((writeError) => {
      if (writeError.code !== "EEXIST") throw writeError;
    });
  }

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
