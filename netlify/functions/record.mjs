import records from "../../lib/records.js";
import { jsonResponse, methodNotAllowed, readJson, requireIdentity } from "../../lib/netlify-functions.mjs";

export default async function handler(request, context) {
  return requireIdentity(async () => {
    const id = context.params.id;
    if (!/^[0-9a-f-]{36}$/i.test(id || "")) {
      return jsonResponse(404, { message: "No se encontró el recurso solicitado." });
    }
    if (request.method === "PUT") {
      const entry = await records.updateEntry(id, await readJson(request));
      return entry
        ? jsonResponse(200, entry)
        : jsonResponse(404, { message: "El registro ya no existe." });
    }
    if (request.method === "DELETE") {
      const deleted = await records.deleteEntry(id);
      return deleted
        ? jsonResponse(200, { message: "Registro eliminado." })
        : jsonResponse(404, { message: "El registro ya no existe." });
    }
    return methodNotAllowed("PUT, DELETE");
  });
}

export const config = {
  path: "/api/registros/:id",
  excludedPath: "/api/registros/exportar"
};
