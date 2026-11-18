import records from "../../lib/records.js";
import { jsonResponse, methodNotAllowed, readJson, requireIdentity } from "../../lib/netlify-functions.mjs";

export default async function handler(request) {
  return requireIdentity(async () => {
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
