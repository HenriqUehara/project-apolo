# Project-Apolo — Migração de Interações de Pipeline (Notion → Notion)

> Documento de contexto para retomada, debug e revisão do projeto.
> Mantém o histórico de decisões e armadilhas já resolvidas.

## O que é
App web que migra registros da base **"Interações - Pipeline"** do Notion
**pessoal** (origem) para o Notion do **DGF** (destino). Migração **ad hoc**:
lista as interações da origem e o usuário migra uma a uma por botão. Copia
**título + conteúdo**, com **dedupe por título** (pula se já existir página
com mesmo título no destino).

## Stack e hospedagem
- **Netlify Functions** (serverless) — não há servidor Express persistente.
  Foi convertido de uma versão Express inicial.
- Front-end estático em `public/`, functions em `netlify/functions/`.
- SDK `@notionhq/client`. Node ESM (`"type": "module"`).
- Repositório GitHub: `HenriqUehara/project-apolo`. Deploy automático no
  Netlify a cada push. URL: `project-apolo.netlify.app`.

## Estrutura
```
netlify.toml                      → publish=public, functions dir, redirects /api/* → functions
public/index.html                 → UI: tela de senha + lista com busca e ordenação A→Z/Z→A
netlify/functions/
  ├── interactions.js             → GET  /api/interactions (lista origem)
  ├── migrate.js                  → POST /api/migrate {pageId} (migra uma página)
  └── _lib/
      ├── migrate.js              → TODA a lógica Notion→Notion
      └── auth.js                 → checagem de senha (header x-app-password)
```
> Atenção: existe um `migrate.js` **na raiz** (sobra da versão Express) que
> **não é usado**. O que vale é `netlify/functions/_lib/migrate.js`.

## Variáveis de ambiente (no painel do Netlify, não no código)
`NOTION_PERSONAL_TOKEN`, `PERSONAL_DATABASE_ID`, `NOTION_DGF_TOKEN`,
`DGF_DATABASE_ID`, `APP_PASSWORD`. (Há um `PORT` legado, inofensivo.)

## Lógica central (`_lib/migrate.js`)
- `getTitlePropName` — descobre dinamicamente o nome da propriedade `title`
  de cada banco (não assume "Name").
- `listSourceInteractions` — pagina o banco de origem, retorna `{id, title}`
  ordenado.
- `migrateOne(pageId)` — lê título; checa duplicata por título no destino;
  cria página com o título; lê os blocos da origem (`getBlocks`, recursivo);
  sanitiza; envia em lotes (`appendBlocks`, ~90 por chamada).
- `sanitizeBlock` + `stripNulls` + `READ_ONLY_FIELDS` — limpam o conteúdo
  lido para o formato que a API de escrita aceita.
- `SUPPORTED_BLOCK_TYPES` — só recria tipos suportados (parágrafo, headings,
  listas, to-do, toggle, quote, callout, code, divider, bookmark). Outros
  são pulados e contados em `skippedBlocks`.

## Histórico de armadilhas resolvidas (provável fonte de bugs futuros)
1. **"Failed to fetch"** — abrir `index.html` direto (file://) em vez de
   servir. Em produção é o Netlify; local seria `netlify dev`.
2. **Arquivos sumindo na descompactação do zip** — `netlify.toml` e as
   functions não subiam. Recriados direto no terminal.
3. **`netlify.toml` parse error** — TOML malformado (indentação/caracteres
   invisíveis). Validar com `cat -A`.
4. **Editar o arquivo errado** — alterações no `migrate.js` da raiz não
   tinham efeito; o certo é `netlify/functions/_lib/migrate.js`. Sempre
   conferir `git status` antes do commit.
5. **`APP_PASSWORD não configurado`** — variável de ambiente só vale após
   **novo deploy**; cadastrar não basta, tem que redeployar.
6. **`Could not find database`** — IDs trocados: foi cadastrado o **ID da
   view** (depois do `?v=`) em vez do **ID do banco** (antes do `?v=`).
7. **Integração sem acesso ao banco** — toda integração precisa ser conectada
   ao banco no Notion (**"..." → Connections**). Pessoal→origem, DGF→destino.
8. **Sem Node no Git Bash** (`node: command not found`) — não dá pra validar
   sintaxe localmente; o deploy do Netlify acaba sendo o checador (falha
   vermelha = erro de sintaxe).

## Erros de validação de bloco (a série recorrente)
A API de leitura devolve campos que a API de escrita recusa. Já tratados:
`icon: null` (via `stripNulls`) e `list_format: "numbers"` (via
`READ_ONLY_FIELDS`).

**Padrão de correção:**
- Se aparecer `body.children[N].ALGUM_BLOCO.ALGUM_CAMPO should be not present`,
  basta adicionar `"ALGUM_CAMPO"` ao conjunto `READ_ONLY_FIELDS` em
  `_lib/migrate.js`.
- Se for `... should be an object or undefined, instead was null`, o
  `stripNulls` já cobre.

## Decisões de design deliberadas
- **"Created by" do Notion não é editável via API** — é automático e sai como
  a integração. Tentar setar pessoa exigiria campo People próprio (recusado)
  ou OAuth como usuário (complexo demais). Mantido automático.
- **Auth por senha simples** (header `x-app-password`) — adequado para uso
  pessoal, não para dados muito sensíveis em internet aberta.
- UI nas cores do DGF (verde escuro/verde), com busca por título + toggle de
  ordenação.

## Fluxo de uma alteração (passo a passo)
1. Editar o arquivo certo (quase sempre `netlify/functions/_lib/migrate.js`
   ou `public/index.html`).
2. `git status` → confirmar que o caminho modificado é o esperado.
3. `git add <arquivo>` → `git commit -m "..."` → `git push`.
4. Netlify redeploya sozinho ao detectar o push. Acompanhar até ficar verde
   (Published). Deploy vermelho = erro; abrir o log.
5. Mudou variável de ambiente? Não basta salvar: disparar **Deploys →
   Trigger deploy → Deploy site**.
6. Testar no site. Para isolar problema de function, acessar direto
   `/.netlify/functions/interactions` (deve responder JSON, não 404).

## Pendência de segurança (importante)
Os tokens originais do Notion e a `APP_PASSWORD` (`Canelinha123*`) **vazaram**
num arquivo no início do projeto. Regenerar os dois tokens em
https://www.notion.so/my-integrations, trocar a senha, atualizar as env vars
no Netlify e redeployar — caso ainda não tenha sido feito.
