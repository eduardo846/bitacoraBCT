const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { createMonthlyWorkbook } = require("../lib/records");

test("keeps Novacomp Excel cells in the activity color instead of red", async () => {
  const buffer = await createMonthlyWorkbook([{
    consultor: "Consultor",
    fecha: "2026-11-23",
    cliente: "Novacomp",
    proyecto: "Proyecto",
    pais: "Costa Rica",
    actividad: "Otro",
    descripcion: "Actividad de prueba",
    horaInicio: "08:00",
    horaFin: "09:00",
    tiempo: 1
  }], "2026-11");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Bitácora 2026-11");

  assert.equal(sheet.getCell("C2").fill.fgColor.argb, "FFFFD966");
  assert.equal(sheet.getCell("D2").fill.fgColor.argb, "FFFFD966");
  assert.notEqual(sheet.getCell("C2").fill.fgColor.argb, "FFFF1F12");
});
