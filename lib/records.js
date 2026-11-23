const { randomUUID } = require("node:crypto");
const ExcelJS = require("exceljs");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldPath, getFirestore } = require("firebase-admin/firestore");
const { getRecordReferences } = require("./record-identifiers");

const ACTIVITIES = new Set([
  "Desarrollo",
  "Reuniones",
  "Almuerzo",
  "Cita Médica",
  "Vacaciones o Feriado",
  "Soporte",
  "Otro"
]);
let recordsCollection;

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function initializeFirebase() {
  if (recordsCollection) return recordsCollection;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Completa FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en la configuración del servidor.");
  }
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n")
      }),
      projectId
    });
  }
  recordsCollection = getFirestore().collection("registros");
  return recordsCollection;
}

function getRecordsCollection() {
  return recordsCollection || initializeFirebase();
}

async function verifyIdToken(token) {
  const allowedEmails = (process.env.FIREBASE_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLocaleLowerCase("en"))
    .filter(Boolean);
  if (allowedEmails.length === 0) {
    throw createHttpError("Configura FIREBASE_ALLOWED_EMAILS con las cuentas autorizadas.", 503);
  }

  initializeFirebase();
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(token, true);
  } catch (error) {
    if ([
      "auth/argument-error",
      "auth/invalid-id-token",
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/user-disabled",
      "auth/user-not-found"
    ].includes(error.code)) {
      throw createHttpError("La sesión no es válida o expiró. Inicia sesión de nuevo.", 401);
    }
    throw error;
  }

  const email = typeof decodedToken.email === "string"
    ? decodedToken.email.trim().toLocaleLowerCase("en")
    : "";
  if (!email || !allowedEmails.includes(email)) {
    throw createHttpError("Esta cuenta no está autorizada para acceder a la bitácora.", 403);
  }
  return decodedToken;
}

async function readEntries(month) {
  let query = getRecordsCollection();
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
    query = query.where("fecha", ">=", `${month}-01`).where("fecha", "<", nextMonth);
  }
  const snapshot = await query.get();
  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
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

function getValidatedEntry(body) {
  const validated = validateEntry(body);
  if (validated.error) throw createHttpError(validated.error, 400);
  return validated.value;
}

async function createEntry(body) {
  const value = getValidatedEntry(body);
  const { ids, documents } = getRecordReferences(value);
  const entry = { id: randomUUID(), ...value, ...ids, createdAt: new Date().toISOString() };
  const firestore = getFirestore();
  const batch = firestore.batch();
  for (const document of documents) {
    batch.set(firestore.collection(document.collection).doc(document.id), document.data, { merge: true });
  }
  batch.create(getRecordsCollection().doc(entry.id), entry);
  await batch.commit();
  return entry;
}

async function updateEntry(id, body) {
  const value = getValidatedEntry(body);
  const { ids, documents } = getRecordReferences(value);
  const reference = getRecordsCollection().doc(id);
  return getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    const entry = {
      ...snapshot.data(),
      ...value,
      ...ids,
      updatedAt: new Date().toISOString()
    };
    transaction.set(reference, entry);
    for (const document of documents) {
      transaction.set(
        getFirestore().collection(document.collection).doc(document.id),
        document.data,
        { merge: true }
      );
    }
    return { ...entry, id: snapshot.id };
  });
}

async function migrateRecordReferences({ apply = false } = {}) {
  const firestore = getFirestore();
  const collection = getRecordsCollection();
  const pageSize = 250;
  const batchSize = 450;
  let cursor = null;
  let scanned = 0;
  let updatedRecords = 0;
  let pages = 0;

  while (true) {
    let query = collection.orderBy(FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    pages += 1;
    scanned += snapshot.size;
    cursor = snapshot.docs[snapshot.docs.length - 1];
    const writes = new Map();

    for (const document of snapshot.docs) {
      const entry = document.data();
      const fields = ["consultor", "cliente", "proyecto"];
      const invalidFields = fields.filter((field) => typeof entry[field] !== "string" || !entry[field].trim());
      if (invalidFields.length) {
        throw new Error(`El registro ${document.id} tiene campos incompletos: ${invalidFields.join(", ")}.`);
      }

      const { ids, documents } = getRecordReferences(entry);
      if (fields.some((field) => entry[`${field}Id`] !== ids[`${field}Id`])) {
        writes.set(`registros/${document.id}`, {
          reference: document.ref,
          data: ids
        });
        updatedRecords += 1;
      }
      for (const reference of documents) {
        const path = `${reference.collection}/${reference.id}`;
        writes.set(path, {
          reference: firestore.collection(reference.collection).doc(reference.id),
          data: reference.data
        });
      }
    }

    if (apply) {
      const operations = [...writes.values()];
      for (let index = 0; index < operations.length; index += batchSize) {
        const batch = firestore.batch();
        for (const operation of operations.slice(index, index + batchSize)) {
          batch.set(operation.reference, operation.data, { merge: true });
        }
        await batch.commit();
      }
    }

    if (snapshot.size < pageSize) break;
  }

  return { apply, scanned, updatedRecords, pages };
}

async function deleteEntry(id) {
  const reference = getRecordsCollection().doc(id);
  return getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return false;
    transaction.delete(reference);
    return true;
  });
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

  }

  sheet.autoFilter = { from: "A1", to: `J${Math.max(1, sheet.rowCount)}` };
  sheet.pageSetup.printArea = `A1:J${Math.max(1, sheet.rowCount)}`;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function exportMonthlyWorkbook(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw createHttpError("Indica el mes de consulta en formato AAAA-MM.", 400);
  }
  const entries = await readEntries(month);
  if (entries.length === 0) {
    throw createHttpError("No hay registros para el mes seleccionado.", 404);
  }
  return createMonthlyWorkbook(entries, month);
}

module.exports = {
  createEntry,
  createMonthlyWorkbook,
  deleteEntry,
  exportMonthlyWorkbook,
  initializeFirebase,
  migrateRecordReferences,
  readEntries,
  updateEntry,
  verifyIdToken
};
