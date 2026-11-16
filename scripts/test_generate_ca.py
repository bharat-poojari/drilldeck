import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.error import HTTPError
from io import BytesIO
from unittest import mock

from scripts import generate_ca
from scripts.generate_ca import (
    archive_previous_daily,
    build_question_records,
    generate_rss_questions,
    parse_rss_feed,
)


def rss_feed(today, count=10, first_url=0, published_date=None):
    published = datetime.combine(
        published_date or date.fromisoformat(today),
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    pub_date = format_datetime(published)
    items = []
    for index in range(first_url, first_url + count):
        items.append(
            "<item>"
            f"<title>Current event headline {index}</title>"
            f"<description>Report summary for current event {index} with enough "
            "detail to create a source-backed headline matching question.</description>"
            f"<link>https://news.example.com/story/{index}</link>"
            f"<pubDate>{pub_date}</pubDate>"
            "</item>"
        )
    return f"<rss><channel>{''.join(items)}</channel></rss>".encode("utf-8")


def generated_questions(today, count=10):
    return [
        {
            "question_text": f"Which headline matches report {index}?",
            "topic": "Karnataka",
            "options": [f"Headline {index}", "Headline A", "Headline B", "Headline C"],
            "correct_option_index": 0,
            "difficulty": "Easy",
            "explanation": "Read the linked report for details.",
            "news_date": today,
            "news_title": f"Current event headline {index}",
            "news_summary": f"Report summary for current event {index}.",
            "source_url": f"https://news.example.com/story/{index}",
        }
        for index in range(count)
    ]


class GenerateCurrentAffairsTests(unittest.TestCase):
    def test_rss_parser_keeps_recent_https_articles_with_summaries(self):
        today = date.today().isoformat()
        articles = parse_rss_feed(rss_feed(today, count=2), "Karnataka", today)

        self.assertEqual(len(articles), 2)
        self.assertEqual(articles[0]["topic"], "Karnataka")
        self.assertEqual(articles[0]["date"], today)
        self.assertEqual(articles[0]["url"], "https://news.example.com/story/0")

    def test_rss_parser_ignores_old_articles(self):
        today = date.today()
        feed = rss_feed(
            today.isoformat(),
            count=1,
            published_date=today - timedelta(days=8),
        )

        self.assertEqual(parse_rss_feed(feed, "India", today.isoformat()), [])

    def test_rss_questions_have_four_choices_and_preserve_the_source_answer(self):
        today = date.today().isoformat()
        with (
            mock.patch.object(generate_ca, "RSS_FEEDS", (("India", "https://feed.example.com"),)),
            mock.patch.object(generate_ca, "fetch_url", return_value=rss_feed(today, count=6)),
        ):
            generated = generate_rss_questions(today, [])

        self.assertEqual(len(generated["questions"]), 6)
        for question in generated["questions"]:
            self.assertEqual(len(question["options"]), 4)
            self.assertEqual(len(set(question["options"])), 4)
            self.assertEqual(
                question["options"][question["correct_option_index"]],
                question["news_title"],
            )
            self.assertTrue(question["source_url"].startswith("https://"))
            self.assertEqual(len(generated["rss_sources"]), 6)

    def test_rss_generation_requires_enough_distinct_sources(self):
        today = date.today().isoformat()
        with (
            mock.patch.object(generate_ca, "RSS_FEEDS", (("India", "https://feed.example.com"),)),
            mock.patch.object(generate_ca, "fetch_url", return_value=rss_feed(today, count=3)),
        ):
            with self.assertRaisesRegex(RuntimeError, "Fewer than four"):
                generate_rss_questions(today, [])

    def test_main_generates_daily_file_without_an_external_api_key(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date()
        yesterday = (today - timedelta(days=1)).isoformat()
        today_text = today.isoformat()
        old_question = build_question_records(
            {"questions": generated_questions(yesterday, count=1)},
            yesterday,
        )[0]
        generated = {
            "questions": generated_questions(today_text),
            "rss_sources": [
                {"url": "https://news.example.com/story/0", "title": "Current event"}
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            (data_dir / generate_ca.DAILY_FILENAME).write_text(
                json.dumps({"date": yesterday, "questions": [old_question]}),
                encoding="utf-8",
            )
            (data_dir / generate_ca.ARCHIVE_FILENAME).write_text(
                json.dumps({"questions": []}),
                encoding="utf-8",
            )
            with (
                mock.patch.object(generate_ca, "DATA_DIR", data_dir),
                mock.patch.object(
                    generate_ca, "generate_rss_questions", return_value=generated
                ),
            ):
                generate_ca.main()

            daily = json.loads(
                (data_dir / generate_ca.DAILY_FILENAME).read_text(encoding="utf-8")
            )
            archive = json.loads(
                (data_dir / generate_ca.ARCHIVE_FILENAME).read_text(encoding="utf-8")
            )
            self.assertEqual(daily["date"], today_text)
            self.assertEqual(daily["questionCount"], 10)
            self.assertEqual(daily["model"], "RSS headline templates")
            self.assertEqual(archive["questionCount"], 1)
            self.assertEqual(archive["questions"][0]["archivedFromDate"], yesterday)
            self.assertTrue(archive["questions"][0]["archivedAt"])

    def test_same_day_update_archives_existing_daily_questions(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        daily = {"date": today, "questions": [{"id": "today", "question": "Current?"}]}
        archive = {"questions": []}
        updated, changed = archive_previous_daily(
            daily, archive, today, "2026-11-06T09:00:00+05:30"
        )
        self.assertTrue(changed)
        self.assertEqual(updated["questions"][0]["archivedFromDate"], today)
        self.assertEqual(updated["questions"][0]["archivedOnDate"], today)

    def test_question_records_use_existing_question_bank_schema(self):
        today = date.today().isoformat()
        records = build_question_records(
            {"questions": generated_questions(today)},
            today,
        )

        self.assertEqual(len(records), 10)
        self.assertEqual(records[0]["options"]["A"], "Headline 0")
        self.assertEqual(records[0]["correctAnswer"], "A")
        self.assertEqual(records[0]["sourceUrl"], "https://news.example.com/story/0")
        self.assertEqual(records[0]["newsDate"], today)
        self.assertTrue(all(record["id"] and record["source"] for record in records))

    def test_fetch_url_retries_temporary_server_errors(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"ok"
        temporary_error = HTTPError(
            "https://example.com/feed",
            503,
            "Unavailable",
            {},
            BytesIO(b"Please retry"),
        )
        with (
            mock.patch(
                "scripts.generate_ca.urllib.request.urlopen",
                side_effect=[temporary_error, response],
            ) as urlopen,
            mock.patch.object(generate_ca.time, "sleep") as sleep,
        ):
            result = generate_ca.fetch_url("https://example.com/feed")

        self.assertEqual(result, b"ok")
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(1)
