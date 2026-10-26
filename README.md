# PCXpress Mercado Livre Analytics

Painel Next.js com API server-side para consultar o Supabase sem expor a `service_role` no
navegador. Os dados vêm da API do Mercado Livre por workflows do n8n.

**Documentação completa:** [`docs/README.md`](docs/README.md) — arquitetura, bases do Supabase,
fluxos do n8n e histórico, funcionamento de cada aba, devoluções, roadmap e runbook.

## Estrutura

```text
app/
  api/dashboard/route.ts      # GET /api/dashboard
  api/returns/route.ts        # GET /api/returns
  returns/                    # seção Devoluções (tela, cálculos, tipos, configuração)
  dashboard-types.ts
  metric-signals.ts
  error.tsx · globals.css · layout.tsx · not-found.tsx · page.tsx
lib/
  supabase-dashboard.ts
  supabase-returns.ts
  returns-demo-data.ts
ingestao/n8n/                 # cópias dos workflows do n8n (sem chaves) + README da ingestão
supabase/migrations/          # migrações da seção Devoluções
docs/                         # documentação do projeto
public/
  og.png · pcxpress-logo.webp
tests/
.env.example · .gitignore · eslint.config.mjs · next-env.d.ts · next.config.ts
package.json · pnpm-lock.yaml · pnpm-workspace.yaml · tsconfig.json · README.md · CLAUDE.md
```

Não envie `node_modules`, `.next`, `.vercel`, `.env` ou `.env.local`.

## Variáveis de ambiente

Use estes nomes localmente em `.env.local` (modelo em `.env.example`) e na Vercel:

```dotenv
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE
SUPABASE_SCHEMA=ml_dashboards
SUPABASE_ACCOUNT_NAME=PC Express
```

Opcionais: `RETURNS_DEMO_MODE` (`true` liga devoluções fictícias no computador local; `false`
desliga em qualquer ambiente) e `LOGISTICS_V2_ENABLED` (sem efeito enquanto a Logística estiver
desligada no código).

`SUPABASE_SERVICE_ROLE_KEY` é secreta e server-only. Nunca use o prefixo `NEXT_PUBLIC_` nessa
variável e nunca envie o valor ao GitHub.

## Desenvolvimento local

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

Abra `http://localhost:3000`. O endpoint de dados é `http://localhost:3000/api/dashboard?periodDays=30`.

Antes de concluir uma mudança: `pnpm run lint`, `pnpm run test` e `pnpm run build`
(3 testes falham por arquivos SQL que nunca foram versionados — ver
[docs/04-dashboard.md](docs/04-dashboard.md#testes)).

## Configuração da Vercel

1. Importe o repositório correto do GitHub.
2. Em `Root Directory`, deixe vazio quando `package.json` estiver na raiz do repositório.
3. Em `Framework Preset`, selecione `Next.js`.
4. Não sobrescreva `Build Command`, `Output Directory` nem `Install Command`.
5. Em `Node.js Version`, selecione `22.x`.
6. Cadastre as quatro variáveis em `Settings > Environment Variables` para `Production`, `Preview` e `Development`.
7. Salve e execute `Redeploy` sem reutilizar o cache da tentativa antiga.

Não existe `vercel.json` neste projeto de propósito. A detecção nativa do Next.js cria
automaticamente as funções de `/api/dashboard` e `/api/returns`.

## Verificação depois do deploy

1. Abra `https://SEU-DOMINIO.vercel.app/api/dashboard?periodDays=30`.
2. Confirme que o navegador mostra JSON e que `"connected"` é `true`.
3. Abra a página inicial e confirme o selo `Dados atualizados`.
4. Teste os períodos `7d`, `30d` e `90d` e o botão de atualizar.

Se a API retornar `"connected": false`, leia o campo `"message"` e confira os nomes e os ambientes
das variáveis. Se retornar 404, o `Root Directory` da Vercel não aponta para a pasta que contém
`package.json` e `app`.

No Supabase, confirme também que `ml_dashboards` está na lista de schemas expostos pela Data API.
Sem isso, o endpoint responderá com uma mensagem `PGRST` mesmo que a chave esteja correta.

## Definições das métricas

- **Conversão:** `pedidos / visitas * 100`. Mede a parcela de visitas que resultou em pedido.
- **Ticket médio:** `valor bruto / pedidos`. Mede o valor bruto médio de cada pedido.
- **Unidades por pedido:** `unidades vendidas / pedidos`. Mede a quantidade média de itens por pedido.
- **Valor bruto:** soma de `gross_amount` dentro do período selecionado.

O gráfico diário compara a janela selecionada com a janela de comparação escolhida (por padrão, a
imediatamente anterior de mesma duração). Dias sem registro permanecem como lacunas e não são
preenchidos artificialmente.

Ao passar o mouse pelo gráfico, o tooltip mostra o valor do dia, o valor do dia equivalente no
período anterior, a variação entre os períodos e a variação contra o dia anterior. A aba
**Produtos e anúncios** também compara visitas, pedidos, unidades, valor bruto, conversão e
posição no ranking por produto.

## Views e tabelas consumidas

- `ml_dashboards.accounts`
- `ml_dashboards.dashboard_item_catalog`
- `ml_dashboards.dashboard_daily_account_summary`
- `ml_dashboards.dashboard_daily_item_performance`
- `ml_dashboards.dashboard_daily_order_impact`
- `ml_dashboards.sellers_current`
- `ml_dashboards.seller_daily_snapshots`
- `ml_dashboards.devolucoes`, `devolucoes_status`, `devolucoes_motivos`, `devolucoes_base_vendas_diaria`

Detalhes de cada uma em [docs/02-supabase.md](docs/02-supabase.md).
