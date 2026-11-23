const test = require("node:test");
const assert = require("node:assert/strict");
const { getRecordReferences, normalizeName } = require("../lib/record-identifiers");

test("normalizes whitespace and letter case for stable references", () => {
  assert.equal(normalizeName("  Proyecto   Ágil "), normalizeName("proyecto ágil"));

  const first = getRecordReferences({
    consultor: "Héctor Ramírez",
    cliente: "BCT",
    proyecto: "Proyecto Ágil"
  });
  const second = getRecordReferences({
    consultor: " héctor  ramírez ",
    cliente: "bct",
    proyecto: "proyecto ágil"
  });

  assert.deepEqual(first.ids, second.ids);
});

test("scopes project references to their client", () => {
  const first = getRecordReferences({
    consultor: "Héctor Ramírez",
    cliente: "BCT",
    proyecto: "Portal"
  });
  const second = getRecordReferences({
    consultor: "Héctor Ramírez",
    cliente: "Novacomp",
    proyecto: "Portal"
  });

  assert.notEqual(first.ids.clienteId, second.ids.clienteId);
  assert.notEqual(first.ids.proyectoId, second.ids.proyectoId);
  assert.equal(first.documents.find((document) => document.collection === "proyectos").data.clienteId, first.ids.clienteId);
});
