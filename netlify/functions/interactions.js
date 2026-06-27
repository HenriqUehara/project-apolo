import { listSourceInteractions } from "./_lib/migrate.js";
import { checkAuth, json } from "./_lib/auth.js";

export async function handler(event) {
  const authErr = checkAuth(event);
  if (authErr) return authErr;

  try {
    const items = await listSourceInteractions();
    return json(200, { items });
  } catch (err) {
    console.error(err);
    return json(500, { error: err.message });
  }
}
