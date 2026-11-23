require("dotenv").config();

const records = require("../lib/records");

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--apply")) {
    throw new Error("Uso: npm run migrate:references [-- --apply]");
  }

  records.initializeFirebase();
  const result = await records.migrateRecordReferences({ apply: args.includes("--apply") });
  console.log(JSON.stringify({
    mode: result.apply ? "aplicado" : "simulación",
    registrosRevisados: result.scanned,
    registrosPorActualizar: result.updatedRecords,
    paginas: result.pages
  }, null, 2));
  if (!result.apply) console.log("Vuelve a ejecutar el comando con -- --apply para guardar los cambios.");
}

main().catch((error) => {
  console.error("No se pudo completar la migración de referencias:", error);
  process.exitCode = 1;
});
