#!/usr/bin/env python3
"""Auditoria estrutural do site, dados legislativos e armazenamento local."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OFFICIAL_SUFFIXES = (".gov.br", ".leg.br")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def is_official(url: str) -> bool:
    parsed = urlparse(str(url or ""))
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(
        host == suffix[1:] or host.endswith(suffix) for suffix in OFFICIAL_SUFFIXES
    )


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    adapter = (ROOT / "data-storage.js").read_text(encoding="utf-8")
    styles = (ROOT / "styles.css").read_text(encoding="utf-8")

    ids = re.findall(r'\bid=["\']([^"\']+)["\']', html)
    duplicated = sorted({item for item in ids if ids.count(item) > 1})
    if duplicated:
        errors.append("IDs HTML duplicados: " + ", ".join(duplicated))

    id_set = set(ids)
    selector_ids = set(re.findall(r'\$\(["\']#([A-Za-z][A-Za-z0-9_-]*)["\']\)', app))
    missing = sorted(selector_ids - id_set)
    if missing:
        errors.append("Seletores JavaScript sem elemento HTML: " + ", ".join(missing))

    required_ids = {
        "area-estudar", "area-lei-seca", "area-jogos", "area-desempenho",
        "tab-radar", "notification-button", "notification-study-indicator",
        "tab-quiz", "tab-cloze", "tab-find-error", "tab-article",
        "tab-multi-ce", "tab-before-after", "tab-memory", "tab-simulado",
        "data-export-backup", "data-import-backup", "data-import-file",
    }
    missing_required = sorted(required_ids - id_set)
    if missing_required:
        errors.append("Elementos essenciais ausentes: " + ", ".join(missing_required))

    if html.index("data-storage.js") > html.index("app.js"):
        errors.append("data-storage.js deve ser carregado antes de app.js.")
    if re.search(r'localStorage\.(?:getItem|setItem|removeItem|clear)\s*\(', app):
        errors.append("app.js ainda acessa localStorage diretamente, fora da camada central.")

    app_keys = set(re.findall(r'"(radarLegislativo\.[^"]+)"', app))
    adapter_keys = set(re.findall(r'"(radarLegislativo\.[^"]+)"', adapter))
    allowed_excluded = {"radarLegislativo.activityActiveSession.v1"}
    missing_backup_keys = sorted(app_keys - adapter_keys - allowed_excluded)
    if missing_backup_keys:
        errors.append("Chaves de progresso fora do backup: " + ", ".join(missing_backup_keys))

    views = {
        "study-view", "law-view", "quiz-view", "cloze-view", "find-error-view",
        "article-view", "multi-ce-view", "before-after-view", "memory-view",
        "simulado-view", "review-view", "history-view", "achievements-view",
        "performance-view", "radar-view",
    }
    missing_views = sorted(views - id_set)
    if missing_views:
        errors.append("Telas não encontradas: " + ", ".join(missing_views))

    laws = read_json(DATA / "laws.json")
    monitor = read_json(DATA / "legislacao.json")
    question_banks = [
        read_json(DATA / "questoes.json"),
        read_json(DATA / "encontre-erro.json"),
        read_json(DATA / "descubra-artigo.json"),
        read_json(DATA / "afirmacoes-por-artigo.json"),
    ]
    snapshots = {
        path.stem: read_json(path)
        for path in sorted((DATA / "snapshots").glob("*.json"))
    }

    law_ids = {str(law.get("id")) for law in laws if law.get("id")}
    snapshot_ids = set(snapshots)
    if law_ids != snapshot_ids:
        errors.append(
            f"Catálogo e capturas não correspondem: "
            f"{len(law_ids - snapshot_ids)} norma(s) sem captura e "
            f"{len(snapshot_ids - law_ids)} captura(s) sem cadastro."
        )

    monitor_ids = {str(law.get("id")) for law in monitor.get("laws", []) if law.get("id")}
    if monitor_ids != law_ids:
        errors.append("O painel do monitoramento não corresponde ao catálogo de normas.")

    for law_id, snapshot in snapshots.items():
        articles = snapshot.get("articles")
        if not isinstance(articles, dict) or not articles:
            errors.append(f"{law_id}: captura sem artigos.")
            continue
        if snapshot.get("article_count") != len(articles):
            errors.append(f"{law_id}: quantidade declarada de artigos não confere.")
        if not is_official(snapshot.get("source_url_used", "")):
            errors.append(f"{law_id}: URL da captura não é HTTPS em domínio oficial.")

    link_urls: set[str] = set()

    def collect_urls(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"url", "source_url", "source_url_used"} and isinstance(child, str):
                    link_urls.add(child)
                else:
                    collect_urls(child)
        elif isinstance(value, list):
            for child in value:
                collect_urls(child)

    collect_urls(laws)
    collect_urls(monitor)
    for bank in question_banks:
        collect_urls(bank)

    for url in sorted(link_urls):
        if not is_official(url):
            errors.append("Link publicado não usa HTTPS em domínio oficial: " + url)

    changes = monitor.get("changes", [])
    if not changes:
        warnings.append(
            "A captura atual não registra alterações reais. O fluxo Antes e depois "
            "precisa ser exercitado com a alteração simulada nos testes de navegador."
        )
    for change in changes:
        if change.get("law_id") not in law_ids:
            errors.append(f"Alteração {change.get('id')}: norma não cadastrada.")
        if not change.get("article"):
            warnings.append(f"Alteração {change.get('id')}: não está vinculada a artigo específico.")
        if change.get("change_type") == "alterado" and not (
            change.get("old_text") and change.get("new_text")
        ):
            errors.append(f"Alteração {change.get('id')}: comparação anterior/atual incompleta.")

    scan_files = [
        path for path in ROOT.rglob("*")
        if path.is_file()
        and path.suffix.lower() in {".js", ".html", ".css", ".yml", ".yaml"}
        and ".git" not in path.parts
        and "node_modules" not in path.parts
    ]
    secret_patterns = {
        "token GitHub clássico": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{25,}\b"),
        "token GitHub fine-grained": re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
        "chave privada": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "chave AWS": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    }
    for path in scan_files:
        content = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in secret_patterns.items():
            if pattern.search(content):
                errors.append(f"{path.relative_to(ROOT)}: possível {label} inserido no código público.")

    print("Auditoria estrutural do Radar Legislativo INSS")
    print(f"Elementos HTML: {len(ids)} IDs únicos")
    print(f"Telas principais e modos: {len(views)}")
    print(f"Normas cadastradas/capturas: {len(law_ids)}")
    print(f"Links oficiais distintos: {len(link_urls)}")
    print(f"Alterações legislativas na captura atual: {len(changes)}")
    print(f"Chaves de dados no backup: {len(adapter_keys)}")
    if warnings:
        print(f"AVISOS: {len(warnings)}")
        for warning in warnings:
            print(" - " + warning)
    if errors:
        print(f"FALHAS: {len(errors)}")
        for error in errors:
            print(" - " + error)
        return 1
    print("SUCESSO: estrutura, capturas, vínculos e armazenamento passaram na auditoria.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
