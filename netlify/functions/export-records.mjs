import records from "../../lib/records.js";
import { jsonResponse, methodNotAllowed, requireFirebaseAuth } from "../../lib/api-http.mjs";

export default async function handler(request) {
  return requireFirebaseAuth(request, async () => {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const month = new URL(request.url).searchParams.get("mes") || "";
    const workbook = await records.exportMonthlyWorkbook(month);
    return new Response(workbook, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bitacora_${month}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  });
}

export const config = { path: "/api/registros/exportar" };
