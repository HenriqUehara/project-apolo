# Migração de Interações · Pipeline (Notion → Notion)

App Node.js/Express para migração **ad hoc** (pontual, página a página) da base de
interações de pipeline do **Notion pessoal** (origem) para o **Notion do DGF** (destino).

Migra apenas **título + conteúdo** de cada interação. Faz **dedupe por título** no
destino: se já existir uma página com o mesmo título, ela é pulada.

## Pré-requisitos

- Node.js 18+ (usa `fetch` nativo e `structuredClone`)
- Duas integrações do Notion (uma por workspace), cada uma com acesso (share) ao
  banco correspondente:
  - integração **pessoal** compartilhada com o banco de origem
  - integração **DGF** compartilhada com o banco de destino

## Configuração

1. Copie o exemplo de variáveis de ambiente:

   ```bash
   cp .env.example .env
   ```

2. Preencha o `.env` com seus valores reais:

   | Variável                 | O que é                                            |
   |--------------------------|----------------------------------------------------|
   | `NOTION_PERSONAL_TOKEN`  | Token da integração do workspace pessoal (origem)  |
   | `PERSONAL_DATABASE_ID`   | ID do banco de interações na origem                |
   | `NOTION_DGF_TOKEN`       | Token da integração do workspace do DGF (destino)  |
   | `DGF_DATABASE_ID`        | ID do banco de interações no destino               |
   | `APP_PASSWORD`           | Senha para acessar a interface web                 |
   | `PORT`                   | Porta (opcional; default 3000)                     |

   > O ID de um banco é a sequência de 32 caracteres na URL do banco no Notion.

3. Instale e rode:

   ```bash
   npm install
   npm start
   ```

4. Abra `http://localhost:3000`, entre com a `APP_PASSWORD`, e clique em **Migrar**
   na interação que quiser levar para o DGF.

## Como funciona

- `GET /api/interactions` — lista as páginas do banco de origem (título).
- `POST /api/migrate` `{ pageId }` — migra uma página:
  1. lê título e conteúdo na origem;
  2. checa duplicata por título no destino (pula se existir);
  3. cria a página no destino com o título;
  4. copia os blocos de conteúdo suportados.

### Blocos de conteúdo suportados

parágrafo, headings 1–3, listas (com/sem número), to-do, toggle, citação, callout,
código, divisória e bookmark — incluindo aninhamento. Blocos não suportados
(ex.: tabelas, embeds, bancos filhos, colunas) são pulados, e a contagem aparece
no resultado da migração.

## Segurança

- O `.env` está no `.gitignore` — **nunca** versione suas credenciais.
- Troque o `APP_PASSWORD` por algo forte.
- Se algum token vazar, revogue em https://www.notion.so/my-integrations e gere outro.
