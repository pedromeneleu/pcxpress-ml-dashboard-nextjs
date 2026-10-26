# 08 · Runbook de operação

## Rodar localmente

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # preencher: SUPABASE_URL=https://supabase.arunadata.com.br,
                              # SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SCHEMA, SUPABASE_ACCOUNT_NAME
                              # opcional: RETURNS_DEMO_MODE=true (devoluções fictícias locais)
pnpm run dev                  # http://localhost:3000
```

Sem `.env.local` o painel abre com dados de demonstração (fallback) — útil para mexer só em layout.
Antes de concluir qualquer mudança: `pnpm run lint`, `pnpm run test` (3 falhas conhecidas),
`pnpm run build`.

## Publicar

Merge no `main` → a Vercel publica em produção. Cada PR/ramo gera uma prévia (com devoluções
fictícias). Mudou variável na Vercel? *Redeploy* sem cache.

## Verificar se está tudo saudável

| O quê | Como | Esperado |
|---|---|---|
| Painel conectado | Abrir `/api/dashboard?periodDays=30` | `"connected": true`, `"message": null`, `availableDateRange.lastDate` = ontem ou hoje |
| Devoluções | Abrir `/api/returns?currentStart=AAAA-MM-DD&currentEnd=AAAA-MM-DD` | `"status": "ready"`, `"demo": false` |
| Fluxos | n8n → Executions, filtrar pelos 3 fluxos ativos | Sync Diario 1×/dia ~19h; Backfill a cada 2 h; MVP7 de hora em hora no minuto 7 |
| Histórico longo | Consulta em `sync_runs` ([02-supabase.md](02-supabase.md#como-confirmar-no-banco)) | Último `success` de cada `workflow_name` recente |
| Saída do MVP7 | Abrir a última execução → node `Sincronizar Devolucoes` | `base_errors: 0`, `claims_deferred: 0`, `fila_erro: null`, `status_sem_etapa: []` |

## Problemas comuns

### O painel mostra "Dados de demonstração"

Leia `message` em `/api/dashboard`:

| Mensagem | Causa | O que fazer |
|---|---|---|
| "Dados ainda não disponíveis." | `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` ausentes no ambiente | Conferir variáveis na Vercel (ambiente certo) e fazer *Redeploy* |
| `Conta "PC Express" não encontrada no Supabase.` | `SUPABASE_ACCOUNT_NAME` diferente de `accounts.account_name` | Corrigir a variável ou o nome no banco |
| `Supabase 406/404 … PGRST106` | Schema `ml_dashboards` não exposto na Data API | Supabase → API settings → *Exposed schemas* |
| `Supabase 401 …` | Chave inválida ou rotacionada | Atualizar `SUPABASE_SERVICE_ROLE_KEY` |
| `Supabase 404 … PGRST205` | View/tabela ausente | Recriar o objeto (por isso o DDL precisa ser versionado) |
| Erro de *timeout*/rede | Supabase fora do ar ou lento (limite de 15 s por chamada) | Verificar o servidor da Aruna |

### Devoluções: "Aguardando dados de devoluções"

`tables_missing` → rodar as 3 migrações (ordem: `2026-10-05_devolucoes.sql`,
`2026-10-08_devolucoes_claims_sem_devolucao.sql`, `2026-10-08_devolucoes_fila.sql`), todas
idempotentes. `empty` → o MVP7 ainda não gravou nada (rodar manualmente). `error` → o detalhe
técnico aparece na tela; nunca são mostrados fictícios nesse caso.

### Token do Mercado Livre inválido

Sintoma: os fluxos falham com 400/401 em `oauth/token` (`invalid_grant`) ou "Access token ausente
ou vencido". Acontece se o `refresh_token` for revogado (troca de senha, app desautorizado,
renovação concorrente) ou ficar meses sem uso.

1. No DevCenter do Mercado Livre, abrir o app (`client_id` `4779123939652829`) e anotar a
   *Redirect URI* cadastrada (provavelmente `https://webhook.arunadata.com.br/webhook/ml-onboarding`,
   que repassa ao serviço do catalog-monitor — confirmar onde esse serviço grava o token).
2. Logado como a conta vendedora da PCXpress, abrir
   `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=<APP_ID>&redirect_uri=<REDIRECT_URI>`
   e autorizar.
3. Se o onboarding não gravar em `ml_dashboards.oauth_tokens`, trocar o `code` manualmente:
   `POST https://api.mercadolibre.com/oauth/token` com `grant_type=authorization_code`,
   `client_id`, `client_secret`, `code`, `redirect_uri` (e `code_verifier`, se o app usar PKCE).
4. Gravar/atualizar a linha da conta em `ml_dashboards.oauth_tokens` (`account_id`,
   `ml_user_id = 155871484`, `access_token`, `refresh_token`, `expires_at`).
5. Executar manualmente `ML Dashboards - Backfill - PCXpress` e conferir `status: success`.

O `refresh_token` do ML é de uso único: evite rodar dois fluxos que renovam token ao mesmo tempo.

### Execução do n8n abortada por tempo ("timed out after 300 seconds")

Limite do node Code. No MVP7, reduzir `max_claims_to_process_per_run` (150) ou `claim_concurrency`;
uma falha isolada se recupera sozinha na hora seguinte. No MVP3, reduzir `orders_chunk_days`.

### MVP3: "ultrapassou o limite de offset 10000"

Um bloco de dias tem pedidos demais para a paginação da API. Reduzir `orders_chunk_days`.

### Muitos 429 (*rate limit*)

Aumentar `request_delay_ms`, reduzir concorrência. MVP1–MVP4 não têm retentativa (roadmap item 15).

## Reprocessar dados

**Pedidos de um período antigo** (ex.: corrigir status): duplicar o `Sync Diario` (para não mexer
no agendado), no CONFIG preencher `orders_date_from`/`orders_date_to` (`AAAA-MM-DD`, os dois
juntos), opcionalmente desligar os nodes MVP2/MVP4 e executar manualmente. Upsert não duplica.
Apagar a cópia depois.

**Devoluções desde o início:** no MVP7, `claims_days_back` até 730; executar manualmente enquanto
`claims_deferred` > 0 (até 150 reclamações por execução); depois voltar para 30 (ou 180).

**Logística v2** (se reativada): religar os gatilhos ao CONFIG; backfill por mês fechado
(`backfill_month`), um dia por execução, até `month_complete`; depois o incremental.

## Mudar regras de negócio

- Devoluções: `app/returns/returns-config.ts` (status → etapa, dias para "parado", prazo, meses
  provisórios, PNR, alerta). Rodar `node --test tests/returns.test.mjs`.
- Cores e limites de saúde: `app/metric-signals.ts`.
- Traduções de ações do vendedor e condições de revisão: constantes no início do código do node
  `Sincronizar Devolucoes` (n8n) — atualizar também `ingestao/n8n/MVP7_Devolucoes.json`.

## Checklist de transição

Acessos e propriedade:

- [ ] Repositório GitHub transferido para a organização/responsável; Vercel reconectada ao novo repositório
- [ ] Projeto da Vercel com o novo responsável como dono/admin
- [ ] Acesso admin ao n8n (`webhook.arunadata.com.br`) e ao Supabase (`supabase.arunadata.com.br`)
- [ ] Acesso ao app no DevCenter do Mercado Livre e ao espaço do Google Chat de alertas
- [ ] Contato da PCXpress (quem usa o painel; quem decide os limites; quem classificará motivos)

Segurança:

- [ ] Client secret do app ML rotacionado e atualizado nos CONFIG do n8n
- [ ] `service_role`/segredo JWT do Supabase rotacionado; Vercel e n8n atualizados
- [ ] Webhook do Google Chat (catalog-monitor) recriado
- [ ] Chaves movidas para Credentials/variáveis do n8n

Conhecimento:

- [ ] `pg_dump --schema-only` do `ml_dashboards` versionado
- [ ] Docs e SQL antigos da pasta local recuperados (ou declarados perdidos)
- [ ] Workflows ML inativos exportados e sanitizados em `ingestao/n8n/`
- [ ] Planilha `pcxpress-fila-devolucoes` localizada (referência das regras da fila)
- [ ] Roadmap original (`ROADMAP-EVOLUCAO-DASHBOARD.md`) conciliado com [07-roadmap.md](07-roadmap.md)
