import records from "../../lib/records.js";
import { jsonResponse, methodNotAllowed, readJson, requireFirebaseAuth } from "../../lib/api-http.mjs";

export default async function handler(request) {
  return requireFirebaseAuth(request, async () => {
    if (request.method === "GET") {
      return jsonResponse(200, await records.readEntries());
    }
    if (request.method === "POST") {
      const entry = await records.createEntry(await readJson(request));
      return jsonResponse(201, entry);
    }
    return methodNotAllowed("GET, POST");
  });
}

export const config = { path: "/api/registros" };
