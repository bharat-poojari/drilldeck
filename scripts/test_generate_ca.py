import json
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from unittest import mock

from scripts import generate_ca
from scripts.generate_ca import (
    archive_previous_daily,
    build_question_records,
    extract_interaction_response,
    generate_daily_questions,
    validate_generated_content,
)


def generated_questions(today, count=10, source_url="https://example.com/news"):
    return {
        "questions": [
            {
                "question_text": f"Current affairs question {index}?",
                "topic": "National Governance",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_option_index": index % 4,
                "difficulty": "Medium",
                "explanation": "The cited report states this fact.",
                "news_date": today,
                "news_title": f"Current event {index}",
                "news_summary": f"A concise report of current event {index}.",
                "source_url": source_url,
            }
            for index in range(count)
        ]
    }


def interaction_response(generated, source_url="https://example.com/news"):
    return {
        "steps": [
            {
                "type": "model_output",
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(generated),
                        "annotations": [
                            {
                                "type": "url_citation",
                                "url": source_url,
                                "title": "Example news",
                            }
                        ],
                    }
                ],
            }
        ]
    }


class GenerateCurrentAffairsTests(unittest.TestCase):
    def test_interaction_response_extracts_json_and_grounding_citations(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        generated = generated_questions(today)
        parsed, citations = extract_interaction_response(
            interaction_response(generated)
        )
        questions = validate_generated_content(parsed, today, citations)

        self.assertEqual(len(questions), generate_ca.MAX_QUESTIONS_PER_DAY)
        self.assertEqual(citations["https://example.com/news"], "Example news")

    def test_content_requires_the_daily_question_limit(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        with self.assertRaisesRegex(RuntimeError, "exactly 10"):
            validate_generated_content(
                generated_questions(today, count=9),
                today,
                {"https://example.com/news": "Example"},
            )

    def test_content_requires_a_cited_recent_source(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        generated = generated_questions(today)
        generated["questions"][0]["source_url"] = "https://unverified.example/news"
        with self.assertRaisesRegex(RuntimeError, "source returned by Google Search"):
            validate_generated_content(
                generated,
                today,
                {"https://example.com/news": "Example"},
            )

    def test_content_rejects_news_older_than_seven_days(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        generated = generated_questions(today)
        generated["questions"][0]["news_date"] = (
            date.fromisoformat(today) - timedelta(days=8)
        ).isoformat()
        with self.assertRaisesRegex(RuntimeError, "last seven days"):
            validate_generated_content(
                generated,
                today,
                {"https://example.com/news": "Example"},
            )

    def test_gemini_request_uses_google_search_grounding_and_question_cap(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        response = interaction_response(generated_questions(today))
        with mock.patch.object(
            generate_ca,
            "fetch_url",
            return_value=json.dumps(response).encode("utf-8"),
        ) as fetch:
            result = generate_daily_questions("test-key", today, [])

        self.assertEqual(len(result["questions"]), 10)
        kwargs = fetch.call_args.kwargs
        self.assertEqual(kwargs["headers"]["x-goog-api-key"], "test-key")
        self.assertEqual(kwargs["timeout"], 120)
        body = json.loads(kwargs["data"])
        self.assertEqual(body["tools"], [{"type": "google_search"}])
        self.assertEqual(body["response_format"]["schema"], generate_ca.QUESTION_SCHEMA)
        self.assertIn("do not rely on model memory", body["input"])

    def test_main_generates_daily_file_and_archives_previous_day(self):
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date()
        yesterday = (today - timedelta(days=1)).isoformat()
        today_text = today.isoformat()
        old_question = build_question_records(
            {
                "questions": [
                    {
                        **generated_questions(yesterday, count=1)["questions"][0],
                        "source_url": "https://example.com/previous",
                    }
                ]
            },
            yesterday,
        )[0]
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            (data_dir / generate_ca.DAILY_FILENAME).write_text(
                json.dumps({"date": yesterday, "questions": [old_question]}),
                encoding="utf-8",
            )
            (data_dir / generate_ca.ARCHIVE_FILENAME).write_text(
                json.dumps({"questions": []}), encoding="utf-8"
            )
            generated = {
                "questions": validate_generated_content(
                    generated_questions(today_text),
                    today_text,
                    {"https://example.com/news": "Example"},
                ),
                "grounding_sources": [
                    {"url": "https://example.com/news", "title": "Example"}
                ],
            }
            with (
                mock.patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}),
                mock.patch.object(generate_ca, "DATA_DIR", data_dir),
                mock.patch.object(
                    generate_ca, "generate_daily_questions", return_value=generated
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
        today = datetime.now(generate_ca.INDIA_TIMEZONE).date().isoformat()
        generated = {
            "questions": validate_generated_content(
                generated_questions(today),
                today,
                {"https://example.com/news": "Example"},
            )
        }
        records = build_question_records(generated, today)

        self.assertEqual(len(records), 10)
        self.assertEqual(records[0]["options"], {
            "A": "Option A",
            "B": "Option B",
            "C": "Option C",
            "D": "Option D",
        })
        self.assertEqual(records[0]["correctAnswer"], "A")
        self.assertEqual(records[0]["sourceUrl"], "https://example.com/news")
        self.assertEqual(records[0]["newsDate"], today)
        self.assertTrue(all(record["id"] and record["source"] for record in records))

    def test_fetch_url_posts_when_request_body_is_provided(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"ok"
        request_body = b'{"test":true}'
        with mock.patch(
            "scripts.generate_ca.urllib.request.urlopen", return_value=response
        ) as urlopen:
            result = generate_ca.fetch_url(
                "https://example.com/interactions",
                headers={"Content-Type": "application/json"},
                data=request_body,
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(result, b"ok")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.data, request_body)

    def test_fetch_url_retries_temporary_server_errors(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b"ok"
        temporary_error = HTTPError(
            "https://example.com/interactions",
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
            result = generate_ca.fetch_url("https://example.com/interactions")

        self.assertEqual(result, b"ok")
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(1)


if __name__ == "__main__":
    unittest.main()
