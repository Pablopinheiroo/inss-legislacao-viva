import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from scripts import monitor
from scripts.monitor import (
    SourceFetchError,
    fetch_law_text,
    fetch_text_with_diagnostics,
    baseline_must_be_rebuilt,
    compare,
    extract_event_dates,
    make_snapshot,
    split_article_components,
    split_articles,
    validate_law_identity,
    validate_snapshot_continuity,
)


class MonitorTests(unittest.TestCase):
    def test_source_identity_accepts_formatted_law_number(self):
        law = {"id": "lei-13985-2020"}
        validate_law_identity(
            "LEI Nº 13.985, DE 7 DE ABRIL DE 2020. Texto da lei.",
            law,
            "https://www2.camara.leg.br/lei.html",
        )

    def test_source_identity_rejects_generic_portal_homepage(self):
        law = {"id": "lei-13985-2020"}
        with self.assertRaises(ValueError):
            validate_law_identity(
                "Notícias do governo COP31 e agenda do presidente em 2026.",
                law,
                "https://www.planalto.gov.br/ccivil_03/lei/l13985.htm",
            )

    def test_source_identity_accepts_number_year_separated_by_slash(self):
        law = {"id": "ec-103-2019"}
        validate_law_identity(
            "EMENDA CONSTITUCIONAL Nº 103/2019. Texto da emenda.",
            law,
            "https://www.camara.leg.br/ec.html",
        )

    def test_split_articles_and_paragraphs(self):
        result = split_articles("Lei teste\nArt. 1º Texto inicial.\n§ 1º Um parágrafo.\nArt. 2º Segundo artigo.")
        self.assertIn("Art. 1", result)
        self.assertIn("Art. 2", result)
        self.assertIn("Um parágrafo", result["Art. 1"])

    def test_article_heading_split_across_lines(self):
        result = split_articles(
            "CAPÍTULO\nSeção I\nArt.\n37\n.\nA administração pública seguirá os princípios.\n"
            "Art.\n149.\nCompete à União instituir contribuições.\n"
            "Art.\n193. A ordem social tem como base o trabalho."
        )
        self.assertIn("Art. 37", result)
        self.assertIn("Art. 149", result)
        self.assertIn("Art. 193", result)
        self.assertIn("A administração pública", result["Art. 37"])
        self.assertIn("Compete à União", result["Art. 149"])
        self.assertIn("A ordem social", result["Art. 193"])

    def test_article_with_letter_suffix(self):
        result = split_articles("Art. 1º-A Texto incluído.\nArt. 2º Outro.")
        self.assertIn("Art. 1-A", result)

    def test_lowercase_article_reference_is_not_a_new_heading(self):
        result = split_articles(
            "Art. 5º Texto do artigo.\n"
            "art. 37, inciso XVI, da Constituição Federal.\n"
            "Art. 6º Segundo artigo."
        )
        self.assertIn("Art. 5", result)
        self.assertNotIn("Art. 37", result)
        self.assertIn("art. 37", result["Art. 5"])
        self.assertIn("Art. 6", result)

    def test_only_selected_articles_are_saved(self):
        law = {
            "id": "cf",
            "title": "Constituição",
            "category": "Constituição",
            "url": "https://example.org/cf",
            "include_articles": ["Art. 5", "Art. 6"],
            "require_all_articles": True,
        }
        snapshot = make_snapshot(
            "Art. 5º Texto do artigo 5.\nArt. 6º Texto do artigo 6.\nArt. 7º Não guardar.",
            law,
            law["url"],
        )
        self.assertEqual(set(snapshot["articles"]), {"Art. 5", "Art. 6"})
        self.assertNotIn("document_text", snapshot)
        self.assertEqual(snapshot["article_count"], 2)

    def test_required_article_missing_does_not_create_snapshot(self):
        law = {
            "id": "cf",
            "title": "Constituição",
            "category": "Constituição",
            "url": "https://example.org/cf",
            "include_articles": ["Art. 5", "Art. 149"],
            "require_all_articles": True,
        }
        with self.assertRaises(ValueError):
            make_snapshot("Art. 5º Texto disponível.", law, law["url"])

    def test_initial_snapshot_is_baseline(self):
        law = {"id": "x", "title": "Lei X", "short_title": "Lei X", "category": "Lei", "url": "https://example.org"}
        current = make_snapshot("Art. 1º Novo texto.\nArt. 2º Segundo.", law, law["url"])
        self.assertEqual(compare(law, None, current, "2026-11-13T00:00:00Z"), [])

    def test_article_change_is_detected(self):
        law = {"id": "x", "title": "Lei X", "short_title": "Lei X", "category": "Lei", "url": "https://example.org"}
        old = make_snapshot("Art. 1º Texto antigo.\nArt. 2º Mantido.", law, law["url"])
        new = make_snapshot("Art. 1º Texto novo.\nArt. 2º Mantido.", law, law["url"])
        changes = compare(law, old, new, "2026-11-13T00:00:00Z")
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["article"], "Art. 1")
        self.assertEqual(changes[0]["change_type"], "alterado")

    def test_other_articles_do_not_affect_selected_scope(self):
        law = {
            "id": "cf",
            "title": "Constituição",
            "category": "Constituição",
            "url": "https://example.org/cf",
            "include_articles": ["Art. 5"],
            "require_all_articles": True,
        }
        old = make_snapshot("Art. 5º Mantido.\nArt. 6º Texto anterior.", law, law["url"])
        new = make_snapshot("Art. 5º Mantido.\nArt. 6º Texto diferente.", law, law["url"])
        self.assertEqual(compare(law, old, new, "2026-11-13T00:00:00Z"), [])

    def test_old_parser_snapshot_requires_new_baseline(self):
        current = {
            "snapshot_version": 2,
            "source_url_used": "https://example.org/new",
            "parser_mode": "artigos",
            "snapshot_scope": "selected_articles",
        }
        old = {
            "document_hash": "legacy",
            "source_url_used": "https://example.org/old",
            "parser_mode": "artigos",
        }
        self.assertTrue(baseline_must_be_rebuilt(old, current))


    def test_hierarchical_device_parser_identifies_nested_units(self):
        parts = split_article_components(
            "Art. 10. Texto do caput.\n"
            "§\n1º Texto do parágrafo.\n"
            "I - Texto do inciso.\n"
            "a) Texto da alínea.\n"
            "1. Texto do item.\n"
            "§ 2º Segundo parágrafo."
        )
        self.assertIn("caput", parts)
        self.assertIn("paragrafo:1", parts)
        self.assertIn("paragrafo:1/inciso:I", parts)
        self.assertIn("paragrafo:1/inciso:I/alinea:a", parts)
        self.assertIn("paragrafo:1/inciso:I/alinea:a/item:1", parts)
        self.assertIn("paragrafo:2", parts)
        self.assertEqual(parts["paragrafo:1/inciso:I/alinea:a"]["device_label"], "alínea a")
        self.assertEqual(parts["paragrafo:1"]["text"], "§ 1º Texto do parágrafo.")
        self.assertEqual(parts["paragrafo:1/inciso:I"]["text"], "I - Texto do inciso.")
        self.assertEqual(parts["paragrafo:1/inciso:I/alinea:a"]["text"], "a) Texto da alínea.")
        self.assertEqual(parts["paragrafo:1/inciso:I/alinea:a/item:1"]["text"], "1. Texto do item.")

    def test_compare_reports_only_the_changed_subdevice(self):
        law = {
            "id": "lei-teste-1",
            "title": "Lei de teste",
            "short_title": "Lei de teste",
            "category": "Lei",
            "url": "https://example.org/lei",
        }
        old = make_snapshot(
            "Art. 1º Texto do caput.\n§ 1º Parágrafo.\nI - Redação antiga.\nII - Mantido.",
            law,
            law["url"],
        )
        new = make_snapshot(
            "Art. 1º Texto do caput.\n§ 1º Parágrafo.\nI - Redação nova.\nII - Mantido.",
            law,
            law["url"],
        )
        changes = compare(law, old, new, "2026-11-14T12:00:00Z")
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["article"], "Art. 1")
        self.assertEqual(changes[0]["device_type"], "inciso")
        self.assertEqual(changes[0]["device_label"], "inciso I")
        self.assertEqual(changes[0]["change_scope"], "parte_do_dispositivo")
        self.assertEqual(changes[0]["legal_effect_status"], "vigencia_nao_confirmada")

    def test_added_subdevice_is_not_reported_as_whole_article(self):
        law = {
            "id": "lei-teste-2",
            "title": "Lei de teste",
            "short_title": "Lei de teste",
            "category": "Lei",
            "url": "https://example.org/lei",
        }
        old = make_snapshot("Art. 1º Texto do caput.", law, law["url"])
        new = make_snapshot("Art. 1º Texto do caput.\n§ 1º Parágrafo incluído.", law, law["url"])
        changes = compare(law, old, new, "2026-11-14T12:00:00Z")
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["change_type"], "incluido")
        self.assertEqual(changes[0]["device_label"], "§ 1º")

    def test_explicit_revocation_annotation_is_identified_at_device_level(self):
        law = {
            "id": "lei-teste-3",
            "title": "Lei de teste",
            "short_title": "Lei de teste",
            "category": "Lei",
            "url": "https://example.org/lei",
        }
        old = make_snapshot("Art. 1º Caput.\n§ 1º Texto vigente.", law, law["url"])
        new = make_snapshot("Art. 1º Caput.\n§ 1º (Revogado pela Lei nº 9.999, de 1º/1/2026).", law, law["url"])
        changes = compare(law, old, new, "2026-11-14T12:00:00Z")
        paragraph_change = next(change for change in changes if change["device_type"] == "paragrafo")
        self.assertEqual(paragraph_change["change_type"], "possivelmente_revogado")
        self.assertEqual(paragraph_change["textual_change_status"], "revogacao_indicada_na_fonte")

    def test_publication_and_effective_dates_require_explicit_wording(self):
        dates = extract_event_dates(
            "Publicado no Diário Oficial em 05/05/2026. "
            "Esta norma entra em vigor a partir de 10/05/2026."
        )
        self.assertEqual(dates["publication_date"], "2026-05-05")
        self.assertEqual(dates["effective_date"], "2026-05-10")

        amendment_reference = extract_event_dates(
            "(Inciso com redação dada pela Lei nº 9.528, de 10/12/1997)"
        )
        self.assertIsNone(amendment_reference["publication_date"])
        self.assertIsNone(amendment_reference["effective_date"])

    def test_missing_device_is_not_automatically_classified_as_revoked(self):
        law = {
            "id": "lei-teste-4",
            "title": "Lei de teste",
            "short_title": "Lei de teste",
            "category": "Lei",
            "url": "https://example.org/lei",
        }
        old = make_snapshot("Art. 1º Caput.\n§ 1º Texto antigo.", law, law["url"])
        new = make_snapshot("Art. 1º Caput.", law, law["url"])
        changes = compare(law, old, new, "2026-11-14T12:00:00Z")
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["change_type"], "nao_encontrado")
        self.assertEqual(changes[0]["legal_effect_status"], "situacao_juridica_nao_confirmada")



    @staticmethod
    def mock_response(status=200, body="", url="https://example.org/lei", headers=None):
        response = Mock()
        response.status_code = status
        response.text = body
        response.url = url
        response.headers = headers or {"Content-Type": "text/html; charset=utf-8"}
        response.content = body.encode("utf-8")
        response.encoding = "utf-8"
        response.apparent_encoding = "utf-8"
        return response

    def test_http_403_is_recorded_as_access_denied_without_retry(self):
        response = self.mock_response(403, "Acesso negado")
        with patch("scripts.monitor.requests.get", return_value=response) as get, \
             patch("scripts.monitor.time.sleep") as sleep:
            with self.assertRaises(SourceFetchError) as raised:
                fetch_text_with_diagnostics("https://example.org/lei")

        self.assertEqual(raised.exception.failure_type, "access_denied")
        self.assertEqual(raised.exception.attempts[0]["http_status"], 403)
        self.assertEqual(raised.exception.attempts[0]["outcome"], "error")
        get.assert_called_once()
        sleep.assert_not_called()

    def test_http_429_retries_and_preserves_rate_limit_diagnostics(self):
        response = self.mock_response(429, "Too many requests", headers={
            "Content-Type": "text/html",
            "Retry-After": "2",
        })
        with patch("scripts.monitor.requests.get", return_value=response) as get, \
             patch("scripts.monitor.time.sleep") as sleep:
            with self.assertRaises(SourceFetchError) as raised:
                fetch_text_with_diagnostics("https://example.org/lei")

        self.assertEqual(raised.exception.failure_type, "rate_limited")
        self.assertEqual(len(raised.exception.attempts), 3)
        self.assertTrue(all(item["http_status"] == 429 for item in raised.exception.attempts))
        self.assertEqual(raised.exception.retry_after_seconds, 2)
        self.assertEqual(get.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_http_503_is_retried_but_never_returned_as_legal_text(self):
        response = self.mock_response(503, "Service temporarily unavailable")
        with patch("scripts.monitor.requests.get", return_value=response) as get, \
             patch("scripts.monitor.time.sleep"):
            with self.assertRaises(SourceFetchError) as raised:
                fetch_text_with_diagnostics("https://example.org/lei")

        self.assertEqual(raised.exception.failure_type, "server_error")
        self.assertEqual(get.call_count, 3)
        self.assertTrue(all(item["outcome"] == "error" for item in raised.exception.attempts))

    def test_http_200_cloudflare_challenge_is_not_accepted_as_law(self):
        challenge = (
            "<html><head><title>Just a moment...</title></head><body>"
            + ("Checking your browser. Verify that you are human. " * 20)
            + "</body></html>"
        )
        response = self.mock_response(200, challenge)
        with patch("scripts.monitor.requests.get", return_value=response):
            with self.assertRaises(SourceFetchError) as raised:
                fetch_text_with_diagnostics("https://example.org/lei")

        self.assertEqual(raised.exception.failure_type, "blocked_page")
        self.assertEqual(raised.exception.attempts[0]["http_status"], 200)

    def test_fetch_uses_backup_after_primary_source_is_blocked(self):
        primary = "https://primary.example.org/lei"
        backup = "https://backup.example.org/lei"
        law = {
            "id": "lei-12345-2020",
            "title": "Lei nº 12.345/2020",
            "category": "Lei",
            "url": primary,
            "fetch_urls": [primary, backup],
        }
        legal_text = (
            "LEI Nº 12.345, DE 1º DE JANEIRO DE 2020.\n"
            + ("Texto oficial da norma com conteúdo suficiente para a captura. " * 12)
        )
        blocked = SourceFetchError(
            "403 bloqueado",
            "access_denied",
            [{
                "url": primary, "attempt": 1, "outcome": "error",
                "failure_type": "access_denied", "http_status": 403,
                "detail": "Acesso negado",
            }],
        )
        backup_attempt = [{
            "url": backup, "attempt": 1, "outcome": "success",
            "failure_type": None, "http_status": 200,
            "detail": "Conteúdo recebido e interpretado.",
        }]
        with patch(
            "scripts.monitor.fetch_text_with_diagnostics",
            side_effect=[blocked, (legal_text, backup_attempt)],
        ):
            text, used_url, diagnostic = fetch_law_text(law)

        self.assertIn("LEI Nº 12.345", text)
        self.assertEqual(used_url, backup)
        self.assertEqual(diagnostic["source_status"], "fallback_used")
        self.assertEqual(diagnostic["source_failure_count"], 1)
        self.assertEqual(diagnostic["source_attempts"][0]["http_status"], 403)

    def test_query_failure_preserves_previous_snapshot_and_does_not_create_removal_alert(self):
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            snapshots_dir = data_dir / "snapshots"
            snapshots_dir.mkdir(parents=True)
            laws_file = data_dir / "laws.json"
            output_file = data_dir / "legislacao.json"
            law_id = "lei-12345-2020"
            previous_snapshot = {
                "snapshot_version": 3,
                "captured_at": "2026-11-13T09:00:00Z",
                "source_url_used": "https://example.org/lei",
                "parser_mode": "artigos",
                "snapshot_scope": "all_detected_articles",
                "article_count": 1,
                "articles": {"Art. 1": "Art. 1º Texto vigente."},
            }
            previous_history = [{
                "id": "historico-anterior",
                "law_id": law_id,
                "article": "Art. 9",
                "change_type": "alterado",
                "detected_at": "2026-11-10T09:00:00Z",
            }]
            laws_file.write_text(json.dumps([{
                "id": law_id,
                "title": "Lei de teste",
                "short_title": "Lei de teste",
                "category": "Lei",
                "url": "https://example.org/lei",
            }]), encoding="utf-8")
            output_file.write_text(json.dumps({
                "monitor_version": 3,
                "last_successful_check": "2026-11-13T09:00:00Z",
                "changes": previous_history,
            }), encoding="utf-8")
            snapshot_file = snapshots_dir / (law_id + ".json")
            snapshot_file.write_text(json.dumps(previous_snapshot), encoding="utf-8")

            blocked_error = SourceFetchError(
                "HTTP 429 rate_limited",
                "rate_limited",
                [{
                    "url": "https://example.org/lei",
                    "attempt": 1,
                    "outcome": "error",
                    "failure_type": "rate_limited",
                    "http_status": 429,
                    "retry_after_seconds": 120,
                    "detail": "Muitas consultas",
                }],
            )
            with patch.object(monitor, "LAWS_FILE", laws_file), \
                 patch.object(monitor, "OUTPUT_FILE", output_file), \
                 patch.object(monitor, "SNAPSHOTS", snapshots_dir), \
                 patch.object(monitor, "fetch_law_text", side_effect=blocked_error), \
                 patch.object(monitor.time, "sleep"):
                result = monitor.run()

            saved_snapshot = json.loads(snapshot_file.read_text(encoding="utf-8"))
            saved_output = json.loads(output_file.read_text(encoding="utf-8"))
            self.assertEqual(result, 1)
            self.assertEqual(saved_snapshot, previous_snapshot)
            self.assertEqual(saved_output["changes"], previous_history)
            self.assertEqual(saved_output["laws"][0]["source_status"], "rate_limited")
            self.assertEqual(saved_output["laws"][0]["source_failure_type"], "rate_limited")
            self.assertEqual(saved_output["laws"][0]["retry_after_seconds"], 120)
            self.assertEqual(saved_output["laws"][0]["new_changes_detected"], 0)
            self.assertEqual(saved_output["status"], "erro")
            self.assertEqual(saved_output["last_successful_check"], "2026-11-13T09:00:00Z")
            self.assertEqual(saved_output["errors"][0]["failure_type"], "rate_limited")



    def test_sudden_article_count_drop_is_rejected_as_incomplete_response(self):
        law = {
            "id": "lei-teste-5",
            "title": "Lei de teste",
            "short_title": "Lei de teste",
            "category": "Lei",
            "url": "https://example.org/lei",
        }
        previous_articles = {
            "Art. " + str(number): "Art. " + str(number) + "º Texto " + str(number) + "."
            for number in range(1, 11)
        }
        previous = {
            "snapshot_version": 3,
            "source_url_used": law["url"],
            "parser_mode": "artigos",
            "snapshot_scope": "all_detected_articles",
            "article_count": len(previous_articles),
            "articles": previous_articles,
        }
        current = make_snapshot(
            "Art. 1º Apenas um artigo apareceu na resposta.",
            law,
            law["url"],
        )
        with self.assertRaises(SourceFetchError) as raised:
            validate_snapshot_continuity(previous, current)

        self.assertEqual(raised.exception.failure_type, "incomplete_response")
        self.assertIn("queda brusca", str(raised.exception))
        self.assertEqual(raised.exception.attempts[0]["failure_type"], "incomplete_response")

    def test_run_preserves_snapshot_when_response_contains_only_a_fragment(self):
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            snapshots_dir = data_dir / "snapshots"
            snapshots_dir.mkdir(parents=True)
            laws_file = data_dir / "laws.json"
            output_file = data_dir / "legislacao.json"
            law_id = "lei-teste-6"
            source_url = "https://example.org/lei"
            previous_articles = {
                "Art. " + str(number): "Art. " + str(number) + "º Texto original."
                for number in range(1, 11)
            }
            previous_snapshot = {
                "snapshot_version": 3,
                "captured_at": "2026-11-13T09:00:00Z",
                "source_url_used": source_url,
                "parser_mode": "artigos",
                "snapshot_scope": "all_detected_articles",
                "article_count": 10,
                "articles": previous_articles,
            }
            previous_history = [{"id": "alerta-preservado", "change_type": "alterado"}]
            laws_file.write_text(json.dumps([{
                "id": law_id,
                "title": "Lei de teste",
                "short_title": "Lei de teste",
                "category": "Lei",
                "url": source_url,
            }]), encoding="utf-8")
            output_file.write_text(json.dumps({
                "monitor_version": 3,
                "last_successful_check": "2026-11-13T09:00:00Z",
                "changes": previous_history,
            }), encoding="utf-8")
            snapshot_file = snapshots_dir / (law_id + ".json")
            snapshot_file.write_text(json.dumps(previous_snapshot), encoding="utf-8")

            fake_diagnostics = {
                "source_status": "ok",
                "source_attempts": [{
                    "url": source_url, "attempt": 1, "outcome": "success",
                    "http_status": 200, "failure_type": None,
                    "detail": "Resposta HTTP recebida.",
                }],
                "source_failure_count": 0,
                "source_failure_type": None,
                "retry_after_seconds": None,
            }
            with patch.object(monitor, "LAWS_FILE", laws_file), \
                 patch.object(monitor, "OUTPUT_FILE", output_file), \
                 patch.object(monitor, "SNAPSHOTS", snapshots_dir), \
                 patch.object(
                     monitor,
                     "fetch_law_text",
                     return_value=("Art. 1º Fragmento da página.", source_url, fake_diagnostics),
                 ), \
                 patch.object(monitor.time, "sleep"):
                result = monitor.run()

            saved_snapshot = json.loads(snapshot_file.read_text(encoding="utf-8"))
            saved_output = json.loads(output_file.read_text(encoding="utf-8"))
            self.assertEqual(result, 1)
            self.assertEqual(saved_snapshot, previous_snapshot)
            self.assertEqual(saved_output["changes"], previous_history)
            self.assertEqual(saved_output["laws"][0]["source_status"], "invalid_response")
            self.assertEqual(saved_output["laws"][0]["source_failure_type"], "incomplete_response")
            self.assertEqual(saved_output["laws"][0]["new_changes_detected"], 0)
            self.assertEqual(saved_output["status"], "erro")



if __name__ == "__main__":
    unittest.main()
