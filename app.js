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
let clozeReviewSessionSeen = new Set();
let selectedClozeText = "";
let quizState = { questions: [], index: 0, selected: null, answers: [], reviewMode: false };
let findErrorItems = [];
let findErrorState = { questions: [], index: 0, answers: [], tries: 0, resolved: false, reviewMode: false, reviewFailed: false };
let findErrorCaptureNote = "";
let findErrorSuspendedCount = 0;
let articleQuestions = [];
let articleCaptureNote = "";
let articleSuspendedCount = 0;
let articleGameState = { questions: [], index: 0, selected: null, answers: [], reviewMode: false, reviewFailed: false };
let multiCEGroups = [];
let multiCEState = { groups: [], articleIndex: 0, statementIndex: 0, selected: null, answers: [] };
let beforeAfterAvailable = [];
let beforeAfterState = { questions: [], index: 0, selected: null, answers: [], answered: false, changeQuestion: null, changeSelected: null, changeAnswered: false, reviewMode: false };
const MEMORY_PROGRESS_KEY = "radarLegislativo.memoryProgress.v1";
const MEMORY_CUSTOM_CARDS_KEY = "radarLegislativo.memoryCustomCards.v1";
const MEMORY_FAVORITE_CARD_IDS_KEY = "radarLegislativo.memoryFavoriteCardIds.v1";
const CE_REVIEW_KEY = "radarLegislativo.ceReview.v1";
const CLOZE_REVIEW_KEY = "radarLegislativo.clozeReview.v1";
const ERROR_REVIEW_KEY = "radarLegislativo.errorReview.v1";
const ARTICLE_REVIEW_KEY = "radarLegislativo.articleReview.v1";
const BEFORE_AFTER_REVIEW_KEY = "radarLegislativo.beforeAfterReview.v1";
const LEGAL_STUDIED_AT_KEY = "radarLegislativo.leiSeca.studiedAt.v1";
const LEGAL_STUDIED_KEY = "radarLegislativo.leiSeca.studied.v1";
const LEGAL_FAVORITES_KEY = "radarLegislativo.leiSeca.favorites.v1";
let legalLaws = [];
let legalSelectedLaw = null;
let legalSnapshot = null;
let legalEntries = [];
let legalSelectedArticle = "";
let selectedLegalExcerpt = null;
let legalSelectionTimer = null;
let selectedLegalDevicePaths = new Set();
let legalTrainingState = { items: [], index: 0, title: "", selected: null };
let memoryCards = [];
let memoryState = { cards: [], index: 0, ratings: [], revealed: false };
let memorySourceSnapshots = new Map();
let memorySourceSnapshotsLoaded = false;
let memorySnapshotPromise = null;
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
function typeLabel(type, change = {}) {
  if (type === "texto_integral_alterado") return "TEXTO INTEGRAL DIFERENTE";
  const device = (change.device_label || "artigo").toLocaleUpperCase("pt-BR");
  return ({
    alterado: device + " ALTERADO",
    incluido: device + " INCLUÍDO",
    nao_encontrado: device + " NÃO LOCALIZADO",
    possivelmente_revogado: device + " COM REVOGAÇÃO INDICADA"
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
  type.textContent = typeLabel(change.change_type, change);
  type.classList.add(change.change_type || "");
  node.querySelector(".detected-date").textContent = "Detectado em " + formatDate(change.detected_at);
  node.querySelector(".law-name").textContent = change.law_short_title || change.law_title || "Norma sem identificação";
  const articleLabel = change.article || "Texto integral";
  node.querySelector(".article-label").textContent = change.device_type && change.device_type !== "artigo" && change.device_type !== "texto_integral"
    ? articleLabel + " · " + (change.device_label || change.device_type)
    : articleLabel;
  node.querySelector(".change-summary").textContent = change.summary || "Diferença detectada entre duas verificações.";
  node.querySelector(".old-text").textContent = change.old_text || "Não havia texto anterior para comparação.";
  node.querySelector(".new-text").textContent = change.new_text || "O artigo não foi localizado na captura atual.";
  node.querySelector(".source-link").href = change.source_url || "https://www.gov.br/";
  const select = node.querySelector(".study-select");
  select.value = stateFor(change.id);
  select.addEventListener("change", () => setStudyState(change.id, select.value));
  const formatLegalDate = value => value ? value.split("-").reverse().join("/") : "não identificada";
  const publication = "Publicação: " + formatLegalDate(change.publication_date);
  const effective = "Entrada em vigor: " + formatLegalDate(change.effective_date);
  const effectNotes = {
    data_de_vigencia_expressa_transcorrida: "A data de vigência expressamente indicada já passou; confirme se a redação continua aplicável.",
    vigencia_futura_expressa: "A fonte indica uma data de vigência futura.",
    revogacao_indicada_sem_data_de_efeito: "A fonte indica revogação, mas a data dos efeitos não foi identificada.",
    situacao_juridica_nao_confirmada: "A ausência na captura não comprova revogação.",
    vigencia_nao_confirmada: "A diferença textual não confirma, sozinha, que a nova redação já esteja vigente."
  };
  const effectNote = effectNotes[change.legal_effect_status] || "Situação jurídica exige conferência do ato oficial.";
  node.querySelector(".date-note").textContent = [publication, effective, effectNote, change.date_note].filter(Boolean).join(" · ");
  return node;
}
function filteredChanges() {
  const query = $("#search-input").value.trim().toLocaleLowerCase("pt-BR");
  const type = $("#type-filter").value;
  const study = $("#study-filter").value;
  return allChanges.filter(item => {
    const haystack = [item.law_title, item.law_short_title, item.article, item.device_label, item.device_path].join(" ").toLocaleLowerCase("pt-BR");
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
  const trackedLaws = dashboardData && Array.isArray(dashboardData.laws) ? dashboardData.laws : [];
  const trackedCount = $("#tracked-laws-count");
  if (trackedCount) trackedCount.textContent = trackedLaws.length + (trackedLaws.length === 1 ? " norma" : " normas");
  trackedLaws.forEach(law => {
    const link = document.createElement("a");
    link.className = "law-item";
    link.href = law.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const title = document.createElement("span");
    title.textContent = law.short_title || law.title;
    const status = document.createElement("small");
    const attempts = Array.isArray(law.source_attempts) ? law.source_attempts : [];
    const lastAttempt = attempts.length ? attempts[attempts.length - 1] : null;
    const attemptCount = attempts.length;
    const httpLabel = lastAttempt && lastAttempt.http_status ? " · HTTP " + lastAttempt.http_status : "";
    if (law.error) {
      const messages = {
        rate_limited: "limite (429)",
        blocked: "bloqueado",
        unavailable: "indisponível",
        invalid_response: "resposta inválida"
      };
      status.textContent = (messages[law.source_status] || "falha na consulta") + httpLabel
        + (attemptCount ? " · " + attemptCount + " tentativa(s)" : "");
      status.title = law.error + (law.retry_after_seconds ? " Tente novamente após " + law.retry_after_seconds + " segundo(s)." : "");
      status.classList.add("source-error");
    } else if (law.source_status === "fallback_used") {
      status.textContent = "fonte alternativa usada · " + law.article_count + " artigos";
      status.classList.add("source-recovered");
      status.title = attemptCount + " tentativa(s) registradas; a fonte principal falhou e uma alternativa respondeu.";
    } else if (law.source_status === "recovered") {
      status.textContent = "consulta após nova tentativa · " + law.article_count + " artigos";
      status.classList.add("source-recovered");
      status.title = attemptCount + " tentativa(s) registradas.";
    } else {
      status.textContent = law.source_revision ? law.source_revision : law.parser_mode === "index" ? "histórico oficial consultado" : law.last_checked ? (law.article_count + " artigos consultados") : "aguardando";
      status.title = attemptCount ? attemptCount + " tentativa(s) registradas." : "";
    }
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
    detail.textContent = typeLabel(item.change_type, item) + " · " + formatDate(item.detected_at);
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
    if (legalLaws.length) renderLegalLibrary();
    if (legalSelectedLaw && legalSnapshot && legalSelectedArticle) renderLegalArticle();
    if (memorySourceSnapshotsLoaded) buildMemoryDeck();
  } catch (error) {
    $("#system-status").className = "status-pill error";
    $("#system-status span:last-child").textContent = "Dados indisponíveis";
    $("#change-list").textContent = "Não foi possível carregar os dados do monitoramento. Confira a publicação pelo GitHub Pages.";
    console.error(error);
  }
}


// -------------------- Biblioteca Lei Seca --------------------
function readLegalStorage(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.filter(item => typeof item === "string") : []);
  } catch (_) {
    return new Set();
  }
}
function writeLegalStorage(key, values) {
  localStorage.setItem(key, JSON.stringify([...values]));
}
function legalStudiedSet() { return readLegalStorage(LEGAL_STUDIED_KEY); }
function legalFavoritesSet() { return readLegalStorage(LEGAL_FAVORITES_KEY); }
function loadLegalStudiedDates() {
  try {
    const value=JSON.parse(localStorage.getItem(LEGAL_STUDIED_AT_KEY)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  } catch (_) { return {}; }
}
function saveLegalStudiedDates(value) {
  try { localStorage.setItem(LEGAL_STUDIED_AT_KEY,JSON.stringify(value)); }
  catch(error){console.warn("Não foi possível salvar a data do estudo:",error);}
}
function legalArticleKey(lawId, article) {
  return lawId + "::" + article;
}
function legalComponentKey(lawId, article, path) {
  return lawId + "::" + article + "::" + path;
}
function legalArticleNumber(value) {
  const match = String(value).match(/(\d+)(?:-([A-Z]))?/);
  return match ? [Number(match[1]), (match[2] || "").toUpperCase()] : [Number.MAX_SAFE_INTEGER, ""];
}
function parseLegalArticleQuery(value) {
  const match = String(value).trim().match(/^(?:(?:artigo|art)\.?\s*)?(\d+)\s*(?:º|°)?\s*(?:[-–—]\s*([a-z]))?$/i);
  return match ? { number: Number(match[1]), suffix: (match[2] || "").toUpperCase() } : null;
}
function legalArticleMatchesQuery(article, query) {
  if (!query) return false;
  const [number, suffix] = legalArticleNumber(article);
  return number === query.number && suffix === query.suffix;
}
function compareLegalArticles(a, b) {
  const left = legalArticleNumber(a);
  const right = legalArticleNumber(b);
  return left[0] - right[0] || left[1].localeCompare(right[1], "pt-BR");
}
function legalLawStatus(lawId) {
  return dashboardData && Array.isArray(dashboardData.laws)
    ? dashboardData.laws.find(item => item.id === lawId) || null
    : null;
}
function legalLawRecentChanges(lawId, days = 30) {
  const changes = dashboardData && Array.isArray(dashboardData.changes)
    ? dashboardData.changes
    : [];
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return changes
    .filter(change => {
      if (change.law_id !== lawId || !change.detected_at) return false;
      const detected = new Date(change.detected_at).getTime();
      return Number.isFinite(detected) && detected >= cutoff && detected <= now;
    })
    .sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
}
function legalLawSourceUrl(law, status = legalLawStatus(law.id)) {
  return status && status.source_url_used ? status.source_url_used : law.url || "";
}
function legalLawLastCheckedText(status) {
  if (status && status.last_checked) {
    return "Última consulta bem-sucedida: " + formatDate(status.last_checked);
  }
  if (status && status.error) return "Última consulta: falhou; captura anterior preservada";
  return "Última consulta: sem registro";
}
function legalLawMatter(law) {
  return law.matter || "Outras matérias";
}
function legalLawSubject(law) {
  return law.subject || "Assunto não classificado";
}
function legalLawSearchText(law) {
  return normalizeAnswer([
    law.short_title, law.title, law.category, law.edital_item,
    legalLawMatter(law), legalLawSubject(law)
  ].join(" "));
}
async function loadLegalLibrary() {
  const list = $("#law-library-list");
  if (!list) return;
  try {
    const response = await fetch(LAWS_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const catalog = await response.json();
    // A biblioteca mostra o cadastro completo, inclusive normas com monitoramento pausado.
    legalLaws = Array.isArray(catalog) ? catalog : [];
    const matters = [...new Set(legalLaws.map(legalLawMatter))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const matterSelect = $("#law-library-category");
    matterSelect.replaceChildren();
    const all = document.createElement("option");
    all.value = "todas";
    all.textContent = "Todas as matérias";
    matterSelect.append(all);
    matters.forEach(matter => {
      const option = document.createElement("option");
      option.value = matter;
      option.textContent = matter;
      matterSelect.append(option);
    });
    $("#law-library-search").value = "";
    matterSelect.value = "todas";
    renderLegalLibrary();
    $("#law-library-summary-count").textContent = legalLaws.length + " normas cadastradas";
    $("#law-library-summary-note").textContent = "Todas organizadas por matéria e assunto; textos conforme as capturas disponíveis.";
    if (!legalLaws.length) throw new Error("O catálogo não contém normas cadastradas.");
    const preferred = legalLaws.find(law => law.id === "lei-8213-1991") || legalLaws[0];
    await loadLegalLaw(preferred.id);
  } catch (error) {
    list.replaceChildren();
    const note = document.createElement("p");
    note.className = "law-library-loading";
    note.textContent = "Não foi possível carregar a biblioteca. Confira sua conexão e tente novamente.";
    list.append(note);
    $("#law-library-summary-count").textContent = "Biblioteca indisponível";
    console.error("Falha ao carregar a biblioteca Lei Seca:", error);
  }
}
function renderLegalLibrary() {
  const list = $("#law-library-list");
  if (!list) return;
  const query = normalizeAnswer($("#law-library-search").value || "");
  const matter = $("#law-library-category").value || "todas";
  const matches = legalLaws.filter(law =>
    (matter === "todas" || legalLawMatter(law) === matter) &&
    (!query || legalLawSearchText(law).includes(query))
  );
  list.replaceChildren();
  $("#law-library-count").textContent = matches.length + " de " + legalLaws.length + " normas cadastradas";
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "law-library-loading";
    empty.textContent = "Nenhuma norma encontrada para essa busca.";
    list.append(empty);
    return;
  }

  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  const matters = new Map();
  matches.forEach(law => {
    const matterName = legalLawMatter(law);
    const subjectName = legalLawSubject(law);
    if (!matters.has(matterName)) matters.set(matterName, new Map());
    const subjects = matters.get(matterName);
    if (!subjects.has(subjectName)) subjects.set(subjectName, []);
    subjects.get(subjectName).push(law);
  });

  [...matters.entries()].sort((a, b) => collator.compare(a[0], b[0])).forEach(([matterName, subjects]) => {
    const matterSection = document.createElement("section");
    matterSection.className = "law-library-matter";
    const matterHeading = document.createElement("div");
    matterHeading.className = "law-library-matter-heading";
    const matterTitle = document.createElement("h3");
    matterTitle.textContent = matterName;
    const matterCount = document.createElement("span");
    const uniqueMatterCount = [...subjects.values()].reduce((total, lawsInSubject) => total + lawsInSubject.length, 0);
    matterCount.textContent = uniqueMatterCount + (uniqueMatterCount === 1 ? " norma" : " normas");
    matterHeading.append(matterTitle, matterCount);
    matterSection.append(matterHeading);

    [...subjects.entries()].sort((a, b) => collator.compare(a[0], b[0])).forEach(([subjectName, subjectLaws]) => {
      const subjectSection = document.createElement("section");
      subjectSection.className = "law-library-subject";
      const subjectTitle = document.createElement("h4");
      subjectTitle.textContent = subjectName;
      const subjectList = document.createElement("div");
      subjectList.className = "law-library-subject-list";

      subjectLaws.sort((a, b) => collator.compare(a.short_title || a.title, b.short_title || b.title)).forEach(law => {
        const entry = document.createElement("article");
        entry.className = "law-library-entry";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "law-library-item";
        button.classList.toggle("active", Boolean(legalSelectedLaw && legalSelectedLaw.id === law.id));
        button.setAttribute("aria-pressed", String(Boolean(legalSelectedLaw && legalSelectedLaw.id === law.id)));

        const name = document.createElement("strong");
        name.textContent = law.short_title || law.title;
        const officialName = document.createElement("span");
        officialName.className = "law-library-official-name";
        officialName.textContent = law.title !== law.short_title ? law.title : "Nome oficial";
        const detail = document.createElement("span");
        detail.className = "law-library-kind";
        detail.textContent = law.category || "Norma";
        button.append(name, officialName, detail);
        button.addEventListener("click", () => loadLegalLaw(law.id));

        const status = legalLawStatus(law.id);
        const metadata = document.createElement("div");
        metadata.className = "law-library-entry-meta";
        const checked = document.createElement("small");
        checked.className = status && status.error ? "law-library-check-status is-error" : "law-library-check-status";
        checked.textContent = legalLawLastCheckedText(status);
        metadata.append(checked);

        const recent = legalLawRecentChanges(law.id);
        if (recent.length) {
          const badge = document.createElement("span");
          badge.className = "law-library-recent-badge";
          badge.textContent = recent.length === 1 ? "Alteração recente" : recent.length + " alterações recentes";
          const latest = recent[0];
          badge.title = "Alteração(ões) detectada(s) pelo monitor nos últimos 30 dias. Mais recente: "
            + formatDate(latest.detected_at)
            + (latest.article ? " · " + latest.article : "");
          metadata.append(badge);
        }

        const sourceUrl = legalLawSourceUrl(law, status);
        if (sourceUrl) {
          const source = document.createElement("a");
          source.className = "law-library-source-link";
          source.href = sourceUrl;
          source.target = "_blank";
          source.rel = "noopener noreferrer";
          source.textContent = "Fonte oficial ↗";
          source.title = "Abrir a fonte oficial utilizada pelo monitoramento";
          metadata.append(source);
        } else {
          const noSource = document.createElement("small");
          noSource.className = "law-library-no-source";
          noSource.textContent = "Fonte oficial não cadastrada";
          metadata.append(noSource);
        }

        entry.append(button, metadata);
        subjectList.append(entry);
      });

      subjectSection.append(subjectTitle, subjectList);
      matterSection.append(subjectSection);
    });
    list.append(matterSection);
  });
}
async function loadLegalLaw(lawId) {
  const law = legalLaws.find(item => item.id === lawId);
  if (!law) return;
  clearLegalExcerptSelection();
  selectedLegalDevicePaths.clear();
  legalTrainingState = { items: [], index: 0, title: "", selected: null };
  $("#law-training-panel").classList.add("hidden");
  legalSelectedLaw = law;
  legalSnapshot = null;
  legalEntries = [];
  legalSelectedArticle = "";
  renderLegalLibrary();
  $("#law-reader-empty").classList.remove("hidden");
  $("#law-reader").classList.add("hidden");
  $("#law-reader-empty").querySelector("h3").textContent = "Carregando " + (law.short_title || law.title) + "...";
  $("#law-reader-empty").querySelector("p").textContent = "Abrindo a captura mais recente disponível no projeto.";
  try {
    const response = await fetch("data/snapshots/" + encodeURIComponent(law.id) + ".json?v=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const snapshot = await response.json();
    memorySourceSnapshots.set(law.id, snapshot);
    legalSnapshot = snapshot;
    const articles = snapshot.articles && typeof snapshot.articles === "object" ? snapshot.articles : {};
    legalEntries = Object.entries(articles)
      .filter(([_, text]) => typeof text === "string" && text.trim().length > 0)
      .sort((a, b) => compareLegalArticles(a[0], b[0]));
    $("#law-reader-category").textContent = law.category || "Legislação";
    $("#law-reader-title").textContent = law.short_title || law.title;
    $("#law-reader-description").textContent = [
      law.title !== law.short_title ? law.title : "",
      law.edital_item ? "Conteúdo do edital: " + law.edital_item : ""
    ].filter(Boolean).join(" · ");
    $("#law-reader-source").href = snapshot.source_url_used || law.url;
    $("#law-reader-source").textContent = "Fonte oficial consultada ↗";
    $("#law-reader-warning").classList.add("hidden");
    const status = legalLawStatus(law.id);
    if (status && status.error) {
      $("#law-reader-warning").textContent = "A última consulta desta norma apresentou falha. O leitor está mostrando a última captura válida, de " + formatDate(snapshot.captured_at) + ". A falha não apagou o texto anterior.";
      $("#law-reader-warning").classList.remove("hidden");
    }
    const warningParts = [];
    if (status && status.error) {
      warningParts.push("A última consulta desta norma apresentou falha. O leitor está mostrando a última captura válida, de " + formatDate(snapshot.captured_at) + ". A falha não apagou o texto anterior.");
    }
    if (law.source_note) warningParts.push(law.source_note);
    if (law.monitor_note) warningParts.push(law.monitor_note);
    if (snapshot.snapshot_scope === "selected_articles") {
      warningParts.push("Esta captura contém somente o recorte de artigos configurado para o estudo.");
    }
    if (warningParts.length) {
      $("#law-reader-warning").textContent = warningParts.join(" ");
      $("#law-reader-warning").classList.remove("hidden");
    }
    $("#law-reader").classList.remove("hidden");
    $("#law-reader-empty").classList.add("hidden");
    $("#law-article-search").value = "";
    if (!legalEntries.length) {
      $("#law-article-select").replaceChildren(new Option("Sem artigos separados", ""));
      $("#law-article-select").disabled = true;
      $("#law-article-filter").disabled = true;
      $("#law-previous-article").disabled = true;
      $("#law-next-article").disabled = true;
      $("#law-current-article-title").textContent = "Texto por artigos indisponível";
      $("#law-article-text").textContent = law.id === "in-128-2022"
        ? "Esta norma está acompanhada pelo índice oficial de atos modificadores. A captura atual não contém o texto consolidado separado por artigos. Use o link da fonte oficial para consultar a legislação."
        : "A captura salva para esta norma não contém artigos que possam ser exibidos individualmente.";
      $("#law-favorite-article").disabled = true;
      $("#law-mark-difficult").disabled = true;
      $("#law-memory-create").disabled = true;
      $("#law-memory-create-panel").classList.add("hidden");
      $("#law-mark-studied").disabled = true;
      $("#law-components-details").hidden = true;
      $("#law-train-article").disabled = true;
      $("#law-train-quiz").disabled = true;
      $("#law-train-facts").disabled = true;
      $("#law-article-count").textContent = "Sem artigos separados";
      $("#law-reader-capture-note").textContent = "Consulta registrada em " + formatDate(snapshot.captured_at) + ".";
      updateLegalLibrarySummary();
      return;
    }
    $("#law-article-select").disabled = false;
    $("#law-article-filter").disabled = false;
    renderLegalArticlePicker();
    updateLegalLibrarySummary();
  } catch (error) {
    $("#law-reader").classList.add("hidden");
    $("#law-reader-empty").classList.remove("hidden");
    $("#law-reader-empty").querySelector("h3").textContent = "Não foi possível abrir esta captura";
    $("#law-reader-empty").querySelector("p").textContent = "O arquivo desta norma não foi carregado. A biblioteca não substitui a captura anterior nem presume o conteúdo que está indisponível.";
    console.error("Falha ao abrir snapshot da norma:", law.id, error);
  }
}
function filteredLegalEntries() {
  const mode = $("#law-article-filter").value || "todos";
  const studied = legalStudiedSet();
  const favorites = legalFavoritesSet();
  return legalEntries.filter(([article]) => {
    const key = legalArticleKey(legalSelectedLaw.id, article);
    if (mode === "favoritos") return favorites.has(key);
    if (mode === "estudados") return studied.has(key);
    if (mode === "nao-estudados") return !studied.has(key);
    return true;
  });
}
function renderLegalArticlePicker() {
  if (!legalSelectedLaw) return;
  const select = $("#law-article-select");
  const entries = filteredLegalEntries();
  const previousValue = legalSelectedArticle;
  const studied = legalStudiedSet();
  const favorites = legalFavoritesSet();
  const mode = $("#law-article-filter").value || "todos";
  select.replaceChildren();

  if (!entries.length) {
    select.append(new Option("Nenhum artigo nesta lista", ""));
    select.disabled = true;
    $("#law-previous-article").disabled = true;
    $("#law-next-article").disabled = true;
    $("#law-current-article-title").textContent = "Nenhum artigo para mostrar";
    $("#law-current-study-status").textContent = "";
    $("#law-current-study-status").className = "law-study-status hidden";
    const emptyMessages = {
      favoritos: "Você ainda não favoritou artigos desta norma.",
      estudados: "Você ainda não marcou artigos desta norma como estudados.",
      "nao-estudados": "Todos os artigos desta norma já estão marcados como estudados."
    };
    $("#law-article-text").textContent = emptyMessages[mode] || "Não há artigos disponíveis nesta lista.";
    $("#law-favorite-article").disabled = true;
    $("#law-mark-difficult").disabled = true;
    $("#law-mark-studied").disabled = true;
    $("#law-components-details").hidden = true;
    $("#law-train-article").disabled = true;
    $("#law-train-quiz").disabled = true;
    legalSelectedArticle = "";
    $("#law-article-count").textContent = "0 artigos nesta lista";
    return;
  }

  entries.forEach(([article]) => {
    const key = legalArticleKey(legalSelectedLaw.id, article);
    const labels = [article];
    if (studied.has(key)) labels.push("✓ Estudado");
    if (favorites.has(key)) labels.push("★ Favorito");
    select.append(new Option(labels.join(" · "), article));
  });
  select.disabled = false;
  const next = entries.some(([article]) => article === previousValue)
    ? previousValue
    : entries[0][0];
  if (next !== previousValue) {
    selectedLegalDevicePaths.clear();
    legalTrainingState = { items: [], index: 0, title: "", selected: null };
    $("#law-training-panel").classList.add("hidden");
  }
  select.value = next;
  legalSelectedArticle = next;
  renderLegalArticle();
  updateLegalQuizButton();
  const index = entries.findIndex(([article]) => article === next);
  $("#law-previous-article").disabled = index <= 0;
  $("#law-next-article").disabled = index < 0 || index >= entries.length - 1;
  updateLegalLibrarySummary();
}
function renderLegalArticle() {
  if (!legalSelectedLaw || !legalSnapshot || !legalSelectedArticle) return;
  const entry = legalEntries.find(([article]) => article === legalSelectedArticle);
  if (!entry) return;
  const [article, text] = entry;
  clearLegalExcerptSelection();
  const articleKey = legalArticleKey(legalSelectedLaw.id, article);
  const studied = legalStudiedSet();
  const favorites = legalFavoritesSet();
  const isStudied = studied.has(articleKey);
  $("#law-current-article-title").textContent = article;
  $("#law-article-text").textContent = text;
  $("#law-memory-create").disabled = false;
  $("#law-memory-create-panel").classList.add("hidden");
  renderLegalArticleHistory(article);

  const studyStatus = $("#law-current-study-status");
  studyStatus.textContent = isStudied ? "✓ Artigo estudado" : "Ainda não estudado";
  studyStatus.className = "law-study-status" + (isStudied ? " is-studied" : "");
  studyStatus.title = isStudied
    ? "Este artigo está marcado como estudado neste navegador."
    : "Este artigo ainda não foi marcado como estudado neste navegador.";

  $("#law-favorite-article").disabled = false;
  $("#law-favorite-article").textContent = favorites.has(articleKey) ? "★ Artigo favorito" : "☆ Favoritar artigo";
  const difficultEntry=loadDifficultArticleQueue()[articleKey];
  $("#law-mark-difficult").disabled=false;
  $("#law-mark-difficult").textContent=difficultEntry&&difficultEntry.status!=="mastered"?"✓ Conteúdo difícil (na revisão)":"Marcar como difícil";
  $("#law-mark-difficult").setAttribute("aria-pressed",String(Boolean(difficultEntry&&difficultEntry.status!=="mastered")));
  $("#law-favorite-article").setAttribute("aria-pressed", String(favorites.has(articleKey)));
  $("#law-mark-studied").disabled = false;
  $("#law-mark-studied").textContent = isStudied ? "Marcar como não estudado" : "Marcar como estudado";
  $("#law-mark-studied").setAttribute("aria-pressed", String(isStudied));
  $("#law-train-article").disabled = text.trim().length < 60;
  $("#law-train-facts").disabled = text.trim().length < 40;

  const components = legalSnapshot.components && legalSnapshot.components[article]
    ? Object.entries(legalSnapshot.components[article])
    : [];
  const deviceCount = components.filter(([path, component]) =>
    path !== "caput" && component.device_type !== "caput"
  ).length;
  $("#law-components-details").hidden = deviceCount === 0;
  $("#law-components-details > summary").textContent =
    "Ver partes identificadas deste artigo (" + deviceCount + " dispositivos)";
  renderLegalComponents(components, article);
  updateSelectedLegalDeviceControls();

  const lawStatus = legalLawStatus(legalSelectedLaw.id);
  const captureDate = formatDate(legalSnapshot.captured_at);
  $("#law-reader-capture-note").textContent = "Captura consultada em " + captureDate
    + (lawStatus && lawStatus.source_status === "fallback_used" ? " · fonte alternativa usada" : "")
    + (lawStatus && lawStatus.source_status === "recovered" ? " · consulta recuperada após nova tentativa" : "");
  const visible = filteredLegalEntries();
  const studiedCount = legalEntries.filter(([name]) =>
    studied.has(legalArticleKey(legalSelectedLaw.id, name))
  ).length;
  $("#law-article-count").textContent = visible.length + " na lista · "
    + studiedCount + "/" + legalEntries.length + " estudados";
  const index = visible.findIndex(([name]) => name === article);
  $("#law-previous-article").disabled = index <= 0;
  $("#law-next-article").disabled = index < 0 || index >= visible.length - 1;
  updateLegalLibrarySummary();
}
function legalRomanValue(value) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const roman = String(value || "").toUpperCase();
  let total = 0;
  let previous = 0;
  for (let index = roman.length - 1; index >= 0; index -= 1) {
    const current = values[roman[index]] || 0;
    total += current < previous ? -current : current;
    previous = Math.max(previous, current);
  }
  return total;
}
function legalComponentNodeType(node) {
  if (node.component && node.component.device_type) return node.component.device_type;
  const part = node.path.split("/").pop();
  return part.includes(":") ? part.split(":")[0] : part;
}
function legalComponentNodeValue(node) {
  const part = node.path.split("/").pop();
  const value = part.includes(":") ? part.slice(part.indexOf(":") + 1) : "";
  const type = legalComponentNodeType(node);
  if (type === "paragrafo") return value === "unico" ? Number.MAX_SAFE_INTEGER : Number(value) || 0;
  if (type === "inciso") return legalRomanValue(value);
  if (type === "alinea") return value.toLowerCase().charCodeAt(0) || 0;
  if (type === "item") return Number(value) || 0;
  return 0;
}
function compareLegalComponentNodes(a, b) {
  const order = { caput: 0, paragrafo: 1, inciso: 2, alinea: 3, item: 4 };
  const typeA = legalComponentNodeType(a);
  const typeB = legalComponentNodeType(b);
  const typeOrder = (order[typeA] ?? 9) - (order[typeB] ?? 9);
  if (typeOrder) return typeOrder;
  const valueOrder = legalComponentNodeValue(a) - legalComponentNodeValue(b);
  if (valueOrder) return valueOrder;
  return (a.component?.device_label || a.path).localeCompare(
    b.component?.device_label || b.path, "pt-BR", { numeric: true, sensitivity: "base" }
  );
}
function legalComponentLabel(node) {
  if (node.component && node.component.device_label) return node.component.device_label;
  const part = node.path.split("/").pop();
  if (part === "caput") return "Caput";
  const [type, value] = part.split(":");
  if (type === "paragrafo") return value === "unico" ? "Parágrafo único" : "§ " + value + "º";
  if (type === "inciso") return "Inciso " + value;
  if (type === "alinea") return "Alínea " + value;
  if (type === "item") return "Item " + value;
  return "Parte do artigo";
}
function buildLegalComponentTree(components) {
  const nodes = new Map();
  const roots = [];
  function ensureNode(path) {
    if (nodes.has(path)) return nodes.get(path);
    const node = { path, component: null, children: [] };
    nodes.set(path, node);
    const separator = path.lastIndexOf("/");
    if (separator >= 0) {
      const parent = ensureNode(path.slice(0, separator));
      parent.children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  }
  components.forEach(([path, component]) => {
    ensureNode(path).component = component;
  });
  function sortNodes(items) {
    items.sort(compareLegalComponentNodes);
    items.forEach(node => sortNodes(node.children));
  }
  sortNodes(roots);
  return roots;
}
function legalDeviceHistory(lawId, article, devicePath = null) {
  const changes = dashboardData && Array.isArray(dashboardData.changes)
    ? dashboardData.changes
    : [];
  return changes
    .filter(change => {
      if (change.law_id !== lawId || change.article !== article) return false;
      if (!devicePath) return true;
      return change.device_path === devicePath
        || (devicePath === article && change.device_type === "artigo");
    })
    .sort((a, b) => new Date(b.detected_at || 0) - new Date(a.detected_at || 0));
}
function renderLegalHistoryItems(container, changes, emptyMessage) {
  container.replaceChildren();
  if (!changes.length) {
    const empty = document.createElement("p");
    empty.className = "law-history-empty";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }
  changes.forEach(change => {
    const card = document.createElement("article");
    card.className = "law-history-entry";

    const heading = document.createElement("div");
    heading.className = "law-history-heading";
    const title = document.createElement("strong");
    title.textContent = typeLabel(change.change_type, change);
    const date = document.createElement("small");
    date.textContent = "Detectado em " + formatDate(change.detected_at);
    heading.append(title, date);

    const summary = document.createElement("p");
    summary.className = "law-history-summary";
    summary.textContent = change.summary || "Diferença textual registrada pelo monitor.";

    const comparison = document.createElement("div");
    comparison.className = "law-history-comparison";
    const previous = document.createElement("section");
    previous.className = "law-history-version is-previous";
    const previousTitle = document.createElement("h5");
    previousTitle.textContent = "Redação anterior";
    const previousText = document.createElement("pre");
    previousText.textContent = change.old_text || "Não havia redação anterior registrada para este dispositivo.";
    previous.append(previousTitle, previousText);

    const current = document.createElement("section");
    current.className = "law-history-version is-current";
    const currentTitle = document.createElement("h5");
    currentTitle.textContent = "Redação atual na captura";
    const currentText = document.createElement("pre");
    currentText.textContent = change.new_text
      || (change.change_type === "nao_encontrado"
        ? "O dispositivo não foi localizado na captura atual. Isso, isoladamente, não comprova revogação."
        : "Não há redação atual registrada para esta ocorrência.");
    current.append(currentTitle, currentText);
    comparison.append(previous, current);

    const footer = document.createElement("div");
    footer.className = "law-history-footer";
    const source = document.createElement("a");
    source.href = change.evidence_url || change.source_url
      || (legalSelectedLaw ? legalLawSourceUrl(legalSelectedLaw) : "https://www.gov.br/");
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Consultar fonte oficial ↗";
    footer.append(source);

    card.append(heading, summary, comparison, footer);
    container.append(card);
  });
}
function renderLegalArticleHistory(article) {
  const history = legalDeviceHistory(legalSelectedLaw.id, article);
  $("#law-article-history-summary").textContent =
    "Histórico de alterações deste artigo (" + history.length + ")";
  renderLegalHistoryItems(
    $("#law-article-history-list"),
    history,
    "O monitor ainda não registrou alterações neste artigo. Quando uma diferença for detectada, as redações anterior e atual aparecerão aqui."
  );
}
function updateSelectedLegalDeviceControls() {
  const components = legalSnapshot && legalSnapshot.components && legalSnapshot.components[legalSelectedArticle]
    ? legalSnapshot.components[legalSelectedArticle]
    : {};
  let paragraphs = 0;
  let incisos = 0;
  selectedLegalDevicePaths.forEach(path => {
    const component = components[path];
    if (!component) {
      selectedLegalDevicePaths.delete(path);
      return;
    }
    if (component.device_type === "paragrafo") paragraphs += 1;
    if (component.device_type === "inciso") incisos += 1;
  });
  $("#law-training-selected-paragraphs").disabled = paragraphs === 0;
  $("#law-training-selected-incisos").disabled = incisos === 0;
  $("#law-training-selected-paragraphs").textContent = "Treinar parágrafos selecionados (" + paragraphs + ")";
  $("#law-training-selected-incisos").textContent = "Treinar incisos selecionados (" + incisos + ")";
  $("#law-training-selection-status").textContent = paragraphs + " parágrafo(s) e " + incisos
    + " inciso(s) selecionado(s). Selecione os dispositivos que deseja estudar.";
}
function renderLegalComponents(components, article) {
  const container = $("#law-components-list");
  const navigation = $("#law-device-navigation");
  const expandedPaths = new Set(
    [...container.querySelectorAll("details.law-component-node[open]")]
      .map(node => node.dataset.devicePath)
  );
  container.replaceChildren();
  navigation.replaceChildren();
  if (!components.length) {
    updateSelectedLegalDeviceControls();
    return;
  }

  const tree = buildLegalComponentTree(components);
  let nodeNumber = 0;
  function renderNode(node, depth, parentLabels = []) {
    nodeNumber += 1;
    const component = node.component || {};
    const type = component.device_type || legalComponentNodeType(node);
    const label = legalComponentLabel(node);
    const details = document.createElement("details");
    details.className = "law-component-node";
    details.id = "law-device-" + nodeNumber;
    details.dataset.devicePath = node.path;
    details.open = expandedPaths.has(node.path);

    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.className = "law-component-title";
    title.textContent = label;
    const kind = document.createElement("span");
    kind.className = "law-component-kind";
    kind.textContent = type;
    summary.append(title, kind);
    details.append(summary);

    const body = document.createElement("div");
    body.className = "law-component-body";
    if (component.text) {
      const text = document.createElement("pre");
      text.className = "legal-selectable-text";
      text.textContent = component.text;
      body.append(text);
    }
    if (component.device_type && component.device_type !== "caput") {
      const favorite = document.createElement("button");
      favorite.type = "button";
      favorite.className = "law-component-favorite";
      const key = legalComponentKey(legalSelectedLaw.id, article, node.path);
      const setFavoriteState = () => {
        const saved = legalFavoritesSet().has(key);
        favorite.textContent = saved ? "★ Salvo nos favoritos" : "☆ Favoritar este dispositivo";
        favorite.setAttribute("aria-pressed", String(saved));
      };
      setFavoriteState();
      favorite.addEventListener("click", () => {
        const current = legalFavoritesSet();
        if (current.has(key)) current.delete(key);
        else current.add(key);
        writeLegalStorage(LEGAL_FAVORITES_KEY, current);
        setFavoriteState();
      });
      body.append(favorite);
    }

    const deviceHistory = legalDeviceHistory(legalSelectedLaw.id, article, node.path);
    const historyDetails = document.createElement("details");
    historyDetails.className = "law-device-history";
    const historySummary = document.createElement("summary");
    historySummary.textContent = "Histórico deste dispositivo (" + deviceHistory.length + ")";
    const historyList = document.createElement("div");
    historyList.className = "law-history-list";
    renderLegalHistoryItems(
      historyList,
      deviceHistory,
      "Nenhuma alteração deste dispositivo foi registrada pelo monitor até agora."
    );
    historyDetails.append(historySummary, historyList);
    body.append(historyDetails);

    const nextLabels = [...parentLabels, label];
    if (node.path !== "caput") {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "law-device-jump";
      jump.style.marginLeft = (Math.max(0, depth - 1) * (window.innerWidth <= 760 ? 8 : 12)) + "px";
      jump.textContent = label;
      jump.title = "Ir para " + nextLabels.join(" › ");
      jump.setAttribute("aria-label", "Ir para " + nextLabels.join(", "));
      jump.addEventListener("click", () => {
        $("#law-components-details").open = true;
        let parent = details;
        while (parent && parent !== container) {
          if (parent.matches("details.law-component-node")) parent.open = true;
          parent = parent.parentElement;
        }
        details.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      navigation.append(jump);
    }

    if (node.children.length) {
      const children = document.createElement("div");
      children.className = "law-component-children";
      node.children.forEach(child => children.append(renderNode(child, depth + 1, nextLabels)));
      body.append(children);
    }
    details.append(body);

    const wrapper = document.createElement("div");
    const selectable = type === "paragrafo" || type === "inciso";
    wrapper.className = "law-component-node-wrap" + (selectable ? " is-selectable" : "");
    if (selectable) {
      const selectionLabel = document.createElement("label");
      selectionLabel.className = "law-component-select-label";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedLegalDevicePaths.has(node.path);
      checkbox.setAttribute("aria-label", "Selecionar " + label + " para treinamento");
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedLegalDevicePaths.add(node.path);
        else selectedLegalDevicePaths.delete(node.path);
        updateSelectedLegalDeviceControls();
      });
      const selectionText = document.createElement("span");
      selectionText.textContent = "Selecionar para treino";
      selectionLabel.append(checkbox, selectionText);
      wrapper.append(selectionLabel);
    }
    wrapper.append(details);
    return wrapper;
  }
  tree.forEach(node => container.append(renderNode(node, 0)));
  updateSelectedLegalDeviceControls();
}
function updateLegalLibrarySummary() {
  const studied = legalStudiedSet();
  const favorites = legalFavoritesSet();
  const articleFavorites = legalSelectedLaw
    ? [...favorites].filter(key => key.startsWith(legalSelectedLaw.id + "::") && key.split("::").length === 2).length
    : 0;
  if (!legalSelectedLaw) return;
  const studiedCount = legalEntries.filter(([article]) => studied.has(legalArticleKey(legalSelectedLaw.id, article))).length;
  $("#law-library-summary-count").textContent = legalEntries.length + " artigos · " + studiedCount + " estudados";
  $("#law-library-summary-note").textContent = articleFavorites + " favoritos nesta norma · marcações salvas neste navegador";
}
function searchLegalArticles() {
  const rawQuery = ($("#law-article-search").value || "").trim();
  const query = normalizeAnswer(rawQuery);
  const articleQuery = parseLegalArticleQuery(rawQuery);
  const explicitArticleQuery = /^(?:artigo|art)\\b/i.test(rawQuery);
  const resultsBox = $("#law-search-results");
  resultsBox.replaceChildren();
  if (!legalEntries.length || (!articleQuery && query.length < 2)) {
    resultsBox.classList.add("hidden");
    return;
  }

  const exactArticleResults = articleQuery
    ? legalEntries.filter(([article]) => legalArticleMatchesQuery(article, articleQuery))
    : [];
  const searchByArticle = Boolean(articleQuery && (explicitArticleQuery || exactArticleResults.length));
  const results = searchByArticle
    ? exactArticleResults
    : legalEntries.filter(([_, text]) => normalizeAnswer(text).includes(query)).slice(0, 35);

  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "law-search-empty";
    empty.textContent = searchByArticle
      ? "O Art. " + articleQuery.number + (articleQuery.suffix ? "-" + articleQuery.suffix : "")
        + " não está disponível nesta captura ou não faz parte do recorte salvo."
      : "Nenhum trecho encontrado nesta norma.";
    resultsBox.append(empty);
  } else {
    const header = document.createElement("p");
    header.className = "law-search-heading";
    header.textContent = searchByArticle
      ? "Artigo localizado"
      : results.length + (results.length === 35 ? "+ resultados" : " resultado(s)");
    resultsBox.append(header);
    results.forEach(([article, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "law-search-result";
      const label = document.createElement("strong");
      label.textContent = article;
      const snippet = document.createElement("span");
      let start = 0;
      if (!searchByArticle) {
        const rawLower = rawQuery.toLocaleLowerCase("pt-BR");
        const position = text.toLocaleLowerCase("pt-BR").indexOf(rawLower);
        start = position >= 0 ? Math.max(0, position - 65) : 0;
      }
      snippet.textContent = text.slice(start, start + 230).replace(/\\s+/g, " ")
        + (text.length > start + 230 ? "…" : "");
      button.append(label, snippet);
      button.addEventListener("click", () => {
        $("#law-article-filter").value = "todos";
        renderLegalArticlePicker();
        $("#law-article-select").value = article;
        if (legalSelectedArticle !== article) selectedLegalDevicePaths.clear();
        legalSelectedArticle = article;
        $("#law-training-panel").classList.add("hidden");
        renderLegalArticle();
        resultsBox.classList.add("hidden");
        $("#law-article-search").value = "";
        $("#law-current-article").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      resultsBox.append(button);
    });
  }
  resultsBox.classList.remove("hidden");
}
function toggleLegalArticleFavorite() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  const key = legalArticleKey(legalSelectedLaw.id, legalSelectedArticle);
  const favorites = legalFavoritesSet();
  if (favorites.has(key)) favorites.delete(key);
  else favorites.add(key);
  writeLegalStorage(LEGAL_FAVORITES_KEY, favorites);
  renderLegalArticlePicker();
}
function toggleLegalArticleStudied() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  const key = legalArticleKey(legalSelectedLaw.id, legalSelectedArticle);
  const studied=legalStudiedSet(),dates=loadLegalStudiedDates();
  if(studied.has(key)){studied.delete(key);delete dates[key];}
  else{studied.add(key);dates[key]=new Date().toISOString();}
  writeLegalStorage(LEGAL_STUDIED_KEY,studied);
  saveLegalStudiedDates(dates);
  renderLegalArticlePicker();
}
function stepLegalArticle(direction) {
  if (!legalSelectedLaw || !legalEntries.length) return;
  const entries = filteredLegalEntries();
  const index = entries.findIndex(([article]) => article === legalSelectedArticle);
  const next = entries[index + direction];
  if (!next) return;
  if (legalSelectedArticle !== next[0]) {
    selectedLegalDevicePaths.clear();
    $("#law-training-panel").classList.add("hidden");
  }
  legalSelectedArticle = next[0];
  $("#law-article-select").value = legalSelectedArticle;
  renderLegalArticle();
}
function selectableLegalTextRoot(node) {
  const element = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
  return element && element.closest ? element.closest(".legal-selectable-text") : null;
}
function clearLegalExcerptSelection() {
  clearTimeout(legalSelectionTimer);
  legalSelectionTimer = null;
  selectedLegalExcerpt = null;
  const toolbar = $("#law-selection-toolbar");
  if (toolbar) toolbar.classList.add("hidden");
  const selection = window.getSelection && window.getSelection();
  if (selection && selection.rangeCount) selection.removeAllRanges();
}
function updateLegalExcerptSelection() {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.isCollapsed) return;
  if (!legalSelectedLaw || !legalSelectedArticle || $("#law-view").classList.contains("hidden")) {
    selectedLegalExcerpt = null;
    $("#law-selection-toolbar").classList.add("hidden");
    return;
  }
  const anchorRoot = selectableLegalTextRoot(selection.anchorNode);
  const focusRoot = selectableLegalTextRoot(selection.focusNode);
  if (!anchorRoot || anchorRoot !== focusRoot) {
    selectedLegalExcerpt = null;
    $("#law-selection-toolbar").classList.add("hidden");
    return;
  }

  const text = selection.toString().replace(/\u00a0/g, " ").trim();
  if (!text) return;
  selectedLegalExcerpt = {
    text,
    lawId: legalSelectedLaw.id,
    lawTitle: legalSelectedLaw.short_title || legalSelectedLaw.title,
    article: legalSelectedArticle,
    sourceUrl: legalLawSourceUrl(legalSelectedLaw),
  };
  const words = text.split(/\s+/).filter(Boolean).length;
  $("#law-selection-label").textContent =
    "Trecho selecionado · " + words + (words === 1 ? " palavra" : " palavras");
  $("#law-selection-preview").textContent =
    text.length > 180 ? text.slice(0, 180) + "…" : text;
  $("#law-selection-toolbar").classList.remove("hidden");
}
function queueLegalExcerptSelectionUpdate() {
  clearTimeout(legalSelectionTimer);
  legalSelectionTimer = setTimeout(updateLegalExcerptSelection, 120);
}
function startLegalTraining(items, title) {
  const panel = $("#law-training-panel");
  if (!items.length) {
    panel.classList.remove("hidden");
    $("#law-training-title").textContent = title || "Treinamento";
    $("#law-training-prompt").textContent = "Não foi possível criar exercícios a partir deste conteúdo.";
    $("#law-training-progress").textContent = "Nenhum exercício disponível";
    $("#law-training-recall-area").classList.add("hidden");
    $("#law-training-cloze-area").classList.add("hidden");
    $("#law-training-choices").classList.add("hidden");
    $("#law-training-answer").classList.add("hidden");
    $("#law-training-next").disabled = true;
    return;
  }
  legalTrainingState = { items, index: 0, title: title || "Treinamento", selected: null };
  panel.classList.remove("hidden");
  renderLegalTrainingItem();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}
function renderLegalTrainingAnswer(item, heading, explanation, sourceText) {
  $("#law-training-answer-title").textContent = heading || "Resposta e conferência";
  $("#law-training-explanation").textContent = explanation || "";
  $("#law-training-source-text").textContent = sourceText || item.answerText || item.sourceText || "";
  $("#law-training-source").href = item.sourceUrl || (legalSnapshot && legalSnapshot.source_url_used) || legalSelectedLaw.url;
  $("#law-training-answer").classList.remove("hidden");
}
function renderLegalTrainingItem() {
  const item = legalTrainingState.items[legalTrainingState.index];
  if (!item) return;
  legalTrainingState.selected = null;
  $("#law-training-title").textContent = item.title || legalTrainingState.title;
  $("#law-training-progress").textContent =
    "Exercício " + (legalTrainingState.index + 1) + " de " + legalTrainingState.items.length
    + (item.kindLabel ? " · " + item.kindLabel : "");
  $("#law-training-prompt").textContent = item.prompt || "";
  $("#law-training-recall-area").classList.add("hidden");
  $("#law-training-cloze-area").classList.add("hidden");
  $("#law-training-choices").classList.add("hidden");
  $("#law-training-answer").classList.add("hidden");
  $("#law-training-feedback").classList.add("hidden");
  $("#law-training-next").disabled = true;
  $("#law-training-next").textContent =
    legalTrainingState.index === legalTrainingState.items.length - 1 ? "Finalizar treinamento" : "Próximo exercício →";
  $("#law-training-check").disabled = false;

  if (item.kind === "ce") {
    $("#law-training-choices").classList.remove("hidden");
    $("#law-training-true").disabled = false;
    $("#law-training-false").disabled = false;
    $("#law-training-true").classList.remove("selected");
    $("#law-training-false").classList.remove("selected");
    $("#law-training-true").setAttribute("aria-pressed", "false");
    $("#law-training-false").setAttribute("aria-pressed", "false");
    $("#law-training-feedback").textContent = "";
  } else if (item.kind === "cloze") {
    $("#law-training-cloze-area").classList.remove("hidden");
    renderLegalTrainingCloze(item);
  } else if (item.kind === "notice") {
    $("#law-training-answer").classList.remove("hidden");
    $("#law-training-answer-title").textContent = "Observação";
    $("#law-training-explanation").textContent = item.explanation || "";
    $("#law-training-source-text").textContent = "";
    $("#law-training-source").href = item.sourceUrl || legalLawSourceUrl(legalSelectedLaw);
    $("#law-training-next").disabled = false;
  } else {
    $("#law-training-recall-area").classList.remove("hidden");
    $("#law-training-recall").value = "";
    $("#law-training-reveal").disabled = false;
  }
}
function answerLegalTrainingCE(value) {
  const item = legalTrainingState.items[legalTrainingState.index];
  if (!item || item.kind !== "ce" || legalTrainingState.selected !== null) return;
  legalTrainingState.selected = value;
  const correct = value === item.answer;
  recordLegalTrainingCEReview(item,value);
  $("#law-training-true").disabled = true;
  $("#law-training-false").disabled = true;
  $("#law-training-true").classList.toggle("selected", value === true);
  $("#law-training-false").classList.toggle("selected", value === false);
  $("#law-training-feedback").textContent = correct ? "Você acertou! ✓" : "Você errou. ✕";
  $("#law-training-feedback").className = "law-training-feedback " + (correct ? "correct" : "incorrect");
  renderLegalTrainingAnswer(
    item,
    item.answer ? "Gabarito: Certo" : "Gabarito: Errado",
    item.explanation,
    item.sourceText || item.literalText || item.statement
  );
  $("#law-training-next").disabled = false;
}
function revealLegalTrainingRecall() {
  const item = legalTrainingState.items[legalTrainingState.index];
  if (!item || item.kind !== "recall") return;
  renderLegalTrainingAnswer(
    item,
    item.answerTitle || "Conferência",
    item.explanation || "Compare sua resposta com a redação apresentada.",
    item.answerText || item.sourceText
  );
  $("#law-training-reveal").disabled = true;
  $("#law-training-next").disabled = false;
}
function renderLegalTrainingCloze(item) {
  const container = $("#law-training-cloze");
  container.replaceChildren();
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  item.blanks.forEach((blank, index) => {
    fragment.append(document.createTextNode(item.text.slice(cursor, blank.start)));
    const slot = document.createElement("span");
    slot.className = "law-training-cloze-slot";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "law-training-cloze-input";
    input.dataset.index = String(index);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "____";
    input.style.width = Math.max(4.5, Math.min(15, blank.value.length * 0.78)) + "ch";
    slot.append(input);
    fragment.append(slot);
    cursor = blank.end;
  });
  fragment.append(document.createTextNode(item.text.slice(cursor)));
  container.append(fragment);
}
function checkLegalTrainingCloze() {
  const item = legalTrainingState.items[legalTrainingState.index];
  if (!item || item.kind !== "cloze") return;
  const inputs = [...$("#law-training-cloze").querySelectorAll("input")];
  recordLegalTrainingClozeReview(item,inputs);
  let correct = 0;
  inputs.forEach(input => {
    const expected = item.blanks[Number(input.dataset.index)].value;
    const isCorrect = normalizeAnswer(input.value) === normalizeAnswer(expected);
    if (isCorrect) correct += 1;
    input.disabled = true;
    input.classList.toggle("correct", isCorrect);
    input.classList.toggle("incorrect", !isCorrect);
    if (!isCorrect) {
      const correction = document.createElement("small");
      correction.className = "law-training-cloze-correction";
      correction.textContent = "Resposta: " + expected;
      input.insertAdjacentElement("afterend", correction);
    }
  });
  $("#law-training-feedback").textContent = correct + " de " + item.blanks.length + " lacunas corretas.";
  $("#law-training-feedback").className =
    "law-training-feedback " + (correct === item.blanks.length ? "correct" : "incorrect");
  $("#law-training-check").disabled = true;
  renderLegalTrainingAnswer(
    item,
    "Trecho completo",
    "A correção compara suas respostas com as palavras exatas do trecho selecionado.",
    item.text
  );
  $("#law-training-next").disabled = false;
}
function nextLegalTrainingItem() {
  if (legalTrainingState.index + 1 >= legalTrainingState.items.length) {
    $("#law-training-panel").classList.add("hidden");
    legalTrainingState = { items: [], index: 0, title: "", selected: null };
    $("#law-current-article").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  legalTrainingState.index += 1;
  renderLegalTrainingItem();
}
function legalTrainingLawMatches(item, law) {
  if (item.law_id) return item.law_id === law.id;
  const acceptedTitles = [law.title, law.short_title].filter(Boolean).map(normalizeAnswer);
  const itemTitle = normalizeAnswer(item.law_title || "");
  if (itemTitle && acceptedTitles.some(title => itemTitle === title || itemTitle.includes(title) || title.includes(itemTitle))) return true;
  const acceptedSources = new Set([
    law.url,
    legalSnapshot && legalSnapshot.source_url_used,
    ...(Array.isArray(law.fetch_urls) ? law.fetch_urls : [])
  ].filter(Boolean));
  return Boolean(item.source_url && acceptedSources.has(item.source_url));
}
function legalTrainingArticleMatches(value, article) {
  const left = legalArticleNumber(value);
  const right = legalArticleNumber(article);
  return left[0] === right[0] && left[1] === right[1];
}
function legalAlterLiteralStatement(text, fullText) {
  const swaps = [
    [/\bmediante\b/i, "independentemente"],
    [/\bindependentemente\b/i, "mediante"],
    [/\bdeverá\b/i, "poderá"],
    [/\bpoderá\b/i, "deverá"],
    [/\bobrigatórios?\b/i, "facultativos"],
    [/\bfacultativos?\b/i, "obrigatórios"],
    [/\burbana e rural\b/i, "urbana"],
    [/\burbanas e rurais\b/i, "urbanas"],
    [/\bmaior\b/i, "menor"],
    [/\bmenor\b/i, "maior"],
    [/\bfacultativa\b/i, "obrigatória"],
    [/\bobrigatória\b/i, "facultativa"],
    [/\baté\b/i, "após"],
    [/\bantes\b/i, "depois"]
  ];
  for (const [pattern, replacement] of swaps) {
    if (pattern.test(text)) {
      const candidate = text.replace(pattern, replacement);
      if (normalizeAnswer(candidate) !== normalizeAnswer(text)
        && !normalizeAnswer(fullText).includes(normalizeAnswer(candidate))) return candidate;
    }
  }
  if (/\bnão\b/i.test(text)) {
    const candidate = text.replace(/\bnão\b/i, "");
    if (normalizeAnswer(candidate) !== normalizeAnswer(text)
      && !normalizeAnswer(fullText).includes(normalizeAnswer(candidate))) return candidate;
  }
  const word = text.match(/\b[A-Za-zÀ-ÖØ-öø-ÿ]{5,}\b/u);
  if (word) {
    const candidate = text.slice(0, word.index) + "exclusivamente" + text.slice(word.index + word[0].length);
    if (!normalizeAnswer(fullText).includes(normalizeAnswer(candidate))) return candidate;
  }
  return "";
}
function buildLegalFidelityCE(text, deviceLabel, sourceUrl, limit = 4) {
  const clauses = String(text || "").replace(/\r/g, "").split(/(?<=[;.!?])\s+|\n+/u)
    .map(value => value.trim()).filter(value => value.length >= 28);
  const candidates = clauses.length ? clauses : [String(text || "").trim()].filter(Boolean);
  const items = [];
  for (const clause of candidates) {
    if (items.length >= limit) break;
    const variant = legalAlterLiteralStatement(clause, text);
    items.push({
      kind: "ce",
      kindLabel: "Conferência literal",
      title: "Certo ou Errado · " + deviceLabel,
      prompt: "A afirmação a seguir reproduz fielmente a redação de " + deviceLabel + "? “" + clause + "”",
      answer: true,
      explanation: "Certo. O trecho apresentado foi extraído literalmente do texto salvo para este dispositivo.",
      sourceText: clause,
      sourceUrl
    });
    if (variant && items.length < limit) {
      items.push({
        kind: "ce",
        kindLabel: "Conferência literal",
        title: "Certo ou Errado · " + deviceLabel,
        prompt: "A afirmação a seguir reproduz fielmente a redação de " + deviceLabel + "? “" + variant + "”",
        answer: false,
        explanation: "Errado. A frase foi modificada para o exercício. Compare com a redação efetiva do dispositivo, apresentada abaixo.",
        sourceText: clause,
        sourceUrl
      });
    }
  }
  return items;
}
function legalTrainingRecallItem(label, text, sourceUrl, prompt) {
  return {
    kind: "recall",
    kindLabel: "Memorização",
    title: "Lembre o conteúdo · " + label,
    prompt: prompt || "Sem consultar o texto, tente explicar o que estabelece " + label + ". Depois, confira a redação abaixo.",
    answerTitle: "Redação do dispositivo",
    answerText: text,
    sourceText: text,
    sourceUrl,
    explanation: "Use a redação oficial salva para conferir se você lembrou todos os pontos importantes."
  };
}
function legalTrainingClauses(text) {
  return String(text || "").replace(/\r/g, "").split(/(?<=[;.!?])\s+|\n+/u)
    .map(value => value.trim()).filter(value => value.length >= 24);
}
function buildLegalFactTrainingItems(text, label, sourceUrl) {
  const clauses = legalTrainingClauses(text);
  const items = [];
  const deadlinePattern = /\b\d{1,4}(?:\s*\([^)]+\))?\s*(?:dias?|meses?|anos?|horas?|minutos?|semanas?)\b/gi;
  clauses.forEach(clause => {
    if (items.length >= 12) return;
    const found = [...clause.matchAll(deadlinePattern)];
    found.forEach(match => {
      if (items.length >= 12) return;
      const blanked = clause.slice(0, match.index) + "________" + clause.slice(match.index + match[0].length);
      items.push({
        kind: "recall",
        kindLabel: "Prazo",
        title: "Identificar prazo · " + label,
        prompt: "Qual prazo aparece neste trecho? " + blanked,
        answerTitle: "Prazo e contexto",
        answerText: clause,
        sourceText: clause,
        sourceUrl,
        explanation: "O prazo é a expressão numérica destacada no texto legal. Confira também o contexto completo."
      });
    });
  });
  const requirementPattern = /\b(?:desde que|contanto que|mediante|condicionad[oa]s?|somente se|apenas se|comprov(?:ar|ação)|é necessário|será necessário|exige|requer|deverá|deverão|depende|observad[oa]s?|respeitad[oa]s?|para fins de)\b/i;
  clauses.forEach(clause => {
    if (items.length >= 18) return;
    const match = requirementPattern.exec(clause);
    if (!match) return;
    const context = clause.slice(0, match.index) + "________" + clause.slice(match.index + match[0].length);
    items.push({
      kind: "recall",
      kindLabel: "Requisito",
      title: "Identificar requisito · " + label,
      prompt: "Que condição ou requisito é indicado neste trecho? " + context,
      answerTitle: "Condição ou requisito",
      answerText: clause,
      sourceText: clause,
      sourceUrl,
      explanation: "O exercício destaca uma expressão associada a condição, obrigação ou requisito. Confira a frase integral para não perder o contexto."
    });
  });
  const exceptionPattern = /\b(?:salvo|exceto|ressalvad[oa]s?|ressalva|não se aplica|excluíd[oa]s?|sem prejuízo|independentemente de|não terá direito|não serão devidos?)\b/i;
  clauses.forEach(clause => {
    if (items.length >= 24) return;
    const match = exceptionPattern.exec(clause);
    if (!match) return;
    const context = clause.slice(0, match.index) + "________" + clause.slice(match.index + match[0].length);
    items.push({
      kind: "recall",
      kindLabel: "Exceção",
      title: "Identificar exceção · " + label,
      prompt: "Qual ressalva ou exceção aparece neste trecho? " + context,
      answerTitle: "Ressalva ou exceção",
      answerText: clause,
      sourceText: clause,
      sourceUrl,
      explanation: "O exercício localizou uma expressão que pode indicar ressalva ou exclusão. Confira o contexto e o alcance do dispositivo."
    });
  });
  return items;
}
async function prepareLegalTrainingBanks() {
  if (!questionBank.length) await loadQuestionBank();
  if (!multiCEGroups.length) await loadMultiCEBank();
}
async function startLegalArticleTraining() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  await prepareLegalTrainingBanks();
  const entry = legalEntries.find(([article]) => article === legalSelectedArticle);
  if (!entry) return;
  const [article, articleText] = entry;
  const sourceUrl = legalSnapshot.source_url_used || legalSelectedLaw.url;
  const curated = [];
  questionBank.filter(item =>
    legalTrainingLawMatches(item, legalSelectedLaw)
    && legalTrainingArticleMatches(item.article, article)
  ).forEach(item => curated.push({
    kind: "ce",
    kindLabel: "Questão cadastrada",
    title: "Questão do artigo · " + article,
    prompt: item.statement,
    answer: item.answer,
    explanation: item.explanation,
    sourceText: item.literal_text || articleText,
    sourceUrl: item.source_url || sourceUrl
  }));
  multiCEGroups.filter(group =>
    group.law_id === legalSelectedLaw.id && legalTrainingArticleMatches(group.article_key, article)
  ).forEach(group => (group.statements || []).forEach(item => curated.push({
    kind: "ce",
    kindLabel: "Afirmação cadastrada",
    title: "Afirmação · " + article,
    prompt: item.prompt,
    answer: item.answer,
    explanation: item.explanation,
    sourceText: group.literal_text || articleText,
    sourceUrl: group.source_url || sourceUrl
  })));
  const seen = new Set();
  const unique = curated.filter(item => {
    const key = normalizeAnswer(item.prompt) + "|" + String(item.answer);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const generated = buildLegalFidelityCE(articleText, article, sourceUrl, unique.length ? 4 : 8);
  const items = [
    ...unique.slice(0, 12),
    ...generated,
    legalTrainingRecallItem(article, articleText, sourceUrl)
  ];
  startLegalTraining(items, "Treinamento do " + article);
}
async function startLegalSelectedDeviceTraining(deviceType) {
  await prepareLegalTrainingBanks();
  const components = legalSnapshot && legalSnapshot.components && legalSnapshot.components[legalSelectedArticle]
    ? legalSnapshot.components[legalSelectedArticle]
    : {};
  const selected = [...selectedLegalDevicePaths]
    .map(path => ({ path, component: components[path] }))
    .filter(entry => entry.component && entry.component.device_type === deviceType);
  if (!selected.length) return;
  const typeName = deviceType === "paragrafo" ? "parágrafo(s)" : "inciso(s)";
  const sourceUrl = legalSnapshot.source_url_used || legalSelectedLaw.url;
  const matchingGroups = multiCEGroups.filter(group =>
    group.law_id === legalSelectedLaw.id && group.article_key === legalSelectedArticle
  );
  const items = [];

  selected.forEach(({component}) => {
    const label = component.device_label || (deviceType === "paragrafo" ? "Parágrafo" : "Inciso");
    const normalizedDeviceText = normalizeLegalForMatch(component.text || "");

    // Só reaproveita afirmações do banco quando a frase de validação está dentro
    // do dispositivo selecionado, e não apenas em outra parte do artigo.
    const validatedStatements = [];
    matchingGroups.forEach(group => {
      (group.statements || []).forEach(statement => {
        const phrase = normalizeLegalForMatch(statement.validation_phrase || "");
        if (phrase && normalizedDeviceText.includes(phrase)) validatedStatements.push({group, statement});
      });
    });
    const seen = new Set();
    validatedStatements.forEach(({group, statement}) => {
      const key = normalizeAnswer(statement.prompt) + "|" + String(statement.answer);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        kind: "ce",
        kindLabel: "Afirmação validada",
        title: "Certo ou Errado · " + label,
        prompt: statement.prompt,
        answer: statement.answer,
        explanation: statement.explanation,
        sourceText: component.text,
        sourceUrl: group.source_url || sourceUrl
      });
    });

    // Também aproveita questões autorais que identificam expressamente este inciso/parágrafo.
    questionBank.filter(item => {
      if (!legalTrainingLawMatches(item, legalSelectedLaw)
        || !legalTrainingArticleMatches(item.article, legalSelectedArticle)) return false;
      const reference = normalizeAnswer(item.article || "");
      if (deviceType === "inciso") return reference.includes(normalizeAnswer(label));
      const number = (label.match(/\d+/) || [])[0];
      if (label.toLowerCase().includes("único")) return reference.includes("paragrafo unico");
      return Boolean(number && /§|par[aá]grafo/i.test(item.article || "") && reference.includes(number));
    }).forEach(item => {
      const key = normalizeAnswer(item.statement) + "|" + String(item.answer);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        kind: "ce",
        kindLabel: "Questão cadastrada",
        title: "Questão · " + label,
        prompt: item.statement,
        answer: item.answer,
        explanation: item.explanation,
        sourceText: component.text,
        sourceUrl: item.source_url || sourceUrl
      });
    });

    items.push(legalTrainingRecallItem(label, component.text, sourceUrl,
      "Sem consultar a lei, lembre o que estabelece " + label + ". Depois confira o texto literal."));
    items.push(...buildLegalFidelityCE(component.text, label, sourceUrl, seen.size ? 2 : 4));
    items.push(...buildLegalFactTrainingItems(component.text, label, sourceUrl));
  });
  startLegalTraining(items, "Treinamento dos " + typeName + " selecionados");
}
function startLegalFactTraining() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  const entry = legalEntries.find(([article]) => article === legalSelectedArticle);
  if (!entry) return;
  const [article, text] = entry;
  const sourceUrl = legalSnapshot.source_url_used || legalSelectedLaw.url;
  const items = buildLegalFactTrainingItems(text, article, sourceUrl);
  if (!items.length) {
    startLegalTraining([{
      kind: "notice",
      title: "Busca automática · " + article,
      kindLabel: "Aviso",
      prompt: "A busca automática não identificou expressões claras de prazo, requisito ou exceção neste artigo.",
      explanation: "Isso não significa que o dispositivo não contenha essas regras. O exercício procura expressões comuns no texto e pode não reconhecer construções diferentes. Confira a redação completa.",
      sourceUrl
    }], "Prazos, requisitos e exceções");
    return;
  }
  startLegalTraining(items, "Prazos, requisitos e exceções · " + article);
}
function trainSelectedLegalExcerpt() {
  const excerpt = selectedLegalExcerpt;
  if (!excerpt || !excerpt.text) return;
  const blanks = buildClozeForText(excerpt.text, "facil");
  selectedLegalExcerpt = null;
  $("#law-selection-toolbar").classList.add("hidden");
  const selection = window.getSelection && window.getSelection();
  if (selection && selection.rangeCount) selection.removeAllRanges();
  if (!blanks.length) {
    startLegalTraining([{
      kind: "notice",
      kindLabel: "Trecho curto",
      prompt: "O trecho selecionado é curto ou não contém palavras adequadas para criar lacunas.",
      explanation: "Selecione um trecho um pouco maior ou com palavras suficientes para montar o exercício.",
      sourceUrl: excerpt.sourceUrl
    }], "Completar o trecho selecionado");
    return;
  }
  startLegalTraining([{
    kind: "cloze",
    kindLabel: "Trecho selecionado",
    title: "Complete o trecho · " + excerpt.article,
    prompt: "Complete as palavras ocultadas no trecho que você selecionou.",
    text: excerpt.text,
    blanks,
    sourceUrl: excerpt.sourceUrl
  }], "Completar o trecho selecionado");
}
async function trainCurrentLegalArticle() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  if (!clozeLaws.length) await loadClozeLaws();
  const lawSelect = $("#cloze-law");
  lawSelect.value = legalSelectedLaw.id;
  $("#cloze-content-type").value = "artigo";
  await loadClozeSnapshot();
  const matchingEntry = clozeSnapshot && clozeSnapshot.entries.find(([article]) => article === legalSelectedArticle);
  if (!matchingEntry) {
    $("#cloze-note").textContent = "Este artigo não tem texto suficiente para gerar lacunas. Você pode continuar lendo a Lei Seca normalmente.";
    showView("cloze");
    return;
  }
  $("#cloze-article").value = legalSelectedArticle;
  $("#cloze-difficulty").value = "medio";
  showView("cloze");
  startCloze();
}


// -------------------- Completar Lei Seca --------------------
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
    clozeLaws.forEach(law => select.append(new Option(law.short_title || law.title, law.id)));
    if (!clozeLaws.length) throw new Error("Nenhuma norma está cadastrada.");
    await loadClozeSnapshot();
    renderClozeReviewOverview();
  } catch (error) {
    $("#cloze-note").textContent = "Não foi possível carregar as normas salvas. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function getClozeComponents(article,type) {
  const raw=clozeSnapshot?.snapshot?.components?.[article];
  if(!raw||typeof raw!=="object")return [];
  return Object.entries(raw).filter(([path,component])=>
    component && component.device_type===type && typeof component.text==="string" && component.text.trim().length>=18
  ).map(([path,component])=>({...component,device_path:component.device_path||path}));
}
function updateClozeArticleOptions() {
  if(!clozeSnapshot)return;
  const type=$("#cloze-content-type").value;
  const previous=$("#cloze-article").value||"aleatorio";
  const available=clozeSnapshot.entries.filter(([article])=>
    type==="artigo"||getClozeComponents(article,type).length>0
  );
  const select=$("#cloze-article");
  select.replaceChildren();
  select.append(new Option("Artigo aleatório","aleatorio"));
  available.forEach(([article])=>select.append(new Option(article,article)));
  select.disabled=available.length===0;
  select.value=available.some(([article])=>article===previous)?previous:"aleatorio";
  updateClozeDeviceOptions();
  $("#start-cloze").disabled=available.length===0;
  if(!available.length) {
    const label=type==="inciso"?"incisos":"parágrafos";
    $("#cloze-note").textContent="Não foram encontrados "+label+" separados nesta norma. Escolha outra norma ou treine o artigo completo.";
  } else if(type!=="artigo") {
    const label=type==="inciso"?"incisos":"parágrafos";
    $("#cloze-note").textContent=available.length+" artigos possuem "+label+" identificados. Escolha um artigo e, opcionalmente, um dispositivo específico.";
  } else {
    $("#cloze-note").textContent=available.length+" artigos disponíveis nesta norma. Fonte consultada em "+formatDate(clozeSnapshot.snapshot.captured_at)+".";
  }
}
function updateClozeDeviceOptions() {
  const type=$("#cloze-content-type").value;
  const control=$("#cloze-device-control");
  const select=$("#cloze-device");
  const article=$("#cloze-article").value;
  control.hidden=type==="artigo";
  if(type==="artigo") {
    select.replaceChildren(new Option("Não se aplica",""));
    select.disabled=true;
    return;
  }
  const label=type==="inciso"?"inciso":"parágrafo";
  if(article==="aleatorio") {
    select.replaceChildren(new Option("Qualquer "+label+" do artigo sorteado","aleatorio"));
    select.disabled=true;
    return;
  }
  const devices=getClozeComponents(article,type);
  select.replaceChildren(new Option("Qualquer "+label+" deste artigo","aleatorio"));
  devices.forEach(device=>select.append(new Option(device.device_label||device.device_path,device.device_path)));
  select.disabled=devices.length===0;
}
async function loadClozeSnapshot() {
  const law=clozeLaws.find(item=>item.id===$("#cloze-law").value)||clozeLaws[0];
  if(!law)return;
  $("#cloze-note").textContent="Carregando artigos de "+(law.short_title||law.title)+"...";
  $("#start-cloze").disabled=true;
  clozeSnapshot=null;
  try {
    const response=await fetch("data/snapshots/"+encodeURIComponent(law.id)+".json?v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const snapshot=await response.json();
    const articles=snapshot.articles&&typeof snapshot.articles==="object"?snapshot.articles:{};
    const entries=Object.entries(articles).filter(([_,text])=>typeof text==="string"&&text.trim().length>=45);
    clozeSnapshot={law,entries,snapshot};
    updateClozeArticleOptions();
    if(!entries.length) {
      $("#cloze-note").textContent="Esta norma não possui artigos separados com texto suficiente para este exercício.";
      $("#start-cloze").disabled=true;
    }
  } catch(error) {
    $("#cloze-note").textContent="Não foi possível carregar a captura dessa norma. A verificação pode não ter sido concluída.";
    $("#cloze-article").disabled=true;$("#cloze-device").disabled=true;$("#start-cloze").disabled=true;
    console.error(error);
  }
}
const CLOZE_COMMON_WORDS=new Set([
  "para","pela","pelo","pelas","pelos","sobre","entre","desde","quando","onde","como","mais","menos",
  "esta","este","essas","esses","isso","isto","aquele","aquela","tambem","ainda","assim","sendo",
  "serao","seria","foram","ser","sua","suas","seu","seus","que","com","sem","nos","nas","dos","das",
  "uma","umas","uns","por","sob","aos","aquelas","aqueles","cada","todo","toda","todos","todas",
  "qual","quais","cujo","cuja","cujos","cujas","art","artigo","inciso","paragrafo","caput"
]);
const CLOZE_LEGAL_KEYWORDS=new Set([
  "nao","vedado","vedada","proibido","proibida","salvo","exceto","mediante","independentemente",
  "obrigatorio","obrigatoria","facultativo","facultativa","exclusivamente","somente","apenas",
  "segurado","beneficio","beneficios","contribuicao","carencia","salario","incapacidade",
  "aposentadoria","dependente","dependentes","requisito","requisitos","prazo","dias","meses",
  "anos","imediatamente","anteriormente","posteriormente","remuneracao","qualidade","inscricao"
]);
function clozeTokenScore(value,numeric) {
  const normalized=normalizeAnswer(value);
  if(numeric)return 5;
  if(CLOZE_LEGAL_KEYWORDS.has(normalized))return 6;
  if(value.length>=11)return 4;
  if(value.length>=8)return 3;
  if(value.length>=5)return 2;
  return 1;
}
function buildClozeForText(text,difficulty) {
  if(difficulty==="dificil")return buildClozePassageBlanks(text);
  const tokenRegex=/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[-'][A-Za-zÀ-ÖØ-öø-ÿ]+)*|\d+(?:[.,]\d+)?/gu;
  const tokens=[];
  let match;
  while((match=tokenRegex.exec(text))!==null) {
    const value=match[0],normalized=normalizeAnswer(value),numeric=/^\d/.test(value);
    const isHeader=match.index<16&&(/^(?:art|artigo)$/i.test(value)||numeric);
    const meaningful=numeric||CLOZE_LEGAL_KEYWORDS.has(normalized)||(value.length>=5&&!CLOZE_COMMON_WORDS.has(normalized));
    if(!isHeader&&meaningful)tokens.push({
      start:match.index,end:match.index+value.length,value,
      score:clozeTokenScore(value,numeric),
      hint:numeric?"Quantidade de algarismos: "+value.length:"Começa com “"+value[0].toLocaleLowerCase("pt-BR")+"” · "+[...value].length+" letras"
    });
  }
  const amount=difficulty==="facil"?4:7;
  const ranked=shuffle(tokens).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,Math.min(amount,ranked.length)).sort((a,b)=>a.start-b.start)
    .map(item=>({...item,type:"word",hint:difficulty==="facil"?item.hint:""}));
}
function buildClozePassageBlanks(text) {
  const candidates=[];
  const pattern=/[^;.!?]+[;.!?]?/g;
  let match;
  while((match=pattern.exec(text))!==null) {
    const raw=match[0],trimmed=raw.trim(),left=raw.indexOf(trimmed);
    const words=trimmed.split(/\s+/).filter(Boolean);
    if(trimmed.length>=45&&words.length>=7)
      candidates.push({start:match.index+left,end:match.index+left+trimmed.length,value:trimmed,type:"segment"});
  }
  if(candidates.length<2) {
    const commaCandidates=[];
    const commaPattern=/[^,;.!?]+[,;!?]?/g;
    while((match=commaPattern.exec(text))!==null) {
      const raw=match[0],trimmed=raw.trim(),left=raw.indexOf(trimmed);
      const words=trimmed.split(/\s+/).filter(Boolean);
      if(trimmed.length>=45&&words.length>=7) {
        commaCandidates.push({start:match.index+left,end:match.index+left+trimmed.length,value:trimmed,type:"segment"});
      }
    }
    if(commaCandidates.length>=2)candidates.splice(0,candidates.length,...commaCandidates);
  }
  const amount=candidates.length>=3?3:Math.min(2,candidates.length);
  return shuffle(candidates).slice(0,amount).sort((a,b)=>a.start-b.start);
}
function renderClozeText(text,blanks,difficulty) {
  const container=$("#cloze-text");
  container.replaceChildren();
  const fragment=document.createDocumentFragment();
  let cursor=0;
  blanks.forEach((blank,index)=>{
    fragment.append(document.createTextNode(text.slice(cursor,blank.start)));
    const slot=document.createElement("span");
    slot.className="cloze-slot";
    const input=blank.type==="segment"?document.createElement("textarea"):document.createElement("input");
    input.className="cloze-input"+(blank.type==="segment"?" cloze-segment-input":"");
    input.dataset.index=String(index);
    input.autocomplete="off";input.autocapitalize="none";input.spellcheck=false;
    input.setAttribute("aria-label",blank.type==="segment"?"Trecho inteiro ocultado "+(index+1):"Lacuna "+(index+1));
    input.placeholder=blank.type==="segment"?"Digite o trecho inteiro ocultado":"____";
    if(blank.type==="segment") {
      input.rows=Math.min(7,Math.max(3,Math.ceil(blank.value.length/72)));
      slot.classList.add("cloze-segment-slot");
    } else {
      input.type="text";
      input.style.width=Math.max(4.5,Math.min(15,blank.value.length*.78))+"ch";
    }
    const correction=document.createElement("span");
    correction.className="cloze-correction hidden";
    slot.append(input,correction);
    if(blank.hint&&difficulty==="facil") {
      const hint=document.createElement("small");
      hint.className="cloze-hint";hint.textContent="Pista: "+blank.hint;slot.append(hint);
    }
    fragment.append(slot);
    cursor=blank.end;
  });
  fragment.append(document.createTextNode(text.slice(cursor)));
  container.append(fragment);
}
function renderClozeExercise(current,difficulty,customBlanks=null) {
  clozeCurrent=current;
  clozeBlanks=customBlanks||buildClozeForText(current.text,difficulty);
  clozeAnswered=0;
  $("#next-cloze").textContent=current.sourceType==="review"?"Próxima revisão →":"Outro trecho ↻";
  $("#cloze-source").href=current.source_url||clozeSnapshot?.snapshot?.source_url_used||clozeSnapshot?.law?.url||"#";
  $("#cloze-law-label").textContent=current.law_title||clozeSnapshot?.law?.short_title||clozeSnapshot?.law?.title||"Lei Seca";
  $("#cloze-article-label").textContent=[current.article,current.device_label].filter(Boolean).join(" · ");
  $("#cloze-original-text").textContent=current.fullText||current.text;
  $("#cloze-original").querySelector("summary").textContent="Mostrar texto original para conferência";
  $("#cloze-original").open=false;
  $("#cloze-feedback").classList.add("hidden");
  $("#check-cloze").classList.remove("hidden");
  $("#next-cloze").classList.add("hidden");
  $("#cloze-progress").textContent=clozeBlanks.length+(clozeBlanks.length===1?" lacuna":" lacunas");
  if(!clozeBlanks.length) {
    $("#cloze-note").textContent="O conteúdo escolhido é curto demais para gerar lacunas úteis. Escolha outro artigo ou dispositivo.";
    $("#cloze-card").classList.add("hidden");$("#cloze-welcome").classList.remove("hidden");
    return false;
  }
  renderClozeText(current.text,clozeBlanks,difficulty);
  $("#cloze-welcome").classList.add("hidden");$("#cloze-card").classList.remove("hidden");
  selectedClozeText="";
  $("#cloze-selection-toolbar").classList.add("hidden");
  return true;
}
function startCloze() {
  if(!clozeSnapshot||!clozeSnapshot.entries.length)return;
  const mode=$("#cloze-content-type").value;
  const selected=$("#cloze-article").value;
  const available=clozeSnapshot.entries.filter(([article])=>mode==="artigo"||getClozeComponents(article,mode).length>0);
  if(!available.length)return;
  const entry=selected==="aleatorio"?available[Math.floor(Math.random()*available.length)]:available.find(([article])=>article===selected);
  if(!entry)return;
  const [article,articleText]=entry;
  let text=articleText,deviceLabel="";
  if(mode!=="artigo") {
    const devices=getClozeComponents(article,mode);
    if(!devices.length) {
      $("#cloze-note").textContent="Este artigo não possui "+(mode==="inciso"?"incisos":"parágrafos")+" identificados com segurança.";
      return;
    }
    const chosenPath=$("#cloze-device").value;
    const device=chosenPath&&chosenPath!=="aleatorio"?devices.find(item=>item.device_path===chosenPath):shuffle(devices)[0];
    if(!device)return;
    text=device.text;deviceLabel=device.device_label||mode;
  }
  const source=clozeSnapshot.snapshot.source_url_used||clozeSnapshot.law.url||"";
  renderClozeExercise({
    article,text,fullText:articleText,sourceType:"catalog",
    law_id:clozeSnapshot.law.id,law_title:clozeSnapshot.law.short_title||clozeSnapshot.law.title,
    source_url:source,device_label:deviceLabel
  },$("#cloze-difficulty").value);
}
function loadClozeReviewQueue() {
  try {
    const value=JSON.parse(localStorage.getItem(CLOZE_REVIEW_KEY)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  } catch(_) { return {}; }
}
function saveClozeReviewQueue(queue) {
  try {localStorage.setItem(CLOZE_REVIEW_KEY,JSON.stringify(queue));}
  catch(error){console.warn("Não foi possível salvar os erros de Lei Seca:",error);$("#cloze-review-note").textContent="O navegador não permitiu salvar a revisão. Confira as permissões de armazenamento.";}
}
function clozeReviewPending() {
  return Object.values(loadClozeReviewQueue()).filter(item=>item&&item.status==="pending"&&item.blank&&item.text);
}
function renderClozeReviewOverview() {
  const queue=Object.values(loadClozeReviewQueue());
  const pending=queue.filter(item=>item&&item.status==="pending"&&item.blank);
  const now=Date.now();
  const due=pending.filter(item=>!item.next_due||new Date(item.next_due).getTime()<=now);
  const mastered=queue.filter(item=>item&&item.status==="mastered").length;
  $("#cloze-review-due").textContent=String(due.length);
  $("#cloze-review-pending").textContent=String(pending.length);
  $("#cloze-review-mastered").textContent=String(mastered);
  const button=$("#cloze-review-start");
  button.disabled=due.length===0;
  button.textContent=due.length?"Revisar erros ("+due.length+")":"Nenhum erro vencido";
  const note=$("#cloze-review-note");
  if(!pending.length)note.textContent="Os trechos em que você errar serão guardados aqui automaticamente.";
  else if(due.length)note.textContent=due.length+" erro(s) pronto(s) para revisar. Os itens que você acertar três vezes deixam a fila ativa.";
  else {
    const next=pending.map(item=>new Date(item.next_due).getTime()).filter(Number.isFinite);
    note.textContent=pending.length+" erro(s) em acompanhamento. Próxima revisão: "+(next.length?formatDate(new Date(Math.min(...next)).toISOString()):"aguardando");
  }
}
function recordClozeReviewError(current,blank,response) {
  const queue=loadClozeReviewQueue();
  const id=[current.law_id||"norma",current.article||"artigo",current.device_label||"",blank.start,normalizeAnswer(blank.value)].join("::");
  const previous=queue[id]||{};
  const now=Date.now();
  queue[id]={
    id,law_id:current.law_id||"",law_title:current.law_title||"Lei Seca",
    article:current.article||"",device_label:current.device_label||"",
    text:current.text,fullText:current.fullText||current.text,
    source_url:current.source_url||"",blank:{...blank},
    error_count:(Number(previous.error_count)||0)+1,correct_reviews:0,
    last_wrong_response:String(response||"").slice(0,500),
    first_error_at:previous.first_error_at||new Date(now).toISOString(),
    last_error_at:new Date(now).toISOString(),next_due:new Date(now).toISOString(),status:"pending"
  };
  saveClozeReviewQueue(queue);renderClozeReviewOverview();
  return id;
}
function recordClozeReviewSuccess(id) {
  const queue=loadClozeReviewQueue(),item=queue[id];
  if(!item||item.status!=="pending")return;
  const correct=(Number(item.correct_reviews)||0)+1,mastered=correct>=3,interval=correct===1?1:3,now=Date.now();
  queue[id]={...item,correct_reviews:correct,last_correct_at:new Date(now).toISOString(),
    next_due:mastered?null:new Date(now+interval*24*60*60*1000).toISOString(),status:mastered?"mastered":"pending"};
  saveClozeReviewQueue(queue);renderClozeReviewOverview();
}
function startClozeReviewSession() {
  clozeReviewSessionSeen=new Set();
  nextClozeReviewItem();
}
function nextClozeReviewItem() {
  const now=Date.now();
  const next=clozeReviewPending().filter(item=>
    !clozeReviewSessionSeen.has(item.id)&&(!item.next_due||new Date(item.next_due).getTime()<=now)
  ).sort((a,b)=>new Date(a.next_due||0)-new Date(b.next_due||0))[0];
  if(!next) {
    $("#cloze-card").classList.add("hidden");$("#cloze-welcome").classList.remove("hidden");
    $("#cloze-note").textContent="Revisão encerrada por enquanto. Os erros que ainda precisam de reforço permanecem salvos para a próxima sessão.";
    clozeCurrent=null;clozeBlanks=[];renderClozeReviewOverview();
    return;
  }
  clozeReviewSessionSeen.add(next.id);
  renderClozeExercise({
    article:next.article,text:next.text,fullText:next.fullText||next.text,sourceType:"review",
    review_id:next.id,law_id:next.law_id,law_title:next.law_title,
    source_url:next.source_url,device_label:next.device_label
  },"dificil",[next.blank]);
  $("#cloze-note").textContent="Central de revisão · responda novamente ao trecho que você errou.";
}
function startClozeFromSelectedText() {
  const selected=String(selectedClozeText||"").trim();
  if(!clozeCurrent||selected.length<15) {
    $("#cloze-selection-help").textContent="Selecione primeiro um trecho com pelo menos 15 caracteres no texto original.";
    return;
  }
  const current={...clozeCurrent,text:selected,fullText:clozeCurrent.fullText||clozeCurrent.text,
    sourceType:"manual-selection",device_label:"Trecho selecionado"};
  renderClozeExercise(current,$("#cloze-difficulty").value);
  $("#cloze-note").textContent="Treinando somente o trecho que você selecionou. A fonte oficial continua disponível abaixo.";
}
function updateClozeSelectionToolbar() {
  const original=$("#cloze-original-text"),selection=window.getSelection();
  if(!original||!selection||selection.isCollapsed) {
    selectedClozeText="";$("#cloze-selection-toolbar").classList.add("hidden");return;
  }
  const range=selection.getRangeAt(0);
  if(!original.contains(range.startContainer)||!original.contains(range.endContainer)) {
    selectedClozeText="";$("#cloze-selection-toolbar").classList.add("hidden");return;
  }
  const text=selection.toString().trim();
  if(text.length<15) {
    selectedClozeText="";$("#cloze-selection-toolbar").classList.add("hidden");return;
  }
  selectedClozeText=text;
  $("#cloze-selection-preview").textContent=text.length>180?text.slice(0,180)+"…":text;
  $("#cloze-selection-toolbar").classList.remove("hidden");
}
function checkCloze() {
  if(!clozeCurrent||!clozeBlanks.length)return;
  const inputs=[...$("#cloze-text").querySelectorAll(".cloze-input")];
  let correct=0,errors=0;
  inputs.forEach(input=>{
    const index=Number(input.dataset.index),blank=clozeBlanks[index],response=input.value||"";
    const isCorrect=normalizeAnswer(response)===normalizeAnswer(blank.value);
    if(isCorrect)correct++;else errors++;
    input.disabled=true;input.classList.toggle("correct",isCorrect);input.classList.toggle("incorrect",!isCorrect);
    const correction=input.nextElementSibling;
    if(!isCorrect&&correction){correction.textContent="→ "+blank.value;correction.classList.remove("hidden");}
    if(clozeCurrent.sourceType==="review") {
      if(isCorrect)recordClozeReviewSuccess(clozeCurrent.review_id);
      else recordClozeReviewError(clozeCurrent,blank,response);
    } else if(!isCorrect)recordClozeReviewError(clozeCurrent,blank,response);
  });
  const reviewMode=clozeCurrent.sourceType==="review";
  if(reviewMode)$("#cloze-feedback").textContent=errors?"Você ainda precisa reforçar este trecho. Ele continuará na Central de revisão.":"Você acertou! O intervalo para rever este trecho foi atualizado.";
  else $("#cloze-feedback").textContent=correct+" de "+clozeBlanks.length+" lacuna(s) correta(s)."
    +(errors?" "+errors+" erro(s) foram guardados para revisão posterior.":" Nenhum erro neste trecho.");
  $("#cloze-feedback").className="cloze-feedback "+(errors?"has-errors":"all-correct");
  $("#cloze-feedback").classList.remove("hidden");
  $("#check-cloze").classList.add("hidden");$("#next-cloze").classList.remove("hidden");
  $("#next-cloze").textContent=reviewMode?"Próximo erro para revisar →":"Outro trecho ↻";
  $("#cloze-progress").textContent=correct+" de "+clozeBlanks.length+" acerto(s)";
  if(reviewMode)renderClozeReviewOverview();
}
// -------------------- Modo de jogo Encontre o erro --------------------
function normalizeLegalForMatch(value) {
  return normalizeAnswer(value)
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function findErrorTypeLabel(type) {
  return ({prazo:"Prazos",percentual:"Percentuais e frações",requisito:"Requisitos",excecao:"Exceções"})[type] || "Requisitos";
}

function renderFindErrorLegalHighlight(element, source, phrase) {
  const original=String(source||"");
  const target=normalizeLegalForMatch(phrase);
  let normalized="",positions=[],pendingSpace=null;
  for(let i=0;i<original.length;){
    const cp=String.fromCodePoint(original.codePointAt(i));
    const decomposed=cp.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
    for(const char of decomposed){
      if(/[\p{L}\p{N}%]/u.test(char)){
        if(pendingSpace!==null&&normalized.length){normalized+=" ";positions.push(pendingSpace);}
        pendingSpace=null;normalized+=char;positions.push(i);
      }else if(normalized.length&&pendingSpace===null){pendingSpace=i;}
    }
    i+=cp.length;
  }
  const found=target?normalized.indexOf(target):-1;
  if(found<0){element.textContent=original;return false;}
  const start=positions[found],last=positions[found+target.length-1];
  if(start===undefined||last===undefined){element.textContent=original;return false;}
  const end=last+String.fromCodePoint(original.codePointAt(last)).length;
  element.replaceChildren();
  if(start>0)element.append(document.createTextNode(original.slice(0,start)));
  const mark=document.createElement("mark");
  mark.className="error-correct-highlight";
  mark.textContent=original.slice(start,end);
  element.append(mark);
  if(end<original.length)element.append(document.createTextNode(original.slice(end)));
  return true;
}
function renderFindErrorWrongHighlight(button, source) {
  const value = String(source || "");
  const leading = (value.match(/^\s*/) || [""])[0];
  const trailing = (value.match(/\s*$/) || [""])[0];
  const phrase = value.slice(leading.length, Math.max(leading.length, value.length - trailing.length));
  button.replaceChildren();
  if (leading) button.append(document.createTextNode(leading));
  if (phrase) {
    const mark = document.createElement("mark");
    mark.className = "error-wrong-highlight";
    mark.textContent = phrase;
    button.append(mark);
  }
  if (trailing) button.append(document.createTextNode(trailing));
  button.setAttribute("aria-label", "Expressão incorreta destacada: " + phrase);
}
async function loadFindErrorBank() {
  const note=$("#error-count-note");
  try {
    const response=await fetch(ERROR_BANK_URL+"?v="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json(),bankItems=Array.isArray(data.items)?data.items:[];
    const ids=[...new Set(bankItems.map(item=>item.law_id))];
    const pairs=await Promise.all(ids.map(async id=>{
      try {
        const result=await fetch("data/snapshots/"+encodeURIComponent(id)+".json?v="+Date.now(),{cache:"no-store"});
        if(!result.ok)throw new Error("HTTP "+result.status);
        return [id,await result.json()];
      } catch(error){console.warn("Snapshot indisponível para Encontre o erro:",id,error);return [id,null];}
    }));
    const snapshots=Object.fromEntries(pairs);let newest=0;findErrorSuspendedCount=0;
    findErrorItems=bankItems.filter(item=>{
      const snapshot=snapshots[item.law_id],text=snapshot&&snapshot.articles&&snapshot.articles[item.article_key];
      const valid=Array.isArray(item.segments)&&item.segments.length>=3&&Number.isInteger(item.wrong_segment_index)
        &&item.wrong_segment_index>=0&&item.wrong_segment_index<item.segments.length
        &&item.segments.every(part=>typeof part==="string")
        &&["prazo","percentual","requisito","excecao"].includes(item.question_type);
      if(!text||!valid){findErrorSuspendedCount++;return false;}
      const expected=normalizeLegalForMatch(item.correct_phrase),current=normalizeLegalForMatch(text);
      if(!expected||!current.includes(expected)){findErrorSuspendedCount++;return false;}
      item.literal_text=text;item.snapshot_captured_at=snapshot.captured_at||null;
      const time=snapshot.captured_at?new Date(snapshot.captured_at).getTime():0;
      if(Number.isFinite(time))newest=Math.max(newest,time);
      return true;
    });
    const category=$("#error-category"),previous=category.value||"todas";category.replaceChildren();
    const all=document.createElement("option");all.value="todas";all.textContent="Todas as matérias";category.append(all);
    [...new Set(findErrorItems.map(item=>item.category))].sort((a,b)=>a.localeCompare(b,"pt-BR")).forEach(value=>{
      const option=document.createElement("option");option.value=value;option.textContent=value;category.append(option);
    });
    if([...category.options].some(option=>option.value===previous))category.value=previous;
    findErrorCaptureNote=newest?" Capturas conferidas até "+formatDate(new Date(newest).toISOString())+".":"";
    updateFindErrorFilters();renderFindErrorReviewOverview();
  } catch(error){
    findErrorItems=[];$("#start-error").disabled=true;
    note.textContent="Não foi possível carregar o banco ou conferir os textos legais. Recarregue o site e tente novamente.";
    renderFindErrorReviewOverview();console.error(error);
  }
}
function selectedFindErrorPool(){
  const category=$("#error-category").value,type=$("#error-type").value;
  return findErrorItems.filter(item=>(category==="todas"||item.category===category)&&(type==="todas"||item.question_type===type));
}
function updateFindErrorFilters(){
  const pool=selectedFindErrorPool();$("#start-error").disabled=pool.length===0;
  const counts=["prazo","percentual","requisito","excecao"].map(type=>pool.filter(item=>item.question_type===type).length);
  const summary=counts.map((n,i)=>["prazos","percentuais/frações","requisitos","exceções"][i]+": "+n).join(" · ");
  const note=$("#error-count-note");
  note.textContent=pool.length+" item(ns) nesta seleção. "+summary+"."+findErrorCaptureNote
    +(findErrorSuspendedCount?" "+findErrorSuspendedCount+" item(ns) suspensos por incompatibilidade com o texto legal atual.":" Todos os itens disponíveis passaram pela conferência da redação correta.");
  if(!findErrorItems.length)note.textContent+=" Faça uma nova verificação das normas e tente novamente.";
}
function loadFindErrorReviewQueue(){
  try{const value=JSON.parse(localStorage.getItem(ERROR_REVIEW_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
  catch(_){return {};}
}
function saveFindErrorReviewQueue(queue){
  try{localStorage.setItem(ERROR_REVIEW_KEY,JSON.stringify(queue));}
  catch(error){console.warn("Não foi possível salvar a revisão Encontre o erro:",error);const note=$("#error-review-note");if(note)note.textContent="O navegador não permitiu salvar os erros. Confira as permissões de armazenamento.";}
}
function findErrorReviewPendingEntries(){
  return Object.values(loadFindErrorReviewQueue()).filter(entry=>entry&&entry.status!=="mastered"&&entry.item&&entry.item.id);
}
function recordFindErrorReviewMiss(item,wrongIndex,reviewMode){
  const queue=loadFindErrorReviewQueue(),old=queue[item.id]||{},now=Date.now();
  queue[item.id]={item:JSON.parse(JSON.stringify(item)),misses:(Number(old.misses)||0)+1,correct_reviews:0,
    first_missed_at:old.first_missed_at||new Date(now).toISOString(),last_missed_at:new Date(now).toISOString(),
    last_wrong_segment:String(item.segments[wrongIndex]||"").trim().slice(0,400),
    next_due:new Date(now+(reviewMode?10*60*1000:0)).toISOString(),status:"pending"};
  saveFindErrorReviewQueue(queue);renderFindErrorReviewOverview();
}
function recordFindErrorReviewSuccess(item){
  const queue=loadFindErrorReviewQueue(),old=queue[item.id];if(!old||old.status==="mastered")return;
  const now=Date.now(),correct=(Number(old.correct_reviews)||0)+1,mastered=correct>=3,days=correct===1?1:3;
  queue[item.id]={...old,item:JSON.parse(JSON.stringify(item)),correct_reviews:correct,last_correct_at:new Date(now).toISOString(),
    next_due:mastered?null:new Date(now+days*86400000).toISOString(),status:mastered?"mastered":"pending"};
  saveFindErrorReviewQueue(queue);renderFindErrorReviewOverview();
}
function renderFindErrorReviewOverview(){
  const all=Object.values(loadFindErrorReviewQueue()),pending=all.filter(e=>e&&e.status!=="mastered"&&e.item);
  const due=pending.filter(e=>{const t=new Date(e.next_due||0).getTime();return !Number.isFinite(t)||t<=Date.now();});
  const live=new Set(findErrorItems.map(item=>item.id)),ready=due.filter(e=>live.has(e.item.id)),suspended=due.length-ready.length;
  const mastered=all.filter(e=>e&&e.status==="mastered").length;
  const dueNode=$("#error-review-due"),pendingNode=$("#error-review-pending"),masteredNode=$("#error-review-mastered");
  const button=$("#error-review-start"),note=$("#error-review-note");
  if(!dueNode||!pendingNode||!masteredNode||!button||!note)return;
  dueNode.textContent=String(due.length);pendingNode.textContent=String(pending.length);masteredNode.textContent=String(mastered);
  button.disabled=ready.length===0;button.textContent=ready.length?"Revisar agora ("+ready.length+")":"Nenhum erro disponível para revisar";
  if(!pending.length)note.textContent="Os trechos que você selecionar incorretamente serão guardados aqui automaticamente.";
  else if(ready.length)note.textContent=ready.length+" erro(s) disponível(is) para revisar. Três acertos em revisões espaçadas retiram o item da fila ativa."
    +(suspended?" Outros "+suspended+" item(ns) aguardam atualização porque a redação correta não aparece na captura atual.":"");
  else if(suspended)note.textContent=suspended+" erro(s) estão guardados, mas foram suspensos porque a redação correta não aparece no snapshot atual da legislação.";
  else{const dates=pending.map(e=>new Date(e.next_due||0).getTime()).filter(Number.isFinite);note.textContent=pending.length+" erro(s) em acompanhamento. Próxima revisão: "+(dates.length?formatDate(new Date(Math.min(...dates)).toISOString()):"aguardando");}
}
function startFindErrorReviewSession(){
  const due=findErrorReviewPendingEntries().filter(e=>{const t=new Date(e.next_due||0).getTime();return !Number.isFinite(t)||t<=Date.now();});
  const current=new Map(findErrorItems.map(item=>[item.id,item])),ready=due.map(e=>current.get(e.item.id)).filter(Boolean);
  if(!ready.length){renderFindErrorReviewOverview();$("#error-review-note").textContent=due.length?"Os erros estão salvos, mas suas questões foram suspensas porque a redação correta não aparece na captura legal atual.":"Ainda não há erros vencidos para revisar.";return;}
  showView("find-error");startFindErrorGame(ready,{reviewMode:true});
}
function startFindErrorGame(onlyItems=null,options={}){
  const pool=onlyItems||selectedFindErrorPool();if(!pool.length){$("#error-count-note").textContent="Não há itens disponíveis para essa seleção.";return;}
  const size=onlyItems?pool.length:($("#error-length").value==="todas"?pool.length:Number($("#error-length").value));
  findErrorState={questions:shuffle(pool).slice(0,Math.min(size,pool.length)),index:0,answers:[],tries:0,resolved:false,reviewMode:Boolean(options.reviewMode),reviewFailed:false};
  $("#error-welcome").classList.add("hidden");$("#error-summary").classList.add("hidden");$("#error-card").classList.remove("hidden");showFindErrorQuestion();
}
function showFindErrorQuestion(){
  const item=findErrorState.questions[findErrorState.index];if(!item)return;
  findErrorState.tries=0;findErrorState.resolved=false;findErrorState.reviewFailed=false;
  $("#error-category-label").textContent=item.category;$("#error-type-label").textContent=findErrorTypeLabel(item.question_type);
  $("#error-progress").textContent="Questão "+(findErrorState.index+1)+" de "+findErrorState.questions.length;
  $("#error-law").textContent=item.law_title;$("#error-article").textContent=item.article;
  const statement=$("#error-statement");statement.replaceChildren();
  item.segments.forEach((part,index)=>{
    const button=document.createElement("button");button.type="button";button.className="error-segment";button.textContent=part;
    button.setAttribute("aria-label","Trecho "+(index+1)+": "+part.trim());
    button.addEventListener("click",()=>chooseFindErrorSegment(index,button));statement.append(button);
  });
  $("#error-attempt-feedback").textContent="Toque na expressão que contraria a lei.";
  $("#error-attempt-feedback").classList.remove("hidden");$("#error-solution").classList.add("hidden");
  $("#error-wrong-phrase").textContent="";$("#error-correct-phrase").textContent="";$("#error-literal").textContent="";
}
function chooseFindErrorSegment(index,button){
  if(findErrorState.resolved||button.disabled)return;
  const item=findErrorState.questions[findErrorState.index];findErrorState.tries++;
  if(index!==item.wrong_segment_index){
    button.disabled=true;button.classList.add("is-tried");
    if(!findErrorState.reviewFailed){recordFindErrorReviewMiss(item,index,findErrorState.reviewMode);findErrorState.reviewFailed=true;}
    $("#error-attempt-feedback").textContent="Esse trecho está de acordo com o dispositivo. Tente outro.";return;
  }
  findErrorState.resolved=true;findErrorState.answers.push({item,attempts:findErrorState.tries});
  if(findErrorState.reviewMode&&!findErrorState.reviewFailed)recordFindErrorReviewSuccess(item);
  $("#error-statement").querySelectorAll(".error-segment").forEach((segment,i)=>{segment.disabled=true;if(i===index)renderFindErrorWrongHighlight(segment,item.segments[i]);});
  $("#error-attempt-feedback").classList.add("hidden");
  $("#error-result").textContent=findErrorState.tries===1?"Erro encontrado de primeira! ✓":"Você encontrou o erro! ✓";
  $("#error-result").className="feedback-result correct";
  $("#error-wrong-phrase").textContent=item.segments[index].trim();$("#error-correct-phrase").textContent=item.correct_phrase;
  $("#error-explanation").textContent=item.explanation;
  renderFindErrorLegalHighlight($("#error-literal"),item.literal_text,item.correct_phrase);
  $("#error-source").href=item.source_url;$("#error-solution").classList.remove("hidden");
  $("#next-error-question").textContent=findErrorState.index===findErrorState.questions.length-1?"Ver resultado →":"Próxima questão →";
  renderFindErrorReviewOverview();
}
function nextFindErrorQuestion(){
  if(findErrorState.index>=findErrorState.questions.length-1){showFindErrorSummary();return;}
  findErrorState.index++;showFindErrorQuestion();
}
function showFindErrorSummary(){
  $("#error-card").classList.add("hidden");$("#error-summary").classList.remove("hidden");
  const total=findErrorState.questions.length,first=findErrorState.answers.filter(a=>a.attempts===1).length,percent=total?Math.round(first/total*100):0;
  $("#error-score").textContent=first+" de "+total+" na primeira tentativa";
  $("#error-score-note").textContent=(findErrorState.reviewMode?"Revisão espaçada · ":"Precisão inicial · ")+percent+"%. "
    +(findErrorState.reviewMode?"Os erros que ainda causaram dúvida permanecem na fila e poderão ser revistos novamente."
      :(first===total?"Excelente! Você identificou todos os erros de primeira.":"Os trechos escolhidos incorretamente foram enviados à Central de revisão."));
  const repeated=findErrorState.answers.filter(a=>a.attempts>1),list=$("#error-mistakes");list.replaceChildren();
  if(!repeated.length)list.textContent="Você encontrou todos os erros na primeira tentativa.";
  else{
    const heading=document.createElement("h3");heading.textContent="Trechos para revisar";
    const rows=document.createElement("div");rows.className="mistake-list";
    repeated.forEach(answer=>{const row=document.createElement("div"),title=document.createElement("strong"),detail=document.createElement("span");
      row.className="mistake-row";title.textContent=answer.item.law_title+" · "+answer.item.article;detail.textContent="Tentativas até encontrar o erro: "+answer.attempts;
      row.append(title,detail);rows.append(row);});
    list.append(heading,rows);
  }
  $("#error-retry-misses").classList.toggle("hidden",repeated.length===0);renderFindErrorReviewOverview();
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
    const previousCategory = categorySelect.value || "todas";
    categorySelect.replaceChildren();
    categorySelect.append(new Option("Todas as matérias", "todas"));
    [...new Set(articleQuestions.map(item => item.category))]
      .sort((a,b) => a.localeCompare(b, "pt-BR"))
      .forEach(category => categorySelect.append(new Option(category, category)));
    if ([...categorySelect.options].some(option => option.value === previousCategory)) categorySelect.value = previousCategory;

    const lawSelect = $("#article-law-filter");
    const previousLaw = lawSelect.value || "todas";
    lawSelect.replaceChildren();
    lawSelect.append(new Option("Todas as normas", "todas"));
    [...new Map(articleQuestions.map(item => [item.law_id, item.law_title])).entries()]
      .sort((a,b) => a[1].localeCompare(b[1], "pt-BR"))
      .forEach(([id, title]) => lawSelect.append(new Option(title, id)));
    if ([...lawSelect.options].some(option => option.value === previousLaw)) lawSelect.value = previousLaw;
    articleCaptureNote = newestCapture ? " Capturas conferidas até " + formatDate(new Date(newestCapture).toISOString()) + "." : "";
    articleSuspendedCount = suspended;
    updateArticleGameFilters();
    renderArticleReviewOverview();
  } catch (error) {
    articleQuestions = [];
    $("#start-article").disabled = true;
    note.textContent = "Não foi possível carregar o banco ou conferir as capturas da legislação. Recarregue o site e tente novamente.";
    renderArticleReviewOverview();
    console.error(error);
  }
}
function selectedArticlePool() {
  const category = $("#article-category").value;
  const lawId = $("#article-law-filter").value;
  const onlyStudied = $("#article-study-filter").value === "estudados";
  const studied = onlyStudied ? legalStudiedSet() : null;
  return articleQuestions.filter(item =>
    (category === "todas" || item.category === category) &&
    (lawId === "todas" || item.law_id === lawId) &&
    (!onlyStudied || studied.has(legalArticleKey(item.law_id, item.answer_article_key)))
  );
}
function updateArticleGameFilters() {
  const pool = selectedArticlePool();
  $("#start-article").disabled = pool.length === 0;
  const onlyStudied = $("#article-study-filter").value === "estudados";
  let message = pool.length + " questão(ões) disponível(is) nesta seleção, de " + articleQuestions.length + " validada(s).";
  if (articleCaptureNote) message += articleCaptureNote;
  if (articleSuspendedCount) message += " " + articleSuspendedCount + " questão(ões) suspensa(s) por incompatibilidade com a captura atual.";
  if (!pool.length && onlyStudied) message += " Nenhuma questão corresponde aos artigos marcados como estudados. Na aba Lei Seca, abra a norma e marque os artigos estudados.";
  else if (!pool.length) message += " Não há questões para esses filtros.";
  $("#article-count-note").textContent = message;
}
function loadArticleReviewQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(ARTICLE_REVIEW_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}
function saveArticleReviewQueue(queue) {
  try { localStorage.setItem(ARTICLE_REVIEW_KEY, JSON.stringify(queue)); }
  catch (error) {
    console.warn("Não foi possível salvar a revisão Descubra o artigo:", error);
    const note = $("#article-review-note");
    if (note) note.textContent = "O navegador não permitiu salvar os erros. Confira as permissões de armazenamento.";
  }
}
function articleReviewPendingEntries() {
  return Object.values(loadArticleReviewQueue()).filter(entry =>
    entry && entry.status !== "mastered" && entry.item && entry.item.id
  );
}
function renderArticleReviewOverview() {
  const queue = Object.values(loadArticleReviewQueue());
  const pending = queue.filter(entry => entry && entry.status !== "mastered" && entry.item);
  const due = pending.filter(entry => {
    const time = new Date(entry.next_due || 0).getTime();
    return !Number.isFinite(time) || time <= Date.now();
  });
  const available = new Map(articleQuestions.map(item => [item.id,item]));
  const ready = due.filter(entry => available.has(entry.item.id));
  const suspended = due.length - ready.length;
  const mastered = queue.filter(entry => entry && entry.status === "mastered").length;
  const dueNode=$("#article-review-due"), pendingNode=$("#article-review-pending");
  const masteredNode=$("#article-review-mastered"), button=$("#article-review-start");
  const note=$("#article-review-note");
  if(!dueNode||!pendingNode||!masteredNode||!button||!note)return;
  dueNode.textContent=String(due.length);
  pendingNode.textContent=String(pending.length);
  masteredNode.textContent=String(mastered);
  button.disabled=ready.length===0;
  button.textContent=ready.length?"Revisar agora ("+ready.length+")":"Nenhum erro vencido para revisar";
  if(!pending.length)note.textContent="As questões que você responder incorretamente serão guardadas aqui para revisão espaçada.";
  else if(ready.length)note.textContent=ready.length+" erro(s) disponível(is) para revisar. Três acertos em revisões espaçadas retiram a questão da fila ativa."
    +(suspended?" Outros "+suspended+" item(ns) aguardam conferência do texto atualizado.":"");
  else if(suspended)note.textContent=suspended+" erro(s) estão guardados, mas suas questões estão suspensas porque a redação de referência não passou pela conferência atual.";
  else {
    const dates=pending.map(entry=>new Date(entry.next_due||0).getTime()).filter(Number.isFinite);
    note.textContent=pending.length+" erro(s) em acompanhamento. Próxima revisão: "
      +(dates.length?formatDate(new Date(Math.min(...dates)).toISOString()):"aguardando");
  }
}
function recordArticleReviewMiss(item, selectedArticle, reviewMode) {
  const queue=loadArticleReviewQueue(), old=queue[item.id]||{}, now=Date.now();
  const storedItem={id:item.id,law_id:item.law_id,law_title:item.law_title,
    answer_article_key:item.answer_article_key,question:item.question};
  queue[item.id]={
    item:storedItem,misses:(Number(old.misses)||0)+1,correct_reviews:0,
    first_missed_at:old.first_missed_at||new Date(now).toISOString(),
    last_missed_at:new Date(now).toISOString(),last_wrong_article_key:String(selectedArticle||""),
    next_due:new Date(now+(reviewMode?10*60*1000:0)).toISOString(),status:"pending"
  };
  saveArticleReviewQueue(queue);renderArticleReviewOverview();
}
function recordArticleReviewSuccess(item) {
  const queue=loadArticleReviewQueue(),old=queue[item.id];
  if(!old||old.status==="mastered")return;
  const now=Date.now(),correct=(Number(old.correct_reviews)||0)+1,mastered=correct>=3;
  const days=correct===1?1:3;
  queue[item.id]={...old,correct_reviews:correct,last_correct_at:new Date(now).toISOString(),
    next_due:mastered?null:new Date(now+days*86400000).toISOString(),status:mastered?"mastered":"pending"};
  saveArticleReviewQueue(queue);renderArticleReviewOverview();
}
function startArticleReviewSession() {
  const due=articleReviewPendingEntries().filter(entry=>{
    const time=new Date(entry.next_due||0).getTime();return !Number.isFinite(time)||time<=Date.now();
  });
  const current=new Map(articleQuestions.map(item=>[item.id,item]));
  const ready=due.map(entry=>current.get(entry.item.id)).filter(Boolean);
  if(!ready.length) {
    renderArticleReviewOverview();
    $("#article-review-note").textContent=due.length
      ?"As questões estão guardadas, mas suspensas porque não passaram pela conferência da captura atual."
      :"Ainda não há erros vencidos para revisar.";
    return;
  }
  showView("article");startArticleGame(ready,{reviewMode:true});
}
function startArticleGame(onlyItems = null, options = {}) {
  const pool = onlyItems || selectedArticlePool();
  if (!pool.length) {
    $("#article-count-note").textContent = "Não há questões disponíveis para essa seleção.";
    return;
  }
  const requested = $("#article-length").value === "todas" ? pool.length : Number($("#article-length").value);
  const items = onlyItems ? shuffle(pool) : shuffle(pool).slice(0, Math.min(requested, pool.length));
  articleGameState = { questions: items, index: 0, selected: null, answers: [], reviewMode: Boolean(options.reviewMode), reviewFailed: false };
  $("#article-welcome").classList.add("hidden");
  $("#article-summary").classList.add("hidden");
  $("#article-card").classList.remove("hidden");
  showArticleQuestion();
}
function showArticleQuestion() {
  const item = articleGameState.questions[articleGameState.index];
  if (!item) return;
  articleGameState.selected = null;
  articleGameState.reviewFailed = false;
  $("#article-literal-details").open = false;
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
  if (!correct) {
    recordArticleReviewMiss(item, articleGameState.selected, articleGameState.reviewMode);
    articleGameState.reviewFailed = true;
  } else if (articleGameState.reviewMode && !articleGameState.reviewFailed) {
    recordArticleReviewSuccess(item);
  }
  const answerOption = item.options.find(option => option.article_key === item.answer_article_key);
  const selectedOption = item.options.find(option => option.article_key === articleGameState.selected);
  $("#article-result").textContent = correct ? "Você acertou! ✓" : "Não foi dessa vez. ✕";
  $("#article-result").className = "feedback-result " + (correct ? "correct" : "incorrect");
  $("#article-answer-line").textContent = "Artigo correto: " + (answerOption ? answerOption.label : item.answer_article_key) +
    (correct ? "." : " · Sua escolha: " + (selectedOption ? selectedOption.label : item.answer_article_key) + ".");
  $("#article-explanation").textContent = item.explanation;
  $("#article-literal").textContent = item.literal_text;
  $("#article-literal-details").open = true;
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
  renderArticleReviewOverview();
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
    updateQuizFilters();
    note.textContent = questionBank.length + " itens disponíveis no banco inicial. Use os filtros para escolher matéria, assunto, norma e artigo.";
    $("#start-quiz").disabled = questionBank.length === 0;
    updateLegalQuizButton();
    renderCEReviewOverview();
  } catch (error) {
    note.textContent = "Não foi possível carregar o banco de questões. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function setQuizSelectOptions(selector, entries, allLabel, previousValue) {
  const select = $(selector);
  const options = [new Option(allLabel, "todas"), ...entries.map(entry => new Option(entry.label, entry.value))];
  select.replaceChildren(...options);
  const allowed = new Set(["todas", ...entries.map(entry => entry.value)]);
  select.value = allowed.has(previousValue) ? previousValue : "todas";
}
function updateQuizFilters() {
  const previous = {
    category: $("#quiz-category").value || "todas",
    topic: $("#quiz-topic").value || "todas",
    law: $("#quiz-law-filter").value || "todas",
    article: $("#quiz-article-filter").value || "todas"
  };
  const categories = [...new Set(questionBank.map(item => item.category).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,"pt-BR"));
  setQuizSelectOptions("#quiz-category",categories.map(value=>({value,label:value})),"Todas as matérias",previous.category);

  const category=$("#quiz-category").value;
  const byCategory=questionBank.filter(item=>category==="todas"||item.category===category);
  const topics=[...new Set(byCategory.map(item=>item.topic).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR"));
  setQuizSelectOptions("#quiz-topic",topics.map(value=>({value,label:value})),"Todos os assuntos",previous.topic);

  const topic=$("#quiz-topic").value;
  const byTopic=byCategory.filter(item=>topic==="todas"||item.topic===topic);
  const laws=[...new Map(byTopic.filter(item=>item.law_id).map(item=>[
    item.law_id,{value:item.law_id,label:item.law_title||item.law_id}
  ])).values()].sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"));
  setQuizSelectOptions("#quiz-law-filter",laws,"Todas as normas",previous.law);

  const law=$("#quiz-law-filter").value;
  const byLaw=byTopic.filter(item=>law==="todas"||item.law_id===law);
  const counts=new Map();
  byLaw.forEach(item=>{if(item.article_key)counts.set(item.article_key,(counts.get(item.article_key)||0)+1);});
  const articles=[...counts.entries()].sort((a,b)=>{
    const left=Number((a[0].match(/\d+/)||[])[0]||0);
    const right=Number((b[0].match(/\d+/)||[])[0]||0);
    return left-right||a[0].localeCompare(b[0],"pt-BR");
  }).map(([value,count])=>({value,label:value+" · "+count+" item(ns)"}));
  setQuizSelectOptions("#quiz-article-filter",articles,"Todos os artigos",previous.article);

  const pool=selectedPool();
  $("#start-quiz").disabled=pool.length===0;
  const chosen=[];
  if($("#quiz-category").value!=="todas")chosen.push($("#quiz-category").selectedOptions[0]?.textContent);
  if($("#quiz-topic").value!=="todas")chosen.push($("#quiz-topic").selectedOptions[0]?.textContent);
  if($("#quiz-law-filter").value!=="todas")chosen.push($("#quiz-law-filter").selectedOptions[0]?.textContent);
  if($("#quiz-article-filter").value!=="todas")chosen.push($("#quiz-article-filter").value);
  $("#question-count-note").textContent=pool.length+" item(ns) nesta seleção."
    +(chosen.length?" Filtros: "+chosen.join(" · ")+".":" O banco inicial pode ser ampliado com novos itens.");
}
function selectedPool() {
  const category=$("#quiz-category").value;
  const topic=$("#quiz-topic").value;
  const law=$("#quiz-law-filter").value;
  const article=$("#quiz-article-filter").value;
  return questionBank.filter(item=>
    (category==="todas"||item.category===category)
    &&(topic==="todas"||item.topic===topic)
    &&(law==="todas"||item.law_id===law)
    &&(article==="todas"||item.article_key===article)
  );
}
function renderTextWithHighlights(element,text,phrases,className="quiz-highlight") {
  const source=String(text||"");
  const wanted=[...new Set((Array.isArray(phrases)?phrases:[phrases]).map(v=>String(v||"").trim()).filter(Boolean))];
  element.replaceChildren();
  if(!source||!wanted.length){element.textContent=source;return 0;}
  const lower=source.toLocaleLowerCase("pt-BR");
  const matches=[];
  wanted.forEach(phrase=>{
    const needle=phrase.toLocaleLowerCase("pt-BR");
    let from=0;
    while(needle&&from<lower.length){
      const index=lower.indexOf(needle,from);
      if(index<0)break;
      matches.push({start:index,end:index+phrase.length});
      from=index+phrase.length;
    }
  });
  matches.sort((a,b)=>a.start-b.start||b.end-a.end);
  const selected=[];
  matches.forEach(match=>{const prev=selected[selected.length-1];if(!prev||match.start>=prev.end)selected.push(match);});
  let cursor=0;
  selected.forEach(match=>{
    if(match.start>cursor)element.append(document.createTextNode(source.slice(cursor,match.start)));
    const mark=document.createElement("mark");mark.className=className;mark.textContent=source.slice(match.start,match.end);element.append(mark);
    cursor=match.end;
  });
  if(cursor<source.length)element.append(document.createTextNode(source.slice(cursor)));
  return selected.length;
}
function renderHighlightSnippets(element,phrases) {
  element.replaceChildren();
  (phrases||[]).filter(Boolean).forEach((phrase,index)=>{
    if(index)element.append(document.createTextNode(" … "));
    const mark=document.createElement("mark");mark.className="quiz-highlight";mark.textContent=phrase;element.append(mark);
  });
}
function startQuiz(onlyItems=null,options={}) {
  const pool=onlyItems||selectedPool();
  if(!pool.length){$("#question-count-note").textContent="Não há questões disponíveis para essa seleção.";return;}
  const requested=options.fullPool||options.reviewMode||$("#quiz-length").value==="todas"
    ?pool.length:Number($("#quiz-length").value);
  const items=shuffle(pool).slice(0,Math.min(requested,pool.length));
  quizState={questions:items,index:0,selected:null,answers:[],reviewMode:Boolean(options.reviewMode)};
  $("#quiz-welcome").classList.add("hidden");
  $("#quiz-summary").classList.add("hidden");
  $("#quiz-card").classList.remove("hidden");
  showQuestion();
}
function showQuestion() {
  const item=quizState.questions[quizState.index];
  $("#answer-true").disabled=false;$("#answer-false").disabled=false;$("#answer-unknown").disabled=false;
  quizState.selected=null;
  $("#quiz-category-label").textContent=item.category;
  $("#quiz-progress").textContent="Questão "+(quizState.index+1)+" de "+quizState.questions.length;
  $("#quiz-law").textContent=item.law_title;$("#quiz-article").textContent=item.article;
  renderTextWithHighlights($("#quiz-statement"),item.statement,[]);
  ["#answer-true","#answer-false","#answer-unknown"].forEach(selector=>{
    $(selector).classList.remove("selected");$(selector).setAttribute("aria-pressed","false");
  });
  $("#submit-answer").disabled=true;
  $("#answer-feedback").classList.add("hidden");
  $("#feedback-wrong-block").classList.add("hidden");
  $("#feedback-support-block").classList.add("hidden");
  $("#next-question").textContent=quizState.index===quizState.questions.length-1?"Ver resultado →":"Próxima questão →";
}
function chooseAnswer(value) {
  if(!$("#answer-feedback").classList.contains("hidden"))return;
  quizState.selected=value;
  $("#answer-true").classList.toggle("selected",value===true);
  $("#answer-false").classList.toggle("selected",value===false);
  $("#answer-unknown").classList.remove("selected");
  $("#answer-true").setAttribute("aria-pressed",String(value===true));
  $("#answer-false").setAttribute("aria-pressed",String(value===false));
  $("#answer-unknown").setAttribute("aria-pressed","false");
  $("#submit-answer").disabled=false;
}
function chooseUnknownAnswer() {
  if(!$("#answer-feedback").classList.contains("hidden"))return;
  quizState.selected="unknown";
  $("#answer-true").classList.remove("selected");$("#answer-false").classList.remove("selected");
  $("#answer-unknown").classList.add("selected");
  $("#answer-true").setAttribute("aria-pressed","false");$("#answer-false").setAttribute("aria-pressed","false");
  $("#answer-unknown").setAttribute("aria-pressed","true");$("#submit-answer").disabled=false;
}
function submitAnswer() {
  if(quizState.selected===null)return;
  const item=quizState.questions[quizState.index],chosen=quizState.selected,unknown=chosen==="unknown";
  const correct=!unknown&&chosen===item.answer;
  quizState.answers.push({item,chosen,correct,unknown});
  if(!correct)recordCEReviewMiss(item,chosen,quizState.reviewMode);
  else if(quizState.reviewMode)recordCEReviewSuccess(item);

  $("#feedback-result").textContent=unknown
    ?"Você marcou “Não sei”. Gabarito: "+(item.answer?"Certo.":"Errado.")
    :correct?"Você acertou! ✓":"Você errou. ✕";
  $("#feedback-result").className="feedback-result "+(unknown?"unknown":correct?"correct":"incorrect");
  $("#feedback-explanation").textContent=item.explanation||"";

  const wrong=item.answer===false?(item.wrong_expression||""):"";
  renderTextWithHighlights($("#quiz-statement"),item.statement,wrong?[wrong]:[]);
  if(wrong){renderHighlightSnippets($("#feedback-wrong-expression"),[wrong]);$("#feedback-wrong-block").classList.remove("hidden");}
  else $("#feedback-wrong-block").classList.add("hidden");

  const support=Array.isArray(item.supporting_excerpts)?item.supporting_excerpts:[];
  if(support.length){
    renderHighlightSnippets($("#feedback-supporting-excerpt"),support);
    renderTextWithHighlights($("#feedback-literal"),item.literal_text,support);
    $("#feedback-support-block").classList.remove("hidden");
  }else{
    $("#feedback-support-block").classList.add("hidden");$("#feedback-literal").textContent=item.literal_text||"";
  }
  $("#feedback-source").href=item.source_url||"#";
  $("#answer-feedback").classList.remove("hidden");
  $("#submit-answer").disabled=true;
  $("#answer-true").disabled=true;$("#answer-false").disabled=true;$("#answer-unknown").disabled=true;
}
function showQuizSummary() {
  $("#quiz-card").classList.add("hidden");$("#quiz-summary").classList.remove("hidden");
  const total=quizState.questions.length;
  const correct=quizState.answers.filter(a=>a.correct).length;
  const wrong=total-correct;
  const unknown=quizState.answers.filter(a=>a.unknown).length;
  const percentage=Math.round((correct/total)*100);
  $("#quiz-score").textContent=correct+" de "+total+" acertos";
  $("#quiz-score-note").textContent="Aproveitamento: "+percentage+"%. "
    +(unknown?unknown+" item(ns) marcado(s) como “Não sei”. ":"")
    +(wrong===0?"Excelente! Você acertou todos os itens.":"As questões erradas e as marcadas como “Não sei” foram enviadas à Central de revisão.");
  const mistakes=quizState.answers.filter(a=>!a.correct),box=$("#quiz-mistakes");
  box.replaceChildren();
  if(!mistakes.length)box.textContent="Nenhuma questão errada neste treino.";
  else{
    const heading=document.createElement("h3");heading.textContent="Pontos para revisar";
    const list=document.createElement("div");list.className="mistake-list";
    mistakes.forEach(answer=>{
      const row=document.createElement("div");row.className="mistake-row";
      const strong=document.createElement("strong"),detail=document.createElement("span");
      strong.textContent=answer.item.law_title+" · "+answer.item.article;
      const chosen=answer.unknown?"Não sei":answer.chosen?"Certo":"Errado";
      detail.textContent="Sua resposta: "+chosen+" · Gabarito: "+(answer.item.answer?"Certo":"Errado");
      row.append(strong,detail);list.append(row);
    });
    box.append(heading,list);
  }
  $("#retry-mistakes").classList.toggle("hidden",mistakes.length===0);
  renderCEReviewOverview();
}
function nextQuestion() {
  if(quizState.index>=quizState.questions.length-1){showQuizSummary();return;}
  quizState.index++;showQuestion();
}
function loadCEReviewQueue() {
  try{const value=JSON.parse(localStorage.getItem(CE_REVIEW_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
  catch(_){return {};}
}
function saveCEReviewQueue(queue) {
  try{localStorage.setItem(CE_REVIEW_KEY,JSON.stringify(queue));}
  catch(error){console.warn("Não foi possível salvar a Central de revisão C/E:",error);const note=$("#ce-review-note");if(note)note.textContent="O navegador não permitiu salvar os erros. Confira as permissões de armazenamento.";}
}
function ceReviewPendingEntries() {
  return Object.values(loadCEReviewQueue()).filter(entry=>entry&&entry.status!=="mastered"&&entry.item&&entry.item.id);
}
function recordCEReviewMiss(item,chosen,reviewMode) {
  const queue=loadCEReviewQueue(),previous=queue[item.id]||{},now=Date.now();
  queue[item.id]={
    item:JSON.parse(JSON.stringify(item)),
    misses:(Number(previous.misses)||0)+1,
    correct_reviews:0,
    first_missed_at:previous.first_missed_at||new Date(now).toISOString(),
    last_missed_at:new Date(now).toISOString(),
    last_response:chosen==="unknown"?"nao_sei":chosen?"certo":"errado",
    next_due:new Date(now+(reviewMode?10*60*1000:0)).toISOString(),
    status:"pending"
  };
  saveCEReviewQueue(queue);renderCEReviewOverview();
}
function recordCEReviewSuccess(item) {
  const queue=loadCEReviewQueue(),previous=queue[item.id];
  if(!previous||previous.status==="mastered")return;
  const now=Date.now(),correctReviews=(Number(previous.correct_reviews)||0)+1,mastered=correctReviews>=3;
  const intervalDays=correctReviews===1?1:3;
  queue[item.id]={
    ...previous,item:JSON.parse(JSON.stringify(item)),correct_reviews:correctReviews,
    last_correct_at:new Date(now).toISOString(),
    next_due:mastered?null:new Date(now+intervalDays*24*60*60*1000).toISOString(),
    status:mastered?"mastered":"pending"
  };
  saveCEReviewQueue(queue);renderCEReviewOverview();
}
function renderCEReviewOverview() {
  const now=Date.now(),all=Object.values(loadCEReviewQueue());
  const pending=all.filter(e=>e&&e.status!=="mastered"&&e.item);
  const due=pending.filter(e=>{const time=new Date(e.next_due||0).getTime();return !Number.isFinite(time)||time<=now;});
  const mastered=all.filter(e=>e&&e.status==="mastered").length;
  const dueNode=$("#ce-review-due"),pendingNode=$("#ce-review-pending"),masteredNode=$("#ce-review-mastered");
  const button=$("#ce-review-start"),note=$("#ce-review-note");
  if(!dueNode||!pendingNode||!masteredNode||!button||!note)return;
  dueNode.textContent=String(due.length);pendingNode.textContent=String(pending.length);masteredNode.textContent=String(mastered);
  button.disabled=due.length===0;
  button.textContent=due.length?"Revisar agora ("+due.length+")":"Nenhuma revisão vencida";
  if(!pending.length)note.textContent="As questões erradas e as marcadas como “Não sei” aparecerão aqui automaticamente.";
  else if(due.length)note.textContent=due.length+" questão(ões) prontas para revisar. As que você acertar três vezes na Central saem da fila ativa.";
  else{
    const next=pending.map(e=>new Date(e.next_due||0).getTime()).filter(Number.isFinite);
    note.textContent=pending.length+" questão(ões) em acompanhamento. Próxima revisão: "+(next.length?formatDate(new Date(Math.min(...next)).toISOString()):"aguardando");
  }
}
function startCEReviewSession() {
  const now=Date.now();
  const due=ceReviewPendingEntries().filter(e=>{const time=new Date(e.next_due||0).getTime();return !Number.isFinite(time)||time<=now;});
  if(!due.length){renderCEReviewOverview();return;}
  const items=due.map(e=>questionBank.find(q=>q.id===e.item.id)||e.item);
  showView("quiz");startQuiz(items,{reviewMode:true,fullPool:true});
}
function updateLegalQuizButton() {
  const button=$("#law-train-quiz");if(!button)return;
  const has=Boolean(legalSelectedLaw&&legalSelectedArticle&&questionBank.some(item=>
    item.law_id===legalSelectedLaw.id&&legalTrainingArticleMatches(item.article_key||item.article,legalSelectedArticle)
  ));
  button.disabled=!has;
  button.title=has?"Abrir o treino C/E já filtrado para este artigo.":"Ainda não há questões C/E cadastradas para este artigo.";
}
async function startQuizForLegalArticle() {
  if(!legalSelectedLaw||!legalSelectedArticle)return;
  if(!questionBank.length)await loadQuestionBank();
  const law=legalSelectedLaw,article=legalSelectedArticle;
  const items=questionBank.filter(item=>item.law_id===law.id&&legalTrainingArticleMatches(item.article_key||item.article,article));
  showView("quiz");
  if(!items.length){$("#question-count-note").textContent="Ainda não há questões C/E cadastradas para "+law.short_title+" · "+article+".";return;}
  $("#quiz-category").value="todas";$("#quiz-topic").value="todas";$("#quiz-law-filter").value=law.id;
  updateQuizFilters();
  $("#quiz-article-filter").value=items[0].article_key;updateQuizFilters();
  $("#quiz-length").value="todas";
  startQuiz(selectedPool(),{fullPool:true});
}
// -------------------- Modo Várias afirmações sobre o mesmo artigo --------------------
function multiCECategoryForLaw(lawId) {
  if (lawId === "constituicao-1988" || lawId === "ec-103-2019") return "Direito Constitucional";
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
    const priorCategory=select.value||"todas";
    select.replaceChildren();
    select.append(new Option("Todas as matérias","todas"));
    [...new Set(multiCEGroups.map(group=>group.category))].sort((a,b)=>a.localeCompare(b,"pt-BR"))
      .forEach(category=>select.append(new Option(category,category)));
    if([...select.options].some(option=>option.value===priorCategory))select.value=priorCategory;

    const lawSelect=$("#multi-ce-law-filter");
    const priorLaw=lawSelect.value||"todas";
    lawSelect.replaceChildren();
    lawSelect.append(new Option("Todas as normas","todas"));
    [...new Map(multiCEGroups.map(group=>[group.law_id,group.law_title])).entries()]
      .sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"))
      .forEach(([id,title])=>lawSelect.append(new Option(title,id)));
    if([...lawSelect.options].some(option=>option.value===priorLaw))lawSelect.value=priorLaw;
    const capture=newest?"Capturas conferidas até "+formatDate(new Date(newest).toISOString())+".":"";
    $("#multi-ce-count-note").dataset.captureNote=capture;
    updateMultiCEFilters();
    const allStatements=multiCEGroups.reduce((sum,group)=>sum+group.statements.length,0);
    $("#multi-ce-count-note").textContent=multiCEGroups.length+" artigos disponíveis, com "+allStatements+" afirmações. "+capture+
      (suspended?" "+suspended+" conjunto(s) suspenso(s) por incompatibilidade com a captura.":" Todos os conjuntos passaram pela conferência.");
    if(!multiCEGroups.length)$("#multi-ce-count-note").textContent+=" Atualize as capturas legais e tente novamente.";
  }catch(error){
    multiCEGroups=[];
    $("#start-multi-ce").disabled=true;
    note.textContent="Não foi possível carregar o banco ou conferir os textos legais. Recarregue o site e tente novamente.";
    console.error(error);
  }
}
function selectedMultiCEPool(){
  const category=$("#multi-ce-category").value;
  const lawId=$("#multi-ce-law-filter").value;
  return multiCEGroups.filter(group=>
    (category==="todas"||group.category===category)&&
    (lawId==="todas"||group.law_id===lawId)
  );
}
function updateMultiCEFilters(){
  const pool=selectedMultiCEPool();
  $("#start-multi-ce").disabled=pool.length===0;
  const total=pool.reduce((sum,group)=>sum+group.statements.length,0);
  const capture=$("#multi-ce-count-note").dataset.captureNote||"";
  $("#multi-ce-count-note").textContent=pool.length+" artigo(s) nesta seleção, com "+total+" afirmação(ões). "+capture;
  if(!pool.length)$("#multi-ce-count-note").textContent+=" Não há artigos para esses filtros.";
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
  renderTextWithHighlights($("#multi-ce-article-text"),group.literal_text,[item.validation_phrase],"multi-ce-legal-highlight");
  $("#multi-ce-article-capture").textContent=group.snapshot_captured_at
    ?"Texto da captura de "+formatDate(group.snapshot_captured_at)+"."
    :"Texto da captura salva no projeto.";
  $("#multi-ce-article-source").href=group.source_url||"#";
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
  $("#multi-ce-article-panel").hidden=true;
  $("#multi-ce-article-toggle").textContent="Ler artigo antes de responder";
  $("#multi-ce-article-toggle").setAttribute("aria-expanded","false");
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
  if(!correct){
    recordCEReviewMiss({
      id:"multi-ce::"+group.id+"::"+item.id,
      statement:item.prompt,answer:item.answer,explanation:item.explanation,
      wrong_expression:"",
      supporting_excerpts:[item.validation_phrase],
      literal_text:group.literal_text,source_url:group.source_url,
      law_id:group.law_id,law_title:group.law_title,
      article:group.article_key,article_key:group.article_key,
      category:group.category,topic:group.topic,multi_ce:true
    },multiCEState.selected,false);
  }
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
  const id=change.law_id||"";
  if(id==="constituicao-1988"||id==="ec-103-2019")return "Direito Constitucional";
  if(id==="decreto-6029-2007"||id==="decreto-1171-1994")return "Ética";
  if(id==="lei-8112-1990"||id==="lei-9784-1999"||id==="lei-8429-1992")return "Direito Administrativo";
  return "Direito Previdenciário";
}
function beforeAfterText(change,version) {
  if(version==="old")return change.old_text||(change.change_type==="incluido"
    ?"Este artigo não aparecia na captura anterior."
    :"Não havia texto anterior disponível para comparação.");
  return change.new_text||"Não havia texto deste artigo na captura atual.";
}
function loadBeforeAfterReviewQueue() {
  try {
    const value=JSON.parse(localStorage.getItem(BEFORE_AFTER_REVIEW_KEY)||"{}");
    return value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  } catch(_){return {};}
}
function saveBeforeAfterReviewQueue(queue) {
  try{localStorage.setItem(BEFORE_AFTER_REVIEW_KEY,JSON.stringify(queue));}
  catch(error){
    console.warn("Não foi possível salvar a revisão Antes e depois:",error);
    const note=$("#before-after-review-note");
    if(note)note.textContent="O navegador não permitiu salvar a revisão das alterações.";
  }
}
function beforeAfterChangeId(change) {
  return String(change.id||[
    change.law_id||"norma",change.article||"artigo",change.detected_at||"",
    change.change_type||"",change.old_text||"",change.new_text||""
  ].join("::"));
}
function loadBeforeAfterStudyInfo(change) {
  const key=legalArticleKey(change.law_id||"",change.article||"");
  if(!legalStudiedSet().has(key))return {
    status:"not_marked",studied_at:null,reference_at:null,
    label:"Este artigo não está marcado como estudado na Biblioteca Lei Seca."
  };
  const studiedAt=loadLegalStudiedDates()[key]||null;
  if(!studiedAt)return {
    status:"unknown",studied_at:null,reference_at:null,
    label:"O artigo já estava marcado como estudado, mas a data não foi registrada. Não é possível confirmar se você o estudou antes da alteração."
  };
  const referenceValue=change.publication_date||change.detected_at||null;
  const referenceType=change.publication_date?"publicação informada":"detecção pelo monitor";
  if(!referenceValue)return {
    status:"unknown",studied_at:studiedAt,reference_at:null,
    label:"A data do estudo foi registrada, mas não há data de publicação ou detecção para comparar."
  };
  const studiedDay=String(studiedAt).slice(0,10),referenceDay=String(referenceValue).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(studiedDay)||!/^\d{4}-\d{2}-\d{2}$/.test(referenceDay))return {
    status:"unknown",studied_at:studiedAt,reference_at:referenceValue,
    label:"Não foi possível comparar as datas do estudo e da alteração."
  };
  const dateLabel=referenceDay.split("-").reverse().join("/");
  const effective=change.effective_date
    ?" Vigência informada: "+String(change.effective_date).split("-").reverse().join("/")+".":"";
  if(studiedDay<referenceDay)return {
    status:"before",studied_at:studiedAt,reference_at:referenceValue,
    label:"Sim. Você marcou o artigo como estudado em "+formatDate(studiedAt)+", antes da "+referenceType+" ("+dateLabel+")."+effective
  };
  if(studiedDay>referenceDay)return {
    status:"after",studied_at:studiedAt,reference_at:referenceValue,
    label:"Não. Você marcou o artigo como estudado em "+formatDate(studiedAt)+", depois da "+referenceType+" ("+dateLabel+")."+effective
  };
  return {
    status:"same_day",studied_at:studiedAt,reference_at:referenceValue,
    label:"As datas coincidem ("+dateLabel+"). Não é possível afirmar a ordem dentro do mesmo dia."+effective
  };
}
function syncBeforeAfterReviewQueue() {
  const queue=loadBeforeAfterReviewQueue();
  let changed=false;
  beforeAfterAvailable.forEach(change=>{
    const id=beforeAfterChangeId(change);
    if(!queue[id]){
      queue[id]={
        id,
        item:{
          id,law_id:change.law_id,law_title:change.law_short_title||change.law_title||"Norma",
          article:change.article,change_type:change.change_type,summary:change.summary||"",
          old_text:change.old_text||"",new_text:change.new_text||"",source_url:change.source_url||"",
          detected_at:change.detected_at||"",publication_date:change.publication_date||"",effective_date:change.effective_date||""
        },
        study_info:loadBeforeAfterStudyInfo(change),
        first_queued_at:new Date().toISOString(),misses:0,correct_reviews:0,
        next_due:new Date().toISOString(),status:"pending"
      };
      changed=true;
    }
    change._review_id=id;
    change.study_info=queue[id].study_info||loadBeforeAfterStudyInfo(change);
  });
  if(changed)saveBeforeAfterReviewQueue(queue);
  renderBeforeAfterReviewOverview();
}
function beforeAfterReviewPendingEntries() {
  return Object.values(loadBeforeAfterReviewQueue()).filter(entry=>
    entry&&entry.status!=="mastered"&&entry.item&&entry.item.id
  );
}
function renderBeforeAfterReviewOverview() {
  const all=Object.values(loadBeforeAfterReviewQueue());
  const pending=all.filter(entry=>entry&&entry.status!=="mastered"&&entry.item);
  const now=Date.now();
  const due=pending.filter(entry=>{
    const time=new Date(entry.next_due||0).getTime();return !Number.isFinite(time)||time<=now;
  });
  const current=new Map(beforeAfterAvailable.map(change=>[beforeAfterChangeId(change),change]));
  const ready=due.filter(entry=>current.has(entry.id));
  const mastered=all.filter(entry=>entry&&entry.status==="mastered").length;
  const dueNode=$("#before-after-review-due"),pendingNode=$("#before-after-review-pending");
  const masteredNode=$("#before-after-review-mastered"),button=$("#before-after-review-start");
  const note=$("#before-after-review-note");
  if(!dueNode||!pendingNode||!masteredNode||!button||!note)return;
  dueNode.textContent=String(due.length);
  pendingNode.textContent=String(pending.length);
  masteredNode.textContent=String(mastered);
  button.disabled=ready.length===0;
  button.textContent=ready.length?"Revisar alterações agora ("+ready.length+")":"Nenhuma alteração vencida para revisar";
  if(!pending.length)note.textContent="Quando o monitor detectar uma alteração confirmada em artigo, ela será colocada automaticamente nesta fila.";
  else if(ready.length)note.textContent=ready.length+" alteração(ões) pronta(s) para revisar. Três acertos em revisões espaçadas retiram o item da fila ativa.";
  else note.textContent=pending.length+" alteração(ões) em acompanhamento. A próxima revisão ainda não venceu ou o registro não está disponível na captura atual.";
}
function recordBeforeAfterMiss(change) {
  const queue=loadBeforeAfterReviewQueue(),id=beforeAfterChangeId(change),old=queue[id];
  if(!old)return;
  const now=Date.now();
  queue[id]={...old,misses:(Number(old.misses)||0)+1,correct_reviews:0,
    last_missed_at:new Date(now).toISOString(),next_due:new Date(now).toISOString(),status:"pending"};
  saveBeforeAfterReviewQueue(queue);renderBeforeAfterReviewOverview();
}
function recordBeforeAfterSuccess(change) {
  const queue=loadBeforeAfterReviewQueue(),id=beforeAfterChangeId(change),old=queue[id];
  if(!old||old.status==="mastered")return;
  const now=Date.now(),correct=(Number(old.correct_reviews)||0)+1,mastered=correct>=3;
  const days=correct===1?1:3;
  queue[id]={...old,correct_reviews:correct,last_correct_at:new Date(now).toISOString(),
    next_due:mastered?null:new Date(now+days*86400000).toISOString(),status:mastered?"mastered":"pending"};
  saveBeforeAfterReviewQueue(queue);renderBeforeAfterReviewOverview();
}
function beforeAfterDiffTokens(text) {
  return String(text||"").match(/\s+|[^\s]+/gu)||[];
}
function normalizeBeforeAfterDiffToken(token) {
  return /^\s+$/u.test(token)?" ":normalizeAnswer(token);
}
function buildBeforeAfterDiff(oldText,newText) {
  const a=beforeAfterDiffTokens(oldText),b=beforeAfterDiffTokens(newText);
  const oldMarks=a.map(text=>({text,kind:"same"})),newMarks=b.map(text=>({text,kind:"same"}));
  const equal=(left,right)=>normalizeBeforeAfterDiffToken(left)===normalizeBeforeAfterDiffToken(right);
  let prefix=0;
  while(prefix<a.length&&prefix<b.length&&equal(a[prefix],b[prefix]))prefix++;
  let suffix=0;
  while(suffix<a.length-prefix&&suffix<b.length-prefix&&equal(a[a.length-1-suffix],b[b.length-1-suffix]))suffix++;
  const aEnd=a.length-suffix,bEnd=b.length-suffix,n=aEnd-prefix,m=bEnd-prefix,ops=[];
  for(let i=0;i<prefix;i++)ops.push({type:"same",a:i,b:i});
  if(n===0)for(let j=prefix;j<bEnd;j++)ops.push({type:"add",b:j});
  else if(m===0)for(let i=prefix;i<aEnd;i++)ops.push({type:"del",a:i});
  else if((n+1)*(m+1)<=1800000) {
    const cols=m+1,dp=new Uint32Array((n+1)*cols);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
      const index=i*cols+j;
      dp[index]=equal(a[prefix+i],b[prefix+j])?1+dp[(i+1)*cols+j+1]:Math.max(dp[(i+1)*cols+j],dp[i*cols+j+1]);
    }
    let i=0,j=0;
    while(i<n&&j<m){
      if(equal(a[prefix+i],b[prefix+j])){ops.push({type:"same",a:prefix+i,b:prefix+j});i++;j++;}
      else if(dp[(i+1)*cols+j]>=dp[i*cols+j+1]){ops.push({type:"del",a:prefix+i});i++;}
      else{ops.push({type:"add",b:prefix+j});j++;}
    }
    while(i<n){ops.push({type:"del",a:prefix+i});i++;}
    while(j<m){ops.push({type:"add",b:prefix+j});j++;}
  }else{
    for(let i=prefix;i<aEnd;i++)ops.push({type:"del",a:i});
    for(let j=prefix;j<bEnd;j++)ops.push({type:"add",b:j});
  }
  for(let i=0;i<suffix;i++)ops.push({type:"same",a:aEnd+i,b:bEnd+i});
  let cursor=0,added=0,removed=0,modified=0;
  while(cursor<ops.length){
    if(ops[cursor].type==="same"){cursor++;continue;}
    const run=[];
    while(cursor<ops.length&&ops[cursor].type!=="same")run.push(ops[cursor++]);
    const deleted=run.filter(op=>op.type==="del"),inserted=run.filter(op=>op.type==="add");
    const paired=Math.min(deleted.length,inserted.length);
    for(let i=0;i<paired;i++){oldMarks[deleted[i].a].kind="modified";newMarks[inserted[i].b].kind="modified";modified++;}
    deleted.slice(paired).forEach(op=>{oldMarks[op.a].kind="removed";removed++;});
    inserted.slice(paired).forEach(op=>{newMarks[op.b].kind="added";added++;});
  }
  return {oldMarks,newMarks,added,removed,modified};
}
function appendBeforeAfterDiffText(container,parts) {
  container.replaceChildren();
  parts.forEach(part=>{
    if(!part.text)return;
    if(part.kind==="same")container.append(document.createTextNode(part.text));
    else{
      const mark=document.createElement("mark");mark.className="diff-"+part.kind;
      mark.textContent=part.text;container.append(mark);
    }
  });
}
function classifyBeforeAfterChange(change,diff) {
  if(change.change_type==="incluido"&&!change.old_text)return "article_added";
  const add=diff.added>0,remove=diff.removed>0,modify=diff.modified>0;
  if((add&&remove)||(add&&modify)||(remove&&modify))return "mixed";
  if(add)return "added";
  if(remove)return "removed";
  if(modify)return "modified";
  return "not_isolated";
}
const BEFORE_AFTER_CHANGE_TYPES=[
  {key:"article_added",label:"O artigo inteiro foi incluído na captura atual."},
  {key:"added",label:"Foram acrescentados trechos, sem retirada de texto."},
  {key:"removed",label:"Foram retirados trechos, sem acréscimo."},
  {key:"modified",label:"Trechos da redação foram substituídos ou modificados."},
  {key:"mixed",label:"Houve acréscimos, retiradas ou modificações combinadas."},
  {key:"not_isolated",label:"A diferença registrada não permitiu separar com segurança os trechos alterados."}
];
function buildBeforeAfterChangeOptions(key) {
  const correct=BEFORE_AFTER_CHANGE_TYPES.find(option=>option.key===key)||BEFORE_AFTER_CHANGE_TYPES.find(option=>option.key==="not_isolated");
  return shuffle([correct,...shuffle(BEFORE_AFTER_CHANGE_TYPES.filter(option=>option.key!==correct.key)).slice(0,3)]);
}
function prepareBeforeAfterBank() {
  beforeAfterAvailable=allChanges.filter(change=>
    Boolean(change.article)&&
    ((change.change_type==="alterado"&&change.old_text&&change.new_text)||
      (change.change_type==="incluido"&&change.new_text))
  );
  const select=$("#before-after-category");
  if(!select)return;
  const previous=select.value||"todas";
  select.replaceChildren();select.append(new Option("Todas as matérias","todas"));
  [...new Set(beforeAfterAvailable.map(beforeAfterCategoryForChange))]
    .sort((a,b)=>a.localeCompare(b,"pt-BR"))
    .forEach(category=>select.append(new Option(category,category)));
  if([...select.options].some(option=>option.value===previous))select.value=previous;
  $("#start-before-after").disabled=beforeAfterAvailable.length===0;
  syncBeforeAfterReviewQueue();
  const note=$("#before-after-count-note");
  const checked=dashboardData&&Array.isArray(dashboardData.laws)?dashboardData.laws.filter(law=>!law.error&&law.last_checked).length:0;
  if(beforeAfterAvailable.length)note.textContent=beforeAfterAvailable.length+" alteração(ões) confirmada(s) em artigos disponíveis. Os trechos acrescentados, retirados e modificados serão destacados.";
  else if(allChanges.length)note.textContent="Há "+allChanges.length+" registro(s) no Radar, mas nenhum é uma comparação confirmada de texto anterior e atual de artigo. Ausências na captura não são tratadas como revogações.";
  else if(dashboardData&&dashboardData.status==="ok")note.textContent="Nenhuma alteração artigo por artigo foi registrada. A última verificação consultou "+checked+" fontes sem detectar diferenças. Quando surgir uma alteração confirmada, ela entrará automaticamente na fila de revisão.";
  else if(dashboardData&&dashboardData.status==="parcial")note.textContent="A última verificação foi parcial. Ainda não há comparação de artigo confirmada; confira o estado das fontes no Radar.";
  else note.textContent="O histórico ainda não está disponível. Recarregue o painel depois que o monitoramento concluir uma verificação.";
}
function prepareBeforeAfterQuestion(change) {
  const options=shuffle([{version:"old",text:beforeAfterText(change,"old")},{version:"new",text:beforeAfterText(change,"new")}]);
  return {change,category:beforeAfterCategoryForChange(change),options,correctIndex:options.findIndex(option=>option.version==="new")};
}
function startBeforeAfterGame(items=null,options={}) {
  let pool=Array.isArray(items)?[...items]:[...beforeAfterAvailable];
  if(!Array.isArray(items)){
    const category=$("#before-after-category").value;
    if(category!=="todas")pool=pool.filter(change=>beforeAfterCategoryForChange(change)===category);
  }
  if(!pool.length)return;
  const length=$("#before-after-length").value;
  const amount=Array.isArray(items)||options.reviewMode?pool.length:length==="todas"?pool.length:Math.min(Number(length)||5,pool.length);
  beforeAfterState={questions:shuffle(pool).slice(0,amount).map(prepareBeforeAfterQuestion),
    index:0,selected:null,answers:[],answered:false,changeQuestion:null,changeSelected:null,changeAnswered:false,reviewMode:Boolean(options.reviewMode)};
  $("#before-after-welcome").classList.add("hidden");$("#before-after-summary").classList.add("hidden");$("#before-after-card").classList.remove("hidden");
  renderBeforeAfterQuestion();
}
function renderBeforeAfterQuestion() {
  const question=beforeAfterState.questions[beforeAfterState.index];
  if(!question)return;
  beforeAfterState.selected=null;beforeAfterState.answered=false;
  beforeAfterState.changeQuestion=null;beforeAfterState.changeSelected=null;beforeAfterState.changeAnswered=false;
  const change=question.change;
  $("#before-after-category-label").textContent=question.category;
  $("#before-after-progress").textContent="Alteração "+(beforeAfterState.index+1)+" de "+beforeAfterState.questions.length;
  $("#before-after-law").textContent=change.law_short_title||change.law_title||"Norma";
  $("#before-after-article").textContent=change.article||"Dispositivo";
  $("#before-after-study-status").textContent=change.study_info?.label||loadBeforeAfterReviewQueue()[beforeAfterChangeId(change)]?.study_info?.label||"A situação de estudo deste artigo ainda não foi registrada.";
  $("#before-after-prompt").textContent="Qual das duas versões corresponde à captura mais recente da fonte oficial?";
  $("#before-after-options").replaceChildren();
  question.options.forEach((option,index)=>{
    const button=document.createElement("button");button.type="button";button.className="before-after-option";button.setAttribute("aria-pressed","false");
    const label=document.createElement("strong");label.textContent="VERSÃO "+(index===0?"A":"B");
    const pre=document.createElement("pre");pre.textContent=option.text;
    button.append(label,pre);
    button.addEventListener("click",()=>{
      if(beforeAfterState.answered)return;
      beforeAfterState.selected=index;
      [...$("#before-after-options").children].forEach((child,childIndex)=>{
        child.classList.toggle("is-selected",childIndex===index);child.setAttribute("aria-pressed",childIndex===index?"true":"false");
      });
      $("#before-after-submit").disabled=false;
    });
    $("#before-after-options").append(button);
  });
  $("#before-after-submit").disabled=true;$("#before-after-feedback").classList.add("hidden");
  $("#before-after-change-question").classList.add("hidden");$("#before-after-next").disabled=true;
  $("#before-after-next").textContent=beforeAfterState.index+1<beforeAfterState.questions.length?"Próxima alteração →":"Ver resultado →";
}
function confirmBeforeAfterAnswer() {
  if(beforeAfterState.selected===null||beforeAfterState.answered)return;
  const question=beforeAfterState.questions[beforeAfterState.index],change=question.change;
  const correct=beforeAfterState.selected===question.correctIndex;
  beforeAfterState.answered=true;
  [...$("#before-after-options").children].forEach(button=>button.disabled=true);
  $("#before-after-submit").disabled=true;
  $("#before-after-result").textContent=correct?"✓ Você identificou a versão mais recente.":"✕ A versão mais recente era a outra opção.";
  $("#before-after-result").className="feedback-result "+(correct?"correct":"incorrect");
  $("#before-after-explanation").textContent=(change.summary||"O monitor registrou uma diferença entre duas capturas.")+" A data de detecção não substitui a conferência da publicação e da vigência do ato.";
  const diff=buildBeforeAfterDiff(change.old_text||"",change.new_text||"");
  const comparison=$("#before-after-comparison");comparison.replaceChildren();
  [
    {title:"ANTES · CAPTURA ANTERIOR",parts:diff.oldMarks,cls:"diff-panel old-panel",plain:beforeAfterText(change,"old")},
    {title:"DEPOIS · CAPTURA ATUALIZADA",parts:diff.newMarks,cls:"diff-panel new-panel",plain:beforeAfterText(change,"new")}
  ].forEach(data=>{
    const panel=document.createElement("div");panel.className=data.cls;
    const title=document.createElement("span");title.textContent=data.title;
    const pre=document.createElement("pre");
    if(data.parts.some(part=>part.kind!=="same"))appendBeforeAfterDiffText(pre,data.parts);else pre.textContent=data.plain;
    panel.append(title,pre);comparison.append(panel);
  });
  const kind=classifyBeforeAfterChange(change,diff),choices=buildBeforeAfterChangeOptions(kind);
  beforeAfterState.changeQuestion={options:choices,correctKey:kind,
    explanation:"Verde indica acréscimo; vermelho indica retirada; amarelo indica trecho modificado. "+diff.added+" trecho(s) acrescentado(s), "+diff.removed+" retirado(s) e "+diff.modified+" modificado(s)."};
  $("#before-after-change-prompt").textContent="Analisando as duas redações: o que aconteceu com o texto deste artigo?";
  $("#before-after-change-options").replaceChildren();
  choices.forEach((choice,index)=>{
    const button=document.createElement("button");button.type="button";button.className="before-after-change-option";
    button.textContent=choice.label;button.addEventListener("click",()=>chooseBeforeAfterChangeAnswer(index));
    $("#before-after-change-options").append(button);
  });
  $("#before-after-change-feedback").classList.add("hidden");
  $("#before-after-change-question").classList.remove("hidden");
  $("#before-after-source").href=change.source_url||"https://www.gov.br/";
  $("#before-after-feedback").classList.remove("hidden");
}
function chooseBeforeAfterChangeAnswer(index) {
  if(beforeAfterState.changeAnswered||!beforeAfterState.changeQuestion)return;
  const question=beforeAfterState.changeQuestion,selected=question.options[index];
  if(!selected)return;
  const correct=selected.key===question.correctKey;
  beforeAfterState.changeSelected=index;beforeAfterState.changeAnswered=true;
  [...$("#before-after-change-options").children].forEach((button,i)=>{
    button.disabled=true;button.classList.toggle("is-correct",question.options[i].key===question.correctKey);
    button.classList.toggle("is-wrong",i===index&&!correct);
  });
  $("#before-after-change-feedback").textContent=(correct?"✓ Correto. ":"✕ Resposta correta: ")+question.options.find(option=>option.key===question.correctKey).label+" "+question.explanation;
  $("#before-after-change-feedback").className="before-after-change-feedback "+(correct?"correct":"incorrect");
  const change=beforeAfterState.questions[beforeAfterState.index].change;
  const versionCorrect=beforeAfterState.selected===beforeAfterState.questions[beforeAfterState.index].correctIndex;
  const complete=versionCorrect&&correct;
  beforeAfterState.answers.push({item:change,correct:complete,version_correct:versionCorrect,change_correct:correct});
  if(complete)recordBeforeAfterSuccess(change);else recordBeforeAfterMiss(change);
  $("#before-after-next").disabled=false;
}
function nextBeforeAfterQuestion() {
  if(!beforeAfterState.changeAnswered)return;
  if(beforeAfterState.index+1<beforeAfterState.questions.length){beforeAfterState.index++;renderBeforeAfterQuestion();return;}
  showBeforeAfterSummary();
}
function showBeforeAfterSummary() {
  $("#before-after-card").classList.add("hidden");$("#before-after-summary").classList.remove("hidden");
  const total=beforeAfterState.answers.length,versions=beforeAfterState.answers.filter(a=>a.version_correct).length;
  const analyses=beforeAfterState.answers.filter(a=>a.change_correct).length,complete=beforeAfterState.answers.filter(a=>a.correct).length;
  const percent=total?Math.round(complete/total*100):0,mistakes=beforeAfterState.answers.filter(a=>!a.correct);
  $("#before-after-score").textContent=complete+" de "+total+" análises completas · "+percent+"%";
  $("#before-after-score-note").textContent="Versão atual identificada: "+versions+"/"+total+". Tipo de alteração identificado: "+analyses+"/"+total+".";
  const box=$("#before-after-mistakes");box.replaceChildren();
  if(mistakes.length){
    const title=document.createElement("h3");title.textContent="Alterações para revisar";
    const list=document.createElement("ul");
    mistakes.forEach(answer=>{
      const li=document.createElement("li"),parts=[];
      if(!answer.version_correct)parts.push("não identificou a versão atual");
      if(!answer.change_correct)parts.push("não identificou o tipo de alteração");
      li.textContent=(answer.item.law_short_title||answer.item.law_title||"Norma")+" · "+(answer.item.article||"Dispositivo")+" — "+parts.join("; ")+".";
      list.append(li);
    });
    box.append(title,list);
  }else{
    const note=document.createElement("p");note.textContent="Muito bem! Você identificou as versões e compreendeu as alterações deste treino.";box.append(note);
  }
  $("#before-after-retry-mistakes").classList.toggle("hidden",mistakes.length===0);
}
function startBeforeAfterReviewSession() {
  const now=Date.now();
  const due=beforeAfterReviewPendingEntries().filter(entry=>{
    const time=new Date(entry.next_due||0).getTime();return !Number.isFinite(time)||time<=now;
  });
  const current=new Map(beforeAfterAvailable.map(change=>[beforeAfterChangeId(change),change]));
  const ready=due.map(entry=>current.get(entry.id)).filter(Boolean);
  if(!ready.length){renderBeforeAfterReviewOverview();return;}
  startBeforeAfterGame(ready,{reviewMode:true});
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

function loadMemoryCustomCards() {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_CUSTOM_CARDS_KEY) || "[]");
    return Array.isArray(value) ? value.filter(card => card && card.id && card.article_key && card.literal_text) : [];
  } catch (_) {
    return [];
  }
}
function saveMemoryCustomCards(cards) {
  try {
    localStorage.setItem(MEMORY_CUSTOM_CARDS_KEY, JSON.stringify(cards));
    return true;
  } catch (error) {
    console.warn("Não foi possível salvar os cartões pessoais:", error);
    $("#memory-note").textContent = "O navegador não permitiu salvar o cartão. Confira o espaço disponível e as permissões de armazenamento.";
    return false;
  }
}
function loadMemoryFavoriteCardIds() {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_FAVORITE_CARD_IDS_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.filter(id => typeof id === "string") : []);
  } catch (_) {
    return new Set();
  }
}
function saveMemoryFavoriteCardIds(ids) {
  try {
    localStorage.setItem(MEMORY_FAVORITE_CARD_IDS_KEY, JSON.stringify([...ids]));
    return true;
  } catch (error) {
    console.warn("Não foi possível salvar os cartões favoritos:", error);
    $("#memory-note").textContent = "Não foi possível salvar a seleção de favoritos neste navegador.";
    return false;
  }
}

async function ensureMemorySourceSnapshots() {
  if (memorySourceSnapshotsLoaded) {
    buildMemoryDeck();
    return;
  }
  if (memorySnapshotPromise) return memorySnapshotPromise;
  memorySnapshotPromise = (async () => {
    let laws = legalLaws;
    if (!laws.length) {
      const catalogResponse = await fetch(LAWS_URL + "?v=" + Date.now(), { cache: "no-store" });
      if (!catalogResponse.ok) throw new Error("Não foi possível carregar a lista de normas.");
      const catalog = await catalogResponse.json();
      laws = Array.isArray(catalog) ? catalog : [];
      if (!legalLaws.length) legalLaws = laws;
    }

    const pending = laws.filter(law => law && law.id && !memorySourceSnapshots.has(law.id));
    const results = [];
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const law = pending[cursor++];
        try {
          const response = await fetch("data/snapshots/" + encodeURIComponent(law.id) + ".json?v=" + Date.now(), { cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          const snapshot = await response.json();
          if (snapshot && snapshot.articles && typeof snapshot.articles === "object") {
            results.push([law.id, snapshot]);
          }
        } catch (error) {
          console.warn("Captura não disponível para os cartões de memorização:", law.id, error);
        }
      }
    }
    // Quatro consultas simultâneas evitam sobrecarregar o GitHub Pages e o navegador.
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()));
    results.forEach(([id, snapshot]) => memorySourceSnapshots.set(id, snapshot));
    memorySourceSnapshotsLoaded = true;
    buildMemoryDeck();
    const captured = memorySourceSnapshots.size;
    $("#memory-note").textContent = memoryCards.length + " cartões disponíveis, incluindo artigos das " + captured + " normas cujas capturas puderam ser carregadas. As consultas são feitas somente ao abrir este modo e ficam em cache durante a sessão.";
  })().catch(error => {
    memorySnapshotPromise = null;
    console.error("Falha ao ampliar o baralho de memorização:", error);
    $("#memory-note").textContent = "Não foi possível ampliar o baralho agora. Os cartões dos bancos de questões continuam disponíveis; tente abrir este modo novamente.";
  });
  return memorySnapshotPromise;
}

function buildMemoryDeck() {
  const cards = new Map();

  function getCard(lawId, articleKey, details, customId = "") {
    const id = customId || lawId + "::" + articleKey;
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
        captured_at: details.captured_at || null,
        source_type: details.source_type || "legal",
        custom_answer: details.custom_answer || ""
      });
    }
    const card = cards.get(id);
    if (details.literal_text) card.literal_text = details.literal_text;
    if (details.source_url) card.source_url = details.source_url;
    if (details.law_title) card.law_title = details.law_title;
    if (details.article_label) card.article_label = details.article_label;
    if (details.category) card.category = details.category;
    if (details.captured_at) card.captured_at = details.captured_at;
    if (details.source_type) card.source_type = details.source_type;
    if (details.custom_answer) card.custom_answer = details.custom_answer;
    return card;
  }

  // Perguntas já validadas pelo modo Descubra o artigo.
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

  // Perguntas autorais ligadas aos artigos do modo Várias afirmações.
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
      const promptText = "Lembre e explique a regra relacionada a esta afirmação: " + statement.prompt;
      if (!card.prompts.some(prompt => prompt.text === promptText)) {
        card.prompts.push({ text: promptText, type: "afirmação" });
      }
    });
  });

  // Amplia o conjunto com todos os artigos presentes nas capturas válidas das normas.
  memorySourceSnapshots.forEach((snapshot, lawId) => {
    const law = legalLaws.find(item => item.id === lawId);
    if (!law) return;
    Object.entries(snapshot.articles || {}).forEach(([articleKey, literalText]) => {
      if (typeof literalText !== "string" || literalText.trim().length < 30) return;
      const card = getCard(lawId, articleKey, {
        law_title: law.short_title || law.title,
        article_label: articleKey,
        category: legalLawMatter(law),
        source_url: snapshot.source_url_used || law.url,
        literal_text: literalText,
        captured_at: snapshot.captured_at
      });
      const principalPrompt = "Explique, sem consultar, a regra principal prevista em " + articleKey + " de " + (law.short_title || law.title) + ".";
      const detailPrompt = "Quais requisitos, prazos, percentuais, condições, competências ou exceções aparecem neste dispositivo?";
      if (!card.prompts.some(prompt => prompt.text === principalPrompt)) {
        card.prompts.push({ text: principalPrompt, type: "artigo" });
      }
      if (!card.prompts.some(prompt => prompt.text === detailPrompt)) {
        card.prompts.push({ text: detailPrompt, type: "detalhes" });
      }
    });
  });

  // Cartões criados manualmente na Biblioteca Lei Seca.
  loadMemoryCustomCards().forEach(saved => {
    const snapshot = memorySourceSnapshots.get(saved.law_id);
    const currentText = snapshot?.articles?.[saved.article_key] || saved.literal_text;
    const law = legalLaws.find(item => item.id === saved.law_id);
    cards.set(saved.id, {
      ...saved,
      law_title: saved.law_title || law?.short_title || law?.title || "Norma",
      category: saved.category || (law ? legalLawMatter(law) : "Direito Previdenciário"),
      source_url: snapshot?.source_url_used || saved.source_url || law?.url || "https://www.gov.br/",
      literal_text: currentText,
      source_type: "manual"
    });
  });

  // Toda alteração artigo por artigo confirmada pelo monitor vira cartão próprio.
  beforeAfterAvailable.forEach(change => {
    if (!change.law_id || !change.article || !change.new_text) return;
    const id = "change::" + beforeAfterChangeId(change);
    const law = legalLaws.find(item => item.id === change.law_id);
    const lawTitle = change.law_short_title || change.law_title || law?.short_title || law?.title || "Norma";
    const articleLabel = change.article || "Dispositivo";
    const prompts = change.change_type === "incluido"
      ? [{ text: "Qual regra foi acrescentada em " + articleLabel + " de " + lawTitle + "?", type: "alteração" }]
      : [
          { text: "O que mudou na redação de " + articleLabel + " de " + lawTitle + "?", type: "alteração" },
          { text: "Compare a redação anterior e a atual. Quais pontos foram acrescentados, retirados ou modificados?", type: "comparação" }
        ];
    cards.set(id, {
      id,
      law_id: change.law_id,
      article_key: articleLabel,
      law_title: lawTitle,
      article_label: articleLabel,
      category: beforeAfterCategoryForChange(change),
      source_url: change.source_url || law?.url || "https://www.gov.br/",
      literal_text: change.new_text,
      previous_text: change.old_text || "",
      change_summary: change.summary || "",
      detected_at: change.detected_at || "",
      prompts,
      captured_at: change.detected_at || null,
      source_type: "change"
    });
  });

  memoryCards = [...cards.values()].filter(card =>
    card.literal_text && card.prompts.length && card.article_key
  );

  const select = $("#memory-category");
  const previousCategory = select.value || "todas";
  select.replaceChildren();
  select.append(new Option("Todas as matérias", "todas"));
  [...new Set(memoryCards.map(card => card.category))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .forEach(category => select.append(new Option(category, category)));
  if ([...select.options].some(option => option.value === previousCategory)) {
    select.value = previousCategory;
  }

  updateMemoryFilters();
  renderMemoryOverview();
  if (!memorySourceSnapshotsLoaded) {
    $("#memory-note").textContent = memoryCards.length
      + " cartões iniciais disponíveis. Ao abrir este modo, o sistema também carregará as capturas das normas para ampliar o baralho.";
  } else {
    $("#memory-note").textContent = memoryCards.length
      + " cartões disponíveis, montados com artigos das capturas atuais, questões validadas, alterações confirmadas e cartões pessoais.";
  }
  if (!memoryCards.length) {
    $("#memory-note").textContent = "Nenhum cartão pôde ser montado. Confira se a Biblioteca Lei Seca e os bancos de estudo conseguiram carregar os artigos.";
  }
}

function updateMemoryFilters() {
  const pool = selectedMemoryPool();
  $("#start-memory").disabled = pool.length === 0;
  const filter = $("#memory-source-filter");
  if (filter) {
    const labels = {
      todas: "Todos os cartões",
      favoritos: "Artigos favoritos",
      alteracoes: "Alterações legislativas",
      personalizados: "Meus cartões"
    };
    const source = filter.value || "todas";
    $("#memory-note").dataset.filterCount = pool.length + " cartão(ões) na seleção: " + (labels[source] || labels.todas) + ".";
  }
}

async function createMemoryCardsFromFavorites() {
  await ensureMemorySourceSnapshots();
  const favoriteArticles = legalFavoritesSet();
  const candidates = memoryCards.filter(card =>
    card.source_type === "legal" &&
    favoriteArticles.has(legalArticleKey(card.law_id, card.article_key))
  );
  if (!candidates.length) {
    $("#memory-note").textContent = favoriteArticles.size
      ? "Seus artigos favoritos ainda não têm uma captura disponível para criar cartões."
      : "Você ainda não favoritou artigos na Biblioteca Lei Seca.";
    return;
  }
  const saved = loadMemoryFavoriteCardIds();
  const before = saved.size;
  candidates.forEach(card => saved.add(card.id));
  if (!saveMemoryFavoriteCardIds(saved)) return;
  $("#memory-source-filter").value = "favoritos";
  updateMemoryFilters();
  renderMemoryOverview();
  $("#memory-note").textContent = (saved.size - before) + " novo(s) cartão(ões) adicionado(s) a partir dos artigos favoritos. " + candidates.length + " favorito(s) disponível(is) neste baralho.";
}

function openMemoryCardEditor() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  const articleText = $("#law-article-text").textContent || "";
  if (articleText.trim().length < 30) return;
  $("#law-memory-create-prompt").value = "Explique, sem consultar, a regra principal de " + legalSelectedArticle + ".";
  $("#law-memory-create-answer").value = "";
  $("#law-memory-create-panel").classList.remove("hidden");
  $("#law-memory-create-prompt").focus();
  $("#law-memory-create-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function saveMemoryCardFromLibrary() {
  if (!legalSelectedLaw || !legalSelectedArticle) return;
  const prompt = $("#law-memory-create-prompt").value.trim();
  const answer = $("#law-memory-create-answer").value.trim();
  const literalText = $("#law-article-text").textContent || "";
  if (!prompt) {
    $("#law-memory-create-prompt").focus();
    return;
  }
  if (literalText.trim().length < 30) {
    $("#law-reader-warning").textContent = "O texto deste artigo não está disponível para criar um cartão.";
    $("#law-reader-warning").classList.remove("hidden");
    return;
  }
  const card = {
    id: "custom::" + legalSelectedLaw.id + "::" + legalSelectedArticle + "::" + Date.now(),
    law_id: legalSelectedLaw.id,
    article_key: legalSelectedArticle,
    law_title: legalSelectedLaw.short_title || legalSelectedLaw.title,
    article_label: legalSelectedArticle,
    category: legalLawMatter(legalSelectedLaw),
    source_url: legalSnapshot?.source_url_used || legalSelectedLaw.url || "https://www.gov.br/",
    literal_text: literalText,
    custom_answer: answer,
    prompts: [{ text: prompt, type: "manual" }],
    captured_at: legalSnapshot?.captured_at || null,
    source_type: "manual"
  };
  const customCards = loadMemoryCustomCards();
  customCards.push(card);
  if (!saveMemoryCustomCards(customCards)) return;
  $("#law-memory-create-panel").classList.add("hidden");
  buildMemoryDeck();
  $("#memory-source-filter").value = "personalizados";
  updateMemoryFilters();
  renderMemoryOverview();
  showView("memory");
  startMemorySession([memoryCards.find(item => item.id === card.id) || card]);
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
  const reviewedCards = memoryCards.filter(card => Number(progress[card.id]?.review_count) > 0);
  const seen = reviewedCards.length;
  const recallScore = seen ? Math.round(reviewedCards.reduce((total, card) => {
    const rating = progress[card.id]?.last_rating;
    return total + (rating === "good" ? 1 : rating === "hard" ? 0.5 : 0);
  }, 0) / seen * 100) : null;
  $("#memory-total").textContent = String(memoryCards.length);
  $("#memory-due").textContent = String(due);
  $("#memory-seen").textContent = String(seen);
  $("#memory-retention").textContent = recallScore === null ? "—" : recallScore + "%";
  renderCEReviewOverview();
}

function selectedMemoryPool() {
  const category = $("#memory-category").value || "todas";
  const source = $("#memory-source-filter")?.value || "todas";
  const favoriteIds = loadMemoryFavoriteCardIds();
  return memoryCards.filter(card => {
    const categoryMatches = category === "todas" || card.category === category;
    if (!categoryMatches) return false;
    if (source === "favoritos") return favoriteIds.has(card.id);
    if (source === "alteracoes") return card.source_type === "change";
    if (source === "personalizados") return card.source_type === "manual";
    return true;
  });
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
  const originLabels = { legal: "Artigo da lei", manual: "Cartão pessoal", change: "Alteração legislativa" };
  $("#memory-origin-tag").textContent = originLabels[card.source_type] || "Cartão";
  $("#memory-origin-tag").classList.toggle("hidden", !card.source_type);
  $("#memory-recall").value = "";
  $("#memory-recall").readOnly = false;
  $("#memory-recall").classList.remove("is-locked");
  $("#memory-reveal").classList.remove("hidden");
  $("#memory-answer").classList.add("hidden");
  $("#memory-literal").textContent = card.literal_text;
  $("#memory-literal-wrap").classList.toggle("hidden", card.source_type === "change");
  $("#memory-custom-answer-wrap").classList.toggle("hidden", !card.custom_answer);
  $("#memory-custom-answer").textContent = card.custom_answer || "";
  $("#memory-change-comparison").classList.toggle("hidden", card.source_type !== "change");
  $("#memory-previous-literal").textContent = card.previous_text || "Não há redação anterior registrada.";
  $("#memory-current-literal").textContent = card.literal_text || "";
  $("#memory-change-summary").textContent = card.change_summary || "Comparação registrada pelo monitor de alterações legislativas.";
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
    last_rating: rating,
    mastered: false
  };
  saveMemoryProgress(progress);
  recordDifficultArticleMemoryRating(card,rating);
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
  const selfReportedRecall = total ? Math.round((good.length + partial.length * 0.5) / total * 100) : 0;
  $("#memory-score-note").textContent = "Você marcou " + good.length + " como lembrou bem, " + partial.length + " como lembrou em parte e " + again.length + " como esquecido. Lembrança percebida nesta sessão: " + selfReportedRecall + "% (autoavaliação).";
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
  const review = view === "review";
  const radar = view === "radar";
  const law = view === "law";
  $("#radar-view").classList.toggle("hidden", !radar);
  $("#law-view").classList.toggle("hidden", !law);
  $("#quiz-view").classList.toggle("hidden", !quiz);
  $("#cloze-view").classList.toggle("hidden", !cloze);
  $("#find-error-view").classList.toggle("hidden", !findError);
  $("#article-view").classList.toggle("hidden", !article);
  $("#multi-ce-view").classList.toggle("hidden", !multiCE);
  $("#before-after-view").classList.toggle("hidden", !beforeAfter);
  $("#memory-view").classList.toggle("hidden", !memory);
  $("#review-view").classList.toggle("hidden", !review);
  $("#tab-radar").classList.toggle("active", radar);
  $("#tab-law").classList.toggle("active", law);
  $("#tab-quiz").classList.toggle("active", quiz);
  $("#tab-cloze").classList.toggle("active", cloze);
  $("#tab-find-error").classList.toggle("active", findError);
  $("#tab-article").classList.toggle("active", article);
  $("#tab-multi-ce").classList.toggle("active", multiCE);
  $("#tab-before-after").classList.toggle("active", beforeAfter);
  $("#tab-memory").classList.toggle("active", memory);
  $("#tab-review").classList.toggle("active", review);
  [ ["tab-radar", radar], ["tab-law", law], ["tab-quiz", quiz], ["tab-cloze", cloze], ["tab-find-error", findError], ["tab-article", article], ["tab-multi-ce", multiCE], ["tab-before-after", beforeAfter], ["tab-memory", memory], ["tab-review", review] ].forEach(([id, active]) => {
    if (active) $("#" + id).setAttribute("aria-current", "page");
    else $("#" + id).removeAttribute("aria-current");
  });
  if (law) $("#law-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (quiz) $("#quiz-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (cloze) $("#cloze-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (findError) $("#find-error-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (article) $("#article-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (multiCE) $("#multi-ce-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (beforeAfter) $("#before-after-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (memory) $("#memory-view").scrollIntoView({ behavior: "smooth", block: "start" });
  else if (review) $("#review-view").scrollIntoView({ behavior: "smooth", block: "start" });
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
$("#tab-law").addEventListener("click", () => showView("law"));
$("#tab-quiz").addEventListener("click", () => showView("quiz"));
$("#tab-cloze").addEventListener("click", () => showView("cloze"));
$("#tab-find-error").addEventListener("click", () => showView("find-error"));
$("#tab-article").addEventListener("click", () => showView("article"));
$("#tab-multi-ce").addEventListener("click", () => showView("multi-ce"));
$("#tab-before-after").addEventListener("click", () => showView("before-after"));
$("#tab-memory").addEventListener("click", () => { renderMemoryOverview(); renderCEReviewOverview(); showView("memory"); ensureMemorySourceSnapshots(); });
$("#ce-review-start").addEventListener("click", startCEReviewSession);
$("#start-memory").addEventListener("click", () => startMemorySession());
$("#memory-category").addEventListener("change", updateMemoryFilters);
$("#memory-source-filter").addEventListener("change", updateMemoryFilters);
$("#memory-import-favorites").addEventListener("click", createMemoryCardsFromFavorites);
$("#law-memory-create").addEventListener("click", openMemoryCardEditor);
$("#law-memory-create-save").addEventListener("click", saveMemoryCardFromLibrary);
$("#law-memory-create-cancel").addEventListener("click", () => $("#law-memory-create-panel").classList.add("hidden"));
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
$("#law-library-search").addEventListener("input", renderLegalLibrary);
$("#law-library-category").addEventListener("change", renderLegalLibrary);
$("#law-article-select").addEventListener("change", () => {
  legalSelectedArticle = $("#law-article-select").value;
  renderLegalArticle();
  updateLegalQuizButton();
});
$("#law-article-filter").addEventListener("change", renderLegalArticlePicker);
$("#law-article-search").addEventListener("input", searchLegalArticles);
$("#law-components-expand-all").addEventListener("click", () => {
  $("#law-components-list").querySelectorAll("details.law-component-node").forEach(node => { node.open = true; });
});
$("#law-components-collapse-all").addEventListener("click", () => {
  $("#law-components-list").querySelectorAll("details.law-component-node").forEach(node => { node.open = false; });
});
$("#law-favorite-article").addEventListener("click", toggleLegalArticleFavorite);
$("#law-mark-studied").addEventListener("click", toggleLegalArticleStudied);
$("#law-previous-article").addEventListener("click", () => stepLegalArticle(-1));
$("#law-next-article").addEventListener("click", () => stepLegalArticle(1));
$("#law-train-article").addEventListener("click", startLegalArticleTraining);
$("#law-train-quiz").addEventListener("click", startQuizForLegalArticle);
$("#law-train-facts").addEventListener("click", startLegalFactTraining);
$("#law-training-selected-paragraphs").addEventListener("click", () => startLegalSelectedDeviceTraining("paragrafo"));
$("#law-training-selected-incisos").addEventListener("click", () => startLegalSelectedDeviceTraining("inciso"));
$("#law-training-true").addEventListener("click", () => answerLegalTrainingCE(true));
$("#law-training-false").addEventListener("click", () => answerLegalTrainingCE(false));
$("#law-training-reveal").addEventListener("click", revealLegalTrainingRecall);
$("#law-training-check").addEventListener("click", checkLegalTrainingCloze);
$("#law-training-next").addEventListener("click", nextLegalTrainingItem);
$("#law-training-close").addEventListener("click", () => $("#law-training-panel").classList.add("hidden"));
document.addEventListener("selectionchange", queueLegalExcerptSelectionUpdate);
$("#law-selection-toolbar").addEventListener("mousedown", event => event.preventDefault());
$("#law-train-selection").addEventListener("click", trainSelectedLegalExcerpt);
$("#law-clear-selection").addEventListener("click", clearLegalExcerptSelection);
$("#cloze-law").addEventListener("change", loadClozeSnapshot);
$("#cloze-content-type").addEventListener("change", updateClozeArticleOptions);
$("#cloze-article").addEventListener("change", updateClozeDeviceOptions);
$("#cloze-review-start").addEventListener("click", startClozeReviewSession);
$("#cloze-train-selection").addEventListener("click", startClozeFromSelectedText);
$("#cloze-selection-toolbar").addEventListener("mousedown", event => event.preventDefault());
document.addEventListener("selectionchange", updateClozeSelectionToolbar);
$("#start-cloze").addEventListener("click", startCloze);
$("#check-cloze").addEventListener("click", checkCloze);
$("#next-cloze").addEventListener("click", () => {
  if (clozeCurrent && clozeCurrent.sourceType === "selection") showView("law");
  else if (clozeCurrent && clozeCurrent.sourceType === "review") nextClozeReviewItem();
  else startCloze();
});
$("#start-error").addEventListener("click", () => startFindErrorGame());
$("#error-category").addEventListener("change", updateFindErrorFilters);
$("#error-type").addEventListener("change", updateFindErrorFilters);
$("#error-review-start").addEventListener("click", startFindErrorReviewSession);
$("#next-error-question").addEventListener("click", nextFindErrorQuestion);
$("#restart-error").addEventListener("click", () => startFindErrorGame());
$("#error-retry-misses").addEventListener("click", () => {
  const repeated = findErrorState.answers.filter(answer => answer.attempts > 1).map(answer => answer.item);
  startFindErrorGame(repeated);
});
$("#start-article").addEventListener("click", () => startArticleGame());
$("#article-category").addEventListener("change", updateArticleGameFilters);
$("#article-law-filter").addEventListener("change", updateArticleGameFilters);
$("#article-study-filter").addEventListener("change", updateArticleGameFilters);
$("#article-review-start").addEventListener("click", startArticleReviewSession);
$("#submit-article").addEventListener("click", submitArticleAnswer);
$("#next-article").addEventListener("click", nextArticleQuestion);
$("#restart-article").addEventListener("click", () => startArticleGame());
$("#article-retry-mistakes").addEventListener("click", () => {
  const misses = articleGameState.answers.filter(answer => !answer.correct).map(answer => answer.item);
  startArticleGame(misses);
});
$("#start-multi-ce").addEventListener("click", () => startMultiCEGame());
$("#multi-ce-category").addEventListener("change", updateMultiCEFilters);
$("#multi-ce-law-filter").addEventListener("change", updateMultiCEFilters);
$("#multi-ce-true").addEventListener("click", () => chooseMultiCEAnswer(true));
$("#multi-ce-false").addEventListener("click", () => chooseMultiCEAnswer(false));
$("#multi-ce-article-toggle").addEventListener("click", () => {
  const panel=$("#multi-ce-article-panel");
  const opening=panel.hidden;
  panel.hidden=!opening;
  $("#multi-ce-article-toggle").textContent=opening?"Fechar artigo":"Ler artigo antes de responder";
  $("#multi-ce-article-toggle").setAttribute("aria-expanded",String(opening));
  if(opening) panel.scrollIntoView({behavior:"smooth",block:"nearest"});
});
$("#multi-ce-submit").addEventListener("click", submitMultiCEAnswer);
$("#multi-ce-next").addEventListener("click", nextMultiCEStatement);
$("#multi-ce-restart").addEventListener("click", () => startMultiCEGame());
$("#multi-ce-retry-mistakes").addEventListener("click", () => {
  const failed = new Set(multiCEState.answers.filter(answer => !answer.correct).map(answer => answer.group.id));
  startMultiCEGame(multiCEGroups.filter(group => failed.has(group.id)));
});
["#quiz-category","#quiz-topic","#quiz-law-filter","#quiz-article-filter"].forEach(selector => {
  $(selector).addEventListener("change", updateQuizFilters);
});
$("#start-quiz").addEventListener("click", () => startQuiz());
$("#answer-true").addEventListener("click", () => chooseAnswer(true));
$("#answer-false").addEventListener("click", () => chooseAnswer(false));
$("#answer-unknown").addEventListener("click", chooseUnknownAnswer);
$("#submit-answer").addEventListener("click", submitAnswer);
$("#next-question").addEventListener("click", nextQuestion);
$("#restart-quiz").addEventListener("click", () => {
  $("#quiz-summary").classList.add("hidden");
  $("#quiz-welcome").classList.remove("hidden");
  startQuiz();
});
$("#retry-mistakes").addEventListener("click", () => {
  const mistakes = quizState.answers.filter(answer => !answer.correct).map(answer => answer.item);
  startQuiz(mistakes,{fullPool:true});
});
document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
loadDashboard();
loadQuestionBank();
loadClozeLaws();
loadLegalLibrary();
loadFindErrorBank();
Promise.all([loadArticleGameBank(), loadMultiCEBank()]).then(buildMemoryDeck);



/* -------------------- Central de revisão unificada -------------------- */
const DIFFICULT_ARTICLE_REVIEW_KEY="radarLegislativo.difficultArticles.v1";
let centralReviewSession={active:false,keys:[],index:0,title:""};
let centralReviewEntriesCache=[];

function loadDifficultArticleQueue(){
  try{const value=JSON.parse(localStorage.getItem(DIFFICULT_ARTICLE_REVIEW_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
  catch(_){return {};}
}
function saveDifficultArticleQueue(queue){
  try{localStorage.setItem(DIFFICULT_ARTICLE_REVIEW_KEY,JSON.stringify(queue));}
  catch(error){console.warn("Não foi possível salvar artigos difíceis:",error);}
}
function toggleLegalArticleDifficulty(){
  if(!legalSelectedLaw||!legalSelectedArticle||!legalSnapshot)return;
  const key=legalArticleKey(legalSelectedLaw.id,legalSelectedArticle),queue=loadDifficultArticleQueue();
  if(queue[key]&&queue[key].status!=="mastered")delete queue[key];
  else{
    const now=new Date().toISOString();
    queue[key]={id:key,law_id:legalSelectedLaw.id,law_title:legalSelectedLaw.short_title||legalSelectedLaw.title,
      category:legalLawMatter(legalSelectedLaw),article_key:legalSelectedArticle,article:legalSelectedArticle,
      literal_text:legalSnapshot.articles?.[legalSelectedArticle]||$("#law-article-text").textContent||"",
      source_url:legalSnapshot.source_url_used||legalSelectedLaw.url||"",first_marked_at:now,last_marked_at:now,
      misses:0,correct_reviews:0,next_due:now,status:"pending"};
  }
  saveDifficultArticleQueue(queue);renderLegalArticle();renderCentralReview();
}
function recordDifficultArticleMemoryRating(card,rating){
  if(!card?.law_id||!card?.article_key)return;
  const key=legalArticleKey(card.law_id,card.article_key),queue=loadDifficultArticleQueue(),old=queue[key];
  if(!old||old.status==="mastered")return;
  const now=Date.now();let correct=Number(old.correct_reviews)||0,misses=Number(old.misses)||0,nextDue=now,status="pending";
  if(rating==="good"){correct++;if(correct>=3){status="mastered";nextDue=null;}else nextDue=now+(correct===1?1:3)*86400000;}
  else if(rating==="hard"){correct=0;nextDue=now+86400000;}
  else{correct=0;misses++;nextDue=now+10*60*1000;}
  queue[key]={...old,misses,correct_reviews:correct,last_rating:rating,last_reviewed_at:new Date(now).toISOString(),
    next_due:nextDue?new Date(nextDue).toISOString():null,status};saveDifficultArticleQueue(queue);
}
function centralReviewDueAt(value){if(!value)return 0;const t=new Date(value).getTime();return Number.isFinite(t)?t:0;}
function centralReviewSourceLabel(source){
  return ({ce:"Certo ou Errado",cloze:"Completar Lei Seca",error:"Encontre o erro",article:"Descubra o artigo",
    beforeAfter:"Antes e depois",difficulty:"Artigo com dificuldade",memory:"Memorização ativa"})[source]||"Revisão";
}
function centralReviewTopic(item,source){
  if(source==="ce")return item.topic||(item.multi_ce?"Várias afirmações":"Questões Certo ou Errado");
  if(source==="cloze")return item.device_label||"Texto da Lei Seca";
  if(source==="error")return findErrorTypeLabel(item.question_type);
  if(source==="article")return item.topic||"Identificação de artigo";
  if(source==="beforeAfter")return "Alterações legislativas";
  if(source==="difficulty")return "Artigos marcados com dificuldade";
  if(source==="memory")return item.source_type==="change"?"Alterações legislativas":item.source_type==="manual"?"Cartões pessoais":"Memorização ativa";
  return "Outros assuntos";
}
function makeCentralReviewEntry(source,id,native,item,opts={}){
  const lawId=item.law_id||native.law_id||"",article=item.article||item.article_key||item.answer_article_key||native.article||native.article_key||"";
  const law=legalLaws.find(x=>x.id===lawId),lawTitle=item.law_title||item.law_short_title||native.law_title||law?.short_title||law?.title||"Norma não identificada";
  const misses=Number(native.misses??native.error_count??0)||0,correct=Number(native.correct_reviews??0)||0,nextDue=native.next_due||null;
  const due=native.status!=="mastered"&&centralReviewDueAt(nextDue)<=Date.now();
  const description=opts.description||item.question||item.statement||item.prompt||item.summary||"Conteúdo salvo para revisão.";
  return {key:source+"::"+id,source,source_label:centralReviewSourceLabel(source),native_id:id,native,item,law_id:lawId,
    law_title:lawTitle,category:item.category||(law?legalLawMatter(law):"Outras matérias"),topic:centralReviewTopic(item,source),
    article:String(article||"Artigo não identificado"),title:opts.title||description,description,
    misses,correct_reviews:correct,next_due:nextDue,due,status:native.status==="mastered"?"mastered":"pending",
    source_url:item.source_url||native.source_url||"",
    last_response:native.last_response==="nao_sei"?"Última resposta: Não sei":native.last_response==="errado"?"Última resposta: Errado":"",
    available:opts.available!==false,priority:misses*10+(due?2:0)-correct};
}
function collectCentralReviewData(){
  const entries=[];let mastered=0;
  const add=(source,queue,mapper)=>Object.entries(queue).forEach(([id,native])=>{
    if(!native||typeof native!=="object")return;if(native.status==="mastered"){mastered++;return;}
    const entry=mapper(id,native);if(entry)entries.push(entry);
  });
  add("ce",loadCEReviewQueue(),(id,native)=>{
    const item=native.item||{};return makeCentralReviewEntry("ce",id,native,item,{title:item.statement||item.prompt||"Questão Certo ou Errado",
      description:item.explanation||item.statement||"",available:Boolean(item.statement||item.prompt)});
  });
  add("cloze",loadClozeReviewQueue(),(id,native)=>{
    if(!native.blank||!native.text)return null;const item={...native,id,article:native.article,law_id:native.law_id,law_title:native.law_title};
    return makeCentralReviewEntry("cloze",id,native,item,{title:"Complete o trecho: "+(native.blank.value||"lacuna da lei"),
      description:native.text,available:Boolean(native.blank.value&&native.text)});
  });
  const errors=new Map(findErrorItems.map(x=>[x.id,x]));
  add("error",loadFindErrorReviewQueue(),(id,native)=>{
    const saved=native.item||{},item=errors.get(saved.id)||saved;
    return makeCentralReviewEntry("error",id,native,item,{title:(item.segments||[]).join(""),
      description:item.explanation||item.correct_phrase||"Identifique a expressão incorreta.",available:errors.has(saved.id)});
  });
  const articles=new Map(articleQuestions.map(x=>[x.id,x]));
  add("article",loadArticleReviewQueue(),(id,native)=>{
    const saved=native.item||{},item=articles.get(saved.id)||saved;
    return makeCentralReviewEntry("article",id,native,item,{title:item.question||"Identifique o artigo correto",
      description:item.question||"Identifique o artigo correspondente.",available:articles.has(saved.id)});
  });
  const changes=new Map(beforeAfterAvailable.map(x=>[beforeAfterChangeId(x),x]));
  add("beforeAfter",loadBeforeAfterReviewQueue(),(id,native)=>{
    const saved=native.item||{},item=changes.get(id)||saved;
    return makeCentralReviewEntry("beforeAfter",id,native,item,{title:item.summary||"Compare a redação anterior com a atual.",
      description:item.summary||"Identifique a redação atual e o tipo de alteração.",available:changes.has(id)});
  });
  add("difficulty",loadDifficultArticleQueue(),(id,native)=>{
    const item={...native,article:native.article_key||native.article};
    const available=Boolean(native.literal_text||memoryCards.some(c=>c.law_id===native.law_id&&c.article_key===native.article_key));
    return makeCentralReviewEntry("difficulty",id,native,item,{title:"Reforce "+(native.article_key||native.article||"este artigo"),
      description:"Artigo marcado manualmente como conteúdo de dificuldade.",available});
  });
  const progress=loadMemoryProgress();
  memoryCards.forEach(card=>{
    const saved=progress[card.id];if(!saved||!(Number(saved.review_count)>0))return;
    if(saved.mastered){mastered++;return;}
    const native={...saved,status:"pending",misses:saved.last_rating==="again"?1:0};
    entries.push(makeCentralReviewEntry("memory",card.id,native,card,{
      title:card.prompts?.[0]?.text||"Lembre o conteúdo deste cartão.",
      description:card.source_type==="change"?card.change_summary||"Revisão de alteração legislativa.":card.custom_answer||card.literal_text||"Cartão de memorização ativa.",
      available:Boolean(card.literal_text&&card.prompts?.length)}));
  });
  entries.sort((a,b)=>b.priority-a.priority||centralReviewDueAt(a.next_due)-centralReviewDueAt(b.next_due)||a.law_title.localeCompare(b.law_title,"pt-BR"));
  return {entries,mastered};
}
function fillCentralReviewSelect(selector,label,values){
  const node=$(selector);if(!node)return;const previous=node.value||"todos";node.replaceChildren(new Option(label,"todos"));
  values.forEach(o=>typeof o==="string"?node.append(new Option(o,o)):node.append(new Option(o.label,o.value)));
  if([...node.options].some(o=>o.value===previous))node.value=previous;
}
function centralReviewFilteredEntries(entries=centralReviewEntriesCache){
  const category=$("#central-review-category").value||"todos",topic=$("#central-review-topic").value||"todos";
  const law=$("#central-review-law").value||"todos",article=$("#central-review-article").value||"todos",query=normalizeAnswer($("#central-review-search").value||"");
  return entries.filter(e=>(category==="todos"||e.category===category)&&(topic==="todos"||e.topic===topic)
    &&(law==="todos"||e.law_id===law)&&(article==="todos"||e.article===article)
    &&(!query||normalizeAnswer([e.title,e.description,e.law_title,e.article,e.topic].join(" ")).includes(query)));
}
function refreshCentralReviewFilters(entries){
  fillCentralReviewSelect("#central-review-category","Todas as matérias",[...new Set(entries.map(e=>e.category))].sort((a,b)=>a.localeCompare(b,"pt-BR")));
  fillCentralReviewSelect("#central-review-topic","Todos os assuntos",[...new Set(entries.map(e=>e.topic))].sort((a,b)=>a.localeCompare(b,"pt-BR")));
  const laws=[...new Map(entries.filter(e=>e.law_id).map(e=>[e.law_id,e.law_title])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"pt-BR")).map(([value,label])=>({value,label}));
  fillCentralReviewSelect("#central-review-law","Todas as normas",laws);
  fillCentralReviewSelect("#central-review-article","Todos os artigos",[...new Set(entries.map(e=>e.article))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true})));
}
function createCentralReviewCard(entry){
  const card=document.createElement("article");card.className="central-review-card";
  const head=document.createElement("div");head.className="central-review-card-head";
  const source=document.createElement("span");source.className="central-review-source";source.textContent=entry.source_label;
  const due=document.createElement("span");due.className="central-review-due"+(entry.due?" is-due":"");due.textContent=entry.due?"Revisão vencida":"Próxima: "+formatDate(entry.next_due);head.append(source,due);
  const title=document.createElement("h3");title.textContent=entry.title;
  const meta=document.createElement("p");meta.className="central-review-meta";meta.textContent=[entry.category,entry.topic,entry.law_title,entry.article].filter(Boolean).join(" · ");
  const desc=document.createElement("p");desc.className="central-review-description";desc.textContent=entry.description.length>260?entry.description.slice(0,257)+"…":entry.description;
  const metrics=document.createElement("div");metrics.className="central-review-metrics";
  const miss=document.createElement("span");miss.textContent=entry.misses+" erro(s)";const correct=document.createElement("span");correct.textContent=entry.correct_reviews+"/3 acertos na revisão";metrics.append(miss,correct);
  if(entry.last_response){const last=document.createElement("span");last.textContent=entry.last_response;metrics.append(last);}
  const actions=document.createElement("div");actions.className="central-review-card-actions";
  const review=document.createElement("button");review.type="button";review.className="primary-button";review.textContent=entry.due?"Revisar agora":"Antecipar revisão";review.disabled=!entry.available;review.addEventListener("click",()=>startCentralReviewEntry(entry));
  const mastered=document.createElement("button");mastered.type="button";mastered.className="secondary-button";mastered.textContent="Marcar como dominado";mastered.addEventListener("click",()=>markCentralReviewMastered(entry));actions.append(review,mastered);
  if(!entry.available){const note=document.createElement("span");note.className="central-review-unavailable";note.textContent="Questão suspensa: não está disponível no banco/captura atual.";actions.append(note);}
  card.append(head,title,meta,desc,metrics,actions);return card;
}
function renderCentralReview(){
  const list=$("#central-review-list");if(!list)return;const data=collectCentralReviewData();centralReviewEntriesCache=data.entries;refreshCentralReviewFilters(data.entries);
  const filtered=centralReviewFilteredEntries(data.entries),due=data.entries.filter(e=>e.due).length;
  $("#central-review-due").textContent=String(due);$("#central-review-pending").textContent=String(data.entries.length);$("#central-review-mastered").textContent=String(data.mastered);
  $("#central-review-visible-count").textContent=filtered.length+" de "+data.entries.length+" conteúdos ativos";
  $("#central-review-start-due").disabled=due===0;$("#central-review-start-all").disabled=data.entries.length===0;
  $("#central-review-start-due").textContent=due?"Revisar pendentes ("+due+")":"Nenhuma revisão vencida";
  $("#central-review-start-all").textContent=data.entries.length?"Iniciar revisão geral ("+data.entries.length+")":"Fila vazia";
  if(centralReviewSession.active){
    $("#central-review-session-note").textContent="Sessão em andamento: conteúdo "+(centralReviewSession.index+1)+" de "+centralReviewSession.keys.length+". Depois de responder, volte aqui para avançar.";
    $("#central-review-next").classList.remove("hidden");$("#central-review-next").disabled=centralReviewSession.index>=centralReviewSession.keys.length;
    $("#central-review-next").textContent=centralReviewSession.index>=centralReviewSession.keys.length?"Sessão concluída":"Próximo conteúdo da sessão →";$("#central-review-stop-session").classList.remove("hidden");
  }else{$("#central-review-session-note").textContent="A fila reúne erros, itens marcados como “Não sei”, artigos difíceis, cartões e alterações legislativas.";$("#central-review-next").classList.add("hidden");$("#central-review-stop-session").classList.add("hidden");}
  list.replaceChildren();
  if(!filtered.length){const empty=document.createElement("div");empty.className="empty-state";const title=document.createElement("h3"),message=document.createElement("p");
    title.textContent=data.entries.length?"Nenhum conteúdo corresponde aos filtros":"Sua fila de revisão está vazia";
    message.textContent=data.entries.length?"Altere os filtros para localizar outros conteúdos.":"Quando você errar, marcar “Não sei” ou sinalizar um artigo como difícil, ele aparecerá aqui. Alterações confirmadas também entram automaticamente.";
    empty.append(title,message);list.append(empty);return;}
  filtered.forEach(e=>list.append(createCentralReviewCard(e)));
}
function centralReviewBatch(dueOnly){
  renderCentralReview();const entries=centralReviewFilteredEntries().filter(e=>e.available&&(!dueOnly||e.due));
  if(!entries.length){$("#central-review-session-note").textContent=dueOnly?"Não há conteúdos vencidos nesta seleção.":"Não há conteúdos disponíveis para iniciar a revisão geral.";return;}
  centralReviewSession={active:true,keys:entries.map(e=>e.key),index:0,title:dueOnly?"Revisão dos pendentes":"Revisão geral"};startCentralReviewCurrent();
}
function startCentralReviewCurrent(){
  const key=centralReviewSession.keys[centralReviewSession.index],entry=centralReviewEntriesCache.find(e=>e.key===key);
  if(!entry){renderCentralReview();return;}renderCentralReview();startCentralReviewEntry(entry);
}
function nextCentralReviewSessionItem(){
  if(!centralReviewSession.active)return;centralReviewSession.index++;
  if(centralReviewSession.index>=centralReviewSession.keys.length){centralReviewSession={active:false,keys:[],index:0,title:""};renderCentralReview();$("#central-review-session-note").textContent="Sessão concluída. Os intervalos foram atualizados pelos jogos.";return;}
  startCentralReviewCurrent();
}
function stopCentralReviewSession(){centralReviewSession={active:false,keys:[],index:0,title:""};renderCentralReview();}
function startCentralReviewEntry(entry){
  if(!entry||!entry.available)return;
  if(entry.source==="ce"){const item=questionBank.find(q=>q.id===entry.native.item?.id)||entry.item;if(!item.statement&&!item.prompt)return;showView("quiz");startQuiz([item],{reviewMode:true,fullPool:true});return;}
  if(entry.source==="cloze"){const item=entry.native;clozeReviewSessionSeen=new Set([entry.native_id]);showView("cloze");
    renderClozeExercise({article:item.article,text:item.text,fullText:item.fullText||item.text,sourceType:"review",review_id:entry.native_id,law_id:item.law_id,law_title:item.law_title,source_url:item.source_url,device_label:item.device_label},"dificil",[item.blank]);return;}
  if(entry.source==="error"){const id=entry.native.item?.id,item=findErrorItems.find(x=>x.id===id);if(!item)return;showView("find-error");startFindErrorGame([item],{reviewMode:true});return;}
  if(entry.source==="article"){const id=entry.native.item?.id,item=articleQuestions.find(x=>x.id===id);if(!item)return;showView("article");startArticleGame([item],{reviewMode:true});return;}
  if(entry.source==="beforeAfter"){const change=beforeAfterAvailable.find(x=>beforeAfterChangeId(x)===entry.native_id);if(!change)return;showView("before-after");startBeforeAfterGame([change],{reviewMode:true});return;}
  if(entry.source==="difficulty"||entry.source==="memory"){
    const open=async()=>{
      if(!memorySourceSnapshotsLoaded)await ensureMemorySourceSnapshots();
      let card=entry.source==="memory"?memoryCards.find(x=>x.id===entry.native_id):memoryCards.find(x=>x.source_type==="legal"&&x.law_id===entry.law_id&&x.article_key===entry.item.article_key);
      if(!card&&entry.source==="difficulty"){
        const snapshot=memorySourceSnapshots.get(entry.law_id),law=legalLaws.find(x=>x.id===entry.law_id),key=entry.item.article_key,literal=snapshot?.articles?.[key]||entry.item.literal_text||"";
        if(literal)card={id:entry.law_id+"::"+key,law_id:entry.law_id,article_key:key,law_title:entry.law_title,article_label:entry.article,category:entry.category,
          source_url:snapshot?.source_url_used||entry.item.source_url||law?.url||"",literal_text:literal,prompts:[{text:"Explique, sem consultar, a regra principal prevista em "+entry.article+".",type:"artigo"}],source_type:"legal"};
      }
      if(!card){$("#central-review-session-note").textContent="Não foi possível localizar o cartão ou o texto atual deste artigo.";return;}showView("memory");startMemorySession([card]);
    };open();return;
  }
}
function markCentralReviewMastered(entry){
  if(!entry)return;const now=new Date().toISOString();
  const update=(key,id)=>{let queue={};try{queue=JSON.parse(localStorage.getItem(key)||"{}");}catch(_){}
    if(queue[id]){queue[id]={...queue[id],status:"mastered",next_due:null,mastered_at:now,mastered_by_user:true};localStorage.setItem(key,JSON.stringify(queue));}};
  if(entry.source==="ce")update(CE_REVIEW_KEY,entry.native_id);
  else if(entry.source==="cloze")update(CLOZE_REVIEW_KEY,entry.native_id);
  else if(entry.source==="error")update(ERROR_REVIEW_KEY,entry.native_id);
  else if(entry.source==="article")update(ARTICLE_REVIEW_KEY,entry.native_id);
  else if(entry.source==="beforeAfter")update(BEFORE_AFTER_REVIEW_KEY,entry.native_id);
  else if(entry.source==="difficulty")update(DIFFICULT_ARTICLE_REVIEW_KEY,entry.native_id);
  else if(entry.source==="memory"){const progress=loadMemoryProgress();progress[entry.native_id]={...(progress[entry.native_id]||{}),mastered:true,next_due:null,mastered_at:now};saveMemoryProgress(progress);}
  renderCentralReview();renderCEReviewOverview();renderClozeReviewOverview();renderFindErrorReviewOverview();renderArticleReviewOverview();renderBeforeAfterReviewOverview();renderMemoryOverview();
}
$("#tab-review").addEventListener("click",()=>{renderCentralReview();showView("review");ensureMemorySourceSnapshots().then(renderCentralReview);});
["#central-review-category","#central-review-topic","#central-review-law","#central-review-article"].forEach(selector=>$(selector).addEventListener("change",renderCentralReview));
$("#central-review-search").addEventListener("input",renderCentralReview);
$("#central-review-start-due").addEventListener("click",()=>centralReviewBatch(true));
$("#central-review-start-all").addEventListener("click",()=>centralReviewBatch(false));
$("#central-review-next").addEventListener("click",nextCentralReviewSessionItem);
$("#central-review-stop-session").addEventListener("click",stopCentralReviewSession);
$("#law-mark-difficult").addEventListener("click",toggleLegalArticleDifficulty);



function legalTrainingReviewItem(item){
  const law=legalSelectedLaw,article=legalSelectedArticle;
  const match=questionBank.find(q=>q.law_id===law?.id&&normalizeAnswer(q.statement)===normalizeAnswer(item.prompt)
    &&legalTrainingArticleMatches(q.article||q.article_key,article));
  let id=match?.id||"";
  if(!id){
    for(const group of multiCEGroups){
      if(group.law_id!==law?.id||!legalTrainingArticleMatches(group.article_key,article))continue;
      const statement=(group.statements||[]).find(x=>normalizeAnswer(x.prompt)===normalizeAnswer(item.prompt));
      if(statement){id="multi-ce::"+group.id+"::"+statement.id;break;}
    }
  }
  if(!id)id="library-training::"+(law?.id||"norma")+"::"+article+"::"+normalizeAnswer(item.prompt).slice(0,100);
  return {id,category:legalLawMatter(law||{}),law_id:law?.id||"",law_title:law?.short_title||law?.title||"Norma",
    article,article_key:article,topic:item.kindLabel||"Treinamento na Biblioteca",statement:item.prompt,
    answer:item.answer,explanation:item.explanation||"",literal_text:item.sourceText||item.literalText||"",
    source_url:item.sourceUrl||legalSnapshot?.source_url_used||law?.url||""};
}
function recordLegalTrainingCEReview(item,chosen){
  const reviewItem=legalTrainingReviewItem(item);
  if(chosen!==reviewItem.answer)recordCEReviewMiss(reviewItem,chosen,false);
  else{
    const existing=loadCEReviewQueue()[reviewItem.id];
    if(existing&&existing.status!=="mastered")recordCEReviewSuccess(reviewItem);
  }
}
function recordLegalTrainingClozeReview(item,inputs){
  const current={sourceType:"catalog",law_id:legalSelectedLaw?.id||"",law_title:legalSelectedLaw?.short_title||legalSelectedLaw?.title||"Lei Seca",
    article:legalSelectedArticle||"",text:item.text,fullText:item.text,source_url:item.sourceUrl||legalSnapshot?.source_url_used||"",
    device_label:item.kindLabel||"Trecho da Biblioteca"};
  const queue=loadClozeReviewQueue();
  inputs.forEach(input=>{
    const index=Number(input.dataset.index),blank=item.blanks[index];
    if(!blank)return;
    const id=[current.law_id||"norma",current.article||"artigo",current.device_label||"",blank.start,normalizeAnswer(blank.value)].join("::");
    if(normalizeAnswer(input.value||"")===normalizeAnswer(blank.value)){
      if(queue[id]&&queue[id].status==="pending")recordClozeReviewSuccess(id);
    }else recordClozeReviewError(current,blank,input.value||"");
  });
}