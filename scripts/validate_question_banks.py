#!/usr/bin/env python3
"""Validate every published exercise against the current official law snapshots."""
from __future__ import annotations

import json
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DIFFICULTIES = {"facil", "media", "dificil"}
OFFICIAL_SUFFIXES = (".gov.br", ".leg.br")


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Não foi possível ler {path.relative_to(ROOT)}: {exc}") from exc


def normalize(value: object) -> str:
    raw = unicodedata.normalize("NFD", str(value or ""))
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn").lower()
    output = []
    for ch in raw:
        if ch.isalnum() or ch == "%":
            output.append(ch)
        else:
            output.append(" ")
    return " ".join("".join(output).split())


def article_fingerprint(value: str) -> str:
    value_hash = 2166136261
    for ch in value:
        value_hash = ((value_hash ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return f"{value_hash:08x}"


def official_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
        return bool(host) and any(host == suffix[1:] or host.endswith(suffix) for suffix in OFFICIAL_SUFFIXES)
    except Exception:
        return False


def fail(errors: list[str], bank: str, item_id: str, message: str):
    errors.append(f"[{bank}] {item_id}: {message}")


def check_common(item: dict, bank: str, key: str, anchors: list[str], snapshots: dict, errors: list[str]):
    item_id = str(item.get("id") or "(sem id)")
    required = ("category", "topic", "law_id", "law_title", "article", "article_key",
                "difficulty", "legal_reference", "source_url", "source_snapshot_date",
                "source_snapshot_captured_at", "source_revision", "source_snapshot_hash",
                "source_article_hash", "explanation")
    for field in required:
        if not item.get(field):
            fail(errors, bank, item_id, f"campo obrigatório ausente: {field}")

    if item.get("difficulty") not in DIFFICULTIES:
        fail(errors, bank, item_id, f"dificuldade inválida: {item.get('difficulty')!r}")

    reference = str(item.get("legal_reference") or "").strip()
    explanation = str(item.get("explanation") or "")
    if not reference or f"Fundamento legal: {reference}." not in explanation:
        fail(errors, bank, item_id, "comentário sem a referência explícita 'Fundamento legal: dispositivo da norma.'")

    source = str(item.get("source_url") or "")
    if not official_url(source):
        fail(errors, bank, item_id, "fonte não reconhecida como domínio oficial gov.br/leg.br")

    snapshot = snapshots.get(str(item.get("law_id") or ""))
    if snapshot is None:
        fail(errors, bank, item_id, "captura oficial da norma não foi encontrada")
        return None

    snapshot_url = str(snapshot.get("source_url_used") or "")
    if source != snapshot_url:
        fail(errors, bank, item_id, "URL da questão difere da fonte usada na captura atual")

    captured_at = str(snapshot.get("captured_at") or "")
    if captured_at and item.get("source_snapshot_captured_at") != captured_at:
        fail(errors, bank, item_id, "data/hora da captura registrada não corresponde à captura do repositório")
    if captured_at and item.get("source_snapshot_date") != captured_at[:10]:
        fail(errors, bank, item_id, "data da captura registrada não corresponde à captura do repositório")

    articles = snapshot.get("articles") or {}
    article_text = articles.get(key)
    if not article_text:
        fail(errors, bank, item_id, f"dispositivo ausente na captura atual: {key!r}")
        return None

    calculated_hash = article_fingerprint(article_text)
    if item.get("source_article_hash") != calculated_hash:
        fail(errors, bank, item_id, "o texto do dispositivo mudou desde a criação da questão; item deve ficar suspenso")
    if not item.get("source_snapshot_hash"):
        fail(errors, bank, item_id, "hash da captura integral não registrado")

    good_anchors = [str(anchor).strip() for anchor in anchors if str(anchor or "").strip()]
    if not good_anchors:
        fail(errors, bank, item_id, "questão sem trecho-âncora que sustente o gabarito")
    else:
        current = normalize(article_text)
        for anchor in good_anchors:
            if normalize(anchor) not in current:
                fail(errors, bank, item_id, f"trecho-âncora não localizado no dispositivo atual: {anchor[:90]!r}")

    return article_text


def check_unique_ids(rows: list[dict], bank: str, errors: list[str]):
    seen = set()
    for item in rows:
        item_id = str(item.get("id") or "")
        if not item_id:
            fail(errors, bank, "(sem id)", "identificador ausente")
        elif item_id in seen:
            fail(errors, bank, item_id, "identificador duplicado")
        seen.add(item_id)


def main() -> int:
    errors: list[str] = []
    snapshot_paths = sorted((DATA / "snapshots").glob("*.json"))
    snapshots = {}
    for path in snapshot_paths:
        try:
            snapshots[path.stem] = load_json(path)
        except ValueError as exc:
            errors.append(str(exc))

    ce = load_json(DATA / "questoes.json")
    find_error = load_json(DATA / "encontre-erro.json")
    discover = load_json(DATA / "descubra-artigo.json")
    multi = load_json(DATA / "afirmacoes-por-artigo.json")

    ce_rows = ce.get("questions") or []
    error_rows = find_error.get("items") or []
    discover_rows = discover.get("questions") or []
    multi_rows = multi.get("article_sets") or []

    check_unique_ids(ce_rows, "Certo ou Errado", errors)
    check_unique_ids(error_rows, "Encontre o erro", errors)
    check_unique_ids(discover_rows, "Descubra o artigo", errors)
    check_unique_ids(multi_rows, "Várias afirmações", errors)

    for item in ce_rows:
        item_id = str(item.get("id") or "(sem id)")
        if not isinstance(item.get("answer"), bool):
            fail(errors, "Certo ou Errado", item_id, "gabarito deve ser booleano")
        if not str(item.get("statement") or "").strip():
            fail(errors, "Certo ou Errado", item_id, "enunciado vazio")
        check_common(item, "Certo ou Errado", str(item.get("article_key") or ""),
                     item.get("supporting_excerpts") or [], snapshots, errors)

    for item in error_rows:
        item_id = str(item.get("id") or "(sem id)")
        segments = item.get("segments")
        index = item.get("wrong_segment_index")
        if not isinstance(segments, list) or len(segments) < 3 or not all(isinstance(x, str) for x in segments):
            fail(errors, "Encontre o erro", item_id, "segmentos do enunciado inválidos")
        elif not isinstance(index, int) or index < 0 or index >= len(segments):
            fail(errors, "Encontre o erro", item_id, "posição do trecho incorreto inválida")
        elif not segments[index].strip():
            fail(errors, "Encontre o erro", item_id, "trecho marcado como incorreto está vazio")
        if item.get("question_type") not in {"prazo", "percentual", "requisito", "excecao"}:
            fail(errors, "Encontre o erro", item_id, "classificação do conteúdo inválida")
        check_common(item, "Encontre o erro", str(item.get("article_key") or ""),
                     [item.get("correct_phrase") or ""], snapshots, errors)

    for item in discover_rows:
        item_id = str(item.get("id") or "(sem id)")
        options = item.get("options") or []
        keys = [option.get("article_key") for option in options if isinstance(option, dict)]
        if len(options) != 4 or len(keys) != 4 or len(set(keys)) != 4:
            fail(errors, "Descubra o artigo", item_id, "devem existir quatro alternativas distintas")
        target = str(item.get("answer_article_key") or "")
        if target not in keys:
            fail(errors, "Descubra o artigo", item_id, "alternativa correta não está entre as opções")
        snap = snapshots.get(str(item.get("law_id") or ""))
        if snap:
            for option_key in keys:
                if option_key not in (snap.get("articles") or {}):
                    fail(errors, "Descubra o artigo", item_id, f"alternativa aponta para dispositivo ausente: {option_key!r}")
        check_common(item, "Descubra o artigo", target,
                     [item.get("validation_phrase") or ""], snapshots, errors)

    statement_total = 0
    for group in multi_rows:
        group_id = str(group.get("id") or "(sem id)")
        statements = group.get("statements") or []
        statement_total += len(statements)
        snapshot = snapshots.get(str(group.get("law_id") or ""))
        article_key = str(group.get("article_key") or "")
        article_text = (snapshot.get("articles") or {}).get(article_key) if snapshot else None

        for field in ("category", "topic", "difficulty", "legal_reference", "source_url",
                      "source_snapshot_date", "source_snapshot_captured_at", "source_revision",
                      "source_snapshot_hash", "source_article_hash"):
            if not group.get(field):
                fail(errors, "Várias afirmações", group_id, f"metadado do grupo ausente: {field}")

        if not isinstance(statements, list) or len(statements) < 2:
            fail(errors, "Várias afirmações", group_id, "o grupo precisa de pelo menos duas afirmações")
        if article_text:
            if group.get("source_article_hash") != article_fingerprint(article_text):
                fail(errors, "Várias afirmações", group_id, "hash do dispositivo mudou; grupo deve ficar suspenso")
            if group.get("source_url") != snapshot.get("source_url_used"):
                fail(errors, "Várias afirmações", group_id, "fonte do grupo diverge da captura atual")
        for statement in statements:
            statement_id = str(statement.get("id") or group_id)
            if not isinstance(statement.get("answer"), bool):
                fail(errors, "Várias afirmações", statement_id, "gabarito deve ser booleano")
            check_common(statement, "Várias afirmações", article_key,
                         [statement.get("validation_phrase") or ""], snapshots, errors)

    print("Validação automática dos bancos de questões")
    print(f"Certo ou Errado: {len(ce_rows)}")
    print(f"Encontre o erro: {len(error_rows)}")
    print(f"Descubra o artigo: {len(discover_rows)}")
    print(f"Várias afirmações: {len(multi_rows)} artigos / {statement_total} itens")
    print(f"Capturas oficiais localizadas: {len(snapshots)}")

    if errors:
        print(f"FALHAS: {len(errors)}")
        for error in errors[:200]:
            print(" - " + error)
        if len(errors) > 200:
            print(f" - ... e mais {len(errors) - 200} falha(s)")
        return 1

    print("SUCESSO: todos os itens possuem fundamento, fonte e dispositivo correspondentes à captura atual.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
