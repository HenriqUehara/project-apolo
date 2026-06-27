import { migrateOne } from "./_lib/migrate.js";
import { checkAuth, json } from "./_lib/auth.js";

export async function handler(event) {
  const authErr = checkAuth(event);
  if (authErr) return authErr;

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método não permitido." });
  }

  let pageId;
  try {
    ({ pageId } = JSON.parse(event.body || "{}"));
  } catch {
    return json(400, { error: "Corpo inválido." });
  }
  if (!pageId) return json(400, { error: "pageId é obrigatório." });

  try {
    const result = await migrateOne(pageId);
    return json(200, result);
  } catch (err) {
    console.error(err);
    return json(500, { status: "error", message: err.message });
  }
}
