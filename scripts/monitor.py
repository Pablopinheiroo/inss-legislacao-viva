#!/usr/bin/env python3
"""Compara apenas o conteúdo legislativo útil, preservando snapshots válidos."""
from __future__ import annotations

import hashlib
import io
import json
import re
import sys
import time
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SNAPSHOTS = DATA / "snapshots"
LAWS_FILE = DATA / "laws.json"
OUTPUT_FILE = DATA / "legislacao.json"
SNAPSHOT_VERSION = 3
MONITOR_VERSION = 3

# A inicial maiúscula é intencional: referências como "art. 6º da EC..." não
# podem ser confundidas com o início de um dispositivo.
ARTICLE_RE = re.compile(
    r"^\s*Art(?:igo)?\.?\s*(\d+)\s*(?:[º°o])?\s*(?:[-–]\s*([A-Z]))?\.?\s*(?:\s+(.*))?$"
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


MAX_FETCH_ATTEMPTS = 3
MAX_RETRY_WAIT_SECONDS = 10

BLOCK_PAGE_PATTERNS = (
    r"attention required.{0,80}cloudflare",
    r"just a moment\.\.\.",
    r"checking your browser",
    r"verify (?:that )?you are human",
    r"complete the security check",
    r"access denied",
    r"request blocked",
    r"you have been blocked",
    r"too many requests",
    r"rate limit exceeded",
    r"cf-chl-",
    r"enable javascript and cookies to continue",
)


class SourceFetchError(RuntimeError):
    """Falha de consulta com diagnóstico preservado para o painel."""

    def __init__(
        self,
        message: str,
        failure_type: str = "network_error",
        attempts: list[dict[str, Any]] | None = None,
    ):
        super().__init__(message)
        self.failure_type = failure_type
        self.attempts = attempts or []
        waits = [
            item.get("retry_after_seconds")
            for item in self.attempts
            if isinstance(item.get("retry_after_seconds"), (int, float))
        ]
        self.retry_after_seconds = max(waits) if waits else None


def parse_retry_after(value: str | None) -> int | None:
    """Lê Retry-After em segundos ou no formato de data HTTP."""
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return int(value)
    try:
        retry_at = parsedate_to_datetime(value)
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max(0, int((retry_at - datetime.now(timezone.utc)).total_seconds()))
    except (TypeError, ValueError, OverflowError):
        return None


def classify_http_failure(status: int, body: str = "") -> str:
    body_lower = body.lower()
    if status == 429 or "rate limit exceeded" in body_lower or "too many requests" in body_lower:
        return "rate_limited"
    if status in {401, 403, 407}:
        return "access_denied"
    if status in {408, 425}:
        return "temporary_network_error"
    if status >= 500:
        return "server_error"
    return "http_error"


def is_access_block_page(body: str) -> bool:
    sample = body[:20000].lower()
    return any(re.search(pattern, sample, re.IGNORECASE | re.DOTALL) for pattern in BLOCK_PAGE_PATTERNS)


def _response_body(response: Any) -> str:
    try:
        return str(response.text or "")
    except Exception:
        try:
            return bytes(response.content).decode("utf-8", errors="replace")
        except Exception:
            return ""


def fetch_text_with_diagnostics(url: str) -> tuple[str, list[dict[str, Any]]]:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
    }
    attempts: list[dict[str, Any]] = []

    for attempt in range(1, MAX_FETCH_ATTEMPTS + 1):
        try:
            response = requests.get(url, headers=headers, timeout=45)
        except requests.Timeout as exc:
            failure_type = "timeout"
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": failure_type,
                "http_status": None,
                "detail": str(exc)[:300],
            })
            if attempt < MAX_FETCH_ATTEMPTS:
                time.sleep(min(attempt, 2))
                continue
            raise SourceFetchError(
                "Tempo limite excedido após " + str(attempt) + " tentativa(s): " + str(exc),
                failure_type,
                attempts,
            ) from exc
        except requests.RequestException as exc:
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": "network_error",
                "http_status": None,
                "detail": str(exc)[:300],
            })
            if attempt < MAX_FETCH_ATTEMPTS:
                time.sleep(min(attempt, 2))
                continue
            raise SourceFetchError(
                "Falha de rede após " + str(attempt) + " tentativa(s): " + str(exc),
                "network_error",
                attempts,
            ) from exc

        status = int(getattr(response, "status_code", 0) or 0)
        response_body = _response_body(response)
        if status >= 400:
            failure_type = classify_http_failure(status, response_body)
            retry_after = parse_retry_after(response.headers.get("Retry-After"))
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": failure_type,
                "http_status": status,
                "retry_after_seconds": retry_after,
                "detail": (response_body[:240].replace("\n", " ") if response_body else "Resposta HTTP " + str(status)),
            })
            retryable = status in {408, 425, 429, 500, 502, 503, 504}
            delay = retry_after if retry_after is not None else min(attempt, 2)
            if retryable and attempt < MAX_FETCH_ATTEMPTS and delay <= MAX_RETRY_WAIT_SECONDS:
                time.sleep(delay)
                continue
            raise SourceFetchError(
                "A fonte respondeu HTTP " + str(status) + " (" + failure_type + ").",
                failure_type,
                attempts,
            )

        requested_host = (urlparse(url).hostname or "").lower().removeprefix("www.")
        final_url = getattr(response, "url", url) or url
        final_host = (urlparse(final_url).hostname or "").lower().removeprefix("www.")
        if requested_host and final_host and requested_host != final_host:
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": "redirected_domain",
                "http_status": status,
                "detail": "Redirecionou para outro domínio: " + final_url,
            })
            raise SourceFetchError(
                "A fonte redirecionou para outro domínio: " + final_url,
                "redirected_domain",
                attempts,
            )

        if is_access_block_page(response_body):
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": "blocked_page",
                "http_status": status,
                "detail": "A fonte exibiu uma página de bloqueio ou verificação automática.",
            })
            raise SourceFetchError(
                "A fonte retornou uma página de bloqueio/verificação (HTTP "
                + str(status) + ").",
                "blocked_page",
                attempts,
            )

        try:
            content_type = response.headers.get("Content-Type", "").lower()
            is_pdf = (
                url.lower().endswith(".pdf")
                or "application/pdf" in content_type
                or getattr(response, "content", b"").startswith(b"%PDF")
            )
            if is_pdf:
                reader = PdfReader(io.BytesIO(response.content))
                text = normalize("\n".join(page.extract_text() or "" for page in reader.pages))
            else:
                if not response.encoding or response.encoding.lower() == "iso-8859-1":
                    response.encoding = response.apparent_encoding or "utf-8"
                soup = BeautifulSoup(response.text, "html.parser")
                for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "del", "s", "strike"]):
                    tag.decompose()
                main = soup.find("main") or soup.find(id="conteudo") or soup.find(id="content") or soup.body or soup
                text = normalize(main.get_text("\n", strip=True))
        except Exception as exc:
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": "invalid_content",
                "http_status": status,
                "detail": "Não foi possível interpretar a resposta: " + str(exc)[:200],
            })
            raise SourceFetchError(
                "Não foi possível interpretar a resposta da fonte: " + str(exc),
                "invalid_content",
                attempts,
            ) from exc

        if len(text) < 350:
            attempts.append({
                "url": url,
                "attempt": attempt,
                "outcome": "error",
                "failure_type": "incomplete_response",
                "http_status": status,
                "detail": "A fonte retornou menos de 350 caracteres úteis.",
            })
            raise SourceFetchError(
                "A fonte retornou pouco texto; captura considerada incompleta.",
                "incomplete_response",
                attempts,
            )

        attempts.append({
            "url": url,
            "attempt": attempt,
            "outcome": "success",
            "failure_type": None,
            "http_status": status,
            "detail": "Conteúdo recebido e interpretado.",
        })
        return text, attempts

    raise SourceFetchError("A fonte não respondeu após as tentativas previstas.", "network_error", attempts)


def fetch_text(url: str) -> str:
    """Compatibilidade com testes e chamadas que precisam apenas do texto."""
    text, _attempts = fetch_text_with_diagnostics(url)
    return text

def validate_law_identity(text: str, law: dict[str, Any], source_url: str) -> None:
    """Impede que páginas genéricas/erros do portal sejam salvos como texto de lei."""
    parts = str(law.get("id", "")).split("-")
    if len(parts) < 2:
        return

    if parts[0] == "constituicao":
        required = [parts[-1]]
    elif len(parts) >= 3 and parts[-2].isdigit() and parts[-1].isdigit():
        required = [parts[-2], parts[-1]]
    else:
        return

    numeric_tokens = {
        re.sub(r"\D", "", match.group(0))
        for match in re.finditer(r"\d+(?:\.\d+)*", text)
    }
    missing = [token for token in required if token not in numeric_tokens]
    if missing:
        raise ValueError(
            "A resposta não contém a identificação desta norma ("
            + law.get("id", "sem identificador")
            + "); possível página genérica ou redirecionamento. Fonte: "
            + source_url
        )


def fetch_law_text(law: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    """Tenta as fontes em ordem e devolve diagnóstico de cada tentativa."""
    urls = law.get("fetch_urls") or [law["url"]]
    attempts: list[dict[str, Any]] = []
    failure_types: list[str] = []

    for url in urls:
        try:
            text, url_attempts = fetch_text_with_diagnostics(url)
            try:
                validate_law_identity(text, law, url)
            except Exception as exc:
                failure_types.append("invalid_content")
                attempts.extend(url_attempts[:-1])
                attempts.append({
                    "url": url,
                    "attempt": url_attempts[-1].get("attempt", 1) if url_attempts else 1,
                    "outcome": "error",
                    "failure_type": "invalid_content",
                    "http_status": url_attempts[-1].get("http_status") if url_attempts else None,
                    "detail": str(exc)[:300],
                })
                continue

            attempts.extend(url_attempts)
            prior_failures = [item for item in attempts if item.get("outcome") == "error"]
            if prior_failures:
                used_fallback = any(item.get("url") != url for item in prior_failures)
                status = "fallback_used" if used_fallback else "recovered"
            else:
                status = "ok"
            return text, url, {
                "source_status": status,
                "source_attempts": attempts,
                "source_failure_count": len(prior_failures),
                "source_failure_type": None,
                "retry_after_seconds": None,
            }
        except Exception as exc:
            if isinstance(exc, SourceFetchError):
                attempts.extend(exc.attempts)
                failure_types.append(exc.failure_type)
            else:
                attempts.append({
                    "url": url,
                    "attempt": 1,
                    "outcome": "error",
                    "failure_type": "invalid_content",
                    "http_status": None,
                    "detail": type(exc).__name__ + ": " + str(exc)[:240],
                })
                failure_types.append("invalid_content")

    priority = (
        "rate_limited",
        "access_denied",
        "blocked_page",
        "redirected_domain",
        "server_error",
        "timeout",
        "network_error",
        "temporary_network_error",
        "incomplete_response",
        "invalid_content",
        "http_error",
    )
    failure_type = next((kind for kind in priority if kind in failure_types), "network_error")
    details = " | ".join(
        item.get("url", "fonte") + " -> " + item.get("failure_type", "erro")
        + (": " + item.get("detail", "") if item.get("detail") else "")
        for item in attempts
    )
    raise SourceFetchError(
        "Nenhuma fonte configurada respondeu de forma válida: " + details,
        failure_type,
        attempts,
    )

def split_articles(text: str) -> dict[str, str]:
    articles: dict[str, list[str]] = {}
    current: str | None = None
    raw_lines = text.splitlines()
    lines: list[str] = []

    # O extrator HTML da Câmara divide alguns cabeçalhos em três linhas:
    # "Art." / "37" / "." / "A administração...". Reúne o prefixo com o número.
    index = 0
    while index < len(raw_lines):
        stripped = raw_lines[index].strip()
        if re.fullmatch(r"Art(?:igo)?\.?", stripped) and index + 1 < len(raw_lines):
            number_line = raw_lines[index + 1].strip()
            number_match = re.match(
                r"^(\d+)\s*([º°o])?\s*\.?(?:\s*[-–]\s*([A-Z]))?(?:\s+(.*))?$",
                number_line,
            )
            if number_match:
                number, ordinal, suffix, body = number_match.groups()
                heading = "Art. " + number + (ordinal or "")
                if suffix:
                    heading += "-" + suffix
                if body:
                    heading += " " + body
                lines.append(heading)
                index += 2
                continue
        lines.append(stripped)
        index += 1

    for stripped in lines:
        if not stripped:
            continue
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



def split_article_components(article_text: str) -> dict[str, dict[str, str]]:
    """Separa caput, parágrafos, incisos, alíneas e itens em caminhos hierárquicos."""
    raw_lines = article_text.splitlines()
    lines: list[str] = []
    index = 0

    # Alguns extratores separam o símbolo § e o número em linhas distintas.
    while index < len(raw_lines):
        line = raw_lines[index].strip()
        if line == "§" and index + 1 < len(raw_lines):
            following = raw_lines[index + 1].strip()
            if re.match(r"^(?:\d+\s*[º°o]?(?:\s|$)|único\b)", following, re.IGNORECASE):
                lines.append("§ " + following)
                index += 2
                continue
        if line.lower() == "parágrafo" and index + 1 < len(raw_lines):
            following = raw_lines[index + 1].strip()
            if following.lower().startswith("único"):
                lines.append("Parágrafo " + following)
                index += 2
                continue
        lines.append(line)
        index += 1

    # Retira apenas o cabeçalho do artigo. O texto que vier na mesma linha
    # continua pertencendo ao caput.
    if lines:
        heading = ARTICLE_RE.match(lines[0])
        if heading:
            body = (heading.group(3) or "").strip()
            if body:
                lines[0] = body
            else:
                lines.pop(0)

    paragraph_re = re.compile(
        r"^(?:§\s*(?:(\d+)\s*[º°o]?|(único))|Parágrafo\s+único)\s*\.?\s*(.*)$",
        re.IGNORECASE,
    )
    inciso_re = re.compile(r"^([IVXLCDM]{1,8})\s*[-–—]\s*(.*)$")
    alinea_re = re.compile(r"^([a-z])\s*(?:\)|[-–—])\s*(.*)$")
    item_re = re.compile(r"^(\d+)\s*[.)]\s*(.*)$")

    active: dict[int, str] = {}
    components: dict[str, dict[str, str]] = {}
    current_key = "caput"
    current_type = "caput"
    current_label = "caput"
    current_lines: list[str] = []

    def save_current() -> None:
        text = normalize("\n".join(current_lines))
        if not text and current_key != "caput":
            return
        components[current_key] = {
            "device_type": current_type,
            "device_label": current_label,
            "device_path": current_key,
            "text": text,
            "normalized_text": re.sub(r"\s+", " ", text).strip(),
        }

    def start_component(
        depth: int,
        device_type: str,
        key_part: str,
        label: str,
        marker_line: str,
    ) -> None:
        nonlocal current_key, current_type, current_label, current_lines
        save_current()

        if depth == 1:
            path = key_part
        elif depth == 2:
            path = active.get(1, "caput") + "/" + key_part
        elif depth == 3:
            parent = active.get(2) or active.get(1) or "caput"
            path = parent + "/" + key_part
        else:
            parent = active.get(3) or active.get(2) or active.get(1) or "caput"
            path = parent + "/" + key_part

        for deeper in list(active):
            if deeper >= depth:
                active.pop(deeper, None)
        active[depth] = path

        current_key = path
        current_type = device_type
        current_label = label
        current_lines = [marker_line] if marker_line else []

    for line in lines:
        if not line:
            continue

        paragraph = paragraph_re.match(line)
        if paragraph:
            number, unique, body = paragraph.groups()
            if unique or line.lower().startswith("parágrafo"):
                key = "paragrafo:unico"
                label = "Parágrafo único"
            else:
                key = "paragrafo:" + str(int(number))
                label = "§ " + str(int(number)) + "º"
            start_component(1, "paragrafo", key, label, line)
            if body:
                current_lines.append(body)
            continue

        inciso = inciso_re.match(line)
        if inciso:
            roman, body = inciso.groups()
            roman = roman.upper()
            start_component(2, "inciso", "inciso:" + roman, "inciso " + roman, line)
            if body:
                current_lines.append(body)
            continue

        alinea = alinea_re.match(line)
        if alinea:
            letter, body = alinea.groups()
            letter = letter.lower()
            start_component(3, "alinea", "alinea:" + letter, "alínea " + letter, line)
            if body:
                current_lines.append(body)
            continue

        item = item_re.match(line)
        if item:
            number, body = item.groups()
            number = str(int(number))
            start_component(4, "item", "item:" + number, "item " + number, line)
            if body:
                current_lines.append(body)
            continue

        current_lines.append(line)

    save_current()
    if not components:
        text = normalize(article_text)
        components["caput"] = {
            "device_type": "caput",
            "device_label": "caput",
            "device_path": "caput",
            "text": text,
            "normalized_text": re.sub(r"\s+", " ", text).strip(),
        }
    return components


BR_DATE_RE = r"(\d{1,2})(?:º|°)?[./](\d{1,2})[./](\d{4})"


def _iso_date(match: re.Match[str] | None) -> str | None:
    if not match:
        return None
    try:
        day, month, year = (int(part) for part in match.groups()[-3:])
        return datetime(year, month, day).date().isoformat()
    except (TypeError, ValueError):
        return None


def extract_event_dates(text: str) -> dict[str, str | None]:
    """Extrai somente datas identificadas expressamente como publicação ou vigência."""
    publication_re = re.compile(
        r"\b(?:publicad[oa]|publicação)\b.{0,100}?\b(?:em|de)\s+" + BR_DATE_RE,
        re.IGNORECASE | re.DOTALL,
    )
    effective_patterns = [
        re.compile(
            r"\b(?:entra(?:rá)?\s+em\s+vigor|passa(?:rá)?\s+a\s+vigorar|"
            r"produz(?:irá)?\s+efeitos?)\s+(?:a\s+partir\s+de|em)\s+" + BR_DATE_RE,
            re.IGNORECASE | re.DOTALL,
        ),
        re.compile(
            r"\b(?:revogad[oa]|revogação)\b.{0,140}?"
            r"(?:a\s+partir\s+de|com\s+efeitos\s+a\s+partir\s+de)\s+" + BR_DATE_RE,
            re.IGNORECASE | re.DOTALL,
        ),
        re.compile(
            r"\bcom\s+efeitos\s+a\s+partir\s+de\s+" + BR_DATE_RE,
            re.IGNORECASE | re.DOTALL,
        ),
    ]

    publication_match = publication_re.search(text)
    publication_date = _iso_date(publication_match)
    effective_match = next(
        (match for pattern in effective_patterns if (match := pattern.search(text))),
        None,
    )
    effective_date = _iso_date(effective_match)

    # "Entra em vigor na data de sua publicação" só permite preencher a data
    # de vigência se a publicação também estiver expressamente identificada.
    if (
        not effective_date
        and publication_date
        and re.search(
            r"\b(?:entra(?:rá)?\s+em\s+vigor|passa(?:rá)?\s+a\s+vigorar)"
            r"\s+na\s+data\s+(?:de\s+sua|da)\s+publicação",
            text,
            re.IGNORECASE,
        )
    ):
        effective_date = publication_date

    return {
        "publication_date": publication_date,
        "effective_date": effective_date,
        "publication_evidence": publication_match.group(0) if publication_match else None,
        "effective_evidence": effective_match.group(0) if effective_match else (
            "na data de sua publicação" if effective_date and publication_date else None
        ),
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

    components = {article: split_article_components(body) for article, body in articles.items()}

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
            "components": components,
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


def make_change(
    law: dict[str, Any],
    article: str,
    kind: str,
    old: str,
    new: str,
    detected: str,
    component: dict[str, str] | None = None,
) -> dict[str, Any]:
    component = component or {
        "device_type": "artigo",
        "device_label": article,
        "device_path": article,
    }
    device_type = component.get("device_type", "artigo")
    device_label = component.get("device_label", article)
    evidence_text = new or old
    dates = extract_event_dates(evidence_text)
    explicitly_revoked = (
        device_type not in {"artigo", "texto_integral"}
        and bool(re.search(r"\(\s*revogad[oa]\b", new, re.IGNORECASE))
    )

    if explicitly_revoked:
        legal_effect_status = (
            "data_de_vigencia_expressa_transcorrida"
            if dates["effective_date"] and dates["effective_date"] <= detected[:10]
            else "revogacao_indicada_sem_data_de_efeito"
        )
        summary = (
            "A fonte oficial identifica este dispositivo como revogado. "
            "A data e os efeitos jurídicos precisam ser conferidos no ato modificador."
        )
        textual_status = "revogacao_indicada_na_fonte"
    elif kind == "incluido":
        legal_effect_status = (
            "vigencia_futura_expressa"
            if dates["effective_date"] and dates["effective_date"] > detected[:10]
            else "vigencia_nao_confirmada"
        )
        summary = (
            "Este dispositivo apareceu na captura atual e não constava na anterior. "
            "A inclusão no texto capturado não confirma, sozinha, a vigência."
        )
        textual_status = "dispositivo_incluido_na_captura"
    elif kind == "nao_encontrado":
        legal_effect_status = "situacao_juridica_nao_confirmada"
        summary = (
            "Este dispositivo não foi localizado na captura atual. "
            "Isso, isoladamente, não comprova revogação."
        )
        textual_status = "dispositivo_nao_localizado"
    else:
        if dates["effective_date"]:
            legal_effect_status = (
                "vigencia_futura_expressa"
                if dates["effective_date"] > detected[:10]
                else "data_de_vigencia_expressa_transcorrida"
            )
        else:
            legal_effect_status = "vigencia_nao_confirmada"
        summary = (
            "Foi detectada uma diferença textual neste dispositivo. "
            "A comparação não confirma, por si só, que a nova redação já esteja vigente."
        )
        textual_status = "alteracao_textual_detectada"

    if device_type == "artigo":
        change_scope = "artigo"
    elif device_type == "caput":
        change_scope = "caput"
    else:
        change_scope = "parte_do_dispositivo"

    unique = digest("|".join([
        law["id"], article, component.get("device_path", ""), kind, old, new, detected
    ]))[:16]

    date_note = (
        "A data de detecção é do monitor. Publicação e início de vigência só são preenchidos "
        "quando a fonte apresenta essas informações expressamente; datas de edição ou assinatura "
        "do ato não são tratadas automaticamente como publicação ou vigência."
    )
    return {
        "id": unique,
        "law_id": law["id"],
        "law_title": law["title"],
        "law_short_title": law.get("short_title", law["title"]),
        "category": law["category"],
        "article": article,
        "device_type": device_type,
        "device_label": device_label,
        "device_path": component.get("device_path", article),
        "change_scope": change_scope,
        "change_type": "possivelmente_revogado" if explicitly_revoked else kind,
        "textual_change_status": textual_status,
        "legal_effect_status": legal_effect_status,
        "detected_at": detected,
        "publication_date": dates["publication_date"],
        "effective_date": dates["effective_date"],
        "publication_date_evidence": dates["publication_evidence"],
        "effective_date_evidence": dates["effective_evidence"],
        "old_text": old,
        "new_text": new,
        "summary": summary,
        "source_url": law["url"],
        "evidence_url": law.get("source_url_used", law["url"]),
        "review_required": True,
        "date_note": date_note,
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
        old_components = previous.get("components") or {}
        new_components = current.get("components") or {}
        changes: list[dict[str, Any]] = []

        for article in sorted(set(old_articles) | set(new_articles), key=article_order):
            old_article = old_articles.get(article, "")
            new_article = new_articles.get(article, "")

            if not old_article and new_article:
                changes.append(make_change(
                    law, article, "incluido", "", new_article, detected,
                    {"device_type": "artigo", "device_label": article, "device_path": article},
                ))
                continue
            if old_article and not new_article:
                changes.append(make_change(
                    law, article, "nao_encontrado", old_article, "", detected,
                    {"device_type": "artigo", "device_label": article, "device_path": article},
                ))
                continue

            old_parts = old_components.get(article) or {}
            new_parts = new_components.get(article) or {}
            if not old_parts or not new_parts:
                if old_article != new_article:
                    changes.append(make_change(
                        law, article, "alterado", old_article, new_article, detected,
                        {"device_type": "artigo", "device_label": article, "device_path": article},
                    ))
                continue

            for path in sorted(set(old_parts) | set(new_parts)):
                old_part = old_parts.get(path) or {}
                new_part = new_parts.get(path) or {}
                old_text = old_part.get("text", "")
                new_text = new_part.get("text", "")
                old_normalized = old_part.get("normalized_text") or re.sub(r"\s+", " ", old_text).strip()
                new_normalized = new_part.get("normalized_text") or re.sub(r"\s+", " ", new_text).strip()
                if old_normalized == new_normalized:
                    continue

                if not old_text:
                    kind = "incluido"
                elif not new_text:
                    kind = "nao_encontrado"
                elif re.search(r"\brevogad[oa]s?\b", new_text, re.IGNORECASE):
                    kind = "possivelmente_revogado"
                else:
                    kind = "alterado"

                metadata = new_part or old_part
                changes.append(make_change(
                    law, article, kind, old_text, new_text, detected, metadata
                ))
        return changes

    return [
        make_change(
            law,
            "Histórico oficial" if current.get("parser_mode") == "index" else "Texto integral",
            "texto_integral_alterado",
            previous.get("document_text", ""),
            current.get("document_text", ""),
            detected,
            {"device_type": "texto_integral", "device_label": "Texto integral", "device_path": "documento"},
        )
    ]


def source_status_for_failure(failure_type: str) -> str:
    if failure_type == "rate_limited":
        return "rate_limited"
    if failure_type in {"access_denied", "blocked_page"}:
        return "blocked"
    if failure_type in {"timeout", "network_error", "temporary_network_error", "server_error"}:
        return "unavailable"
    return "invalid_response"

def run() -> int:
    laws = [law for law in load_json(LAWS_FILE, []) if law.get("enabled", True)]
    previous_data = load_json(OUTPUT_FILE, {})
    detected = now_utc()

    # Preserva o histórico anterior, mesmo quando a estrutura interna do monitor muda.
    all_changes = list(previous_data.get("changes", []))
    law_results = []
    errors = []
    success_count = 0
    baseline_count = 0

    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    for law in laws:
        snapshot_path = SNAPSHOTS / (law["id"] + ".json")
        previous_snapshot = load_json(snapshot_path, None)
        try:
            text, source_url_used, source_diagnostics = fetch_law_text(law)
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
                "source_status": source_diagnostics["source_status"],
                "source_attempts": source_diagnostics["source_attempts"],
                "source_failure_count": source_diagnostics["source_failure_count"],
                "source_failure_type": source_diagnostics["source_failure_type"],
                "retry_after_seconds": source_diagnostics["retry_after_seconds"],
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
            failure_type = exc.failure_type if isinstance(exc, SourceFetchError) else "invalid_content"
            source_status = source_status_for_failure(failure_type)
            source_attempts = exc.attempts if isinstance(exc, SourceFetchError) else []
            retry_after = exc.retry_after_seconds if isinstance(exc, SourceFetchError) else None
            errors.append({
                "law_id": law["id"], "law_title": law["title"], "message": message,
                "source_status": source_status, "failure_type": failure_type,
                "attempts": source_attempts, "retry_after_seconds": retry_after,
            })
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
                "source_status": source_status,
                "source_attempts": source_attempts,
                "source_failure_count": len([item for item in source_attempts if item.get("outcome") == "error"]),
                "source_failure_type": failure_type,
                "retry_after_seconds": retry_after,
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
        limited = sum(1 for item in errors if item.get("source_status") == "rate_limited")
        blocked = sum(1 for item in errors if item.get("source_status") == "blocked")
        summary = (
            f"{success_count} fonte(s) consultada(s); {len(errors)} fonte(s) apresentaram erro "
            f"({limited} com limite de acesso e {blocked} bloqueada(s)). "
            "As capturas anteriores dessas fontes foram preservadas."
        )
    else:
        status = "erro"
        last_success = previous_data.get("last_successful_check")
        limited = sum(1 for item in errors if item.get("source_status") == "rate_limited")
        blocked = sum(1 for item in errors if item.get("source_status") == "blocked")
        summary = (
            f"Nenhuma fonte pôde ser consultada ({limited} com limite de acesso e "
            f"{blocked} bloqueada(s)). As capturas anteriores foram preservadas."
        )

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
