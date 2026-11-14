(function (root) {
  "use strict";
  const BACKUP_FORMAT = "radar-legislativo-inss-backup";
  const BACKUP_VERSION = 1;
  const ACTIVE_SESSION_KEY = "radarLegislativo.activityActiveSession.v1";
  const MAX_BACKUP_CHARS = 25 * 1024 * 1024;
  const MAX_ITEM_CHARS = 12 * 1024 * 1024;
  const STORAGE_KEYS = Object.freeze([
    "radarLegislativo.lastSeen",
    "radarLegislativo.studyStates",
    "radarLegislativo.memoryProgress.v1",
    "radarLegislativo.memoryCustomCards.v1",
    "radarLegislativo.memoryFavoriteCardIds.v1",
    "radarLegislativo.ceReview.v1",
    "radarLegislativo.clozeReview.v1",
    "radarLegislativo.errorReview.v1",
    "radarLegislativo.articleReview.v1",
    "radarLegislativo.beforeAfterReview.v1",
    "radarLegislativo.leiSeca.studiedAt.v1",
    "radarLegislativo.leiSeca.studied.v1",
    "radarLegislativo.leiSeca.favorites.v1",
    "radarLegislativo.difficultArticles.v1",
    "radarLegislativo.activityEvents.v1",
    "radarLegislativo.activitySessions.v1",
    "radarLegislativo.experience.v1",
    "radarLegislativo.achievements.v1"
  ]);
  const OBJECT_KEYS = new Set([
    "radarLegislativo.studyStates",
    "radarLegislativo.memoryProgress.v1",
    "radarLegislativo.ceReview.v1",
    "radarLegislativo.clozeReview.v1",
    "radarLegislativo.errorReview.v1",
    "radarLegislativo.articleReview.v1",
    "radarLegislativo.beforeAfterReview.v1",
    "radarLegislativo.leiSeca.studiedAt.v1",
    "radarLegislativo.difficultArticles.v1",
    "radarLegislativo.experience.v1",
    "radarLegislativo.achievements.v1"
  ]);
  const ARRAY_KEYS = new Set([
    "radarLegislativo.memoryCustomCards.v1",
    "radarLegislativo.memoryFavoriteCardIds.v1",
    "radarLegislativo.leiSeca.studied.v1",
    "radarLegislativo.leiSeca.favorites.v1",
    "radarLegislativo.activityEvents.v1",
    "radarLegislativo.activitySessions.v1"
  ]);
  const allowedKeys = new Set(STORAGE_KEYS);

  function notify(ok, error) {
    try {
      if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("radar-data-storage", {
          detail: { ok: Boolean(ok), message: error ? String(error.message || error) : "" }
        }));
      }
    } catch (_) {}
  }

  function getItem(key) {
    try { return root.localStorage.getItem(key); }
    catch (error) { notify(false, error); return null; }
  }
  function readItemStrict(key) {
    try { return root.localStorage.getItem(key); }
    catch (error) {
      notify(false, error);
      throw new Error("O navegador não permitiu ler os dados locais. Nenhuma restauração foi iniciada.");
    }
  }
  function setItem(key, value) {
    try {
      root.localStorage.setItem(key, String(value));
      notify(true);
      return true;
    } catch (error) {
      notify(false, error);
      throw error;
    }
  }
  function removeItem(key) {
    try {
      root.localStorage.removeItem(key);
      notify(true);
      return true;
    } catch (error) {
      notify(false, error);
      throw error;
    }
  }

  function createBackup() {
    const storage = {};
    STORAGE_KEYS.forEach(key => { storage[key] = readItemStrict(key); });
    return {
      format: BACKUP_FORMAT,
      schema_version: BACKUP_VERSION,
      application: "Radar Legislativo INSS",
      created_at: new Date().toISOString(),
      storage
    };
  }

  function validateBackup(backup) {
    if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
      throw new Error("O arquivo não contém um backup válido.");
    }
    if (backup.format !== BACKUP_FORMAT) {
      throw new Error("Este arquivo não é um backup do Radar Legislativo INSS.");
    }
    if (backup.schema_version !== BACKUP_VERSION) {
      throw new Error("A versão deste backup não é compatível com esta versão do site.");
    }
    if (!backup.storage || typeof backup.storage !== "object" || Array.isArray(backup.storage)) {
      throw new Error("O backup não contém a área de dados esperada.");
    }
    if (JSON.stringify(backup).length > MAX_BACKUP_CHARS) {
      throw new Error("O backup é muito grande para ser importado com segurança.");
    }
    const keys = Object.keys(backup.storage);
    if (!keys.length || keys.some(key => !allowedKeys.has(key))) {
      throw new Error("O backup contém campos desconhecidos ou não permitidos.");
    }
    for (const key of keys) {
      const value = backup.storage[key];
      if (value === null) continue;
      if (typeof value !== "string") throw new Error("Há um dado com formato inválido no backup.");
      if (value.length > MAX_ITEM_CHARS) throw new Error("Um dos registros do backup excede o tamanho permitido.");
      if (key === "radarLegislativo.lastSeen") {
        if (value && !Number.isFinite(Date.parse(value))) {
          throw new Error("A data de leitura das notificações está inválida.");
        }
        continue;
      }
      let parsed;
      try { parsed = JSON.parse(value); }
      catch (_) { throw new Error("Um dos registros do backup está danificado."); }
      if (OBJECT_KEYS.has(key) && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new Error("Um registro que deveria ser um objeto está em formato diferente.");
      }
      if (ARRAY_KEYS.has(key) && !Array.isArray(parsed)) {
        throw new Error("Um registro que deveria ser uma lista está em formato diferente.");
      }
    }
    return backup;
  }

  function restoreBackup(input) {
    const backup = validateBackup(input);
    const previous = {};
    STORAGE_KEYS.forEach(key => { previous[key] = readItemStrict(key); });
    const changed = [];
    try {
      for (const key of STORAGE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(backup.storage, key)) continue;
        const value = backup.storage[key];
        const saved = value === null ? removeItem(key) : setItem(key, value);
        if (!saved) throw new Error("O navegador recusou a gravação de um dos registros.");
        changed.push(key);
      }
      if (!removeItem(ACTIVE_SESSION_KEY)) {
        throw new Error("Não foi possível encerrar a sessão de jogo anterior.");
      }
      return {
        restored_keys: changed.filter(key => backup.storage[key] !== null).length,
        cleared_keys: changed.filter(key => backup.storage[key] === null).length,
        backup_created_at: backup.created_at || null
      };
    } catch (error) {
      let rollbackFailed = false;
      for (const key of changed.reverse()) {
        try {
          const value = previous[key];
          const restored = value === null ? removeItem(key) : setItem(key, value);
          if (!restored) rollbackFailed = true;
        } catch (_) {
          rollbackFailed = true;
        }
      }
      const detail = rollbackFailed
        ? " A tentativa de retorno também encontrou uma falha de armazenamento; mantenha o arquivo de backup original."
        : " Os dados que estavam neste navegador foram mantidos.";
      throw new Error((error.message || "Falha ao importar o backup.") + detail);
    }
  }

  root.RadarDataStorage = Object.freeze({
    getItem, setItem, removeItem, createBackup, validateBackup, restoreBackup,
    getBackupKeys: () => STORAGE_KEYS.slice()
  });
})(window);
