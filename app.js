const DATA_URL = "data/legislacao.json";
const QUESTIONS_URL = "data/questoes.json";
const LAST_SEEN_KEY = "radarLegislativo.lastSeen";
const STUDY_KEY = "radarLegislativo.studyStates";
let dashboardData = null;
let allChanges = [];
let questionBank = [];
let quizState = { questions: [], index: 0, selected: null, answers: [] };
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
  $("#stat-check").textContent = formatDate(data.last_successful_check);
  $("#stat-check-note").textContent = data.last_successful_check ? "última execução sem erros" : (data.summary || "A primeira execução ainda não ocorreu");
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
    status.textContent = law.error ? "falha na consulta" : law.parser_mode === "index" ? "histórico de alterações" : law.last_checked ? "texto consultado" : "aguardando";
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
  $("#radar-view").classList.toggle("hidden", quiz);
  $("#quiz-view").classList.toggle("hidden", !quiz);
  $("#tab-radar").classList.toggle("active", !quiz);
  $("#tab-quiz").classList.toggle("active", quiz);
  if (quiz) {
    $("#tab-radar").removeAttribute("aria-current");
    $("#tab-quiz").setAttribute("aria-current", "page");
  } else {
    $("#tab-quiz").removeAttribute("aria-current");
    $("#tab-radar").setAttribute("aria-current", "page");
  }
  if (quiz) $("#quiz-view").scrollIntoView({ behavior: "smooth", block: "start" });
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
