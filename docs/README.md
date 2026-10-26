# PCXpress · Painel Mercado Livre — documentação de transição

> Levantamento feito em **26/10/2026** a partir de: código deste repositório, histórico do Git e
> dos PRs, os workflows do n8n (código, configuração e execuções) e as migrações SQL. O Supabase
> **não foi consultado diretamente** (o host estava bloqueado no ambiente usado para escrever
> esta documentação); tudo o que está em [02-supabase.md](02-supabase.md) foi deduzido do que o
> código lê e do que os fluxos gravam, e o documento traz as consultas para confirmar no banco.

## O que é, em uma frase

Painel web (Next.js na Vercel) que mostra vendas, anúncios, tráfego, saúde da conta e devoluções
da loja **PCXpress** no **Mercado Livre**, alimentado por workflows **n8n** que puxam a API do
Mercado Livre e gravam no **Supabase** (schema `ml_dashboards`). Projeto da **Aruna Data** para o
cliente PCXpress.

```text
API Mercado Livre ──► n8n (webhook.arunadata.com.br) ──► Supabase (supabase.arunadata.com.br, schema ml_dashboards)
                                                                     │  PostgREST + service_role (só no servidor)
                                                                     ▼
                                     Next.js 16 na Vercel (pcxpress-ml-dashboard.vercel.app) ──► navegador
```

## Estado em 26/10/2026

| Parte | Situação |
|---|---|
| Painel — Visão geral, Vendas, Produtos, Desempenho, Tráfego, Saúde da conta | Em produção, lendo dados reais |
| Painel — Devoluções (Acompanhamento + Fechamento) | Em produção com dados reais (439 devoluções no banco) |
| Painel — Logística | **Retirada do menu em 05/10/2026**; código mantido, consultas desligadas (`logisticsEnabled = false`) |
| n8n — `ML Dashboards - Sync Diario` (vendedor, anúncios, pedidos, visitas) | Ativo, todo dia às 19h (Brasília). Últimas 14 execuções: 100% sucesso |
| n8n — `ML Dashboards - Backfill - PCXpress` (na prática: vendedor + renovação do token) | Ativo, a cada 2 h. 100% sucesso |
| n8n — `ML Dashboards - MVP7 Devolucoes v2 (painel)` | Ativo, de hora em hora (minuto 7). 1 falha (timeout) em 335 execuções |
| n8n — MVP5 Logística, MVP6 Pós-venda, Logística v2 (2 fluxos) | Inativos (legado) |
| Testes (`pnpm run test`) | 37 testes: 34 passam, **3 falham por scripts SQL que nunca foram versionados** (problema antigo, não regressão) |

## Índice

| Documento | Conteúdo |
|---|---|
| [01-arquitetura.md](01-arquitetura.md) | Contexto de negócio, componentes, identificadores, ambientes, variáveis, cadência dos dados, segurança |
| [02-supabase.md](02-supabase.md) | Todas as tabelas e views do schema `ml_dashboards`: colunas, chaves, quem grava, quem lê, situação, armadilhas, consultas de verificação |
| [03-n8n.md](03-n8n.md) | Todos os workflows (ativos, legados e de outros clientes), o que cada node faz, endpoints do ML, configuração e histórico de execuções |
| [04-dashboard.md](04-dashboard.md) | O app Next.js em detalhe: arquivos, fluxo de dados, contratos das APIs, modelo de datas, cada aba e cada métrica, testes, deploy |
| [05-devolucoes.md](05-devolucoes.md) | A seção Devoluções de ponta a ponta (regras de negócio, ingestão, telas, modo demonstração) |
| [06-historico.md](06-historico.md) | Linha do tempo do projeto: workflows, commits, PRs e decisões |
| [07-roadmap.md](07-roadmap.md) | Próximos passos priorizados, dívidas técnicas, riscos e decisões em aberto |
| [08-runbook.md](08-runbook.md) | Operação: rodar, publicar, verificar saúde, resolver falhas comuns, reprocessar dados, checklist de transição |

Documentos que já existiam e continuam válidos:

- [`../ingestao/n8n/README.md`](../ingestao/n8n/README.md) — ingestão de devoluções (MVP7) campo a campo.
- [`../CLAUDE.md`](../CLAUDE.md) — guia curto para o Claude Code (atualizado junto com estes documentos).

## Para o próximo Claude (ou pessoa) que assumir

Leia nesta ordem: este arquivo → [01-arquitetura.md](01-arquitetura.md) → [07-roadmap.md](07-roadmap.md)
→ o documento da área que for mexer. Regras que o projeto segue e que valem manter:

1. **Interface em português do Brasil.** Valores em reais sempre completos (`Intl.NumberFormat`
   com `BRL`), nunca "mil"/"mi".
2. **Nunca inventar número.** Dado ausente aparece como "Sem dados", "—" ou "não informado";
   nunca R$ 0,00 falso. Percentuais e médias são calculados na leitura, nunca gravados.
3. **A chave `service_role` do Supabase só existe no servidor** (`lib/`), nunca com prefixo
   `NEXT_PUBLIC_` e nunca no repositório. Os workflows versionados em `ingestao/n8n/` têm as chaves
   trocadas por `PREENCHA_…` (há teste garantindo isso).
4. **Regras de negócio provisórias ficam em um arquivo só**: `app/returns/returns-config.ts`
   (devoluções) e `app/metric-signals.ts` (cores/limites). Mude lá, não espalhe constantes.
5. **O código que roda de verdade está no n8n.** A cópia em `ingestao/n8n/` pode ficar para trás
   se alguém editar direto no n8n (aconteceu em 16/10). Ao mexer num workflow, exporte, troque as
   chaves por `PREENCHA_…` e atualize a cópia.
6. **Antes de concluir:** `pnpm run lint`, `pnpm run test`, `pnpm run build`. As 3 falhas
   conhecidas de `tests/project.test.mjs` (ver [04-dashboard.md](04-dashboard.md#testes)) não são
   causadas por mudanças novas.

## Pendências de transição (resumo — detalhes no [runbook](08-runbook.md#checklist-de-transição))

- O repositório está na conta **pessoal** `pedromeneleu` no GitHub: transferir para a organização
  da Aruna (ou conta do responsável) e reconectar o projeto da Vercel.
- **Segredos em texto puro** nos nodes `CONFIG` do n8n (client secret do app do Mercado Livre e
  `service_role` do Supabase) e na URL do Google Chat dos fluxos `catalog-monitor`. Como quem tinha
  acesso está saindo, o recomendado é **rotacionar** e passar a guardar em Credentials/variáveis do n8n.
- O DDL das tabelas e views principais **não está versionado** (só as migrações de devoluções
  estão em `supabase/migrations/`). Fazer um `pg_dump --schema-only` do schema `ml_dashboards`.
- Os documentos antigos citados no README (`docs/PLANO-VISUAL-DADOS-ATUAIS.md`,
  `docs/MAPA-METRICAS-E-TELAS.md`, `docs/ROADMAP-EVOLUCAO-DASHBOARD.md`,
  `docs/GUIA-ATUALIZACAO-GITHUB.md`) e três scripts SQL lidos pelos testes **nunca foram enviados
  ao GitHub**. Se existirem na máquina de quem está saindo, vale recuperá-los. (O `.env.example`,
  que também faltava, foi criado junto com esta documentação.)
