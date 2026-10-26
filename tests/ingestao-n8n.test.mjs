import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const folder = new URL("../ingestao/n8n/", import.meta.url);
const files = (await readdir(folder)).filter((name) => name.endsWith(".json"));

test("cópias dos workflows n8n no repositório não guardam chaves", async () => {
  assert.ok(files.length >= 2);

  for (const name of files) {
    const raw = await readFile(new URL(name, folder), "utf8");
    // Nenhum JWT (service_role do Supabase) em nenhum lugar do arquivo.
    assert.doesNotMatch(raw, /eyJhbGciOi/, name);

    const configs = JSON.parse(raw).nodes.filter((node) => node.name.startsWith("CONFIG"));
    assert.ok(configs.length, `${name} sem node CONFIG`);
    for (const node of configs) {
      for (const field of ["ml_client_id", "ml_client_secret", "supabase_url", "supabase_service_role_key"]) {
        assert.match(node.parameters.jsCode, new RegExp(field + ": 'PREENCHA_"), `${name}: ${field}`);
      }
    }
  }
});
