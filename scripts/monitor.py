#!/usr/bin/env python3
"""Compara apenas o conteúdo legislativo útil, preservando snapshots válidos."""
from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
LAWS_FILE = DATA / "laws.json"
OUTPUT_FILE = DATA / "legislacao.json"
SNAPSHOT_VERSION = 2
MONITOR_VERSION = 2

# A inicial maiúscula é intencional: referências como "art. 6º da EC..." não
# podem ser confundidas com o início de um dispositivo.
ARTICLE_RE = re.compile(
    r"^\s*Art(?:igo)?\.?\s*(\d+)\s*(?:[º°o])?\.?\s*(?:[-–]\s*([A-Z]))?(?:\s+(.*))?$"
)
REFERENCE_STARTS = {
    "da", "das", "de", "do", "dos", "na", "nas", "no", "nos",
    "conforme", "vide", "citado", "citada"
}


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
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
    }
    response = requests.get(url, headers=headers, timeout=45)
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "").lower()
    is_pdf = url.lower().endswith(".pdf") or "application/pdf" in content_type or response.content.startswith(b"%PDF")
    if is_pdf:
        reader = PdfReader(io.BytesIO(response.content))
        text = normalize("\n".join(page.extract_text() or "" for page in reader.pages))
    else:
        if not response.encoding or response.encoding.lower() == "iso-8859-1":
            response.encoding = response.apparent_encoding or "utf-8"
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "del", "s", "strike"]):
            tag.decompose()
        # As páginas da Câmara e do Planalto usam contêineres diferentes.
        main = soup.find("main") or soup.find(id="conteudo") or soup.find(id="content") or soup.body or soup
        text = normalize(main.get_text("\n", strip=True))

    if len(text) < 350:
        raise ValueError("A fonte retornou pouco texto; captura considerada incompleta.")
    return text


def fetch_law_text(law: dict[str, Any]) -> tuple[str, str]:
    urls = law.get("fetch_urls") or [law["url"]]
    failures = []
    for url in urls:
        try:
            return fetch_text(url), url
        except Exception as exc:
            failures.append(url + " -> " + type(exc).__name__ + ": " + str(exc))
    raise RuntimeError("Nenhuma fonte configurada respondeu: " + " | ".join(failures))


def split_articles(text: str) -> dict[str, str]:
    articles: dict[str, list[str]] = {}
    current: str | None = None

    for line in text.splitlines():
        stripped = line.strip()
        match = ARTICLE_RE.match(stripped)

        if match:
            body_start = (match.group(3) or "").strip()
            first_word_match = re.match(r"([A-Za-zÀ-ÿ]+)", body_start)
            first_word = first_word_match.group(1).lower() if first_word_match else ""
            # "Art. 6º da Emenda..." é referência a outro ato, não cabeçalho.
            if first_word in REFERENCE_STARTS:
                match = None

        if match:
            number = int(match.group(1))
            suffix = (match.group(2) or "").upper()
            current = "Art. " + str(number) + (("-" + suffix) if suffix else "")
            articles.setdefault(current, []).append(stripped)
        elif current:
            articles[current].append(stripped)

    return {
        key: normalize("\n".join(value))
        for key, value in articles.items()
        if normalize("\n".join(value))
    }


def make_snapshot(
    text: str,
    law: dict[str, Any],
    source_url_used: str | None = None,
    captured_at: str | None = None,
) -> dict[str, Any]:
    all_articles = split_articles(text)
    include = law.get("include_articles")
    if include:
        articles = {key: all_articles[key] for key in include if key in all_articles}
        if law.get("require_all_articles"):
            missing = [key for key in include if key not in articles]
            if missing:
                raise ValueError(
                    "A fonte não apresentou todos os artigos exigidos para o recorte: "
                    + ", ".join(missing)
                )
        scope = law.get("snapshot_scope", "selected_articles")
    else:
        articles = all_articles
        scope = law.get("snapshot_scope", "all_detected_articles")

    source = source_url_used or law["url"]
    if articles:
        content = json.dumps(articles, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return {
            "snapshot_version": SNAPSHOT_VERSION,
            "captured_at": captured_at,
            "source_url_used": source,
            "source_revision": law.get("source_revision"),
            "parser_mode": "artigos",
            "snapshot_scope": scope,
            "article_count": len(articles),
            "content_hash": digest(content),
            "articles": articles,
        }

    # Fontes de histórico (como a página do INSS sobre a IN 128) ou atos
    # cuja estrutura não permite separar artigos ficam identificados como texto.
    mode = law.get("monitor_mode", "texto")
    content = text
    return {
        "snapshot_version": SNAPSHOT_VERSION,
        "captured_at": captured_at,
        "source_url_used": source,
        "source_revision": law.get("source_revision"),
        "parser_mode": "index" if mode == "index" else "documento",
        "snapshot_scope": law.get("snapshot_scope", "official_index" if mode == "index" else "document_text"),
        "article_count": 0,
        "content_hash": digest(content),
        "document_text": content,
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
        "possivelmente_revogado": "A captura atual contém indicação de revogação. Confira o ato oficial e sua vigência.",
        "texto_integral_alterado": "O conteúdo da fonte oficial mudou. Confira a alteração no ato oficial.",
    }
    summary = labels[kind]
    if law.get("monitor_mode") == "index" and kind == "texto_integral_alterado":
        summary = "O histórico oficial de alterações da IN 128 mudou. Consulte a lista de atos modificadores e confira o texto consolidado no portal do INSS."

    return {
        "id": unique,
        "law_id": law["id"],
        "law_title": law["title"],
        "law_short_title": law.get("short_title", law["title"]),
        "category": law["category"],
        "article": article,
        "change_type": kind,
        "detected_at": detected,
        "publication_date": None,
        "effective_date": None,
        "old_text": old,
        "new_text": new,
        "summary": summary,
        "source_url": law["url"],
        "evidence_url": law.get("source_url_used", law["url"]),
        "review_required": True,
        "date_note": "Data de detecção pelo monitor. Publicação e vigência precisam ser conferidas no ato oficial.",
    }


def baseline_must_be_rebuilt(previous: dict[str, Any] | None, current: dict[str, Any]) -> bool:
    if not previous:
        return True
    if previous.get("snapshot_version") != SNAPSHOT_VERSION:
        return True
    if previous.get("source_url_used") != current.get("source_url_used"):
        return True
    if previous.get("parser_mode") != current.get("parser_mode"):
        return True
    if previous.get("snapshot_scope") != current.get("snapshot_scope"):
        return True
    return False


def compare(
    law: dict[str, Any],
    previous: dict[str, Any] | None,
    current: dict[str, Any],
    detected: str,
) -> list[dict[str, Any]]:
    if baseline_must_be_rebuilt(previous, current):
        return []
    if previous.get("content_hash") == current.get("content_hash"):
        return []

    old_articles = previous.get("articles") or {}
    new_articles = current.get("articles") or {}
    if previous.get("parser_mode") == "artigos" and current.get("parser_mode") == "artigos":
        changes = []
        for article in sorted(set(old_articles) | set(new_articles), key=article_order):
            old = old_articles.get(article, "")
            new = new_articles.get(article, "")
            if old == new:
                continue
            kind = (
                "incluido" if not old
                else "nao_encontrado" if not new
                else "possivelmente_revogado" if re.search(r"\brevogad[oa]\b", new, re.IGNORECASE)
                else "alterado"
            )
            changes.append(make_change(law, article, kind, old, new, detected))
        return changes

    return [
        make_change(
            law,
            "Histórico oficial" if current.get("parser_mode") == "index" else "Texto integral",
            "texto_integral_alterado",
            previous.get("document_text", ""),
            current.get("document_text", ""),
            detected,
        )
    ]


def run() -> int:
    laws = [law for law in load_json(LAWS_FILE, []) if law.get("enabled", True)]
    previous_data = load_json(OUTPUT_FILE, {})
    detected = now_utc()

    # A mudança de formato invalida alertas antigos produzidos pelo parser anterior.
    all_changes = (
        list(previous_data.get("changes", []))
        if previous_data.get("monitor_version") == MONITOR_VERSION
        else []
    )
    law_results = []
    errors = []
    success_count = 0
    baseline_count = 0

    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    for law in laws:
        snapshot_path = SNAPSHOTS / (law["id"] + ".json")
        previous_snapshot = load_json(snapshot_path, None)
        try:
            text, source_url_used = fetch_law_text(law)
            current = make_snapshot(text, law, source_url_used, detected)
            law_with_source = {**law, "source_url_used": source_url_used}
            rebuilt = baseline_must_be_rebuilt(previous_snapshot, current)
            changes = compare(law_with_source, previous_snapshot, current, detected)
            if rebuilt:
                baseline_count += 1

            all_changes.extend(changes)
            save_json(snapshot_path, current)
            success_count += 1
            law_results.append({
                "id": law["id"],
                "title": law["title"],
                "short_title": law.get("short_title", law["title"]),
                "category": law["category"],
                "url": law["url"],
                "source_name": law.get("source_name", "Fonte oficial"),
                "source_revision": law.get("source_revision"),
                "source_note": law.get("source_note"),
                "last_checked": detected,
                "article_count": current["article_count"],
                "parser_mode": current["parser_mode"],
                "snapshot_scope": current["snapshot_scope"],
                "baseline_updated": rebuilt,
                "source_url_used": source_url_used,
                "new_changes_detected": len(changes),
                "error": None,
            })
            print(
                ("BASELINE: " if rebuilt else "OK: ")
                + law.get("short_title", law["title"])
                + " — " + str(current["article_count"]) + " artigo(s), "
                + str(len(changes)) + " diferença(s)"
            )
        except Exception as exc:
            message = type(exc).__name__ + ": " + str(exc)
            errors.append({"law_id": law["id"], "law_title": law["title"], "message": message})
            law_results.append({
                "id": law["id"],
                "title": law["title"],
                "short_title": law.get("short_title", law["title"]),
                "category": law["category"],
                "url": law["url"],
                "source_name": law.get("source_name", "Fonte oficial"),
                "source_revision": law.get("source_revision"),
                "source_note": law.get("source_note"),
                "last_checked": None,
                "article_count": previous_snapshot.get("article_count", 0) if previous_snapshot else 0,
                "parser_mode": previous_snapshot.get("parser_mode", "indisponivel") if previous_snapshot else "indisponivel",
                "snapshot_scope": previous_snapshot.get("snapshot_scope") if previous_snapshot else None,
                "baseline_updated": False,
                "source_url_used": previous_snapshot.get("source_url_used") if previous_snapshot else None,
                "new_changes_detected": 0,
                "error": message,
            })
            print("ERRO: " + law.get("short_title", law["title"]) + " — " + message, file=sys.stderr)
        time.sleep(0.35)

    all_changes.sort(key=lambda item: item.get("detected_at", ""), reverse=True)
    all_changes = all_changes[:300]

    if laws and success_count == len(laws):
        status = "ok"
        last_success = detected
        summary = (
            f"{success_count} fontes oficiais consultadas; "
            f"{baseline_count} capturas iniciais/atualizadas; "
            f"{sum(item.get('new_changes_detected', 0) for item in law_results)} alteração(ões) detectada(s)."
        )
    elif success_count:
        status = "parcial"
        last_success = previous_data.get("last_successful_check")
        summary = f"{success_count} fonte(s) consultada(s); {len(errors)} fonte(s) apresentaram erro. Fontes com erro não tiveram a captura anterior substituída."
    else:
        status = "erro"
        last_success = previous_data.get("last_successful_check")
        summary = "Nenhuma fonte pôde ser consultada. As capturas anteriores foram preservadas."

    output = {
        "schema_version": 2,
        "monitor_version": MONITOR_VERSION,
        "generated_at": detected,
        "last_check_attempt": detected,
        "last_successful_check": last_success,
        "status": status,
        "summary": summary,
        "baseline_updated_count": baseline_count,
        "laws": law_results,
        "changes": all_changes,
        "errors": errors,
    }
    save_json(OUTPUT_FILE, output)
    print(
        "Resultado: " + status
        + ". Fontes OK: " + str(success_count) + "/" + str(len(laws))
        + ". Capturas reestabelecidas: " + str(baseline_count)
    )
    return 0 if success_count == len(laws) else (1 if not success_count else 0)


if __name__ == "__main__":
    raise SystemExit(run())
