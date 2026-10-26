# 06 · Histórico do projeto

Reconstruído a partir das datas de criação/edição dos workflows no n8n, dos commits e dos PRs.
Datas em horário de Brasília quando vierem do Git; as do n8n estão em UTC.

## Linha do tempo

| Data | O quê | Fonte |
|---|---|---|
| 21/07/2026 | Criado `Onboarding ML - Callback` (redirect OAuth do app ML → catalog-monitor) | n8n |
| 28/07/2026 | Criado `ML Dashboards - Backfill - PCXpress`: carga inicial (o CONFIG guarda a janela de pedidos 01/07–09/08/2026) | n8n |
| 09/08/2026 | Primeiros commits no GitHub (8 commits "Update …" enviados pela interface web: `page.tsx`, `supabase-dashboard.ts`, `dashboard-types.ts`, `globals.css`, `project.test.mjs`) | Git |
| 10/08/2026 | Criado `ML Dashboards - Sync Diario` (MVP1–MVP4 encadeados, diário) | n8n |
| 12/08/2026 | **PR #1** — `CLAUDE.md`, cores semânticas (`app/metric-signals.ts`), `.gitignore` | GitHub |
| 13/08/2026 | Criado `MVP5 Logistica Shipments v2` | n8n |
| 14/08/2026 | Criado `MVP6 Pos-venda Claims Returns v7 Retomavel`; uploads de `page.tsx`/`dashboard-types.ts`/`supabase-dashboard.ts`/`globals.css` (construção da aba Logística) | n8n, Git |
| 17–18/08/2026 | **PR #2** — `metric-signals` ligado ao indicador de comparação; "valor efetivamente pago" ao lado do valor bruto | GitHub |
| 23/08/2026 | Grande upload manual (12 commits): saúde dos dados da logística, rota com filtro de modalidade, layout. **Desfez sem querer a ligação do `metric-signals` com o indicador de comparação** | Git |
| 26/08/2026 | Criado `Logistica v2 - Sincronizacao incremental` | n8n |
| 31/08/2026 | Criado `Logistica v2 - Backfill mensal retomavel` (mês configurado: 2026-08) | n8n |
| 05/10/2026 (manhã) | Uploads de `page.tsx`, `supabase-dashboard.ts` (3×), `dashboard-types.ts`: integração da Logística V2 atrás de *feature flag* e, em seguida, **retirada da aba Logística** (`logisticsEnabled = false`, item removido do menu) | Git |
| 05/10/2026 | `updatedAt` de quase todos os workflows da instância às 02:50–02:51 UTC (provável ativação do acesso MCP). Os fluxos de logística e pós-venda estão hoje sem versão publicada; a data em que foram desligados não ficou registrada | n8n |
| 05/10/2026 | **PR #3** — seção Devoluções (estrutura, cálculos, migração `2026-10-05_devolucoes.sql`, rota `/api/returns`); **PR #4** — dados fictícios nas prévias da Vercel com avisos | GitHub |
| 06/10/2026 | **PR #5** — Acompanhamento focado no dia a dia (só casos em aberto, sem filtro de datas); motivos e anúncios passam ao Fechamento | GitHub |
| 07/10/2026 | **PR #6** — fictícios também no site oficial até chegarem dados reais | GitHub |
| 08/10/2026 | Criado no n8n `ML Dashboards - MVP7 Devolucoes v2 (painel)` (00:08 UTC); **PR #7** — Acompanhamento no formato da planilha (colunas A–X), migração `2026-10-08_devolucoes_fila.sql`; SQL `devolucoes_claims_sem_devolucao` aplicado | n8n, GitHub |
| 09/10/2026 | **PR #8** — volta a ler as devoluções reais (`select=*`, só tabela inexistente liga fictícios); **PR #9** — MVP7 v2 grava as colunas da fila; PR #10 aberto | GitHub |
| 11/10/2026 | **PR #10** mesclado — MVP7 não para com erro 400 e grava a fila linha a linha mostrando o motivo da recusa | GitHub |
| 16/10/2026 | MVP7 editado direto no n8n (novas traduções de ações e condições de revisão; regras de amostra) — **não foi para o repositório** até esta documentação | n8n |
| 20/10/2026 | Única falha do MVP7 no período retido (timeout de 300 s às 21:07 UTC) | n8n |
| 26/10/2026 | Esta documentação; cópia do MVP7 sincronizada com produção; exportação sanitizada do Sync Diario; `.env.example` criado; teste que impede chaves nas cópias dos workflows | Git |

## Como o código foi produzido

- **Até agosto:** arquivos editados fora do Git e enviados inteiros pela interface web do GitHub
  (mensagens padrão "Update <arquivo>"), pela conta `pedromeneleu-coder`
  (`pedro.meneleu@arunadata.com.br`). Documentos (`docs/*.md`) e scripts SQL que existiam na pasta
  local **não foram enviados** — daí os links quebrados no README e os testes que falham.
- **A partir de 12/08:** mudanças feitas com Claude Code em ramos `claude/…`, sempre via PR com
  descrição do que muda, impacto para o cliente e verificação (lint, test, build, navegador).
  PRs #8–#10 vieram da conta `pedromeneleu`, dona atual do repositório.
- **n8n:** fluxos escritos como nodes Code em JavaScript; o MVP7 foi desenvolvido no repositório
  (com testes que executam o código) e importado no n8n; edições posteriores feitas direto no n8n
  precisam ser trazidas de volta à mão.

## Decisões registradas

| Decisão | Quando | Por quê / evidência |
|---|---|---|
| Ler o Supabase só no servidor, sem SDK, com `service_role` | desde o início | Não expor a chave; README e teste `keeps the Supabase service role key server-only` |
| Conversão = pedidos ÷ visitas (não unidades) | desde o início | README "Definições das métricas" e testes |
| Valores monetários sempre completos | agosto | Teste `renders monetary values without abbreviated thousands or millions` |
| Cor = julgamento, não decoração; limites de saúde por patamar | 12/08 (PR #1) | `app/metric-signals.ts` (limites provisórios, não oficiais do ML) |
| Retirar a aba Logística | 05/10 | Comentário no código: objetos exclusivos de logística "serão removidos do Supabase". Fluxos de logística desativados |
| Devolução = pós-entrega; cancelamento fica em Saúde da conta | 05/10 (PR #3) | `returns-types.ts` |
| Nenhum dado pessoal do comprador além do apelido | 05/10 e 08/10 | Migrações e testes |
| Acompanhamento = situação de hoje, sem filtro de datas | 06/10 (PR #5) | Teste `acompanhamento não muda com o filtro de datas` |
| Fechamento pela data da venda original | 05/10 | Igual à planilha; meses recentes "provisórios" |
| Fictícios no site oficial só até haver dados reais; erro nunca vira fictício | 07–09/10 (PRs #6 e #8) | Incidente de 08/10 (coluna inexistente lida como tabela inexistente) |
| Fila no formato da planilha `pcxpress-fila-devolucoes` | 08/10 (PR #7) | Operação já trabalhava com a planilha |
| MVP7 substitui o MVP6 para devoluções | 08/10 | MVP6 desativado; MVP7 grava no modelo da planilha |
