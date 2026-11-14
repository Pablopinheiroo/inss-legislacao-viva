const { test, expect } = require("@playwright/test");

const BASE = "http://127.0.0.1:4173";

async function openApp(page) {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#system-status span:last-child")).toHaveText("Verificação concluída", { timeout: 60_000 });
  await expect(page.locator("#law-article-select")).toBeEnabled({ timeout: 60_000 });
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

test("Biblioteca Lei Seca: captura, fonte oficial, favoritos e progresso persistente", async ({ page }) => {
  await openApp(page);
  await page.locator("#area-lei-seca").click();
  await expect(page.locator("#law-reader")).toBeVisible();

  const article = await page.locator("#law-article-select").inputValue();
  expect(article).toBeTruthy();
  const snapshotText = await page.evaluate(async articleKey => {
    const snapshot = await fetch("data/snapshots/lei-8213-1991.json").then(response => response.json());
    return snapshot.articles[articleKey];
  }, article);
  await expect(page.locator("#law-article-text")).toHaveText(snapshotText);

  const source = new URL(await page.locator("#law-reader-source").getAttribute("href"));
  expect(["gov.br", "leg.br"].some(suffix => source.hostname === suffix || source.hostname.endsWith("." + suffix))).toBeTruthy();

  await page.locator("#law-favorite-article").click();
  const favoriteKey = "lei-8213-1991::" + article;
  let favorites = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.leiSeca.favorites.v1") || "[]"));
  expect(favorites).toContain(favoriteKey);

  await page.locator("#law-article-filter").selectOption("favoritos");
  await expect(page.locator("#law-article-select")).toHaveValue(article);
  await page.locator("#law-article-filter").selectOption("todos");

  await page.locator("#law-mark-studied").click();
  const studied = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.leiSeca.studied.v1") || "[]"));
  expect(studied).toContain(favoriteKey);

  await page.reload();
  await expect(page.locator("#law-article-select")).toBeEnabled({ timeout: 60_000 });
  favorites = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.leiSeca.favorites.v1") || "[]"));
  expect(favorites).toContain(favoriteKey);
  const studiedAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.leiSeca.studied.v1") || "[]"));
  expect(studiedAfterReload).toContain(favoriteKey);
});

test("os sete modos de treinamento registram respostas e mantêm o progresso", async ({ page }) => {
  const pageErrors = await openApp(page);
  await enterGames(page);

  // 1. Certo ou Errado: a opção Não sei deve chegar à fila de revisão.
  await page.locator("#tab-quiz").click();
  await page.locator("#start-quiz").click();
  await expect(page.locator("#quiz-card")).toBeVisible();
  await page.locator("#answer-unknown").click();
  await page.locator("#submit-answer").click();
  await expect(page.locator("#answer-feedback")).toBeVisible();
  const ceQueue = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.ceReview.v1") || "{}"));
  expect(Object.keys(ceQueue).length).toBeGreaterThan(0);

  // A centralização da revisão deve trazer o erro do jogo de origem e reabrir o modo correto.
  await page.locator("#area-estudar").click();
  await page.locator("#tab-review").click();
  await expect(page.locator("#central-review-list .central-review-card")).toHaveCount(1);
  await page.locator("#central-review-list .central-review-card .primary-button").click();
  await expect(page.locator("#quiz-card")).toBeVisible();
  await page.locator("#area-jogos").click();

  // 2. Completar Lei Seca: responder incorretamente deve criar um item de revisão.
  await page.locator("#tab-cloze").click();
  await expect(page.locator("#start-cloze")).toBeEnabled();
  await page.locator("#start-cloze").click();
  await expect(page.locator("#cloze-card")).toBeVisible();
  const blanks = page.locator("#cloze-text input");
  const blankCount = await blanks.count();
  expect(blankCount).toBeGreaterThan(0);
  for (let index = 0; index < blankCount; index++) {
    await blanks.nth(index).fill("resposta propositalmente incorreta");
  }
  await page.locator("#check-cloze").click();
  await expect(page.locator("#cloze-feedback")).toBeVisible();
  const clozeQueue = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.clozeReview.v1") || "{}"));
  expect(Object.values(clozeQueue).some(item => item && item.status === "pending")).toBeTruthy();

  // 3. Encontre o erro: percorrer os trechos até localizar o único trecho incorreto.
  await page.locator("#tab-find-error").click();
  await expect(page.locator("#start-error")).toBeEnabled();
  await page.locator("#start-error").click();
  await expect(page.locator("#error-card")).toBeVisible();
  const segmentCount = await page.locator("#error-statement .error-segment").count();
  expect(segmentCount).toBeGreaterThanOrEqual(3);
  for (let attempt = 0; attempt < segmentCount; attempt++) {
    if (await page.locator("#error-solution").isVisible()) break;
    const nextSegment = page.locator("#error-statement .error-segment:not(:disabled)").first();
    await nextSegment.click();
  }
  await expect(page.locator("#error-solution")).toBeVisible();

  // 4. Descubra o artigo.
  await page.locator("#tab-article").click();
  await expect(page.locator("#start-article")).toBeEnabled();
  await page.locator("#start-article").click();
  await expect(page.locator("#article-card")).toBeVisible();
  await page.locator("#article-options button").first().click();
  await page.locator("#submit-article").click();
  await expect(page.locator("#article-feedback")).toBeVisible();

  // 5. Várias afirmações.
  await page.locator("#tab-multi-ce").click();
  await expect(page.locator("#start-multi-ce")).toBeEnabled();
  await page.locator("#start-multi-ce").click();
  await expect(page.locator("#multi-ce-card")).toBeVisible();
  await page.locator("#multi-ce-true").click();
  await page.locator("#multi-ce-submit").click();
  await expect(page.locator("#multi-ce-feedback")).toBeVisible();

  // 6. Antes e depois é testado com uma alteração simulada no teste de integração próprio,
  // pois a captura publicada no momento não contém alterações reais.
  
  // 7. Memorização ativa.
  await page.locator("#tab-memory").click();
  await expect(page.locator("#start-memory")).toBeEnabled({ timeout: 60_000 });
  await page.locator("#start-memory").click();
  await expect(page.locator("#memory-card")).toBeVisible();
  await page.locator("#memory-reveal").click();
  await expect(page.locator("#memory-answer")).toBeVisible();
  await page.locator("#memory-good").click();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.memoryProgress.v1") || "{}"));
  expect(Object.keys(progress).length).toBeGreaterThan(0);

  const events = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.activityEvents.v1") || "[]"));
  expect(events.filter(item => item.event_type === "answer").length).toBeGreaterThanOrEqual(4);
  const experience = await page.evaluate(() => JSON.parse(localStorage.getItem("radarLegislativo.experience.v1") || "{}"));
  expect(Number(experience.total_xp || 0)).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test("artigo alterado: aviso, comparação Antes e depois e questão vinculada", async ({ page }) => {
  await page.route("**/data/legislacao.json*", async route => {
    const response = await route.fetch();
    const data = await response.json();
    const snapshotResponse = await fetch(BASE + "/data/snapshots/lei-8213-1991.json");
    const snapshot = await snapshotResponse.json();
    const newText = snapshot.articles["Art. 1"];
    const oldText = newText.replace("mediante contribuição", "independentemente de contribuição");
    expect(oldText).not.toBe(newText);
    data.changes = [{
      id: "quality-fixture-lei-8213-art-1",
      law_id: "lei-8213-1991",
      law_title: "Lei nº 8.213, de 24 de julho de 1991",
      law_short_title: "Lei 8.213/1991 — Planos de Benefícios",
      article: "Art. 1",
      change_type: "alterado",
      summary: "Alteração simulada para testar o vínculo com artigo estudado.",
      old_text: oldText,
      new_text: newText,
      source_url: snapshot.source_url_used,
      detected_at: "2026-11-14T16:00:00.000Z"
    }];
    await route.fulfill({ response, json: data });
  });

  await openApp(page);
  await page.locator("#area-lei-seca").click();
  await expect(page.locator("#law-reader")).toBeVisible();
  await page.locator("#law-article-select").selectOption("Art. 1");
  await page.locator("#law-mark-studied").click();
  await expect(page.locator("#notification-study-indicator")).toBeVisible();
  await expect(page.locator("#notification-button")).toHaveClass(/has-study-impact/);

  await page.locator("#notification-button").click();
  await expect(page.locator("#drawer-content")).toContainText("Alterações em artigos estudados");
  await expect(page.locator("#drawer-content")).toContainText("Art. 1");
  await page.locator("#close-drawer").click();

  await enterGames(page);
  await page.locator("#tab-before-after").click();
  await expect(page.locator("#before-after-count-note")).toContainText("1 alteração");
  await expect(page.locator("#start-before-after")).toBeEnabled();
  await page.locator("#start-before-after").click();
  await expect(page.locator("#before-after-card")).toBeVisible();

  const currentVersion = page.locator("#before-after-options button").filter({ hasText: "mediante contribuição" });
  await expect(currentVersion).toHaveCount(1);
  await currentVersion.click();
  await page.locator("#before-after-submit").click();
  await expect(page.locator("#before-after-feedback")).toBeVisible();
  await expect(page.locator("#before-after-comparison")).toContainText("DEPOIS");
  await page.locator("#before-after-change-options button").first().click();
  await expect(page.locator("#before-after-next")).toBeEnabled();
  await page.locator("#before-after-next").click();
  await expect(page.locator("#before-after-summary")).toBeVisible();

  // A questão C/E que aponta para o mesmo artigo continua disponível e vinculada à captura.
  await page.locator("#tab-quiz").click();
  await page.locator("#quiz-law-filter").selectOption("lei-8213-1991");
  const articleOption = page.locator('#quiz-article-filter option[value="Art. 1"]');
  await expect(articleOption).toHaveCount(1);
  await page.locator("#quiz-article-filter").selectOption("Art. 1");
  await expect(page.locator("#start-quiz")).toBeEnabled();
  await expect(page.locator("#question-count-note")).toContainText("item(ns) nesta seleção");
});

test("simulados tradicional, rápido e completo; cronômetros e relatório", async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());

  await openApp(page);
  await enterGames(page);
  await page.locator("#tab-simulado").click();

  await page.locator("#start-simulado").click();
  await expect(page.locator("#simulado-card")).toBeVisible();
  await expect(page.locator("#simulado-timer-wrap")).toBeHidden();
  await page.locator("#simulado-answer-true").click();
  await page.locator("#simulado-finish").click();
  await expect(page.locator("#simulado-result")).toBeVisible();

  await page.reload();
  await openApp(page);
  await enterGames(page);
  await page.locator("#tab-simulado").click();
  await page.locator("#start-simulado-rapido").click();
  await expect(page.locator("#simulado-timer-wrap")).toBeVisible();
  const quickTime = await page.locator("#simulado-timer").textContent();
  expect(quickTime).toMatch(/^\d{2}:\d{2}$/);
  await page.waitForTimeout(1200);
  expect(await page.locator("#simulado-timer").textContent()).not.toBe(quickTime);
  await page.locator("#simulado-answer-false").click();
  await page.locator("#simulado-finish").click();
  await expect(page.locator("#simulado-result")).toBeVisible();

  await page.reload();
  await openApp(page);
  await enterGames(page);
  await page.locator("#tab-simulado").click();
  await page.locator("#start-simulado-completo").click();
  await expect(page.locator("#simulado-type-label")).toContainText("60 QUESTÕES");
  await expect(page.locator("#simulado-timer-wrap")).toBeVisible();
  await expect(page.locator("#simulado-timer")).toHaveText(/^\d{2}:\d{2}$/);
  await page.locator("#simulado-answer-true").click();
  await page.locator("#simulado-finish").click();
  await expect(page.locator("#simulado-result")).toBeVisible();
  await expect(page.locator("#simulado-stat-net-points")).not.toBeEmpty();
  await expect(page.locator("#simulado-stat-time")).not.toBeEmpty();
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
