import "dotenv/config";
import express from "express";
import { listSourceInteractions, migrateOne } from "./migrate.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD;

// ── Auth simples por senha (header x-app-password) ──────────────────────────
function requireAuth(req, res, next) {
  if (!APP_PASSWORD) {
    return res.status(500).json({ error: "APP_PASSWORD não configurado no servidor." });
  }
  if (req.get("x-app-password") !== APP_PASSWORD) {
    return res.status(401).json({ error: "Senha inválida." });
  }
  next();
}

// ── Rotas de API ────────────────────────────────────────────────────────────

// Lista as interações disponíveis na origem
app.get("/api/interactions", requireAuth, async (req, res) => {
  try {
    const items = await listSourceInteractions();
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Migra uma página específica (ad hoc)
app.post("/api/migrate", requireAuth, async (req, res) => {
  const { pageId } = req.body || {};
  if (!pageId) return res.status(400).json({ error: "pageId é obrigatório." });
  try {
    const result = await migrateOne(pageId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ── Front-end estático ───────────────────────────────────────────────────────
app.use(express.static("public"));

app.listen(PORT, () => {
  console.log(`▶ Servidor rodando em http://localhost:${PORT}`);
});
