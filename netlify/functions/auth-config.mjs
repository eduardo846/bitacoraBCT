import records from "../../lib/records.js";
import { jsonResponse } from "../../lib/api-http.mjs";

export default async function handler() {
  try {
    return jsonResponse(200, records.getFirebaseClientConfig());
  } catch (error) {
    console.error("No se pudo cargar la configuración pública de Firebase:", error);
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return jsonResponse(status, {
      message: status < 500 ? error.message : "No se pudo cargar la configuración de autenticación."
    });
  }
}

export const config = { path: "/api/auth-config" };
