import { Client } from "@notionhq/client";

const personal = new Client({ auth: process.env.NOTION_PERSONAL_TOKEN });
const dgf = new Client({ auth: process.env.NOTION_DGF_TOKEN });

const PERSONAL_DB = process.env.PERSONAL_DATABASE_ID;
const DGF_DB = process.env.DGF_DATABASE_ID;

// ── Helpers ────────────────────────────────────────────────────────────────

// Descobre o nome da propriedade "title" de um banco (pode não se chamar "Name")
async function getTitlePropName(client, databaseId) {
  const db = await client.databases.retrieve({ database_id: databaseId });
  for (const [name, prop] of Object.entries(db.properties)) {
    if (prop.type === "title") return name;
  }
  throw new Error(`Nenhuma propriedade do tipo 'title' encontrada no banco ${databaseId}`);
}

function plainTitle(page, titlePropName) {
  const prop = page.properties?.[titlePropName];
  const arr = prop?.title ?? [];
  return arr.map((t) => t.plain_text).join("").trim();
}

// Lista todas as páginas de um banco (com paginação)
async function listAllPages(client, databaseId) {
  const pages = [];
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// Lê todos os blocos (conteúdo) de uma página, recursivamente
async function getBlocks(client, blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results) {
      if (block.has_children) {
        block.__children = await getBlocks(client, block.id);
      }
      blocks.push(block);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// Tipos de bloco que conseguimos recriar diretamente via API
const SUPPORTED_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "toggle",
  "quote",
  "callout",
  "code",
  "divider",
  "bookmark",
]);

// Limpa um bloco lido para um formato aceito no append (remove ids, metadados, etc.)
function sanitizeBlock(block) {
  const type = block.type;
  if (!SUPPORTED_BLOCK_TYPES.has(type)) return null;

  const payload = block[type] ? structuredClone(block[type]) : {};

  // Remove campos que a API de escrita rejeita
  delete payload.children;

  // Reanexa filhos suportados (toggles, listas aninhadas, callouts, quotes)
  if (block.__children?.length) {
    const childBlocks = block.__children
      .map(sanitizeBlock)
      .filter(Boolean);
    if (childBlocks.length) payload.children = childBlocks;
  }

  return { object: "block", type, [type]: payload };
}

// A API limita ~100 blocos por chamada de append
async function appendBlocks(client, pageId, blocks) {
  const CHUNK = 90;
  for (let i = 0; i < blocks.length; i += CHUNK) {
    await client.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + CHUNK),
    });
  }
}

// ── API pública do módulo ──────────────────────────────────────────────────

// Lista as interações da origem (pessoal) para exibir no front-end
export async function listSourceInteractions() {
  const titleProp = await getTitlePropName(personal, PERSONAL_DB);
  const pages = await listAllPages(personal, PERSONAL_DB);
  return pages
    .map((p) => ({ id: p.id, title: plainTitle(p, titleProp) || "(sem título)" }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

// Migra UMA página específica (ad hoc) da origem para o destino.
// Retorna { status: "migrated" | "skipped" | "error", ... }
export async function migrateOne(personalPageId) {
  const srcTitleProp = await getTitlePropName(personal, PERSONAL_DB);
  const dstTitleProp = await getTitlePropName(dgf, DGF_DB);

  // 1. Lê a página de origem
  const page = await personal.pages.retrieve({ page_id: personalPageId });
  const title = plainTitle(page, srcTitleProp);

  if (!title) {
    return { status: "error", title: "(sem título)", message: "Página sem título; pulada." };
  }

  // 2. Dedupe por título no destino
  const existing = await dgf.databases.query({
    database_id: DGF_DB,
    filter: { property: dstTitleProp, title: { equals: title } },
    page_size: 1,
  });
  if (existing.results.length > 0) {
    return { status: "skipped", title, message: "Já existe no destino (mesmo título)." };
  }

  // 3. Cria a página no destino só com o título
  const newPage = await dgf.pages.create({
    parent: { database_id: DGF_DB },
    properties: {
      [dstTitleProp]: { title: [{ type: "text", text: { content: title } }] },
    },
  });

  // 4. Copia o conteúdo (corpo da interação)
  const rawBlocks = await getBlocks(personal, personalPageId);
  const blocks = rawBlocks.map(sanitizeBlock).filter(Boolean);
  const skippedBlocks = rawBlocks.length - blocks.length;

  if (blocks.length) {
    await appendBlocks(dgf, newPage.id, blocks);
  }

  return {
    status: "migrated",
    title,
    url: newPage.url,
    blocks: blocks.length,
    skippedBlocks,
  };
}
