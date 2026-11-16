import hashlib
import html
import json
import random
import re
import sys
import time
import xml.etree.ElementTree as ET
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "General_Knowledge" / "CURRENT AFFAIRS"
DAILY_FILENAME = "today_current_affair.json"
ARCHIVE_FILENAME = "permanent_current_affairs.json"
MAX_QUESTIONS_PER_DAY = 10
INDIA_TIMEZONE = timezone(timedelta(hours=5, minutes=30), "IST")
MAX_REQUEST_ATTEMPTS = 4
RSS_FEEDS = (
    ("Karnataka", "https://www.thehindu.com/news/national/karnataka/feeder/default.rss"),
    ("India", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ("International", "https://www.thehindu.com/news/international/feeder/default.rss"),
    ("Business", "https://www.thehindu.com/business/feeder/default.rss"),
    ("Science and Technology", "https://www.thehindu.com/sci-tech/feeder/default.rss"),
)


def fetch_url(url, headers=None, timeout=30, data=None):
    request = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "DrillDeck-Current-Affairs/1.0", **(headers or {})},
    )
    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:500]
            if error.code not in {429, 500, 502, 503, 504} or attempt == MAX_REQUEST_ATTEMPTS:
                raise RuntimeError(
                    f"Request failed with HTTP {error.code}: {detail}"
                ) from error
            print(
                f"Request returned HTTP {error.code}; retrying "
                f"({attempt}/{MAX_REQUEST_ATTEMPTS - 1}).",
                file=sys.stderr,
            )
        except urllib.error.URLError as error:
            if attempt == MAX_REQUEST_ATTEMPTS:
                raise RuntimeError(f"Request failed: {error.reason}") from error
            print(
                f"Request failed temporarily; retrying "
                f"({attempt}/{MAX_REQUEST_ATTEMPTS - 1}).",
                file=sys.stderr,
            )
        time.sleep(2 ** (attempt - 1))
    raise RuntimeError("Request failed after all retry attempts.")


def load_dataset(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not read question dataset {path}: {error}") from error
    if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
        raise RuntimeError(f"Question dataset {path} must contain a questions array.")
    return data


def _xml_text(element, *field_names):
    for child in list(element):
        if child.tag.rsplit("}", 1)[-1].lower() in field_names:
            if child.tag.rsplit("}", 1)[-1].lower() == "link" and child.get("href"):
                return child.get("href", "").strip()
            return "".join(child.itertext()).strip()
    return ""


def _clean_feed_text(value, limit):
    text = re.sub(r"<[^>]*>", " ", html.unescape(value or ""))
    text = " ".join(text.split())
    return text[:limit].rsplit(" ", 1)[0] if len(text) > limit else text


def _parse_feed_date(value):
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(INDIA_TIMEZONE).date()


def parse_rss_feed(content, topic, today):
    try:
        root = ET.fromstring(content)
    except ET.ParseError as error:
        raise RuntimeError(f"The {topic} RSS feed contains invalid XML.") from error

    today_date = date.fromisoformat(today)
    earliest_date = today_date - timedelta(days=7)
    articles = []
    seen_urls = set()
    for item in root.iter():
        if item.tag.rsplit("}", 1)[-1].lower() not in {"item", "entry"}:
            continue
        title = _clean_feed_text(_xml_text(item, "title"), 180)
        summary = _clean_feed_text(
            _xml_text(item, "description", "summary", "encoded", "content"), 280
        )
        url = _xml_text(item, "link")
        if not url:
            url = next(
                (child.get("href", "").strip() for child in item
                 if child.tag.rsplit("}", 1)[-1].lower() == "link" and child.get("href")),
                "",
            )
        published = _parse_feed_date(
            _xml_text(item, "pubdate", "published", "updated", "date")
        )
        parsed_url = urllib.parse.urlparse(url)
        if (
            not title or len(summary) < 40 or published is None or
            not earliest_date <= published <= today_date or
            parsed_url.scheme != "https" or not parsed_url.netloc or url in seen_urls
        ):
            continue
        seen_urls.add(url)
        articles.append(
            {
                "topic": topic,
                "title": title,
                "summary": summary,
                "url": url,
                "date": published.isoformat(),
            }
        )
    return articles


def generate_rss_questions(today, previous_questions):
    archived_sources = {
        question.get("sourceUrl")
        for question in previous_questions
        if isinstance(question, dict) and isinstance(question.get("sourceUrl"), str)
    }
    candidates = []
    seen_titles = set()
    for topic, feed_url in RSS_FEEDS:
        try:
            content = fetch_url(feed_url)
            articles = parse_rss_feed(content, topic, today)
        except RuntimeError as error:
            print(f"Skipping unavailable {topic} RSS feed: {error}", file=sys.stderr)
            continue
        for article in articles:
            title_key = article["title"].casefold()
            if article["url"] in archived_sources or title_key in seen_titles:
                continue
            seen_titles.add(title_key)
            candidates.append(article)

    if len(candidates) < 4:
        raise RuntimeError(
            "Fewer than four distinct, recent RSS stories were available; no quiz was generated."
        )

    questions = []
    for index, article in enumerate(candidates[:MAX_QUESTIONS_PER_DAY]):
        choices = [
            candidates[(index + offset) % len(candidates)]["title"]
            for offset in range(4)
        ]
        random.Random(article["url"]).shuffle(choices)
        summary = article["summary"]
        questions.append(
            {
                "question_text": f"Which headline best matches this report summary?\n\n{summary}",
                "topic": article["topic"],
                "options": choices,
                "correct_option_index": choices.index(article["title"]),
                "difficulty": "Easy",
                "explanation": (
                    f"This report is categorized under {article['topic']}. "
                    f"Read the linked source for the full article."
                ),
                "news_date": article["date"],
                "news_title": article["title"],
                "news_summary": summary,
                "source_url": article["url"],
            }
        )

    return {
        "questions": questions,
        "rss_sources": [
            {"url": article["url"], "title": article["title"]}
            for article in candidates[:MAX_QUESTIONS_PER_DAY]
        ],
    }


def build_question_records(generated, today):
    answer_labels = ("A", "B", "C", "D")
    records = []
    for question in generated["questions"]:
        question_hash = hashlib.sha256(
            f'{today}|{question["source_url"]}|{question["question_text"]}'.encode("utf-8")
        ).hexdigest()[:12]
        records.append(
            {
                "id": f"CA-{today}-{question_hash}",
                "subject": "Current Affairs",
                "topic": question["topic"],
                "chapter": question["news_title"],
                "difficulty": question["difficulty"],
                "language": "English",
                "question": question["question_text"],
                "options": {
                    answer_labels[option_index]: option
                    for option_index, option in enumerate(question["options"])
                },
                "correctAnswer": answer_labels[question["correct_option_index"]],
                "explanation": question["explanation"],
                "source": f'{question["news_title"]} ({question["news_date"]}) - {question["source_url"]}',
                "newsDate": question["news_date"],
                "newsTitle": question["news_title"],
                "newsSummary": question["news_summary"],
                "sourceUrl": question["source_url"],
            }
        )
    return records


def write_dataset(path, dataset):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.tmp")
    temporary_path.write_text(
        f"{json.dumps(dataset, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def archive_previous_daily(daily, archive, today, updated_at):
    if not daily["questions"]:
        return archive, False

    known_ids = {
        question.get("id")
        for question in archive["questions"]
        if isinstance(question, dict)
    }
    known_prompts = {
        " ".join(question.get("question", "").casefold().split())
        for question in archive["questions"]
        if isinstance(question, dict) and isinstance(question.get("question"), str)
    }
    archived_questions = list(archive["questions"])
    for question in daily["questions"]:
        prompt = " ".join(question.get("question", "").casefold().split())
        if question.get("id") in known_ids or prompt in known_prompts:
            continue
        archived_questions.append(
            {
                **question,
                "archivedFromDate": daily.get("date"),
                "archivedOnDate": today,
                "archivedAt": updated_at,
            }
        )
        known_ids.add(question.get("id"))
        known_prompts.add(prompt)

    return (
        {
            **archive,
            "description": "Permanent archive of generated daily current-affairs questions.",
            "updatedAt": updated_at,
            "questionCount": len(archived_questions),
            "questions": archived_questions,
        },
        True,
    )


def main():
    today = datetime.now(INDIA_TIMEZONE).date().isoformat()
    updated_at = datetime.now(INDIA_TIMEZONE).isoformat(timespec="seconds")
    daily_path = DATA_DIR / DAILY_FILENAME
    archive_path = DATA_DIR / ARCHIVE_FILENAME
    daily = load_dataset(daily_path)
    archive = load_dataset(archive_path)

    generated = generate_rss_questions(today, archive["questions"])
    records = build_question_records(generated, today)
    if not records:
        raise RuntimeError("RSS feeds did not provide any current-affairs questions.")

    archive, archive_changed = archive_previous_daily(daily, archive, today, updated_at)
    if archive_changed:
        write_dataset(archive_path, archive)

    daily_dataset = {
        "exam": "KEA",
        "version": "1.0.0",
        "description": f"Latest RSS-based current-affairs questions for {today}.",
        "date": today,
        "generatedAt": updated_at,
        "updatedAt": updated_at,
        "model": "RSS headline templates",
        "source": "The Hindu RSS feeds",
        "maxQuestions": MAX_QUESTIONS_PER_DAY,
        "questionCount": len(records),
        "rssSources": generated["rss_sources"],
        "questions": records,
    }
    write_dataset(daily_path, daily_dataset)
    print(
        f"Generated {len(records)} RSS-based current-affairs questions for {today}; "
        f"archived previous daily content: {'yes' if archive_changed else 'no'}."
    )


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError) as error:
        print(f"Current-affairs generation failed: {error}", file=sys.stderr)
        sys.exit(1)
