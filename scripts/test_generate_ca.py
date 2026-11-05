import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from scripts import generate_ca
from scripts.generate_ca import (
    build_question_records,
    generate_questions,
    parse_feed,
    select_new_articles,
    validate_generated_content,
)


class GenerateCurrentAffairsTests(unittest.TestCase):
    def test_parse_feed_strips_html_from_news_excerpt(self):
        entries = parse_feed(
            b"""<rss><channel><item><title>News &amp; update</title>
            <link>https://example.com/news</link>
            <pubDate>Wed, 04 Nov 2026 18:30:00 GMT</pubDate>
            <description><![CDATA[<p>A new <b>scheme</b> was announced.</p>]]></description>
            </item></channel></rss>"""
        )
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["title"], "News & update")
        self.assertEqual(entries[0]["summary"], "A new scheme was announced.")
        self.assertEqual(entries[0]["published_date"], "2026-11-05")

    def test_article_selection_skips_saved_and_repeated_urls(self):
        article = {
            "title": "New scheme",
            "link": "https://example.com/news",
            "summary": "Details",
            "published_date": "2026-11-05",
        }
        selected = select_new_articles(
            [
                article,
                article,
                {
                    "title": "Other",
                    "link": "https://example.com/other",
                    "summary": "Details",
                    "published_date": "2026-11-05",
                },
            ],
            [{"sourceUrl": article["link"]}],
            2,
            "2026-11-05",
        )
        self.assertEqual([item["title"] for item in selected], ["Other"])

    def test_article_selection_only_includes_articles_published_today(self):
        entries = [
            {
                "title": "Yesterday",
                "link": "https://example.com/yesterday",
                "summary": "Older news",
                "published_date": "2026-11-04",
            },
            {
                "title": "Undated",
                "link": "https://example.com/undated",
                "summary": "No publication date",
                "published_date": None,
            },
            {
                "title": "Today",
                "link": "https://example.com/today",
                "summary": "Today's news",
                "published_date": "2026-11-05",
            },
        ]
        selected = select_new_articles(entries, [], 2, "2026-11-05")
        self.assertEqual([item["title"] for item in selected], ["Today"])

    def test_main_runs_without_network_when_feeds_are_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            for _, _, filename in generate_ca.FEEDS:
                (data_dir / filename).write_text(
                    json.dumps({"questions": []}), encoding="utf-8"
                )
            with (
                mock.patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
                mock.patch.object(generate_ca, "DATA_DIR", data_dir),
                mock.patch.object(
                    generate_ca,
                    "fetch_url",
                    return_value=b"<rss><channel></channel></rss>",
                ) as fetch,
            ):
                generate_ca.main()
            self.assertEqual(fetch.call_count, len(generate_ca.FEEDS))

    def test_main_generates_and_saves_questions_from_today_feeds(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        published = datetime.now(generate_ca.INDIA_TIMEZONE).strftime(
            "%a, %d %b %Y %H:%M:%S %z"
        )
        feed = (
            "<rss><channel><item><title>Today's update</title>"
            "<link>https://example.com/today</link>"
            f"<pubDate>{published}</pubDate>"
            "<description>A current news excerpt.</description>"
            "</item></channel></rss>"
        ).encode("utf-8")
        generated = {
            "summary": "A concise summary.",
            "questions": [
                {
                    "question_text": f"Question {index}?",
                    "options": ["One", "Two", "Three", "Four"],
                    "correct_option_index": 0,
                    "difficulty": "Easy",
                    "explanation": "The excerpt states this.",
                }
                for index in range(3)
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            for _, _, filename in generate_ca.FEEDS:
                (data_dir / filename).write_text(
                    json.dumps({"questions": []}), encoding="utf-8"
                )
            with (
                mock.patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
                mock.patch.object(generate_ca, "DATA_DIR", data_dir),
                mock.patch.object(generate_ca, "fetch_url", side_effect=[feed, feed]),
                mock.patch.object(
                    generate_ca, "generate_questions", return_value=generated
                ) as generate,
            ):
                generate_ca.main()

            self.assertEqual(generate.call_count, len(generate_ca.FEEDS))
            for _, _, filename in generate_ca.FEEDS:
                dataset = json.loads((data_dir / filename).read_text(encoding="utf-8"))
                self.assertEqual(len(dataset["questions"]), 3)
                self.assertTrue(
                    all(question["newsDate"] == today for question in dataset["questions"])
                )

    def test_gemini_generation_passes_api_key_and_json_request_body(self):
        generated = {
            "summary": "A concise summary.",
            "questions": [
                {
                    "question_text": f"Question {index}?",
                    "options": ["One", "Two", "Three", "Four"],
                    "correct_option_index": 0,
                    "difficulty": "Easy",
                    "explanation": "The excerpt states this.",
                }
                for index in range(3)
            ],
        }
        response = {
            "candidates": [
                {"content": {"parts": [{"text": json.dumps(generated)}]}}
            ]
        }
        article = {
            "title": "A news story",
            "link": "https://example.com/news",
            "summary": "A reliable news excerpt.",
        }
        with mock.patch.object(
            generate_ca,
            "fetch_url",
            return_value=json.dumps(response).encode("utf-8"),
        ) as fetch:
            result = generate_questions("test-key", "National", article)

        self.assertEqual(result, generated)
        kwargs = fetch.call_args.kwargs
        self.assertEqual(kwargs["headers"]["x-goog-api-key"], "test-key")
        self.assertEqual(kwargs["headers"]["Content-Type"], "application/json")
        request_body = json.loads(kwargs["data"])
        self.assertIn("contents", request_body)
        self.assertEqual(request_body["generationConfig"]["responseMimeType"], "application/json")

    def test_fetch_url_posts_when_request_body_is_provided(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"ok"
        request_body = b'{"test":true}'
        with mock.patch(
            "scripts.generate_ca.urllib.request.urlopen", return_value=response
        ) as urlopen:
            result = generate_ca.fetch_url(
                "https://example.com/gemini",
                headers={"Content-Type": "application/json"},
                data=request_body,
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(result, b"ok")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.data, request_body)

    def test_generated_content_rejects_invalid_answer_index(self):
        generated = {
            "summary": "A concise summary.",
            "questions": [
                {
                    "question_text": "Which option is correct?",
                    "options": ["One", "Two", "Three", "Four"],
                    "correct_option_index": 4,
                    "difficulty": "Easy",
                    "explanation": "The excerpt states this.",
                }
            ] * 3,
        }
        with self.assertRaisesRegex(RuntimeError, "correct_option_index"):
            validate_generated_content(generated)

    def test_question_records_use_existing_question_bank_schema(self):
        article = {
            "title": "New scheme announced",
            "link": "https://example.com/news",
            "summary": "The government announced a new scheme.",
        }
        generated = {
            "summary": "The government announced a new scheme.",
            "questions": [
                {
                    "question_text": f"Question {index}?",
                    "options": ["One", "Two", "Three", "Four"],
                    "correct_option_index": index % 4,
                    "difficulty": "Medium",
                    "explanation": "The news excerpt states this.",
                }
                for index in range(3)
            ],
        }
        records = build_question_records("National", article, generated, "2026-11-04")
        self.assertEqual(len(records), 3)
        self.assertTrue(all(record.get("id") for record in records))
        self.assertTrue(all(record.get("topic") for record in records))
        self.assertTrue(all(record.get("question") for record in records))
        self.assertTrue(all(set(record["options"]) == {"A", "B", "C", "D"} for record in records))
        self.assertTrue(all(record["correctAnswer"] in {"A", "B", "C", "D"} for record in records))
        self.assertTrue(all(record.get("explanation") and record.get("source") for record in records))
        self.assertEqual(records[0]["options"], {"A": "One", "B": "Two", "C": "Three", "D": "Four"})
        self.assertEqual(records[0]["correctAnswer"], "A")
        self.assertEqual(records[0]["sourceUrl"], article["link"])
        self.assertEqual(records[0]["newsDate"], "2026-11-04")


if __name__ == "__main__":
    unittest.main()
