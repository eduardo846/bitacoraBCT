import records from "./records.js";

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function requireFirebaseAuth(request, handler) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return jsonResponse(401, { message: "Inicia sesión para acceder a la bitácora." });
  }

  try {
    const user = await records.verifyIdToken(match[1]);
    return await handler(user);
  } catch (error) {
    if ([401, 403, 503].includes(error.statusCode)) {
      return jsonResponse(error.statusCode, { message: error.message });
    }
    console.error("Error en una función de Bitácora:", error);
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = status < 500 ? error.message : "Ocurrió un error al procesar la solicitud.";
    return jsonResponse(status, { message });
  }
}

export async function readJson(request) {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 64 * 1024) {
    const error = new Error("La solicitud es demasiado grande.");
    error.statusCode = 413;
    throw error;
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("El cuerpo debe ser un JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

export function methodNotAllowed(allow) {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: allow,
      "Cache-Control": "no-store"
    }
  });
}
