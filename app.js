const DATA_URL = "data/legislacao.json";
const QUESTIONS_URL = "data/questoes.json";
const LAWS_URL = "data/laws.json";
const ERROR_BANK_URL = "data/encontre-erro.json";
const LAST_SEEN_KEY = "radarLegislativo.lastSeen";
const STUDY_KEY = "radarLegislativo.studyStates";
let dashboardData = null;
let allChanges = [];
let questionBank = [];
let clozeLaws = [];
let clozeSnapshot = null;
let clozeCurrent = null;
let clozeBlanks = [];
let clozeAnswered = 0;
let quizState = { questions: [], index: 0, selected: null, answers: [] };
let findErrorItems = [];
let findErrorState = { questions: [], index: 0, answers: [], tries: 0, resolved: false };
const $ = (selector) => document.querySelector(selector);
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatDate(value) {
  if (!value) return "Ainda não realizada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : dateFormatter.format(date);
}
function loadStudyStates() {
  try { return JSON.parse(localStorage.getItem(STUDY_KEY) || "{}"); }
  catch (_) { return {}; }
}
function stateFor(id) { return loadStudyStates()[id] || "nao-estudado"; }
function setStudyState(id, state) {
  const states = loadStudyStates();
  states[id] = state;
  localStorage.setItem(STUDY_KEY, JSON.stringify(states));
}
function typeLabel(type) {
  return ({
    alterado: "ARTIGO ALTERADO",
    incluido: "ARTIGO INCLUÍDO",
    nao_encontrado: "ARTIGO NÃO LOCALIZADO",
    possivelmente_revogado: "POSSÍVEL REVOGAÇÃO",
    texto_integral_alterado: "TEXTO INTEGRAL DIFERENTE"
  })[type] || "DIFERENÇA DETECTADA";
}
function renderStatus(data) {
  const pill = $("#system-status");
  pill.className = "status-pill " + (data.status || "");
  const label = data.status === "ok" ? "Verificação concluída" : data.status === "parcial" ? "Verificação parcial" : data.status === "erro" ? "Falha na verificação" : "Aguardando primeira verificação";
  pill.querySelector("span:last-child").textContent = label;
  $("#stat-changes").textContent = data.changes ? data.changes.length : 0;
  $("#stat-laws").textContent = data.laws ? data.laws.length : 0;
  $("#stat-check").textContent = formatDate(data.last_check_attempt || data.last_successful_check);
  $("#stat-check-note").textContent = data.summary || (data.last_successful_check ? "Última consulta concluída" : "A primeira execução ainda não ocorreu");
}
function updateBadge() {
  const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
  const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
  const count = allChanges.filter(item => new Date(item.detected_at).getTime() > lastSeenTime).length;
  const badge = $("#notification-badge");
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("hidden", count === 0);
}
function createChangeCard(change) {
  const node = $("#change-template").content.firstElementChild.cloneNode(true);
  const type = node.querySelector(".change-type");
  type.textContent = typeLabel(change.change_type);
  type.classList.add(change.change_type || "");
  node.querySelector(".detected-date").textContent = "Detectado em " + formatDate(change.detected_at);
  node.querySelector(".law-name").textContent = change.law_short_title || change.law_title || "Norma sem identificação";
  node.querySelector(".article-label").textContent = change.article || "Texto integral";
  node.querySelector(".change-summary").textContent = change.summary || "Diferença detectada entre duas verificações.";
  node.querySelector(".old-text").textContent = change.old_text || "Não havia texto anterior para comparação.";
  node.querySelector(".new-text").textContent = change.new_text || "O artigo não foi localizado na captura atual.";
  node.querySelector(".source-link").href = change.source_url || "https://www.gov.br/";
  const select = node.querySelector(".study-select");
  select.value = stateFor(change.id);
  select.addEventListener("change", () => setStudyState(change.id, select.value));
  node.querySelector(".date-note").textContent = change.date_note || "Confira a fonte oficial antes de atualizar seu material.";
  return node;
}
function filteredChanges() {
  const query = $("#search-input").value.trim().toLocaleLowerCase("pt-BR");
  const type = $("#type-filter").value;
  const study = $("#study-filter").value;
  return allChanges.filter(item => {
    const haystack = [item.law_title, item.law_short_title, item.article].join(" ").toLocaleLowerCase("pt-BR");
    return (!query || haystack.includes(query)) && (type === "todos" || item.change_type === type) && (study === "todos" || stateFor(item.id) === study);
  });
}
function renderChanges() {
  const list = $("#change-list");
  const results = filteredChanges();
  list.replaceChildren();
  $("#results-caption").textContent = results.length + " item(ns) exibido(s)";
  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("h3");
    const message = document.createElement("p");
    const noHistory = allChanges.length === 0;
    title.textContent = noHistory ? "Nenhuma alteração registrada" : "Nenhum resultado encontrado";
    message.textContent = noHistory
      ? (dashboardData && dashboardData.last_successful_check ? "Nenhuma diferença foi identificada nas verificações concluídas. Consulte novamente depois da próxima execução." : "A primeira verificação ainda precisa ser executada. Depois dela, diferenças futuras aparecerão aqui.")
      : "Tente mudar os filtros ou a busca.";
    empty.append(title, message);
    list.append(empty);
    return;
  }
  results.forEach(change => list.append(createChangeCard(change)));
}
function renderLaws() {
  const list = $("#law-list");
  list.replaceChildren();
  (dashboardData && dashboardData.laws ? dashboardData.laws : []).forEach(law => {
    const link = document.createElement("a");
    link.className = "law-item";
    link.href = law.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const title = document.createElement("span");
    title.textContent = law.short_title || law.title;
    const status = document.createElement("small");
    status.textContent = law.error ? "falha na consulta" : law.source_revision ? law.source_revision : law.parser_mode === "index" ? "histórico oficial consultado" : law.last_checked ? (law.article_count + " artigos consultados") : "aguardando";
    link.append(title, status);
    list.append(link);
  });
}
function renderDrawer() {
  const content = $("#drawer-content");
  content.replaceChildren();
  const recent = allChanges.slice(0, 20);
  if (!recent.length) {
    const message = document.createElement("p");
    message.className = "drawer-copy";
    message.textContent = "Nenhuma alteração foi registrada até agora.";
    content.append(message);
    return;
  }
  recent.forEach(item => {
    const row = document.createElement("div");
    row.className = "drawer-row";
    const strong = document.createElement("strong");
    const detail = document.createElement("span");
    strong.textContent = (item.law_short_title || item.law_title) + " · " + (item.article || "Texto integral");
    detail.textContent = typeLabel(item.change_type) + " · " + formatDate(item.detected_at);
    row.append(strong, detail);
    content.append(row);
  });
}
function openDrawer() {
  $("#notification-drawer").classList.remove("hidden");
  $("#notification-button").setAttribute("aria-expanded", "true");
  localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  updateBadge();
  renderDrawer();
}
function closeDrawer() {
  $("#notification-drawer").classList.add("hidden");
  $("#notification-button").setAttribute("aria-expanded", "false");
}
async function loadDashboard() {
  try {
    const response = await fetch(DATA_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    dashboardData = await response.json();
    allChanges = Array.isArray(dashboardData.changes) ? dashboardData.changes : [];
    renderStatus(dashboardData);
    updateBadge();
    renderChanges();
    renderLaws();
  } catch (error) {
    $("#system-status").className = "status-pill error";
    $("#system-status span:last-child").textContent = "Dados indisponíveis";
    $("#change-list").textContent = "Não foi possível carregar os dados do monitoramento. Confira a publicação pelo GitHub Pages.";
    console.error(error);
  }
}


// -------------------- Completar Lei Seca --------------------
function normalizeAnswer(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'").replace(/\s+/g, " ");
}
async function loadClozeLaws() {
  try {
    const response = await fetch(LAWS_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    clozeLaws = (Array.isArray(data) ? data : []).filter(law => law.enabled !== false);
    const select = $("#cloze-law");
    select.replaceChildren();
    clozeLaws.forEach(law => {
      const option = document.createElement("option");
      option.value = law.id;
      option.textContent = law.short_title || law.title;
      select.append(option);
    });
    if (!clozeLaws.length) throw new Error("Nenhuma norma está cadastrada.");
    await loadClozeSnapshot();
  } catch (error) {
    $("#cloze-note").textContent = "Não foi possível carregar as normas salvas. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
async function loadClozeSnapshot() {
  const law = clozeLaws.find(item => item.id === $("#cloze-law").value) || clozeLaws[0];
  if (!law) return;
  $("#cloze-note").textContent = "Carregando artigos de " + (law.short_title || law.title) + "...";
  $("#start-cloze").disabled = true;
  clozeSnapshot = null;
  try {
    const response = await fetch("data/snapshots/" + encodeURIComponent(law.id) + ".json?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const snapshot = await response.json();
    const articles = snapshot.articles && typeof snapshot.articles === "object" ? snapshot.articles : {};
    const entries = Object.entries(articles).filter(([_, text]) => typeof text === "string" && text.trim().length >= 80);
    clozeSnapshot = { law, entries, snapshot };
    const articleSelect = $("#cloze-article");
    articleSelect.replaceChildren();
    const randomOption = document.createElement("option");
    randomOption.value = "aleatorio";
    randomOption.textContent = "Artigo aleatório";
    articleSelect.append(randomOption);
    entries.sort((a,b) => {
      const na = Number((a[0].match(/\d+/) || [0])[0]);
      const nb = Number((b[0].match(/\d+/) || [0])[0]);
      return na - nb || a[0].localeCompare(b[0], "pt-BR");
    }).forEach(([article]) => {
      const option = document.createElement("option");
      option.value = article;
      option.textContent = article;
      articleSelect.append(option);
    });
    articleSelect.disabled = entries.length === 0;
    $("#start-cloze").disabled = entries.length === 0;
    $("#cloze-note").textContent = entries.length
      ? entries.length + " artigos disponíveis nesta norma. Fonte consultada em " + formatDate(snapshot.captured_at) + "."
      : "Esta norma ainda não possui artigos separados com segurança para o exercício de lacunas. Escolha outra norma.";
  } catch (error) {
    $("#cloze-note").textContent = "Não foi possível carregar a captura dessa norma. A verificação pode não ter sido concluída.";
    $("#cloze-article").disabled = true;
    $("#start-cloze").disabled = true;
    console.error(error);
  }
}
function buildClozeForText(text, difficulty) {
  const tokenRegex = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[-'][A-Za-zÀ-ÖØ-öø-ÿ]+)*|\d+(?:[.,]\d+)?/gu;
  const common = new Set([
    "para","pela","pelo","pelas","pelos","sobre","entre","desde","quando","onde","como","mais","menos",
    "esta","este","essas","esses","isso","isto","aquele","aquela","tambem","ainda","assim","sendo",
    "serao","seria","serao","foram","ser","sua","suas","seu","seus","que","com","sem","nos","nas",
    "dos","das","dos","uma","umas","uns","por","sob","aos","aquelas","aqueles","cada","todo","toda",
    "todos","todas","qual","quais","cujo","cuja","cujos","cujas","art","artigo"
  ]);
  const tokens = [];
  let match;
  while ((match = tokenRegex.exec(text)) !== null) {
    const value = match[0];
    const normalized = normalizeAnswer(value);
    const numeric = /^\d/.test(value);
    const initialHeaderToken = tokens.length < 2 && (normalized === "art" || /^\d/.test(value));
    if (!initialHeaderToken && (numeric ? value.length >= 2 : value.length >= 5 && !common.has(normalized))) {
      tokens.push({ start: match.index, end: match.index + value.length, value });
    }
  }
  const requested = difficulty === "facil" ? 4 : difficulty === "dificil" ? 10 : 7;
  const selected = shuffle(tokens).slice(0, Math.min(requested, tokens.length)).sort((a,b) => a.start - b.start);
  return selected;
}
function renderClozeText(text, blanks) {
  const container = $("#cloze-text");
  container.replaceChildren();
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  blanks.forEach((blank, index) => {
    fragment.append(document.createTextNode(text.slice(cursor, blank.start)));
    const slot = document.createElement("span");
    slot.className = "cloze-slot";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cloze-input";
    input.dataset.index = String(index);
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Lacuna " + (index + 1));
    input.placeholder = "____";
    input.style.width = Math.max(4.5, Math.min(15, blank.value.length * 0.78)) + "ch";
    const correction = document.createElement("span");
    correction.className = "cloze-correction hidden";
    slot.append(input, correction);
    fragment.append(slot);
    cursor = blank.end;
  });
  fragment.append(document.createTextNode(text.slice(cursor)));
  container.append(fragment);
}
function startCloze() {
  if (!clozeSnapshot || !clozeSnapshot.entries.length) return;
  const selected = $("#cloze-article").value;
  let entry;
  if (selected === "aleatorio") {
    entry = clozeSnapshot.entries[Math.floor(Math.random() * clozeSnapshot.entries.length)];
  } else {
    entry = clozeSnapshot.entries.find(([article]) => article === selected);
  }
  if (!entry) return;
  const [article, text] = entry;
  clozeCurrent = { article, text };
  clozeBlanks = buildClozeForText(text, $("#cloze-difficulty").value);
  clozeAnswered = 0;
  $("#cloze-law-label").textContent = clozeSnapshot.law.short_title || clozeSnapshot.law.title;
  $("#cloze-article-label").textContent = article;
  $("#cloze-original-text").textContent = text;
  $("#cloze-original").open = false;
  $("#cloze-feedback").classList.add("hidden");
  $("#check-cloze").classList.remove("hidden");
  $("#next-cloze").classList.add("hidden");
  $("#cloze-progress").textContent = clozeBlanks.length + " lacuna(s)";
  if (!clozeBlanks.length) {
    $("#cloze-note").textContent = "Este artigo é curto demais para gerar lacunas úteis. Escolha outro artigo ou outra norma.";
    $("#cloze-card").classList.add("hidden");
    $("#cloze-welcome").classList.remove("hidden");
    return;
  }
  renderClozeText(text, clozeBlanks);
  $("#cloze-welcome").classList.add("hidden");
  $("#cloze-card").classList.remove("hidden");
}
function checkCloze() {
  if (!clozeCurrent || !clozeBlanks.length) return;
  const inputs = [...$("#cloze-text").querySelectorAll(".cloze-input")];
  let correct = 0;
  inputs.forEach(input => {
    const index = Number(input.dataset.index);
    const expected = clozeBlanks[index].value;
    const isCorrect = normalizeAnswer(input.value) === normalizeAnswer(expected);
    if (isCorrect) correct += 1;
    input.disabled = true;
    input.classList.toggle("correct", isCorrect);
    input.classList.toggle("incorrect", !isCorrect);
    const correction = input.nextElementSibling;
    if (!isCorrect) {
      correction.textContent = "→ " + expected;
      correction.classList.remove("hidden");
    }
  });
  clozeAnswered += correct;
  $("#cloze-feedback").textContent = correct + " de " + clozeBlanks.length + " lacunas corretas.";
  $("#cloze-feedback").className = "cloze-feedback " + (correct === clozeBlanks.length ? "all-correct" : "has-errors");
  $("#cloze-feedback").classList.remove("hidden");
  $("#check-cloze").classList.add("hidden");
  $("#next-cloze").classList.remove("hidden");
  $("#cloze-progress").textContent = "Acertos neste artigo: " + clozeAnswered;
}


// -------------------- Modo de jogo Encontre o erro --------------------
function normalizeLegalForMatch(value) {
  return normalizeAnswer(value)
    .replace(/[^\\p{L}\\p{N}%]+/gu, " ")
    .replace(/\\s+/g, " ")
    .trim();
}
async function loadFindErrorBank() {
  const note = $("#error-count-note");
  try {
    const response = await fetch(ERROR_BANK_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    const bankItems = Array.isArray(data.items) ? data.items : [];
    const lawIds = [...new Set(bankItems.map(item => item.law_id))];
    const snapshotPairs = await Promise.all(lawIds.map(async id => {
      try {
        const result = await fetch("data/snapshots/" + encodeURIComponent(id) + ".json?v=" + Date.now(), { cache: "no-store" });
        if (!result.ok) throw new Error("HTTP " + result.status);
        return [id, await result.json()];
      } catch (error) {
        console.warn("Snapshot indisponível para o modo Encontre o erro:", id, error);
        return [id, null];
      }
    }));
    const snapshots = Object.fromEntries(snapshotPairs);
    let suspended = 0;
    let newestCapture = 0;

    findErrorItems = bankItems.filter(item => {
      const snapshot = snapshots[item.law_id];
      const currentText = snapshot && snapshot.articles && snapshot.articles[item.article_key];
      if (!currentText) {
        suspended += 1;
        return false;
      }
      const expected = normalizeLegalForMatch(item.correct_phrase);
      const current = normalizeLegalForMatch(currentText);
      if (!expected || !current.includes(expected)) {
        suspended += 1;
        return false;
      }
      item.literal_text = currentText;
      item.snapshot_captured_at = snapshot.captured_at || null;
      const stamp = snapshot.captured_at ? new Date(snapshot.captured_at).getTime() : 0;
      if (Number.isFinite(stamp)) newestCapture = Math.max(newestCapture, stamp);
      return true;
    });

    const categorySelect = $("#error-category");
    categorySelect.replaceChildren();
    const all = document.createElement("option");
    all.value = "todas";
    all.textContent = "Todas as matérias";
    categorySelect.append(all);
    [...new Set(findErrorItems.map(item => item.category))]
      .sort((a,b) => a.localeCompare(b, "pt-BR"))
      .forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categorySelect.append(option);
      });

    $("#start-error").disabled = findErrorItems.length === 0;
    const captureNote = newestCapture ? " Capturas conferidas até " + formatDate(new Date(newestCapture).toISOString()) + "." : "";
    note.textContent = findErrorItems.length + " item(ns) disponíveis." + captureNote +
      (suspended ? " " + suspended + " item(ns) foram suspensos porque o artigo ou a expressão correta não correspondeu à captura atual." : " Todos os itens passaram na conferência do texto salvo.");
    if (!findErrorItems.length) note.textContent += " Faça uma verificação da legislação e tente novamente.";
  } catch (error) {
    findErrorItems = [];
    $("#start-error").disabled = true;
    note.textContent = "Não foi possível carregar o banco ou conferir os textos legais. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function selectedFindErrorPool() {
  const category = $("#error-category").value;
  return findErrorItems.filter(item => category === "todas" || item.category === category);
}
function startFindErrorGame(onlyItems = null) {
  const pool = onlyItems || selectedFindErrorPool();
  if (!pool.length) {
    $("#error-count-note").textContent = "Não há itens disponíveis para essa seleção.";
    return;
  }
  const requested = $("#error-length").value === "todas" ? pool.length : Number($("#error-length").value);
  const items = onlyItems ? shuffle(pool) : shuffle(pool).slice(0, Math.min(requested, pool.length));
  findErrorState = { questions: items, index: 0, answers: [], tries: 0, resolved: false };
  $("#error-welcome").classList.add("hidden");
  $("#error-summary").classList.add("hidden");
  $("#error-card").classList.remove("hidden");
  showFindErrorQuestion();
}
function showFindErrorQuestion() {
  const item = findErrorState.questions[findErrorState.index];
  if (!item) return;
  findErrorState.tries = 0;
  findErrorState.resolved = false;
  $("#error-category-label").textContent = item.category;
  $("#error-progress").textContent = "Questão " + (findErrorState.index + 1) + " de " + findErrorState.questions.length;
  $("#error-law").textContent = item.law_title;
  $("#error-article").textContent = item.article;
  const statement = $("#error-statement");
  statement.replaceChildren();
  item.segments.forEach((segment, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "error-segment";
    button.textContent = segment;
    button.setAttribute("aria-label", "Trecho " + (index + 1) + ": " + segment.trim());
    button.addEventListener("click", () => chooseFindErrorSegment(index, button));
    statement.append(button);
  });
  $("#error-attempt-feedback").textContent = "Toque na expressão que contraria a lei.";
  $("#error-attempt-feedback").classList.remove("hidden");
  $("#error-solution").classList.add("hidden");
  $("#error-literal").textContent = "";
}
function chooseFindErrorSegment(index, button) {
  if (findErrorState.resolved || button.disabled) return;
  const item = findErrorState.questions[findErrorState.index];
  findErrorState.tries += 1;

  if (index !== item.wrong_segment_index) {
    button.disabled = true;
    button.classList.add("is-tried");
    $("#error-attempt-feedback").textContent = "Esse trecho está de acordo com o dispositivo. Tente outro.";
    return;
  }

  findErrorState.resolved = true;
  findErrorState.answers.push({ item, attempts: findErrorState.tries });
  $("#error-statement").querySelectorAll(".error-segment").forEach((segment, segmentIndex) => {
    segment.disabled = true;
    if (segmentIndex === index) segment.classList.add("is-wrong");
  });
  $("#error-attempt-feedback").classList.add("hidden");
  $("#error-result").textContent = findErrorState.tries === 1 ? "Erro encontrado de primeira! ✓" : "Você encontrou o erro! ✓";
  $("#error-result").className = "feedback-result correct";
  $("#error-correction").textContent = "Trecho incorreto: “" + item.segments[index].trim() + "”. Correção: “" + item.correct_phrase + "”.";
  $("#error-explanation").textContent = item.explanation;
  $("#error-literal").textContent = item.literal_text;
  $("#error-source").href = item.source_url;
  $("#error-solution").classList.remove("hidden");
  $("#next-error-question").textContent = findErrorState.index === findErrorState.questions.length - 1 ? "Ver resultado →" : "Próxima questão →";
}
function nextFindErrorQuestion() {
  if (findErrorState.index >= findErrorState.questions.length - 1) {
    showFindErrorSummary();
    return;
  }
  findErrorState.index += 1;
  showFindErrorQuestion();
}
function showFindErrorSummary() {
  $("#error-card").classList.add("hidden");
  $("#error-summary").classList.remove("hidden");
  const total = findErrorState.questions.length;
  const firstTry = findErrorState.answers.filter(answer => answer.attempts === 1).length;
  const percentage = total ? Math.round((firstTry / total) * 100) : 0;
  $("#error-score").textContent = firstTry + " de " + total + " na primeira tentativa";
  $("#error-score-note").textContent = "Precisão inicial: " + percentage + "%. " +
    (firstTry === total ? "Excelente! Você identificou todos os erros de primeira." : "Revise as expressões em que precisou de mais tentativas.");

  const repeated = findErrorState.answers.filter(answer => answer.attempts > 1);
  const list = $("#error-mistakes");
  list.replaceChildren();
  if (!repeated.length) {
    list.textContent = "Você encontrou todos os erros na primeira tentativa.";
  } else {
    const heading = document.createElement("h3");
    heading.textContent = "Trechos para revisar";
    const rows = document.createElement("div");
    rows.className = "mistake-list";
    repeated.forEach(answer => {
      const row = document.createElement("div");
      row.className = "mistake-row";
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      title.textContent = answer.item.law_title + " · " + answer.item.article;
      detail.textContent = "Tentativas até encontrar o erro: " + answer.attempts;
      row.append(title, detail);
      rows.append(row);
    });
    list.append(heading, rows);
  }
  $("#error-retry-misses").classList.toggle("hidden", repeated.length === 0);
}

// -------------------- Modo de treino Certo/Errado --------------------
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
async function loadQuestionBank() {
  const note = $("#question-count-note");
  try {
    const response = await fetch(QUESTIONS_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    questionBank = Array.isArray(data.questions) ? data.questions : [];
    const categories = [...new Set(questionBank.map(item => item.category))].sort((a,b) => a.localeCompare(b, "pt-BR"));
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      $("#quiz-category").append(option);
    });
    note.textContent = questionBank.length + " itens disponíveis no banco inicial. As questões são embaralhadas a cada treino.";
    $("#start-quiz").disabled = questionBank.length === 0;
  } catch (error) {
    note.textContent = "Não foi possível carregar o banco de questões. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function selectedPool() {
  const category = $("#quiz-category").value;
  return questionBank.filter(item => category === "todas" || item.category === category);
}
function startQuiz(onlyItems = null) {
  const pool = onlyItems || selectedPool();
  if (!pool.length) {
    $("#question-count-note").textContent = "Não há questões disponíveis para essa seleção.";
    return;
  }
  const requested = $("#quiz-length").value === "todas" ? pool.length : Number($("#quiz-length").value);
  const items = shuffle(pool).slice(0, Math.min(requested, pool.length));
  quizState = { questions: items, index: 0, selected: null, answers: [] };
  $("#quiz-welcome").classList.add("hidden");
  $("#quiz-summary").classList.add("hidden");
  $("#quiz-card").classList.remove("hidden");
  showQuestion();
}
function showQuestion() {
  const item = quizState.questions[quizState.index];
  $("#answer-true").disabled = false;
  $("#answer-false").disabled = false;
  quizState.selected = null;
  $("#quiz-category-label").textContent = item.category;
  $("#quiz-progress").textContent = "Questão " + (quizState.index + 1) + " de " + quizState.questions.length;
  $("#quiz-law").textContent = item.law_title;
  $("#quiz-article").textContent = item.article;
  $("#quiz-statement").textContent = item.statement;
  $("#answer-true").classList.remove("selected");
  $("#answer-false").classList.remove("selected");
  $("#answer-true").setAttribute("aria-pressed", "false");
  $("#answer-false").setAttribute("aria-pressed", "false");
  $("#submit-answer").disabled = true;
  $("#answer-feedback").classList.add("hidden");
  $("#next-question").textContent = quizState.index === quizState.questions.length - 1 ? "Ver resultado →" : "Próxima questão →";
}
function chooseAnswer(value) {
  if ($("#answer-feedback").classList.contains("hidden") === false) return;
  quizState.selected = value;
  $("#answer-true").classList.toggle("selected", value === true);
  $("#answer-false").classList.toggle("selected", value === false);
  $("#answer-true").setAttribute("aria-pressed", String(value === true));
  $("#answer-false").setAttribute("aria-pressed", String(value === false));
  $("#submit-answer").disabled = false;
}
function submitAnswer() {
  if (quizState.selected === null) return;
  const item = quizState.questions[quizState.index];
  const correct = quizState.selected === item.answer;
  quizState.answers.push({ item, chosen: quizState.selected, correct });
  $("#feedback-result").textContent = correct ? "Você acertou! ✓" : "Você errou. ✕";
  $("#feedback-result").className = "feedback-result " + (correct ? "correct" : "incorrect");
  $("#feedback-explanation").textContent = item.explanation;
  $("#feedback-literal").textContent = item.literal_text;
  $("#feedback-source").href = item.source_url;
  $("#answer-feedback").classList.remove("hidden");
  $("#submit-answer").disabled = true;
  $("#answer-true").disabled = true;
  $("#answer-false").disabled = true;
}
function showQuizSummary() {
  $("#quiz-card").classList.add("hidden");
  $("#quiz-summary").classList.remove("hidden");
  const total = quizState.questions.length;
  const correct = quizState.answers.filter(answer => answer.correct).length;
  const wrong = total - correct;
  const percentage = Math.round((correct / total) * 100);
  $("#quiz-score").textContent = correct + " de " + total + " acertos";
  $("#quiz-score-note").textContent = "Aproveitamento: " + percentage + "%. " + (wrong === 0 ? "Excelente! Você acertou todos os itens." : "Revise os dispositivos das questões que errou.");
  const mistakes = quizState.answers.filter(answer => !answer.correct);
  const box = $("#quiz-mistakes");
  box.replaceChildren();
  if (!mistakes.length) {
    box.textContent = "Nenhuma questão errada neste treino.";
  } else {
    const heading = document.createElement("h3");
    heading.textContent = "Pontos para revisar";
    const list = document.createElement("div");
    list.className = "mistake-list";
    mistakes.forEach(answer => {
      const row = document.createElement("div");
      row.className = "mistake-row";
      const strong = document.createElement("strong");
      const detail = document.createElement("span");
      strong.textContent = answer.item.law_title + " · " + answer.item.article;
      detail.textContent = "Sua resposta: " + (answer.chosen ? "Certo" : "Errado") + " · Gabarito: " + (answer.item.answer ? "Certo" : "Errado");
      row.append(strong, detail);
      list.append(row);
    });
    box.append(heading, list);
  }
  $("#retry-mistakes").classList.toggle("hidden", mistakes.length === 0);
}
function nextQuestion() {
  if (quizState.index >= quizState.questions.length - 1) {
    showQuizSummary();
    return;
  }
  quizState.index += 1;
  $("#answer-true").disabled = false;
  $("#answer-false").disabled = false;
  showQuestion();
}
function showView(view) {
  const quiz = view === "quiz";
  const cloze = view === "cloze";
  const findError = view === "find-error";
  const radar = view === "radar";
  $("#radar-view").classList.toggle("hidden", !radar);
  $("#quiz-view").classList.toggle("hidden", !quiz);
  $("#cloze-view").classList.toggle("hidden", !cloze);
  $("#find-error-view").classList.toggle("hidden", !findError);
  $("#tab-radar").classList.toggle("active", radar);
  $("#tab-quiz").classList.toggle("active", quiz);
  $("#tab-cloze").classList.toggle("active", cloze);
  $("#tab-find-error").classList.toggle("active", findError);
  [ ["tab-radar", radar], ["tab-quiz", quiz], ["tab-cloze", cloze], ["tab-find-error", findError] ].forEach(([id, active]) => {
    if (active) $("#" + id).setAttribute("aria-current", "page");
    else $("#" + id).removeAttribute("aria-current");
  });
  if (quiz) $("#quiz-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (cloze) $("#cloze-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (findError) $("#find-error-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

$("#notification-button").addEventListener("click", openDrawer);
$("#close-drawer").addEventListener("click", closeDrawer);
$("#notification-drawer").addEventListener("click", event => { if (event.target.id === "notification-drawer") closeDrawer(); });
$("#refresh-button").addEventListener("click", loadDashboard);
$("#search-input").addEventListener("input", renderChanges);
$("#type-filter").addEventListener("change", renderChanges);
$("#study-filter").addEventListener("change", renderChanges);
$("#tab-radar").addEventListener("click", () => showView("radar"));
$("#tab-quiz").addEventListener("click", () => showView("quiz"));
$("#tab-cloze").addEventListener("click", () => showView("cloze"));
$("#tab-find-error").addEventListener("click", () => showView("find-error"));
$("#cloze-law").addEventListener("change", loadClozeSnapshot);
$("#start-cloze").addEventListener("click", startCloze);
$("#check-cloze").addEventListener("click", checkCloze);
$("#next-cloze").addEventListener("click", startCloze);
$("#start-error").addEventListener("click", () => startFindErrorGame());
$("#next-error-question").addEventListener("click", nextFindErrorQuestion);
$("#restart-error").addEventListener("click", () => startFindErrorGame());
$("#error-retry-misses").addEventListener("click", () => {
  const repeated = findErrorState.answers.filter(answer => answer.attempts > 1).map(answer => answer.item);
  startFindErrorGame(repeated);
});
$("#start-quiz").addEventListener("click", () => startQuiz());
$("#answer-true").addEventListener("click", () => chooseAnswer(true));
$("#answer-false").addEventListener("click", () => chooseAnswer(false));
$("#submit-answer").addEventListener("click", submitAnswer);
$("#next-question").addEventListener("click", nextQuestion);
$("#restart-quiz").addEventListener("click", () => {
  $("#quiz-summary").classList.add("hidden");
  $("#quiz-welcome").classList.remove("hidden");
  startQuiz();
});
$("#retry-mistakes").addEventListener("click", () => {
  const mistakes = quizState.answers.filter(answer => !answer.correct).map(answer => answer.item);
  startQuiz(mistakes);
});
document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
loadDashboard();
loadQuestionBank();
loadClozeLaws();
loadFindErrorBank();
