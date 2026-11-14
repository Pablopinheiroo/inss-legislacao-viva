"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "data-storage.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function loadStore(initial = {}, options = {}) {
  const values = new Map(Object.entries(initial));
  let failedOnce = false;
  const localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (options.failOnceFor === key && !failedOnce) {
        failedOnce = true;
        throw new Error("QuotaExceededError simulado");
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  class CustomEventMock {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }
  const window = { localStorage, CustomEvent: CustomEventMock, dispatchEvent() {} };
  vm.runInNewContext(source, { window, JSON, Date, Object, Array, Set, Error, Number, String, Math });
  return { store: window.RadarDataStorage, values };
}

test("o backup reúne progresso, revisões, favoritos, histórico, XP e conquistas", () => {
  const { store } = loadStore({
    "radarLegislativo.studyStates": JSON.stringify({ "lei::Art. 1º": "estudado" }),
    "radarLegislativo.activityEvents.v1": JSON.stringify([{ event_type: "answer" }])
  });
  const backup = store.createBackup();
  assert.equal(backup.format, "radar-legislativo-inss-backup");
  assert.equal(typeof backup.storage["radarLegislativo.studyStates"], "string");
  assert.equal(typeof backup.storage["radarLegislativo.activityEvents.v1"], "string");
  assert.ok(Object.hasOwn(backup.storage, "radarLegislativo.leiSeca.favorites.v1"));
  assert.ok(Object.hasOwn(backup.storage, "radarLegislativo.experience.v1"));
  assert.ok(Object.hasOwn(backup.storage, "radarLegislativo.achievements.v1"));
  assert.equal(Object.hasOwn(backup.storage, "radarLegislativo.activityActiveSession.v1"), false);
});

test("a restauração recupera os dados e encerra uma partida que estava em andamento", () => {
  const { store, values } = loadStore({
    "radarLegislativo.studyStates": JSON.stringify({ article: "estudado" }),
    "radarLegislativo.activityEvents.v1": JSON.stringify([{ id: "evento-antigo" }]),
    "radarLegislativo.activityActiveSession.v1": "sessao-atual"
  });
  const backup = store.createBackup();
  values.set("radarLegislativo.studyStates", JSON.stringify({ article: "alterado" }));
  values.set("radarLegislativo.activityEvents.v1", JSON.stringify([]));
  const result = store.restoreBackup(backup);
  assert.deepEqual(JSON.parse(values.get("radarLegislativo.studyStates")), { article: "estudado" });
  assert.deepEqual(JSON.parse(values.get("radarLegislativo.activityEvents.v1")), [{ id: "evento-antigo" }]);
  assert.equal(values.has("radarLegislativo.activityActiveSession.v1"), false);
  assert.ok(result.restored_keys > 0);
});

test("a validação recusa arquivos de outra aplicação e campos desconhecidos", () => {
  const { store, values } = loadStore({
    "radarLegislativo.studyStates": JSON.stringify({ intacto: true })
  });
  const backup = store.createBackup();
  assert.throws(() => store.validateBackup({ format: "outro", schema_version: 1, storage: {} }));
  const altered = JSON.parse(JSON.stringify(backup));
  altered.storage["radarLegislativo.senha"] = "nao-permitido";
  assert.throws(() => store.validateBackup(altered));
  assert.deepEqual(JSON.parse(values.get("radarLegislativo.studyStates")), { intacto: true });
});

test("a validação recusa registros JSON danificados ou com estrutura incompatível", () => {
  const { store } = loadStore();
  const malformed = store.createBackup();
  malformed.storage["radarLegislativo.studyStates"] = "{";
  assert.throws(() => store.validateBackup(malformed));
  const wrongShape = store.createBackup();
  wrongShape.storage["radarLegislativo.activityEvents.v1"] = JSON.stringify({});
  assert.throws(() => store.validateBackup(wrongShape));
});

test("uma falha durante a importação tenta reverter os registros já gravados", () => {
  const original = {
    "radarLegislativo.studyStates": JSON.stringify({ original: true }),
    "radarLegislativo.ceReview.v1": JSON.stringify({ old: true })
  };
  const { store, values } = loadStore(original, { failOnceFor: "radarLegislativo.ceReview.v1" });
  const backup = store.createBackup();
  backup.storage["radarLegislativo.studyStates"] = JSON.stringify({ novo: true });
  backup.storage["radarLegislativo.ceReview.v1"] = JSON.stringify({ novo: true });
  assert.throws(() => store.restoreBackup(backup));
  assert.deepEqual(JSON.parse(values.get("radarLegislativo.studyStates")), { original: true });
  assert.deepEqual(JSON.parse(values.get("radarLegislativo.ceReview.v1")), { old: true });
});

test("o HTML carrega o gerenciador antes do app, que não acessa localStorage diretamente", () => {
  assert.ok(html.indexOf("data-storage.js") >= 0);
  assert.ok(html.indexOf("data-storage.js") < html.indexOf("app.js"));
  assert.match(html, /id="data-export-backup"/);
  assert.match(html, /id="data-import-backup"/);
  assert.equal((appSource.match(/localStorage\.(?:getItem|setItem|removeItem)\(/g) || []).length, 0);
  assert.match(appSource, /window\.RadarDataStorage/);
});


test("um backup exportado em um navegador pode ser restaurado em outro", () => {
  const deviceA = loadStore({
    "radarLegislativo.studyStates": JSON.stringify({ "Lei 8.213::Art. 15": "estudado" }),
    "radarLegislativo.leiSeca.favorites.v1": JSON.stringify(["Lei 8.213::Art. 15"]),
    "radarLegislativo.experience.v1": JSON.stringify({ total_xp: 125, awarded_ids: [], ledger: [] })
  });
  const backupFileContents = JSON.stringify(deviceA.store.createBackup());
  const deviceB = loadStore({
    "radarLegislativo.studyStates": JSON.stringify({ dado: "de outro navegador" })
  });
  const imported = JSON.parse(backupFileContents);
  const result = deviceB.store.restoreBackup(imported);
  assert.deepEqual(JSON.parse(deviceB.values.get("radarLegislativo.studyStates")), {
    "Lei 8.213::Art. 15": "estudado"
  });
  assert.deepEqual(JSON.parse(deviceB.values.get("radarLegislativo.leiSeca.favorites.v1")), [
    "Lei 8.213::Art. 15"
  ]);
  assert.equal(JSON.parse(deviceB.values.get("radarLegislativo.experience.v1")).total_xp, 125);
  assert.ok(result.restored_keys > 0);
});

test("nenhuma chave de progresso do app fica fora da lista do backup sem exceção explícita", () => {
  const { store } = loadStore();
  const appKeys = new Set([...appSource.matchAll(/"radarLegislativo\\.[^"]+"/g)].map(match => match[0].slice(1, -1)));
  const backupKeys = new Set(store.getBackupKeys());
  const intentionallyExcluded = new Set(["radarLegislativo.activityActiveSession.v1"]);
  for (const key of appKeys) {
    assert.ok(backupKeys.has(key) || intentionallyExcluded.has(key), "Chave sem backup: " + key);
  }
  assert.equal(appSource.includes("localStorage.clear("), false);
});
