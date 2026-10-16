import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Roda o código do node "Sincronizar Devolucoes" do workflow n8n MVP7 com um
// Mercado Livre e um Supabase falsos (nenhuma chamada sai da máquina).
const root = new URL("../", import.meta.url);
const workflow = JSON.parse(await readFile(new URL("ingestao/n8n/MVP7_Devolucoes.json", root), "utf8"));
const syncCode = workflow.nodes.find((node) => node.name === "Sincronizar Devolucoes").parameters.jsCode;

const ACCOUNT = '3cc8f0ba-4310-49b9-94ac-1073b35cfe71';
const SELLER = 155871484;
const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
const ahead = (n) => new Date(Date.now() + n * 86400000).toISOString();

const sellerPlayer = (actions) => ([
  { role: 'complainant', type: 'buyer', user_id: 1, available_actions: [] },
  { role: 'respondent', type: 'seller', user_id: SELLER, available_actions: actions },
]);

const claims = {
  // Pacote no ponto de coleta: data de postagem ainda não existe (caso real de 08/10).
  C1: { id: 'C1', status: 'opened', stage: 'claim', type: 'mediations', reason_id: 'PDD9939', resource: 'order', resource_id: 'O1', related_entities: ['return'], date_created: day(3), last_updated: day(1), players: sellerPlayer([{ action: 'open_dispute', mandatory: false, due_date: null }]) },
  // Entregue na loja, revisão obrigatória com prazo.
  C2: { id: 'C2', status: 'opened', stage: 'claim', type: 'mediations', reason_id: 'PDD9940', resource: 'order', resource_id: 'O2', related_entities: ['return'], date_created: day(10), last_updated: day(1), players: sellerPlayer([{ action: 'return_review_ok', mandatory: true, due_date: ahead(1) }, { action: 'return_review_fail', mandatory: true, due_date: ahead(2) }, { action: 'open_dispute', mandatory: false }]) },
  // Revisado no CD (Full), não apto para venda.
  C3: { id: 'C3', status: 'opened', stage: 'claim', type: 'mediations', reason_id: 'PDD9941', resource: 'order', resource_id: 'O3', related_entities: ['return'], date_created: day(40), last_updated: day(20), players: sellerPlayer([]) },
  // Fechada e já gravada antes da migração da fila (precisa ser preenchida de novo).
  C4: { id: 'C4', status: 'closed', stage: 'claim', type: 'mediations', reason_id: 'PDD9942', resource: 'order', resource_id: 'O4', related_entities: ['return'], date_created: day(60), last_updated: day(50), resolution: { reason: 'item_returned', benefited: ['complainant'] }, players: sellerPlayer([]) },
  // A busca não trouxe os participantes: o detalhe é lido.
  C5: { id: 'C5', status: 'opened', stage: 'dispute', type: 'mediations', reason_id: 'PDD9943', resource: 'order', resource_id: 'O5', related_entities: ['return'], date_created: day(15), last_updated: day(2) },
  // Revisado no CD e voltando para a loja (2º envio return_from_triage).
  C6: { id: 'C6', status: 'opened', stage: 'claim', type: 'mediations', reason_id: 'PDD9944', resource: 'order', resource_id: 'O6', related_entities: ['return'], date_created: day(30), last_updated: day(1), players: sellerPlayer([]) },
};
const claimDetail = { C5: { players: sellerPlayer([{ action: 'send_message_to_mediator', mandatory: true, due_date: ahead(0) }]) } };

const returns = {
  C1: { id: 'R1', status: 'label_generated', status_money: 'retained', date_created: day(3), last_updated: day(1), related_entities: [], orders: [{ order_id: 'O1', item_id: 'MLB1', return_quantity: 1 }], shipments: [{ shipment_id: 'S1', status: 'ready_to_ship', type: 'return', destination: { name: 'seller_address' } }] },
  C2: { id: 'R2', status: 'delivered', status_money: 'retained', date_created: day(10), last_updated: day(1), related_entities: [], orders: [{ order_id: 'O2', item_id: 'MLB2', return_quantity: 1 }], shipments: [{ shipment_id: 'S2', status: 'delivered', type: 'return', destination: { name: 'seller_address' } }] },
  C3: { id: 'R3', status: 'delivered', status_money: 'refunded', date_created: day(40), last_updated: day(20), related_entities: ['reviews'], orders: [{ order_id: 'O3', item_id: 'MLB3', return_quantity: 1 }], shipments: [{ shipment_id: 'S3', status: 'delivered', type: 'return', destination: { name: 'warehouse' } }] },
  C4: { id: 'R4', status: 'delivered', status_money: 'refunded', date_created: day(60), last_updated: day(50), related_entities: [], orders: [{ order_id: 'O4', item_id: 'MLB4', return_quantity: 1 }], shipments: [{ shipment_id: 'S4', status: 'delivered', type: 'return', destination: { name: 'seller_address' } }] },
  C5: { id: 'R5', status: 'label_generated', status_money: 'retained', date_created: day(15), last_updated: day(2), related_entities: [], orders: [{ order_id: 'O5', item_id: 'MLB5', return_quantity: 1 }], shipments: [{ shipment_id: 'S5', status: 'ready_to_ship', type: 'return', destination: { name: 'seller_address' } }] },
  C6: { id: 'R6', status: 'shipped', status_money: 'retained', date_created: day(30), last_updated: day(1), related_entities: [], orders: [{ order_id: 'O6', item_id: 'MLB6', return_quantity: 1 }], shipments: [
    { shipment_id: 'S6a', status: 'delivered', type: 'return', destination: { name: 'warehouse' } },
    { shipment_id: 'S6b', status: 'shipped', type: 'return_from_triage', destination: { name: 'seller_address' } },
  ] },
};

const historyFor = (status, substatus, dates, tracking) => ({
  id: 1, status, substatus, mode: 'me2', tracking_number: tracking, return_tracking_number: null,
  date_history: { date_shipped: null, date_delivered: null, date_delivered_estimated: null, date_created: day(3), ...dates },
});
const histories = {
  S1: historyFor('ready_to_ship', 'in_hub', {}, 'TRK1'),
  S2: historyFor('delivered', null, { date_shipped: day(6), date_delivered: day(2) }, 'TRK2'),
  S3: historyFor('delivered', null, { date_shipped: day(35), date_delivered: day(25) }, 'MEL3'),
  S4: historyFor('delivered', null, { date_shipped: day(55), date_delivered: day(52) }, 'TRK4'),
  S5: historyFor('ready_to_ship', 'printed', {}, null),
  S6a: historyFor('delivered', null, { date_shipped: day(25), date_delivered: day(20) }, 'MEL6A'),
  S6b: historyFor('shipped', 'in_transit', { date_shipped: day(1), date_delivered_estimated: ahead(3) }, 'TRK6B'),
};

const order = (id, sku, price, qty, refunded) => ({
  id, date_created: day(70), total_amount: price * qty, buyer: { id: 9, nickname: 'COMPRADOR_' + id, first_name: 'NAO', last_name: 'GRAVAR' },
  order_items: [{ item: { id: 'MLB' + id.slice(1), title: 'Produto ' + id, seller_sku: sku }, quantity: qty, unit_price: price }],
  payments: [{ id: 1, transaction_amount: price * qty, transaction_amount_refunded: refunded }],
  shipping: { id: 'SO' + id },
});
const orders = {
  O1: order('O1', 'SKU1', 217, 1, 0), O2: order('O2', 'SKU2', 261.9, 1, 0), O3: order('O3', 'SKU3', 584.99, 1, 584.99),
  O4: order('O4', 'SKU4', 100, 2, 100), O5: order('O5', 'SKU5', 155.2, 1, 0), O6: order('O6', 'SKU6', 1040, 1, 0),
};

const httpError = (statusCode, body) => Object.assign(new Error('HTTP ' + statusCode), { statusCode, response: { statusCode, body } });

// C4 já gravada (antes da fila); as demais são novas.
const storedC4 = { claim_id: 'C4', return_id: 'R4', order_id: 'O4', mlb_id: 'MLB4', titulo_anuncio: 'Produto O4', familia_motivo: 'PDD', reason_id: 'PDD9942', status_atual: 'refunded', etapa_atual: 'reembolsada', data_venda: '2026-08-01', data_abertura: day(60), data_envio_comprador: day(55), data_recebimento: day(52), data_reembolso: day(51), ultima_atualizacao: day(50), unidades_devolvidas: 1, valor_devolvido: 100, custo_frete_devolucao: 20, logistic_type: 'cross_docking' };

function fakeHttp(mode, calls, posted, overrides = {}) {
  return async function httpRequest(options) {
      const count = (key) => { calls[key] = (calls[key] || 0) + 1; };
    const url = new URL(options.url);
    const path = decodeURIComponent(url.pathname);
    if (url.hostname === 'api.mercadolibre.com') {
      let match;
      if (path === '/post-purchase/v1/claims/search') {
        count('ml:search');
        if (url.searchParams.get('offset') !== '0') return { data: [], paging: { total: 0 } };
        const status = url.searchParams.get('status');
        const data = Object.values(claims).filter((claim) => claim.status === status).map((claim) => {
          const copy = { ...claim };
          if (claim.id === 'C5') delete copy.players;
          return copy;
        });
        return { data, paging: { total: data.length } };
      }
      if ((match = path.match(/^\/post-purchase\/v1\/claims\/(C\d)$/))) {
        count('ml:claim_detail');
        if (overrides.failDetail) throw new Error('Request failed with status code 400');
        return { ...claims[match[1]], ...(claimDetail[match[1]] || {}) };
      }
      if ((match = path.match(/^\/post-purchase\/v2\/claims\/(C\d)\/returns$/))) { count('ml:returns'); return returns[match[1]]; }
      if ((match = path.match(/^\/post-purchase\/v1\/returns\/(R\d)\/reviews$/))) {
        count('ml:reviews');
        return { reviews: [{ date_created: day(22), resource_reviews: [{ stage: 'triage', status: 'failed', product_condition: 'unsaleable', product_destination: 'meli' }] }] };
      }
      if (path.match(/\/charges\/return-cost$/)) { count('ml:return_cost'); return { amount: 30.5, currency_id: 'BRL' }; }
      if ((match = path.match(/^\/shipments\/(\w+)\/history$/))) {
        count('ml:history:' + match[1]);
        if (overrides.failHistory?.includes(match[1])) throw httpError(500, {});
        return histories[match[1]];
      }
      if ((match = path.match(/^\/shipments\/(\w+)$/))) { count('ml:shipment:' + match[1]); return { id: match[1], logistic_type: 'cross_docking', status: 'delivered' }; }
      if ((match = path.match(/^\/orders\/(O\d)$/))) { count('ml:order:' + match[1]); return orders[match[1]]; }
      if (path.match(/^\/post-purchase\/v1\/claims\/reasons\//)) { count('ml:reason'); return { id: 'x', name: 'Motivo', detail: 'Detalhe' }; }
      throw httpError(404, { message: 'nao simulado ' + path });
    }

    const table = path.replace('/rest/v1/', '');
    const select = url.searchParams.get('select') || '';
    if (options.method === 'GET') {
      if (table === 'oauth_tokens') return [{ account_id: ACCOUNT, refresh_token: 'r', access_token: 'a', expires_at: ahead(1), ml_user_id: SELLER, accounts: { account_name: 'PC Express', active: true } }];
      if (table === 'devolucoes') {
        if (mode === 'sem_fila' && select.includes('sku')) {
          throw httpError(400, { code: '42703', message: 'column devolucoes.sku does not exist' });
        }
        // Como o n8n às vezes entrega o erro: só a mensagem, sem código nem corpo.
        if (mode === 'sem_fila_sem_corpo' && select.includes('sku')) {
          throw new Error('Request failed with status code 400');
        }
        return url.searchParams.get('offset') === '0' ? [storedC4] : [];
      }
      return [];
    }
    if (options.method === 'POST') {
      if (table === 'sync_runs') return [{ id: 77 }];
      posted[table] = [...(posted[table] || []), ...(Array.isArray(options.body) ? options.body : [options.body])];
      // Resposta completa (returnFullResponse): o corpo com o motivo chega ao workflow.
      if (table === 'devolucoes' && mode === 'linha_recusada' && options.returnFullResponse) {
        if (options.body.some((row) => row.claim_id === 'C3' && 'sku' in row)) {
          return { statusCode: 400, headers: {}, body: { code: '23514', message: 'new row violates check constraint "devolucoes_fila_valores_validos"' } };
        }
        return { statusCode: 201, headers: {}, body: '' };
      }
      if (table === 'devolucoes' && mode === 'gravacao_recusada' && options.body.some((row) => 'sku' in row)) {
        throw new Error('Request failed with status code 400');
      }
      if (table === 'devolucoes' && mode === 'sem_fila' && options.body.some((row) => 'sku' in row)) {
        throw httpError(400, { code: 'PGRST204', message: "Could not find the 'sku' column of 'devolucoes'" });
      }
      return null;
    }
    return null;
  }
}

async function runWorkflow(mode, overrides = {}) {
  const calls = {};
  const posted = {};
  const config = { ml_client_id: 'id', ml_client_secret: 's', supabase_url: 'https://fake.supabase.co', supabase_service_role_key: 'k', schema: 'ml_dashboards', workflow_name: 'ml_dashboards_mvp7_devolucoes_sync', time_zone: 'America/Sao_Paulo', target_account_id: '', target_seller_id: String(SELLER), claims_days_back: 180, claims_range_chunk_days: 30, max_claims_per_account: 5000, max_claims_to_process_per_run: 150, ml_page_size: 30, supabase_page_size: 1000, supabase_upsert_batch_size: 100, claim_concurrency: 3, request_delay_ms: 0, request_max_retries: 0 };
  const $ = () => ({ first: () => ({ json: config }) });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const output = await new AsyncFunction("$", syncCode).call({ helpers: { httpRequest: fakeHttp(mode, calls, posted, overrides) } }, $);
  const rows = Object.fromEntries((posted.devolucoes || []).map((row) => [row.claim_id, row]));
  return { summary: output[0].json, calls, rows };
}

const iso = (value) => new Date(Date.parse(value)).toISOString();

test("MVP7 lê as datas do date_history sem 2ª chamada e sem amostra quando a data ainda não existe", async () => {
  const { summary, calls, rows } = await runWorkflow("fila");
  assert.equal(summary.status, "success", JSON.stringify(summary.base_error_examples));
  assert.equal(summary.amostra_envio_devolucao.length, 0);
  for (const id of ["S1", "S2", "S3", "S4", "S5", "S6a"]) assert.equal(calls["ml:shipment:" + id], undefined, id);
  assert.ok(rows.C2.data_envio_comprador && rows.C2.data_recebimento);
  assert.ok(rows.C6.data_envio_comprador && rows.C6.data_recebimento);
});

test("MVP7 usa o próprio envio como 2ª fonte só quando o histórico falha", async () => {
  const { summary, calls } = await runWorkflow("fila", { failHistory: ["S2"] });
  assert.equal(calls["ml:shipment:S2"], 1);
  assert.equal(summary.amostra_envio_devolucao.length, 1);
  assert.equal(summary.amostra_envio_devolucao[0].claim_id, "C2");
});

test("MVP7 preenche as colunas da fila no vocabulário da planilha", async () => {
  const { summary, calls, rows } = await runWorkflow("fila");
  assert.equal(summary.colunas_fila_disponiveis, true);
  assert.equal(summary.returns_upserted, 6);
  const expect = (id, fields) => {
    for (const [key, value] of Object.entries(fields)) assert.deepEqual(rows[id][key], value, id + "." + key);
  };
  expect("C1", { etapa_ml: "Devolução", status_reclamacao: "opened", status_retorno: "Em preparação pelo comprador", acao_pendente: "Nenhuma — aguardar envio do comprador", prazo_acao_vendedor: null, destino_retorno: "Vendedor", rastreio: "TRK1", sku: "SKU1", quantidade: 1, valor_venda: 217, valor_reembolsado: 0, comprador_apelido: "COMPRADOR_O1", resultado: null });
  expect("C2", { status_retorno: "Entregue ao vendedor — revisão pendente", acao_pendente: "Revisar o produto e informar ao ML", prazo_acao_vendedor: iso(claims.C2.players[1].available_actions[0].due_date) });
  expect("C3", { status_retorno: "Revisado — produto parado no CD do ML", acao_pendente: "Solicitar a retirada do produto no CD", destino_retorno: "CD Mercado Livre (Full)", resultado: "Não apto para venda", valor_reembolsado: 584.99 });
  // Fechada e gravada antes da migração da fila: é preenchida de novo uma vez.
  expect("C4", { status_reclamacao: "closed", status_retorno: "Encerrado — reembolsado ao comprador", acao_pendente: "Nenhuma — caso encerrado", resultado: "A favor do comprador", sku: "SKU4", quantidade: 2, valor_venda: 200 });
  expect("C5", { etapa_ml: "Mediação", status_retorno: "Em análise pelo ML", acao_pendente: "Responder ao ML na mediação" });
  // Códigos vistos na API real em 16/10 (recontact, return_review_unified_*).
  assert.match(syncCode, /recontact: 'Responder ao recontato do caso'/);
  assert.match(syncCode, /return_review_unified_ok: 'Revisar o produto e informar ao ML'/);
  assert.match(syncCode, /no_testable: 'Não testável'/);
  expect("C6", { status_retorno: "Revisado — a caminho do vendedor", destino_retorno: "Vendedor", rastreio: "TRK6B", acao_pendente: "Nenhuma — aguardar chegada", data_prevista: iso(histories.S6b.date_history.date_delivered_estimated) });
  assert.equal(calls["ml:claim_detail"], 1, "detalhe só para a aberta sem participantes");
  // Só o apelido do comprador: nunca nome ou sobrenome.
  for (const row of Object.values(rows)) assert.doesNotMatch(JSON.stringify(row), /NAO|GRAVAR/);
});

test("MVP7 sem a migração da fila grava só as colunas antigas", async () => {
  const { summary, calls, rows } = await runWorkflow("sem_fila");
  assert.equal(summary.status, "success", JSON.stringify(summary.base_error_examples));
  assert.equal(summary.colunas_fila_disponiveis, false);
  assert.equal(summary.returns_upserted, 5);
  for (const row of Object.values(rows)) assert.ok(!("sku" in row) && !("acao_pendente" in row));
  assert.equal(calls["ml:claim_detail"], undefined);
});

test("MVP7 sem fila também quando o 400 chega sem corpo", async () => {
  const { summary, rows } = await runWorkflow("sem_fila_sem_corpo");
  assert.equal(summary.status, "success", JSON.stringify(summary.error ?? summary.base_error_examples));
  assert.equal(summary.colunas_fila_disponiveis, false);
  assert.equal(summary.fila_erro.etapa, "leitura");
  assert.equal(summary.fila_erro.statusCode, 400);
  for (const row of Object.values(rows)) assert.ok(!("sku" in row));
});

test("MVP7 grava sem a fila e mostra o erro quando o Supabase recusa as colunas novas", async () => {
  const { summary, rows } = await runWorkflow("gravacao_recusada");
  assert.equal(summary.status, "success", JSON.stringify(summary.error ?? summary.base_error_examples));
  assert.equal(summary.colunas_fila_disponiveis, false);
  assert.equal(summary.fila_erro.etapa, "gravacao");
  assert.equal(summary.returns_upserted, 6);
  assert.ok(Object.values(rows).some((row) => !("sku" in row)), "regravou sem as colunas da fila");
});

test("MVP7 grava linha a linha e mostra o motivo quando uma linha da fila é recusada", async () => {
  const { summary, rows } = await runWorkflow("linha_recusada");
  assert.equal(summary.status, "success", JSON.stringify(summary.error ?? summary.base_error_examples));
  assert.equal(summary.colunas_fila_disponiveis, true, "as demais linhas continuam com a fila");
  assert.equal(summary.fila_linhas_recusadas, 1);
  const [example] = summary.fila_exemplos_recusados;
  assert.equal(example.claim_id, "C3");
  assert.equal(example.erro.body.code, "23514");
  assert.ok(!("comprador_apelido" in example.valores_fila), "exemplo sem o apelido do comprador");
  assert.ok(!("sku" in rows.C3), "C3 gravada sem a fila");
  for (const id of ["C1", "C2", "C4", "C5", "C6"]) assert.equal(typeof rows[id].sku, "string", id);
});

test("MVP7 segue quando o detalhe da reclamação responde 400", async () => {
  const { summary, rows } = await runWorkflow("fila", { failDetail: true });
  assert.equal(summary.status, "success", JSON.stringify(summary.base_error_examples));
  assert.equal(summary.detail_restricted_or_unavailable, 1);
  assert.equal(rows.C5.etapa_ml, "Mediação");
});

test("workflow MVP7 não guarda chaves", () => {
  const config = workflow.nodes.find((node) => node.name === "CONFIG - Devolucoes").parameters.jsCode;
  for (const field of ["ml_client_id", "ml_client_secret", "supabase_url", "supabase_service_role_key"]) {
    assert.match(config, new RegExp(field + ": 'PREENCHA_"));
  }
});
