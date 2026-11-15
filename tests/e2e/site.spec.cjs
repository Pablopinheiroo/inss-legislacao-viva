const { test, expect } = require("@playwright/test");

const BASE = "http://127.0.0.1:4173";

async function openApp(page) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#system-status span:last-child")).toHaveText(/Verificação (concluída|parcial|erro)|Falha na verificação/, { timeout: 60_000 });
  await expect(page.locator("#study-subject-grid")).toHaveCount(0);
  await expect(page.locator("#law-article-select")).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator("#law-article-text")).not.toBeEmpty({ timeout: 60_000 });
  await expect(page.locator("#start-quiz")).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator("#start-cloze")).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator("#start-error")).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator("#start-article")).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator("#start-multi-ce")).toBeEnabled({ timeout: 60_000 });
  return pageErrors;
}

async function enterGames(page) {
  await page.locator("#area-jogos").click();
}

test("navegação entre as quatro áreas, submenus e Radar", async ({ page }) => {
  await openApp(page);

  await page.locator("#area-estudar").click();
  await expect(page.locator("#study-view")).toBeVisible();
  await expect(page.locator("#subnav-estudar")).toBeVisible();
  await page.locator("#tab-review").click();
  await expect(page.locator("#review-view")).toBeVisible();

  await page.locator("#area-lei-seca").click();
  await expect(page.locator("#law-view")).toBeVisible();
  await expect(page.locator("#subnav-lei-seca")).toBeVisible();

  await enterGames(page);
  await expect(page.locator("#quiz-view")).toBeVisible();
  await expect(page.locator("#subnav-jogos")).toBeVisible();
  for (const [button, view] of [
    ["tab-cloze", "cloze-view"],
    ["tab-find-error", "find-error-view"],
    ["tab-article", "article-view"],
    ["tab-multi-ce", "multi-ce-view"],
    ["tab-before-after", "before-after-view"],
    ["tab-memory", "memory-view"],
    ["tab-simulado", "simulado-view"],
  ]) {
    await page.locator("#" + button).click();
    await expect(page.locator("#" + view)).toBeVisible();
  }

  await page.locator("#area-desempenho").click();
  await expect(page.locator("#performance-view")).toBeVisible();
  await expect(page.locator("#subnav-desempenho")).toBeVisible();
  await page.locator("#tab-history").click();
  await expect(page.locator("#history-view")).toBeVisible();
  await page.locator("#tab-achievements").click();
  await expect(page.locator("#achievements-view")).toBeVisible();

  await page.locator("#tab-radar").click();
  await expect(page.locator("#radar-view")).toBeVisible();
  await expect(page.locator("#section-nav")).toBeHidden();
});

test("Biblioteca Lei Seca mantém o texto local e liga à fonte oficial", async ({ page }) => {
  await openApp(page);
  await page.locator("#area-lei-seca").click();
  await expect(page.locator("#law-reader")).toBeVisible();
  await expect(page.locator("#law-article-select")).toBeEnabled();
  await expect(page.locator("#law-article-text")).not.toBeEmpty();
  await expect(page.locator("#law-reader-warning")).toContainText("captura salva");
  await expect(page.locator("#law-mark-studied")).toBeEnabled();
  await expect(page.locator("#law-favorite-article")).toBeEnabled();
  const source = new URL(await page.locator("#law-reader-source").getAttribute("href"));
  expect(source.hostname).toBe("www.planalto.gov.br");
  const options = await page.locator("#law-article-select option").count();
  expect(options).toBeGreaterThan(1);
});

test("os modos legislativos e simulados voltam a ter banco local disponível", async ({ page }) => {
  const pageErrors = await openApp(page);
  await enterGames(page);

  for (const [tab, button] of [
    ["tab-quiz", "start-quiz"],
    ["tab-cloze", "start-cloze"],
    ["tab-find-error", "start-error"],
    ["tab-article", "start-article"],
    ["tab-multi-ce", "start-multi-ce"]
  ]) {
    await page.locator("#" + tab).click();
    await expect(page.locator("#" + button)).toBeEnabled({ timeout: 60_000 });
  }

  await page.locator("#tab-simulado").click();
  await expect(page.locator("#start-simulado")).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator("#simulado-bank-note")).not.toContainText("0 questão(ões)");

  await page.locator("#tab-before-after").click();
  await expect(page.locator("#before-after-count-note")).toContainText(/alteração|comparação|registro/i);

  await page.locator("#tab-memory").click();
  await expect(page.locator("#memory-note")).not.toContainText("Nenhum cartão pôde ser montado", { timeout: 60_000 });
  expect(pageErrors).toEqual([]);
});

test("Lei Seca exibe apenas instrumentos normativos, sem matérias não legislativas", async ({ page }) => {
  await openApp(page);
  await page.locator("#area-lei-seca").click();
  await expect(page.locator("#law-library-count")).toContainText("normas cadastradas");
  await expect(page.locator("#law-library-list")).toContainText("Lei 8.213/1991");
  await expect(page.locator("#law-library-list")).toContainText("Decreto 3.048/1999");
  await expect(page.locator("#law-library-list")).not.toContainText("Português");
  await expect(page.locator("#law-library-list")).not.toContainText("Informática");
  await expect(page.locator("#law-library-list")).not.toContainText("Raciocínio Lógico");
});

test("cálculo de XP e domínio por assunto com dados controlados", async ({ page }) => {
  const seed = {
    experience: { total_xp: 100, awarded_ids: [], ledger: [], updated_at: null },
    sessions: [],
    events: []
  };
  for (let sessionIndex = 1; sessionIndex <= 2; sessionIndex++) {
    const sessionId = "quality-domain-session-" + sessionIndex;
    const started = new Date(Date.UTC(2026, 10, 10 + sessionIndex)).toISOString();
    seed.sessions.push({
      id: sessionId, mode: "quiz", mode_label: "Certo ou Errado",
      started_at: started, ended_at: started, status: "completed",
      answers_total: 5, review_mode: false, categories: ["Direito Previdenciário"]
    });
    for (let questionIndex = 1; questionIndex <= 5; questionIndex++) {
      seed.events.push({
        id: sessionId + "-question-" + questionIndex,
        event_type: "answer",
        session_id: sessionId,
        occurred_at: started,
        mode: "quiz",
        question_id: "quality-domain-question-" + questionIndex,
        prompt: "Questão de teste " + questionIndex,
        outcome: "correct",
        correct: true,
        category: "Direito Previdenciário",
        topic: "Benefícios previdenciários",
        law_id: "lei-8213-1991",
        law_title: "Lei 8.213/1991",
        article: "Art. 1",
        review_mode: false
      });
    }
  }
  await page.addInitScript(data => {
    localStorage.setItem("radarLegislativo.experience.v1", JSON.stringify(data.experience));
    localStorage.setItem("radarLegislativo.activitySessions.v1", JSON.stringify(data.sessions));
    localStorage.setItem("radarLegislativo.activityEvents.v1", JSON.stringify(data.events));
  }, seed);

  await openApp(page);
  await page.locator("#area-desempenho").click();
  await expect(page.locator("#xp-level")).toHaveText("2");
  await expect(page.locator("#performance-xp-total")).toHaveText("100 XP");
  await page.locator("#tab-history").click();
  await expect(page.locator("#domain-all-list")).toContainText("Dominado");
  await expect(page.locator("#domain-all-list")).toContainText("Benefícios previdenciários");
});

test("backup exportado pode ser recuperado em outro navegador", async ({ browser }) => {
  const sourceContext = await browser.newContext();
  const sourcePage = await sourceContext.newPage();
  await openApp(sourcePage);
  await sourcePage.evaluate(() => {
    localStorage.setItem("radarLegislativo.leiSeca.favorites.v1", JSON.stringify(["lei-8213-1991::Art. 1"]));
    localStorage.setItem("radarLegislativo.studyStates", JSON.stringify({ "quality::Art. 1": "estudado" }));
  });

  await sourcePage.locator(".study-data-details > summary").click();
  const downloadPromise = sourcePage.waitForEvent("download");
  await sourcePage.locator("#data-export-backup").click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  const fs = require("node:fs");
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  expect(backup.format).toBe("radar-legislativo-inss-backup");
  expect(backup.storage["radarLegislativo.leiSeca.favorites.v1"]).toContain("lei-8213-1991::Art. 1");
  expect(backup.storage["radarLegislativo.activityEvents.v1"]).not.toBeUndefined();

  const targetContext = await browser.newContext();
  const targetPage = await targetContext.newPage();
  await openApp(targetPage);
  await targetPage.evaluate(() => {
    localStorage.setItem("radarLegislativo.studyStates", JSON.stringify({ onlyTarget: "old" }));
  });
  targetPage.on("dialog", dialog => dialog.accept());

  await targetPage.locator(".study-data-details > summary").click();
  const safetyCopy = targetPage.waitForEvent("download");
  await targetPage.locator("#data-import-file").setInputFiles({
    name: "backup-de-teste.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });
  const safetyDownload = await safetyCopy;
  expect(safetyDownload.suggestedFilename()).toContain("antes-da-importacao");

  await expect.poll(async () => targetPage.evaluate(() => {
    const states = JSON.parse(localStorage.getItem("radarLegislativo.studyStates") || "{}");
    const favorites = JSON.parse(localStorage.getItem("radarLegislativo.leiSeca.favorites.v1") || "[]");
    return { states, favorites };
  }), { timeout: 20_000 }).toEqual({
    states: { "quality::Art. 1": "estudado" },
    favorites: ["lei-8213-1991::Art. 1"]
  });

  await sourceContext.close();
  await targetContext.close();
});

test("uso responsivo em celular e computador sem chamadas a servidor próprio", async ({ page }) => {
  const remoteDataRequests = [];
  page.on("request", request => {
    const type = request.resourceType();
    if ((type === "fetch" || type === "xhr") && !request.url().startsWith(BASE)) {
      remoteDataRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator("#area-lei-seca").click();
  await expect(page.locator("#law-reader")).toBeVisible();
  const mobileMetrics = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(mobileMetrics.document).toBeLessThanOrEqual(mobileMetrics.width + 1);
  expect(mobileMetrics.body).toBeLessThanOrEqual(mobileMetrics.width + 1);
  for (const id of ["area-estudar", "area-lei-seca", "area-jogos", "area-desempenho"]) {
    await expect(page.locator("#" + id)).toBeVisible();
  }
  const header = await page.evaluate(() => {
    const brand = document.querySelector(".topbar-brand-area").getBoundingClientRect();
    const bell = document.querySelector("#notification-button").getBoundingClientRect();
    return { brandRight: brand.right, bellLeft: bell.left, bellRight: bell.right, width: innerWidth };
  });
  expect(header.brandRight).toBeLessThanOrEqual(header.bellLeft + 1);
  expect(header.bellRight).toBeLessThanOrEqual(header.width + 1);

  await page.setViewportSize({ width: 1365, height: 900 });
  await page.locator("#area-desempenho").click();
  await expect(page.locator("#performance-view")).toBeVisible();
  const desktopMetrics = await page.evaluate(() => ({
    width: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(desktopMetrics.document).toBeLessThanOrEqual(desktopMetrics.width + 1);
  expect(remoteDataRequests).toEqual([]);
});
