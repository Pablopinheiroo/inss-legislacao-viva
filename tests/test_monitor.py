import unittest

from scripts.monitor import compare, make_snapshot, split_articles


class MonitorTests(unittest.TestCase):
    def test_split_articles_and_paragraphs(self):
        result = split_articles("Lei teste\nArt. 1º Texto inicial.\n§ 1º Um parágrafo.\nArt. 2º Segundo artigo.")
        self.assertIn("Art. 1", result)
        self.assertIn("Art. 2", result)
        self.assertIn("Um parágrafo", result["Art. 1"])

    def test_article_with_letter_suffix(self):
        result = split_articles("Art. 1º-A Texto incluído.\nArt. 2º Outro.")
        self.assertIn("Art. 1-A", result)

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


if __name__ == "__main__":
    unittest.main()
