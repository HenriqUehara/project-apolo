export function checkAuth(event) {
  const APP_PASSWORD = process.env.APP_PASSWORD;
  if (!APP_PASSWORD) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "APP_PASSWORD não configurado no servidor." }),
    };
  }
  const sent = event.headers["x-app-password"];
  if (sent !== APP_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "Senha inválida." }) };
  }
  return null;
}

export const json = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});
