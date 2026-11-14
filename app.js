const DATA_URL = "data/legislacao.json";
const QUESTIONS_URL = "data/questoes.json";
const LAWS_URL = "data/laws.json";
const ERROR_BANK_URL = "data/encontre-erro.json";
const ARTICLE_BANK_URL = "data/descubra-artigo.json";
const MULTI_CE_BANK_URL = "data/afirmacoes-por-artigo.json";
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
let articleQuestions = [];
let articleGameState = { questions: [], index: 0, selected: null, answers: [] };
let multiCEGroups = [];
let multiCEState = { groups: [], articleIndex: 0, statementIndex: 0, selected: null, answers: [] };
let beforeAfterAvailable = [];
let beforeAfterState = { questions: [], index: 0, selected: null, answers: [], answered: false };
const MEMORY_PROGRESS_KEY = "radarLegislativo.memoryProgress.v1";
let memoryCards = [];
let memoryState = { cards: [], index: 0, ratings: [], revealed: false };
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
    prepareBeforeAfterBank();
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
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .replace(/\s+/g, " ")
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


// -------------------- Modo de jogo Descubra o artigo --------------------
async function loadArticleGameBank() {
  const note = $("#article-count-note");
  try {
    const response = await fetch(ARTICLE_BANK_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    const bank = Array.isArray(data.questions) ? data.questions : [];
    const lawIds = [...new Set(bank.map(item => item.law_id))];
    const snapshotPairs = await Promise.all(lawIds.map(async id => {
      try {
        const result = await fetch("data/snapshots/" + encodeURIComponent(id) + ".json?v=" + Date.now(), { cache: "no-store" });
        if (!result.ok) throw new Error("HTTP " + result.status);
        return [id, await result.json()];
      } catch (error) {
        console.warn("Snapshot indisponível para Descubra o artigo:", id, error);
        return [id, null];
      }
    }));
    const snapshots = Object.fromEntries(snapshotPairs);
    let suspended = 0;
    let newestCapture = 0;

    articleQuestions = bank.filter(item => {
      const snapshot = snapshots[item.law_id];
      const articles = snapshot && snapshot.articles;
      const targetText = articles && articles[item.answer_article_key];
      const anchor = normalizeLegalForMatch(item.validation_phrase || "");
      if (!targetText || !anchor || !normalizeLegalForMatch(targetText).includes(anchor)) {
        suspended += 1;
        return false;
      }
      if (!Array.isArray(item.options) || item.options.length !== 4) {
        suspended += 1;
        return false;
      }
      const uniqueOptions = new Set(item.options.map(option => option.article_key));
      if (uniqueOptions.size !== 4 || !item.options.some(option => option.article_key === item.answer_article_key)) {
        suspended += 1;
        return false;
      }
      if (item.options.some(option => !articles[option.article_key])) {
        suspended += 1;
        return false;
      }
      item.literal_text = targetText;
      item.snapshot_captured_at = snapshot.captured_at || null;
      const stamp = snapshot.captured_at ? new Date(snapshot.captured_at).getTime() : 0;
      if (Number.isFinite(stamp)) newestCapture = Math.max(newestCapture, stamp);
      return true;
    });

    const categorySelect = $("#article-category");
    categorySelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "todas";
    allOption.textContent = "Todas as matérias";
    categorySelect.append(allOption);
    [...new Set(articleQuestions.map(item => item.category))]
      .sort((a,b) => a.localeCompare(b, "pt-BR"))
      .forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categorySelect.append(option);
      });

    $("#start-article").disabled = articleQuestions.length === 0;
    const captureNote = newestCapture ? " Capturas conferidas até " + formatDate(new Date(newestCapture).toISOString()) + "." : "";
    note.textContent = articleQuestions.length + " questões disponíveis." + captureNote +
      (suspended ? " " + suspended + " questão(ões) suspensa(s) por incompatibilidade com o texto salvo." : " Todas passaram pela conferência dos artigos e das frases de referência.");
    if (!articleQuestions.length) note.textContent += " Atualize as capturas legais e tente novamente.";
  } catch (error) {
    articleQuestions = [];
    $("#start-article").disabled = true;
    note.textContent = "Não foi possível carregar o banco ou conferir as capturas da legislação. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function selectedArticlePool() {
  const category = $("#article-category").value;
  return articleQuestions.filter(item => category === "todas" || item.category === category);
}
function startArticleGame(onlyItems = null) {
  const pool = onlyItems || selectedArticlePool();
  if (!pool.length) {
    $("#article-count-note").textContent = "Não há questões disponíveis para essa seleção.";
    return;
  }
  const requested = $("#article-length").value === "todas" ? pool.length : Number($("#article-length").value);
  const items = onlyItems ? shuffle(pool) : shuffle(pool).slice(0, Math.min(requested, pool.length));
  articleGameState = { questions: items, index: 0, selected: null, answers: [] };
  $("#article-welcome").classList.add("hidden");
  $("#article-summary").classList.add("hidden");
  $("#article-card").classList.remove("hidden");
  showArticleQuestion();
}
function showArticleQuestion() {
  const item = articleGameState.questions[articleGameState.index];
  if (!item) return;
  articleGameState.selected = null;
  $("#article-category-label").textContent = item.category;
  $("#article-progress").textContent = "Questão " + (articleGameState.index + 1) + " de " + articleGameState.questions.length;
  $("#article-law").textContent = item.law_title;
  $("#article-question").textContent = item.question;
  const optionsBox = $("#article-options");
  optionsBox.replaceChildren();
  const options = shuffle(item.options);
  options.forEach(option => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button article-option";
    button.textContent = option.label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => chooseArticleOption(option.article_key, button));
    optionsBox.append(button);
  });
  $("#submit-article").disabled = true;
  $("#article-feedback").classList.add("hidden");
  $("#next-article").textContent = articleGameState.index === articleGameState.questions.length - 1 ? "Ver resultado →" : "Próxima questão →";
}
function chooseArticleOption(articleKey, button) {
  if (!$("#article-feedback").classList.contains("hidden")) return;
  articleGameState.selected = articleKey;
  $("#article-options").querySelectorAll(".article-option").forEach(option => {
    option.classList.toggle("selected", option === button);
    option.setAttribute("aria-pressed", String(option === button));
  });
  $("#submit-article").disabled = false;
}
function submitArticleAnswer() {
  if (!articleGameState.selected) return;
  const item = articleGameState.questions[articleGameState.index];
  const correct = articleGameState.selected === item.answer_article_key;
  articleGameState.answers.push({ item, chosen: articleGameState.selected, correct });
  const answerOption = item.options.find(option => option.article_key === item.answer_article_key);
  const selectedOption = item.options.find(option => option.article_key === articleGameState.selected);
  $("#article-result").textContent = correct ? "Você acertou! ✓" : "Não foi dessa vez. ✕";
  $("#article-result").className = "feedback-result " + (correct ? "correct" : "incorrect");
  $("#article-answer-line").textContent = "Artigo correto: " + (answerOption ? answerOption.label : item.answer_article_key) +
    (correct ? "." : " · Sua escolha: " + (selectedOption ? selectedOption.label : item.answer_article_key) + ".");
  $("#article-explanation").textContent = item.explanation;
  $("#article-literal").textContent = item.literal_text;
  $("#article-source").href = item.source_url;
  $("#article-feedback").classList.remove("hidden");
  $("#submit-article").disabled = true;
  $("#article-options").querySelectorAll(".article-option").forEach(button => {
    button.disabled = true;
    const choice = item.options.find(option => option.label === button.textContent);
    if (choice && choice.article_key === item.answer_article_key) button.classList.add("selected", "correct");
    else if (choice && choice.article_key === articleGameState.selected && !correct) button.classList.add("incorrect");
  });
}
function nextArticleQuestion() {
  if (articleGameState.index >= articleGameState.questions.length - 1) {
    showArticleSummary();
    return;
  }
  articleGameState.index += 1;
  showArticleQuestion();
}
function showArticleSummary() {
  $("#article-card").classList.add("hidden");
  $("#article-summary").classList.remove("hidden");
  const total = articleGameState.questions.length;
  const correct = articleGameState.answers.filter(answer => answer.correct).length;
  const wrong = total - correct;
  const percentage = total ? Math.round((correct / total) * 100) : 0;
  $("#article-score").textContent = correct + " de " + total + " acertos";
  $("#article-score-note").textContent = "Aproveitamento: " + percentage + "%. " +
    (wrong === 0 ? "Excelente! Você identificou todos os artigos." : "Revise os assuntos das questões que errou.");
  const mistakes = articleGameState.answers.filter(answer => !answer.correct);
  const list = $("#article-mistakes");
  list.replaceChildren();
  if (!mistakes.length) {
    list.textContent = "Nenhum artigo errado neste jogo.";
  } else {
    const heading = document.createElement("h3");
    heading.textContent = "Artigos para revisar";
    const rows = document.createElement("div");
    rows.className = "mistake-list";
    mistakes.forEach(answer => {
      const row = document.createElement("div");
      row.className = "mistake-row";
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      const correctOption = answer.item.options.find(option => option.article_key === answer.item.answer_article_key);
      const chosenOption = answer.item.options.find(option => option.article_key === answer.chosen);
      title.textContent = answer.item.law_title + " · " + answer.item.question;
      detail.textContent = "Sua resposta: " + (chosenOption ? chosenOption.label : answer.chosen) +
        " · Gabarito: " + (correctOption ? correctOption.label : answer.item.answer_article_key);
      row.append(title, detail);
      rows.append(row);
    });
    list.append(heading, rows);
  }
  $("#article-retry-mistakes").classList.toggle("hidden", mistakes.length === 0);
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

// -------------------- Modo Várias afirmações sobre o mesmo artigo --------------------
function multiCECategoryForLaw(lawId) {
  if (lawId === "decreto-6029-2007" || lawId === "decreto-1171-1994") return "Ética";
  if (lawId === "lei-8112-1990" || lawId === "lei-9784-1999" || lawId === "lei-8429-1992") return "Direito Administrativo";
  return "Direito Previdenciário";
}
async function loadMultiCEBank() {
  const note=$("#multi-ce-count-note");
  try {
    const response=await fetch(MULTI_CE_BANK_URL+"?v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    const bank=Array.isArray(data.article_sets)?data.article_sets:[];
    const lawIds=[...new Set(bank.map(group=>group.law_id))];
    const pairs=await Promise.all(lawIds.map(async id=>{
      try{
        const res=await fetch("data/snapshots/"+encodeURIComponent(id)+".json?v="+Date.now(),{cache:"no-store"});
        if(!res.ok)throw new Error("HTTP "+res.status);
        return [id,await res.json()];
      }catch(error){
        console.warn("Snapshot indisponível para Várias afirmações:",id,error);
        return [id,null];
      }
    }));
    const snapshots=Object.fromEntries(pairs);
    let suspended=0;
    let newest=0;
    multiCEGroups=bank.filter(group=>{
      const snapshot=snapshots[group.law_id];
      const article=snapshot?.articles?.[group.article_key];
      if(!article||!Array.isArray(group.statements)||group.statements.length<2){
        suspended++;
        return false;
      }
      const normalizedArticle=normalizeLegalForMatch(article);
      const valid=group.statements.every(item=>
        typeof item.answer==="boolean" &&
        item.explanation &&
        normalizeLegalForMatch(item.validation_phrase||"") &&
        normalizedArticle.includes(normalizeLegalForMatch(item.validation_phrase))
      );
      if(!valid){
        suspended++;
        return false;
      }
      group.literal_text=article;
      group.category=multiCECategoryForLaw(group.law_id);
      group.snapshot_captured_at=snapshot.captured_at||null;
      const stamp=snapshot.captured_at?new Date(snapshot.captured_at).getTime():0;
      if(Number.isFinite(stamp))newest=Math.max(newest,stamp);
      return true;
    });
    const select=$("#multi-ce-category");
    select.replaceChildren();
    const all=document.createElement("option");
    all.value="todas";all.textContent="Todas as matérias";select.append(all);
    [...new Set(multiCEGroups.map(g=>g.category))].sort((a,b)=>a.localeCompare(b,"pt-BR")).forEach(category=>{
      const option=document.createElement("option");
      option.value=category;option.textContent=category;select.append(option);
    });
    $("#start-multi-ce").disabled=multiCEGroups.length===0;
    const capture=newest?" Capturas conferidas até "+formatDate(new Date(newest).toISOString())+".":"";
    note.textContent=multiCEGroups.length+" artigos disponíveis, com "+multiCEGroups.reduce((n,g)=>n+g.statements.length,0)+" afirmações."+capture+
      (suspended?" "+suspended+" conjunto(s) suspenso(s) por incompatibilidade com a captura.":" Todos os conjuntos passaram pela conferência.");
    if(!multiCEGroups.length)note.textContent+=" Atualize as capturas legais e tente novamente.";
  }catch(error){
    multiCEGroups=[];
    $("#start-multi-ce").disabled=true;
    note.textContent="Não foi possível carregar o banco ou conferir os textos legais. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function selectedMultiCEPool(){
  const category=$("#multi-ce-category").value;
  return multiCEGroups.filter(group=>category==="todas"||group.category===category);
}
function startMultiCEGame(onlyGroups=null){
  const pool=onlyGroups||selectedMultiCEPool();
  if(!pool.length){
    $("#multi-ce-count-note").textContent="Não há artigos disponíveis para essa seleção.";
    return;
  }
  const value=$("#multi-ce-length").value;
  const amount=value==="todas"?pool.length:Number(value);
  const selected=onlyGroups?shuffle(pool):shuffle(pool).slice(0,Math.min(amount,pool.length));
  multiCEState={groups:selected,articleIndex:0,statementIndex:0,selected:null,answers:[]};
  $("#multi-ce-welcome").classList.add("hidden");
  $("#multi-ce-summary").classList.add("hidden");
  $("#multi-ce-card").classList.remove("hidden");
  showMultiCEStatement();
}
function showMultiCEStatement(){
  const group=multiCEState.groups[multiCEState.articleIndex];
  const item=group.statements[multiCEState.statementIndex];
  multiCEState.selected=null;
  $("#multi-ce-category-label").textContent=group.category;
  $("#multi-ce-progress").textContent=
    "Artigo "+(multiCEState.articleIndex+1)+" de "+multiCEState.groups.length+
    " · Afirmação "+(multiCEState.statementIndex+1)+" de "+group.statements.length;
  $("#multi-ce-law").textContent=group.law_title;
  $("#multi-ce-article-label").textContent=group.article_label;
  $("#multi-ce-topic").textContent=group.topic;
  $("#multi-ce-article-text").textContent=group.literal_text;
  $("#multi-ce-prompt").textContent=item.prompt;
  $("#multi-ce-true").disabled=false;
  $("#multi-ce-false").disabled=false;
  $("#multi-ce-true").classList.remove("selected");
  $("#multi-ce-false").classList.remove("selected");
  $("#multi-ce-true").setAttribute("aria-pressed","false");
  $("#multi-ce-false").setAttribute("aria-pressed","false");
  $("#multi-ce-submit").disabled=true;
  $("#multi-ce-feedback").classList.add("hidden");
  $("#multi-ce-correction").classList.add("hidden");
  $("#multi-ce-article-text").parentElement.open=false;
  $("#multi-ce-next").textContent=multiCEState.statementIndex<group.statements.length-1
    ?"Próxima afirmação →"
    :multiCEState.articleIndex===multiCEState.groups.length-1?"Ver resultado →":"Próximo artigo →";
}
function chooseMultiCEAnswer(value){
  if(!$("#multi-ce-feedback").classList.contains("hidden"))return;
  multiCEState.selected=value;
  $("#multi-ce-true").classList.toggle("selected",value===true);
  $("#multi-ce-false").classList.toggle("selected",value===false);
  $("#multi-ce-true").setAttribute("aria-pressed",String(value===true));
  $("#multi-ce-false").setAttribute("aria-pressed",String(value===false));
  $("#multi-ce-submit").disabled=false;
}
function submitMultiCEAnswer(){
  if(multiCEState.selected===null)return;
  const group=multiCEState.groups[multiCEState.articleIndex];
  const item=group.statements[multiCEState.statementIndex];
  const correct=multiCEState.selected===item.answer;
  multiCEState.answers.push({group,item,chosen:multiCEState.selected,correct});
  $("#multi-ce-result").textContent=correct?"Você acertou! ✓":"Você errou. ✕";
  $("#multi-ce-result").className="feedback-result "+(correct?"correct":"incorrect");
  $("#multi-ce-explanation").textContent=item.explanation;
  const correction=$("#multi-ce-correction");
  if(!item.answer&&item.correction){
    correction.textContent="Ajuste importante: "+item.correction;
    correction.classList.remove("hidden");
  }else correction.classList.add("hidden");
  $("#multi-ce-source").href=group.source_url;
  $("#multi-ce-feedback").classList.remove("hidden");
  $("#multi-ce-true").disabled=true;
  $("#multi-ce-false").disabled=true;
  $("#multi-ce-submit").disabled=true;
}
function nextMultiCEStatement(){
  const group=multiCEState.groups[multiCEState.articleIndex];
  if(multiCEState.statementIndex<group.statements.length-1){
    multiCEState.statementIndex++;
  }else if(multiCEState.articleIndex<multiCEState.groups.length-1){
    multiCEState.articleIndex++;
    multiCEState.statementIndex=0;
  }else{
    showMultiCESummary();
    return;
  }
  showMultiCEStatement();
}
function showMultiCESummary(){
  $("#multi-ce-card").classList.add("hidden");
  $("#multi-ce-summary").classList.remove("hidden");
  const total=multiCEState.answers.length;
  const correct=multiCEState.answers.filter(a=>a.correct).length;
  const percentage=total?Math.round(correct/total*100):0;
  $("#multi-ce-score").textContent=correct+" de "+total+" afirmações corretas";
  $("#multi-ce-score-note").textContent="Aproveitamento: "+percentage+"%. "+(correct===total?"Excelente! Você acertou tudo.":"Confira as justificativas e retome os artigos em que teve dificuldade.");
  const breakdown=$("#multi-ce-breakdown");
  breakdown.replaceChildren();
  const heading=document.createElement("h3");
  heading.textContent="Desempenho por artigo";
  const rows=document.createElement("div");
  rows.className="multi-ce-result-list";
  multiCEState.groups.forEach(group=>{
    const answers=multiCEState.answers.filter(a=>a.group.id===group.id);
    const right=answers.filter(a=>a.correct).length;
    const row=document.createElement("div");
    row.className="multi-ce-result-row";
    const name=document.createElement("strong");
    const score=document.createElement("span");
    name.textContent=group.law_title+" · "+group.article_label;
    score.textContent=right+" de "+answers.length+" acertos";
    row.append(name,score);
    rows.append(row);
  });
  breakdown.append(heading,rows);
  const mistakes=multiCEState.answers.filter(a=>!a.correct);
  const mistakeBox=$("#multi-ce-mistakes");
  mistakeBox.replaceChildren();
  if(!mistakes.length){
    mistakeBox.textContent="Nenhuma afirmação errada neste treino.";
  }else{
    const title=document.createElement("h3");
    title.textContent="Afirmações para revisar";
    const list=document.createElement("div");
    list.className="mistake-list";
    mistakes.forEach(answer=>{
      const row=document.createElement("div");
      row.className="mistake-row";
      const prompt=document.createElement("strong");
      const detail=document.createElement("span");
      prompt.textContent=answer.group.article_label+" · "+answer.item.prompt;
      detail.textContent="Sua resposta: "+(answer.chosen?"Certo":"Errado")+" · Gabarito: "+(answer.item.answer?"Certo":"Errado");
      row.append(prompt,detail);
      list.append(row);
    });
    mistakeBox.append(title,list);
  }
  const failedIds=new Set(mistakes.map(a=>a.group.id));
  $("#multi-ce-retry-mistakes").classList.toggle("hidden",failedIds.size===0);
}


// -------------------- Antes e depois das alterações --------------------
function beforeAfterCategoryForChange(change) {
  const id = change.law_id || "";
  if (id === "constituicao-1988" || id === "ec-103-2019") return "Direito Constitucional";
  if (id === "decreto-6029-2007" || id === "decreto-1171-1994") return "Ética";
  if (id === "lei-8112-1990" || id === "lei-9784-1999" || id === "lei-8429-1992") return "Direito Administrativo";
  return "Direito Previdenciário";
}

function beforeAfterText(change, version) {
  if (version === "old") {
    return change.old_text || (
      change.change_type === "incluido"
        ? "Este artigo não aparecia na captura anterior."
        : "Não havia texto anterior disponível para comparação."
    );
  }
  return change.new_text || (
    change.change_type === "nao_encontrado"
      ? "Este artigo não foi localizado na captura atual."
      : "Não havia texto deste artigo na captura atual."
  );
}

function prepareBeforeAfterBank() {
  beforeAfterAvailable = allChanges.filter(change =>
    change.change_type !== "texto_integral_alterado" &&
    Boolean(change.article) &&
    Boolean(change.old_text || change.new_text || change.change_type === "incluido" || change.change_type === "nao_encontrado")
  );

  const select = $("#before-after-category");
  if (!select) return;
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "todas";
  all.textContent = "Todas as matérias";
  select.append(all);

  [...new Set(beforeAfterAvailable.map(beforeAfterCategoryForChange))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.append(option);
    });

  $("#start-before-after").disabled = beforeAfterAvailable.length === 0;
  const note = $("#before-after-count-note");
  const checked = dashboardData && Array.isArray(dashboardData.laws)
    ? dashboardData.laws.filter(law => !law.error && law.last_checked).length
    : 0;

  if (beforeAfterAvailable.length) {
    note.textContent = beforeAfterAvailable.length + " alteração(ões) de artigos disponíveis. Cada rodada usa textos registrados pelo monitor, sem criar exemplos fictícios.";
  } else if (allChanges.length) {
    note.textContent = "Há " + allChanges.length + " registro(s) no Radar, mas nenhum é uma comparação artigo por artigo. Consulte as mudanças de texto integral diretamente no Radar.";
  } else if (dashboardData && dashboardData.status === "ok") {
    note.textContent = "Nenhuma alteração artigo por artigo foi registrada até agora. A última verificação consultou " + checked + " fontes sem detectar diferenças. Quando surgir uma alteração, ela aparecerá aqui automaticamente.";
  } else if (dashboardData && dashboardData.status === "parcial") {
    note.textContent = "A última verificação foi parcial. Não há comparações artigo por artigo disponíveis neste momento; confira o estado das fontes no Radar.";
  } else {
    note.textContent = "O histórico ainda não está disponível. Recarregue o painel depois que o monitoramento concluir uma verificação.";
  }
}

function prepareBeforeAfterQuestion(change) {
  const options = shuffle([
    { version: "old", text: beforeAfterText(change, "old") },
    { version: "new", text: beforeAfterText(change, "new") }
  ]);
  return {
    change,
    category: beforeAfterCategoryForChange(change),
    options,
    correctIndex: options.findIndex(option => option.version === "new")
  };
}

function startBeforeAfterGame(items = null) {
  let pool = Array.isArray(items) ? [...items] : [...beforeAfterAvailable];
  if (!Array.isArray(items)) {
    const category = $("#before-after-category").value;
    if (category !== "todas") pool = pool.filter(change => beforeAfterCategoryForChange(change) === category);
  }
  if (!pool.length) return;

  const length = $("#before-after-length").value;
  const amount = length === "todas" ? pool.length : Math.min(Number(length) || 5, pool.length);
  beforeAfterState = {
    questions: shuffle(pool).slice(0, amount).map(prepareBeforeAfterQuestion),
    index: 0,
    selected: null,
    answers: [],
    answered: false
  };
  $("#before-after-welcome").classList.add("hidden");
  $("#before-after-summary").classList.add("hidden");
  $("#before-after-card").classList.remove("hidden");
  renderBeforeAfterQuestion();
}

function renderBeforeAfterQuestion() {
  const question = beforeAfterState.questions[beforeAfterState.index];
  if (!question) return;
  beforeAfterState.selected = null;
  beforeAfterState.answered = false;
  $("#before-after-category-label").textContent = question.category;
  $("#before-after-progress").textContent = "Alteração " + (beforeAfterState.index + 1) + " de " + beforeAfterState.questions.length;
  $("#before-after-law").textContent = question.change.law_short_title || question.change.law_title || "Norma";
  $("#before-after-article").textContent = question.change.article || "Dispositivo";
  $("#before-after-prompt").textContent = "Qual das duas versões corresponde à captura mais recente da fonte oficial?";
  $("#before-after-options").replaceChildren();

  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "before-after-option";
    button.setAttribute("aria-pressed", "false");
    const label = document.createElement("strong");
    label.textContent = "VERSÃO " + (index === 0 ? "A" : "B");
    const text = document.createElement("pre");
    text.textContent = option.text;
    button.append(label, text);
    button.addEventListener("click", () => {
      if (beforeAfterState.answered) return;
      beforeAfterState.selected = index;
      [...$("#before-after-options").children].forEach((child, childIndex) => {
        child.classList.toggle("is-selected", childIndex === index);
        child.setAttribute("aria-pressed", childIndex === index ? "true" : "false");
      });
      $("#before-after-submit").disabled = false;
    });
    $("#before-after-options").append(button);
  });

  $("#before-after-submit").disabled = true;
  $("#before-after-feedback").classList.add("hidden");
  $("#before-after-next").textContent = beforeAfterState.index + 1 < beforeAfterState.questions.length
    ? "Próxima alteração →"
    : "Ver resultado →";
}

function confirmBeforeAfterAnswer() {
  if (beforeAfterState.selected === null || beforeAfterState.answered) return;
  const question = beforeAfterState.questions[beforeAfterState.index];
  const change = question.change;
  const correct = beforeAfterState.selected === question.correctIndex;
  beforeAfterState.answered = true;
  beforeAfterState.answers.push({ item: change, correct });

  [...$("#before-after-options").children].forEach(button => { button.disabled = true; });
  $("#before-after-submit").disabled = true;
  $("#before-after-result").textContent = correct
    ? "✓ Você identificou a versão mais recente."
    : "✕ A versão mais recente era a outra opção.";
  $("#before-after-result").className = "feedback-result " + (correct ? "correct" : "incorrect");
  $("#before-after-explanation").textContent =
    (change.summary || "O monitor registrou uma diferença entre duas capturas.")
    + " A versão atual é a que aparece na captura mais recente; isso não substitui a conferência da publicação e da vigência do ato.";

  const comparison = $("#before-after-comparison");
  comparison.replaceChildren();
  [
    { title: "ANTES · CAPTURA ANTERIOR", text: beforeAfterText(change, "old"), className: "diff-panel old-panel" },
    { title: "AGORA · CAPTURA MAIS RECENTE", text: beforeAfterText(change, "new"), className: "diff-panel new-panel" }
  ].forEach(panelData => {
    const panel = document.createElement("div");
    panel.className = panelData.className;
    const title = document.createElement("span");
    title.textContent = panelData.title;
    const text = document.createElement("pre");
    text.textContent = panelData.text;
    panel.append(title, text);
    comparison.append(panel);
  });
  $("#before-after-source").href = change.source_url || "https://www.gov.br/";
  $("#before-after-feedback").classList.remove("hidden");
}

function nextBeforeAfterQuestion() {
  if (beforeAfterState.index + 1 < beforeAfterState.questions.length) {
    beforeAfterState.index += 1;
    renderBeforeAfterQuestion();
    return;
  }
  showBeforeAfterSummary();
}

function showBeforeAfterSummary() {
  $("#before-after-card").classList.add("hidden");
  $("#before-after-summary").classList.remove("hidden");
  const total = beforeAfterState.answers.length;
  const correct = beforeAfterState.answers.filter(answer => answer.correct).length;
  const percent = total ? Math.round(correct / total * 100) : 0;
  const mistakes = beforeAfterState.answers.filter(answer => !answer.correct);
  $("#before-after-score").textContent = correct + " de " + total + " acerto(s) · " + percent + "%";
  $("#before-after-score-note").textContent = total + " alteração(ões) revisada(s). Confira novamente as que você errou.";
  const box = $("#before-after-mistakes");
  box.replaceChildren();
  if (mistakes.length) {
    const title = document.createElement("h3");
    title.textContent = "Alterações para revisar";
    const list = document.createElement("ul");
    mistakes.forEach(answer => {
      const item = document.createElement("li");
      item.textContent = (answer.item.law_short_title || answer.item.law_title || "Norma") + " · " + (answer.item.article || "Dispositivo");
      list.append(item);
    });
    box.append(title, list);
  } else {
    const note = document.createElement("p");
    note.textContent = "Muito bem! Você identificou todas as versões atuais deste treino.";
    box.append(note);
  }
  $("#before-after-retry-mistakes").classList.toggle("hidden", mistakes.length === 0);
}


// -------------------- Memorização ativa com revisão espaçada --------------------
function loadMemoryProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_PROGRESS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function saveMemoryProgress(progress) {
  try {
    localStorage.setItem(MEMORY_PROGRESS_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn("Não foi possível salvar o progresso de memorização:", error);
    $("#memory-note").textContent = "O navegador não permitiu salvar o progresso. Confira as permissões de armazenamento do site.";
  }
}

function buildMemoryDeck() {
  const cards = new Map();

  function getCard(lawId, articleKey, details) {
    const id = lawId + "::" + articleKey;
    if (!cards.has(id)) {
      cards.set(id, {
        id,
        law_id: lawId,
        article_key: articleKey,
        law_title: details.law_title || "Norma",
        article_label: details.article_label || articleKey,
        category: details.category || "Direito Previdenciário",
        source_url: details.source_url || "https://www.gov.br/",
        literal_text: details.literal_text || "",
        prompts: [],
        captured_at: details.captured_at || null
      });
    }
    const card = cards.get(id);
    if (!card.literal_text && details.literal_text) card.literal_text = details.literal_text;
    if (details.source_url) card.source_url = details.source_url;
    if (details.law_title) card.law_title = details.law_title;
    if (details.article_label) card.article_label = details.article_label;
    if (details.category) card.category = details.category;
    return card;
  }

  // Usa as perguntas autorais já validadas pelo modo Descubra o artigo.
  articleQuestions.forEach(item => {
    const correctOption = item.options?.find(option => option.article_key === item.answer_article_key);
    const card = getCard(item.law_id, item.answer_article_key, {
      law_title: item.law_title,
      article_label: correctOption?.label || item.answer_article_key,
      category: item.category,
      source_url: item.source_url,
      literal_text: item.literal_text,
      captured_at: item.snapshot_captured_at
    });
    if (item.question && !card.prompts.some(prompt => prompt.text === item.question)) {
      card.prompts.push({ text: item.question, type: "pergunta" });
    }
  });

  // Completa o conjunto com temas e afirmações dos artigos já validados.
  multiCEGroups.forEach(group => {
    const card = getCard(group.law_id, group.article_key, {
      law_title: group.law_title,
      article_label: group.article_label,
      category: group.category,
      source_url: group.source_url,
      literal_text: group.literal_text,
      captured_at: group.snapshot_captured_at
    });
    const topicPrompt = "Explique, sem consultar, o que a legislação estabelece sobre: " + group.topic + ".";
    if (!card.prompts.some(prompt => prompt.text === topicPrompt)) {
      card.prompts.push({ text: topicPrompt, type: "tema" });
    }
    (group.statements || []).forEach(statement => {
      const text = "Lembre e explique a regra relacionada a esta afirmação: " + statement.prompt;
      if (!card.prompts.some(prompt => prompt.text === text)) {
        card.prompts.push({ text, type: "afirmação" });
      }
    });
  });

  memoryCards = [...cards.values()].filter(card =>
    card.literal_text && card.prompts.length && card.article_key
  );

  const select = $("#memory-category");
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "todas";
  all.textContent = "Todas as matérias";
  select.append(all);
  [...new Set(memoryCards.map(card => card.category))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.append(option);
    });

  $("#start-memory").disabled = memoryCards.length === 0;
  renderMemoryOverview();

  $("#memory-note").textContent = memoryCards.length
    + " cartões de artigos disponíveis, montados a partir dos bancos de estudo e conferidos com as capturas salvas. As perguntas podem variar a cada revisão."; 
  if (!memoryCards.length) {
    $("#memory-note").textContent = "Nenhum cartão pôde ser montado. Confira se os modos Descubra o artigo e Várias afirmações conseguiram carregar os artigos.";
  }
}

function memoryDueAt(card, progress) {
  const entry = progress[card.id];
  if (!entry || !entry.next_due) return 0;
  const value = new Date(entry.next_due).getTime();
  return Number.isFinite(value) ? value : 0;
}

function renderMemoryOverview() {
  const progress = loadMemoryProgress();
  const now = Date.now();
  const due = memoryCards.filter(card => memoryDueAt(card, progress) <= now).length;
  const seen = memoryCards.filter(card => Number(progress[card.id]?.review_count) > 0).length;
  $("#memory-total").textContent = String(memoryCards.length);
  $("#memory-due").textContent = String(due);
  $("#memory-seen").textContent = String(seen);
}

function selectedMemoryPool() {
  const category = $("#memory-category").value;
  return memoryCards.filter(card => category === "todas" || card.category === category);
}

function startMemorySession(onlyCards = null) {
  let pool = onlyCards ? [...onlyCards] : selectedMemoryPool();
  if (!pool.length) {
    $("#memory-note").textContent = "Não há cartões disponíveis para essa seleção.";
    return;
  }

  const progress = loadMemoryProgress();
  const now = Date.now();
  pool.sort((a, b) => {
    const aEntry = progress[a.id];
    const bEntry = progress[b.id];
    const aPriority = aEntry ? (memoryDueAt(a, progress) <= now ? 0 : 2) : 1;
    const bPriority = bEntry ? (memoryDueAt(b, progress) <= now ? 0 : 2) : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const dueDifference = memoryDueAt(a, progress) - memoryDueAt(b, progress);
    if (dueDifference !== 0) return dueDifference;
    return a.law_title.localeCompare(b.law_title, "pt-BR");
  });

  const length = $("#memory-length").value;
  const amount = length === "todas" ? pool.length : Math.min(Number(length) || 5, pool.length);
  const selected = onlyCards ? pool : pool.slice(0, amount);
  memoryState = {
    cards: selected.map(card => ({
      ...card,
      currentPrompt: card.prompts[Math.floor(Math.random() * card.prompts.length)]
    })),
    index: 0,
    ratings: [],
    revealed: false
  };

  $("#memory-welcome").classList.add("hidden");
  $("#memory-summary").classList.add("hidden");
  $("#memory-card").classList.remove("hidden");
  renderMemoryCard();
}

function renderMemoryCard() {
  const card = memoryState.cards[memoryState.index];
  if (!card) return;
  memoryState.revealed = false;
  $("#memory-category-label").textContent = card.category;
  $("#memory-progress").textContent = "Cartão " + (memoryState.index + 1) + " de " + memoryState.cards.length;
  $("#memory-law").textContent = card.law_title;
  $("#memory-article").textContent = card.article_label;
  $("#memory-prompt").textContent = card.currentPrompt?.text || "Explique o conteúdo deste artigo com suas palavras.";
  $("#memory-recall").value = "";
  $("#memory-recall").readOnly = false;
  $("#memory-recall").classList.remove("is-locked");
  $("#memory-reveal").classList.remove("hidden");
  $("#memory-answer").classList.add("hidden");
  $("#memory-literal").textContent = card.literal_text;
  $("#memory-source").href = card.source_url;
  $("#memory-next-due").textContent = "";
}

function revealMemoryAnswer() {
  if (memoryState.revealed) return;
  const card = memoryState.cards[memoryState.index];
  if (!card) return;
  memoryState.revealed = true;
  $("#memory-recall").readOnly = true;
  $("#memory-recall").classList.add("is-locked");
  $("#memory-reveal").classList.add("hidden");
  $("#memory-answer").classList.remove("hidden");
  $("#memory-answer").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function rateMemoryCard(rating) {
  if (!memoryState.revealed) return;
  const card = memoryState.cards[memoryState.index];
  if (!card) return;
  const progress = loadMemoryProgress();
  const previous = progress[card.id] || {};
  const previousInterval = Number(previous.interval_days) || 0;
  const previousRepetitions = Number(previous.repetitions) || 0;
  const now = Date.now();
  let intervalDays = 0;
  let dueTime = now;

  if (rating === "again") {
    dueTime = now + 10 * 60 * 1000;
    intervalDays = 0;
  } else if (rating === "hard") {
    intervalDays = previousInterval < 1 ? 1 : Math.min(30, Math.max(2, Math.round(previousInterval * 1.2)));
    dueTime = now + intervalDays * 24 * 60 * 60 * 1000;
  } else {
    intervalDays = previousInterval < 1 ? 3 : Math.min(30, previousInterval * 2);
    dueTime = now + intervalDays * 24 * 60 * 60 * 1000;
  }

  progress[card.id] = {
    review_count: (Number(previous.review_count) || 0) + 1,
    repetitions: rating === "good" ? previousRepetitions + 1 : 0,
    interval_days: intervalDays,
    next_due: new Date(dueTime).toISOString(),
    last_reviewed: new Date(now).toISOString(),
    last_rating: rating
  };
  saveMemoryProgress(progress);
  memoryState.ratings.push({ card, rating, next_due: progress[card.id].next_due });
  renderMemoryOverview();

  if (memoryState.index + 1 < memoryState.cards.length) {
    memoryState.index += 1;
    renderMemoryCard();
  } else {
    showMemorySummary();
  }
}

function showMemorySummary() {
  $("#memory-card").classList.add("hidden");
  $("#memory-summary").classList.remove("hidden");
  const total = memoryState.ratings.length;
  const again = memoryState.ratings.filter(item => item.rating === "again");
  const partial = memoryState.ratings.filter(item => item.rating === "hard");
  const good = memoryState.ratings.filter(item => item.rating === "good");
  $("#memory-score").textContent = total + " cartão(ões) revisado(s)";
  $("#memory-score-note").textContent = "Você marcou " + good.length + " como lembrou bem, " + partial.length + " como lembrou em parte e " + again.length + " como esquecido.";
  const detail = $("#memory-summary-detail");
  detail.replaceChildren();
  [
    { title: "Esqueci", count: again.length, note: "Volta para revisão em 10 minutos." },
    { title: "Lembrei em parte", count: partial.length, note: "Volta para revisão em 1 dia." },
    { title: "Lembrei bem", count: good.length, note: "O intervalo aumenta gradualmente, até 30 dias." }
  ].forEach(item => {
    const row = document.createElement("div");
    row.className = "memory-summary-row";
    const strong = document.createElement("strong");
    strong.textContent = item.title + ": " + item.count;
    const span = document.createElement("span");
    span.textContent = item.note;
    row.append(strong, span);
    detail.append(row);
  });
  $("#memory-retry-again").classList.toggle("hidden", again.length === 0);
  renderMemoryOverview();
}

function showView(view) {
  const quiz = view === "quiz";
  const cloze = view === "cloze";
  const findError = view === "find-error";
  const article = view === "article";
  const multiCE = view === "multi-ce";
  const beforeAfter = view === "before-after";
  const memory = view === "memory";
  const radar = view === "radar";
  $("#radar-view").classList.toggle("hidden", !radar);
  $("#quiz-view").classList.toggle("hidden", !quiz);
  $("#cloze-view").classList.toggle("hidden", !cloze);
  $("#find-error-view").classList.toggle("hidden", !findError);
  $("#article-view").classList.toggle("hidden", !article);
  $("#multi-ce-view").classList.toggle("hidden", !multiCE);
  $("#before-after-view").classList.toggle("hidden", !beforeAfter);
  $("#memory-view").classList.toggle("hidden", !memory);
  $("#tab-radar").classList.toggle("active", radar);
  $("#tab-quiz").classList.toggle("active", quiz);
  $("#tab-cloze").classList.toggle("active", cloze);
  $("#tab-find-error").classList.toggle("active", findError);
  $("#tab-article").classList.toggle("active", article);
  $("#tab-multi-ce").classList.toggle("active", multiCE);
  $("#tab-before-after").classList.toggle("active", beforeAfter);
  $("#tab-memory").classList.toggle("active", memory);
  [ ["tab-radar", radar], ["tab-quiz", quiz], ["tab-cloze", cloze], ["tab-find-error", findError], ["tab-article", article], ["tab-multi-ce", multiCE], ["tab-before-after", beforeAfter], ["tab-memory", memory] ].forEach(([id, active]) => {
    if (active) $("#" + id).setAttribute("aria-current", "page");
    else $("#" + id).removeAttribute("aria-current");
  });
  if (quiz) $("#quiz-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (cloze) $("#cloze-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (findError) $("#find-error-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (article) $("#article-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (multiCE) $("#multi-ce-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (beforeAfter) $("#before-after-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (memory) $("#memory-view").scrollIntoView({ behavior: "smooth", block: "start" });
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
$("#tab-article").addEventListener("click", () => showView("article"));
$("#tab-multi-ce").addEventListener("click", () => showView("multi-ce"));
$("#tab-before-after").addEventListener("click", () => showView("before-after"));
$("#tab-memory").addEventListener("click", () => { renderMemoryOverview(); showView("memory"); });
$("#start-memory").addEventListener("click", () => startMemorySession());
$("#memory-reveal").addEventListener("click", revealMemoryAnswer);
$("#memory-again").addEventListener("click", () => rateMemoryCard("again"));
$("#memory-hard").addEventListener("click", () => rateMemoryCard("hard"));
$("#memory-good").addEventListener("click", () => rateMemoryCard("good"));
$("#memory-restart").addEventListener("click", () => startMemorySession());
$("#memory-retry-again").addEventListener("click", () => {
  const missedIds = new Set(memoryState.ratings.filter(item => item.rating === "again").map(item => item.card.id));
  startMemorySession(memoryCards.filter(card => missedIds.has(card.id)));
});
$("#start-before-after").addEventListener("click", () => startBeforeAfterGame());
$("#before-after-submit").addEventListener("click", confirmBeforeAfterAnswer);
$("#before-after-next").addEventListener("click", nextBeforeAfterQuestion);
$("#before-after-restart").addEventListener("click", () => startBeforeAfterGame());
$("#before-after-retry-mistakes").addEventListener("click", () => {
  const mistakes = beforeAfterState.answers.filter(answer => !answer.correct).map(answer => answer.item);
  startBeforeAfterGame(mistakes);
});
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
$("#start-article").addEventListener("click", () => startArticleGame());
$("#submit-article").addEventListener("click", submitArticleAnswer);
$("#next-article").addEventListener("click", nextArticleQuestion);
$("#restart-article").addEventListener("click", () => startArticleGame());
$("#article-retry-mistakes").addEventListener("click", () => {
  const misses = articleGameState.answers.filter(answer => !answer.correct).map(answer => answer.item);
  startArticleGame(misses);
});
$("#start-multi-ce").addEventListener("click", () => startMultiCEGame());
$("#multi-ce-true").addEventListener("click", () => chooseMultiCEAnswer(true));
$("#multi-ce-false").addEventListener("click", () => chooseMultiCEAnswer(false));
$("#multi-ce-submit").addEventListener("click", submitMultiCEAnswer);
$("#multi-ce-next").addEventListener("click", nextMultiCEStatement);
$("#multi-ce-restart").addEventListener("click", () => startMultiCEGame());
$("#multi-ce-retry-mistakes").addEventListener("click", () => {
  const failed = new Set(multiCEState.answers.filter(answer => !answer.correct).map(answer => answer.group.id));
  startMultiCEGame(multiCEGroups.filter(group => failed.has(group.id)));
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
Promise.all([loadArticleGameBank(), loadMultiCEBank()]).then(buildMemoryDeck);
