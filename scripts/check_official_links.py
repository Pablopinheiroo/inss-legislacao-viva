#!/usr/bin/env python3
"""Verifica os links oficiais publicados no catálogo, monitor e bancos de questões."""
from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OFFICIAL_SUFFIXES = (".gov.br", ".leg.br")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def collect_urls(value, result: set[str]):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"url", "source_url", "source_url_used"} and isinstance(child, str):
                if child.startswith("https://"):
                    result.add(child)
            else:
                collect_urls(child, result)
    elif isinstance(value, list):
        for child in value:
            collect_urls(child, result)


def check_url(url: str):
    host = (urlparse(url).hostname or "").lower()
    if not any(host == suffix[1:] or host.endswith(suffix) for suffix in OFFICIAL_SUFFIXES):
        return url, "FAIL", "domínio não reconhecido como oficial"

    last_status = None
    last_detail = ""
    for attempt in range(2):
        request = Request(
            url,
            headers={
                "User-Agent": "RadarLegislativoINSS-LinkCheck/1.0 (+https://github.com/Pablopinheiroo/inss-legislacao-viva)",
                "Range": "bytes=0-2047",
                "Accept": "text/html,application/pdf,*/*",
            },
        )
        try:
            with urlopen(request, timeout=22) as response:
                status = int(response.status)
                content = response.read(2048)
                final_host = (urlparse(response.geturl()).hostname or "").lower()
                if not any(final_host == suffix[1:] or final_host.endswith(suffix) for suffix in OFFICIAL_SUFFIXES):
                    return url, "WARN", f"redirecionou para domínio externo: {final_host}"
                if status in (200, 206) and content:
                    sample = content[:2048].decode("utf-8", errors="ignore").lower()
                    if any(marker in sample for marker in ("cf-chl-", "just a moment...", "enable javascript and cookies")):
                        return url, "WARN", f"respondeu com página de verificação automática (HTTP {status})"
                    return url, "OK", f"HTTP {status}"
                last_status = status
                last_detail = f"resposta sem conteúdo (HTTP {status})"
        except HTTPError as exc:
            last_status = exc.code
            last_detail = f"HTTP {exc.code}"
        except (URLError, TimeoutError, OSError) as exc:
            last_detail = str(exc)[:180]
        if attempt == 0:
            time.sleep(1.2)

    if last_status in (404, 410):
        return url, "FAIL", last_detail
    if last_status in (401, 403, 429) or (last_status and last_status >= 500):
        return url, "WARN", last_detail + " (bloqueio/instabilidade da fonte)"
    return url, "WARN", last_detail or "não foi possível confirmar a resposta"


def main() -> int:
    files = [
        DATA / "laws.json",
        DATA / "legislacao.json",
        DATA / "questoes.json",
        DATA / "encontre-erro.json",
        DATA / "descubra-artigo.json",
        DATA / "afirmacoes-por-artigo.json",
    ]
    urls: set[str] = set()
    for path in files:
        collect_urls(load_json(path), urls)

    print(f"Verificando {len(urls)} links oficiais distintos.")
    results = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(check_url, url) for url in sorted(urls)]
        for future in as_completed(futures):
            results.append(future.result())

    results.sort(key=lambda item: (item[1] != "FAIL", item[1] != "WARN", item[0]))
    for url, status, detail in results:
        print(f"[{status}] {detail} — {url}")

    failures = [item for item in results if item[1] == "FAIL"]
    warnings = [item for item in results if item[1] == "WARN"]
    print(f"Links respondendo: {len(results) - len(failures) - len(warnings)}")
    print(f"Links quebrados confirmados: {len(failures)}")
    print(f"Links sem confirmação conclusiva: {len(warnings)}")
    if failures:
        print("FALHA: corrija os links que retornaram HTTP 404/410 ou domínio inválido.")
        return 1
    print("SUCESSO: nenhum link oficialmente quebrado foi identificado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
