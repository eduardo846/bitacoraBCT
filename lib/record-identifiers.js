const { createHash } = require("node:crypto");

function normalizeName(value) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

function referenceId(type, value, scope = "") {
  const identity = [type, scope, normalizeName(value)].join("\0");
  return createHash("sha256").update(identity, "utf8").digest("hex");
}

function getRecordReferences(entry) {
  const clienteId = referenceId("cliente", entry.cliente);
  const consultorId = referenceId("consultor", entry.consultor);
  const proyectoId = referenceId("proyecto", entry.proyecto, clienteId);

  return {
    ids: { consultorId, clienteId, proyectoId },
    documents: [
      {
        collection: "consultores",
        id: consultorId,
        data: { nombre: entry.consultor, nombreNormalizado: normalizeName(entry.consultor) }
      },
      {
        collection: "clientes",
        id: clienteId,
        data: { nombre: entry.cliente, nombreNormalizado: normalizeName(entry.cliente) }
      },
      {
        collection: "proyectos",
        id: proyectoId,
        data: {
          nombre: entry.proyecto,
          nombreNormalizado: normalizeName(entry.proyecto),
          clienteId
        }
      }
    ]
  };
}

module.exports = { getRecordReferences, normalizeName };
