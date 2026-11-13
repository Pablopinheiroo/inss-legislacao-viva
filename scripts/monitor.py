#!/usr/bin/env python3
"""Compara capturas de fontes oficiais para estudo legislativo do INSS."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
LAWS_FILE = DATA / "laws.json"
OUTPUT_FILE = DATA / "legislacao.json"
USER_AGENT = "RadarLegislativoINSS/0.1 (monitoramento educacional)"
ARTICLE_RE = re.compile(r"^\s*Art(?:igo)?\.?\s*(\d+)\s*(?:[º°o])?\s*(?:-\s*([A-Z]))?.*$", re.IGNORECASE)


def now_utc() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize(text: str) -> str:
    lines = []
    for raw in text.replace("\xa0", " ").replace("\u200b", "").splitlines():
        line = re.sub(r"[ \t\r\f\v]+", " ", raw).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def fetch_text(url: str) -> str:
    response = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9"},
        timeout=45,
    )
    response.raise_for_status()
    if not response.encoding or response.encoding.lower() == "iso-8859-1":
        response.encoding = response.apparent_encoding or "utf-8"
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "del", "s", "strike"]):
        tag.decompose()
    main = soup.find("main") or soup.find(id="conteudo") or soup.find(id="content") or soup.body or soup
    text = normalize(main.get_text("\n", strip=True))
    if len(text) < 350:
        raise ValueError("A página retornou pouco texto; captura considerada incompleta.")
    return text


def split_articles(text: str) -> dict[str, str]:
    articles: dict[str, list[str]] = {}
    current = None
    for line in text.splitlines():
        match = ARTICLE_RE.match(line)
        if match:
            number = int(match.group(1))
            suffix = (match.group(2) or "").upper()
            current = "Art. " + str(number) + (("-" + suffix) if suffix else "")
            articles.setdefault(current, []).append(line.strip())
        elif current:
            articles[current].append(line.strip())
    return {key: normalize("\n".join(value)) for key, value in articles.items() if normalize("\n".join(value))}


def make_snapshot(text: str, law: dict[str, Any]) -> dict[str, Any]:
    articles = split_articles(text)
    allow = law.get("include_articles")
    if allow:
        accepted = set(allow)
        articles = {key: value for key, value in articles.items() if key in accepted}
    mode = "artigos" if len(articles) >= 2 else "documento"
    return {
        "document_hash": digest(text),
        "parser_mode": mode,
        "article_count": len(articles),
        "articles": articles,
        "full_text": text,
    }


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def article_order(value: str) -> tuple[int, str]:
    match = re.search(r"(\d+)(?:-([A-Z]))?", value)
    return (int(match.group(1)) if match else 10**9, match.group(2) if match and match.group(2) else "")


def make_change(law: dict[str, Any], article: str, kind: str, old: str, new: str, detected: str) -> dict[str, Any]:
    unique = digest("|".join([law["id"], article, kind, old, new, detected]))[:16]
    labels = {
        "alterado": "O texto do dispositivo está diferente da última captura válida.",
        "incluido": "O dispositivo apareceu na captura atual e não constava na captura anterior.",
        "nao_encontrado": "O dispositivo não foi localizado na captura atual. Isso não confirma revogação.",
        "texto_integral_alterado": "A página mudou, mas o monitor não conseguiu separar os dispositivos com segurança.",
    }
    return {
        "id": unique,
        "law_id": law["id"],
        "law_title": law["title"],
        "law_short_title": law["short_title"],
        "category": law["category"],
        "article": article,
        "change_type": kind,
        "detected_at": detected,
        "publication_date": None,
        "effective_date": None,
        "old_text": old,
        "new_text": new,
        "summary": labels[kind],
        "source_url": law["url"],
        "review_required": True,
        "date_note": "Data de detecção pelo monitor. Publicação e vigência precisam ser conferidas no ato oficial.",
    }


def compare(law: dict[str, Any], previous: dict[str, Any] | None,
            current: dict[str, Any], detected: str) -> list[dict[str, Any]]:
    if not previous or previous.get("document_hash") == current.get("document_hash"):
        return []
    old_articles = previous.get("articles") or {}
    new_articles = current.get("articles") or {}
    if previous.get("parser_mode") != current.get("parser_mode") or not old_articles or not new_articles:
        return [make_change(law, "Texto integral", "texto_integral_alterado",
                            previous.get("full_text", ""), current.get("full_text", ""), detected)]
    changes = []
    for article in sorted(set(old_articles) | set(new_articles), key=article_order):
        old = old_articles.get(article, "")
        new = new_articles.get(article, "")
        if old == new:
            continue
        kind = "incluido" if not old else "nao_encontrado" if not new else "alterado"
        changes.append(make_change(law, article, kind, old, new, detected))
    return changes


def run() -> int:
    laws = [law for law in load_json(LAWS_FILE, []) if law.get("enabled", True)]
    previous_data = load_json(OUTPUT_FILE, {})
    detected = now_utc()
    all_changes = list(previous_data.get("changes", []))
    law_results = []
    errors = []
    success_count = 0

    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    for law in laws:
        snapshot_path = SNAPSHOTS / (law["id"] + ".json")
        previous_snapshot = load_json(snapshot_path, None)
        try:
            text = fetch_text(law["url"])
            current = make_snapshot(text, law)
            changes = compare(law, previous_snapshot, current, detected)
            all_changes.extend(changes)
            save_json(snapshot_path, current)
            success_count += 1
            law_results.append({
                "id": law["id"], "title": law["title"], "short_title": law["short_title"],
                "category": law["category"], "url": law["url"], "source_name": law.get("source_name", "Fonte oficial"),
                "last_checked": detected, "article_count": current["article_count"],
                "parser_mode": current["parser_mode"], "new_changes_detected": len(changes), "error": None,
            })
            print("OK: " + law["short_title"] + " — " + str(len(changes)) + " diferença(s)")
        except Exception as exc:
            message = type(exc).__name__ + ": " + str(exc)
            errors.append({"law_id": law["id"], "law_title": law["title"], "message": message})
            law_results.append({
                "id": law["id"], "title": law["title"], "short_title": law["short_title"],
                "category": law["category"], "url": law["url"], "source_name": law.get("source_name", "Fonte oficial"),
                "last_checked": None,
                "article_count": previous_snapshot.get("article_count", 0) if previous_snapshot else 0,
                "parser_mode": previous_snapshot.get("parser_mode", "indisponivel") if previous_snapshot else "indisponivel",
                "new_changes_detected": 0, "error": message,
            })
            print("ERRO: " + law["short_title"] + " — " + message, file=sys.stderr)
        time.sleep(0.4)

    all_changes.sort(key=lambda item: item.get("detected_at", ""), reverse=True)
    all_changes = all_changes[:300]
    if laws and success_count == len(laws):
        status = "ok"
        last_success = detected
        summary = "Todas as fontes configuradas foram consultadas nesta execução."
    elif success_count:
        status = "parcial"
        last_success = previous_data.get("last_successful_check")
        summary = str(success_count) + " fonte(s) consultada(s); " + str(len(errors)) + " fonte(s) apresentaram erro."
    else:
        status = "erro"
        last_success = previous_data.get("last_successful_check")
        summary = "Nenhuma fonte pôde ser consultada. As capturas anteriores foram preservadas."

    output = {
        "schema_version": 1, "generated_at": detected, "last_check_attempt": detected,
        "last_successful_check": last_success, "status": status, "summary": summary,
        "laws": law_results, "changes": all_changes, "errors": errors,
    }
    save_json(OUTPUT_FILE, output)
    print("Resultado: " + status + ". Fontes OK: " + str(success_count) + "/" + str(len(laws)))
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
