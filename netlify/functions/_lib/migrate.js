import { Client } from "@notionhq/client";

const personal = new Client({ auth: process.env.NOTION_PERSONAL_TOKEN });
const dgf = new Client({ auth: process.env.NOTION_DGF_TOKEN });

const PERSONAL_DB = process.env.PERSONAL_DATABASE_ID;
const DGF_DB = process.env.DGF_DATABASE_ID;

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

function sanitizeBlock(block) {
  const type = block.type;
  if (!SUPPORTED_BLOCK_TYPES.has(type)) return null;

  const payload = block[type] ? structuredClone(block[type]) : {};
  delete payload.children;

  if (block.__children?.length) {
    const childBlocks = block.__children.map(sanitizeBlock).filter(Boolean);
    if (childBlocks.length) payload.children = childBlocks;
  }

  return { object: "block", type, [type]: payload };
}

async function appendBlocks(client, pageId, blocks) {
  const CHUNK = 90;
  for (let i = 0; i < blocks.length; i += CHUNK) {
    await client.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + CHUNK),
    });
  }
}

export async function listSourceInteractions() {
  const titleProp = await getTitlePropName(personal, PERSONAL_DB);
  const pages = await listAllPages(personal, PERSONAL_DB);
  return pages
    .map((p) => ({ id: p.id, title: plainTitle(p, titleProp) || "(sem título)" }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export async function migrateOne(personalPageId) {
  const srcTitleProp = await getTitlePropName(personal, PERSONAL_DB);
  const dstTitleProp = await getTitlePropName(dgf, DGF_DB);

  const page = await personal.pages.retrieve({ page_id: personalPageId });
  const title = plainTitle(page, srcTitleProp);

  if (!title) {
    return { status: "error", title: "(sem título)", message: "Página sem título; pulada." };
  }

  const existing = await dgf.databases.query({
    database_id: DGF_DB,
    filter: { property: dstTitleProp, title: { equals: title } },
    page_size: 1,
  });
  if (existing.results.length > 0) {
    return { status: "skipped", title, message: "Já existe no destino (mesmo título)." };
  }

  const newPage = await dgf.pages.create({
    parent: { database_id: DGF_DB },
    properties: {
      [dstTitleProp]: { title: [{ type: "text", text: { content: title } }] },
    },
  });

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
