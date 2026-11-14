import unittest

from scripts.monitor import (
    baseline_must_be_rebuilt,
    compare,
    extract_event_dates,
    make_snapshot,
    split_article_components,
    split_articles,
    validate_law_identity,
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



if __name__ == "__main__":
    unittest.main()
