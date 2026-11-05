import hashlib
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "General_Knowledge" / "CURRENT AFFAIRS"
FEEDS = (
    (
        "Karnataka",
        "https://news.google.com/rss/search?q=Karnataka+government+schemes+OR+KPSC&hl=en-IN&gl=IN&ceid=IN:en",
        "Karnataka_Current_Affairs.json",
    ),
    (
        "National",
        "https://news.google.com/rss/search?q=India+national+current+affairs+UPSC+exams&hl=en-IN&gl=IN&ceid=IN:en",
        "National_Current_Affairs.json",
    ),
)
QUESTIONS_PER_FEED = 2
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
INDIA_TIMEZONE = timezone(timedelta(hours=5, minutes=30), "IST")

QUESTION_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "questions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "question_text": {"type": "STRING"},
                    "options": {"type": "ARRAY", "items": {"type": "STRING"}},
                    "correct_option_index": {"type": "INTEGER"},
                    "difficulty": {
                        "type": "STRING",
                        "enum": ["Easy", "Medium", "Hard"],
                    },
                    "explanation": {"type": "STRING"},
                },
                "required": [
                    "question_text",
                    "options",
                    "correct_option_index",
                    "difficulty",
                    "explanation",
                ],
            },
        },
    },
    "required": ["summary", "questions"],
}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean_text(value):
    parser = _TextExtractor()
    parser.feed(html.unescape(value or ""))
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()


def fetch_url(url, headers=None, timeout=30, data=None):
    request = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "DrillDeck-Current-Affairs/1.0", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        for value in (headers or {}).values():
            if value:
                detail = detail.replace(value, "[REDACTED]")
        raise RuntimeError(f"Request failed with HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Request failed: {error.reason}") from error


def parse_feed(xml_data):
    root = ET.fromstring(xml_data)
    entries = []
    for item in root.findall(".//item"):
        title = clean_text(item.findtext("title", ""))
        link = clean_text(item.findtext("link", ""))
        summary = clean_text(item.findtext("description", ""))
        published_text = (item.findtext("pubDate") or "").strip()
        try:
            published_at = parsedate_to_datetime(published_text)
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            published_date = published_at.astimezone(INDIA_TIMEZONE).date().isoformat()
        except (TypeError, ValueError, OverflowError):
            published_date = None
        if title and link and summary:
            entries.append(
                {
                    "title": title,
                    "link": link,
                    "summary": summary,
                    "published_date": published_date,
                }
            )
    return entries


def load_dataset(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not read question dataset {path}: {error}") from error
    if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
        raise RuntimeError(f"Question dataset {path} must contain a questions array.")
    return data


def select_new_articles(entries, existing_questions, limit, today):
    known_urls = {
        question.get("sourceUrl")
        for question in existing_questions
        if isinstance(question, dict) and isinstance(question.get("sourceUrl"), str)
    }
    known_sources = {
        question.get("source", "").strip()
        for question in existing_questions
        if isinstance(question, dict) and isinstance(question.get("source"), str)
    }
    selected = []
    seen_urls = set()
    for article in entries:
        link = article["link"].strip()
        source = f'{article["title"]} - {link}'
        if (
            article.get("published_date") != today
            or link in known_urls
            or source in known_sources
            or link in seen_urls
        ):
            continue
        seen_urls.add(link)
        selected.append(article)
        if len(selected) == limit:
            break
    return selected


def generate_questions(api_key, scope, article):
    prompt = (
        "Create exam-quality current-affairs multiple-choice questions for Indian "
        "competitive exams (KPSC/KEA/UPSC style). Use only facts supported by the "
        "provided news title and excerpt; do not guess or add unsupported facts. "
        "If the excerpt does not contain enough reliable facts for three distinct "
        "questions, do not invent facts; fail rather than producing unsupported items. "
        "Return a concise, factual two-sentence summary and exactly three "
        "non-duplicative questions with four distinct options, "
        "one correct option index from 0 to 3, a suitable Easy/Medium/Hard difficulty, "
        "and a short explanation.\n\n"
        f"Scope: {scope}\n"
        f"News title: {article['title']}\n"
        f"News excerpt: {article['summary']}\n"
        f"Source URL (for reference only): {article['link']}"
    )
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(GEMINI_MODEL, safe='')}:generateContent"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseSchema": QUESTION_SCHEMA,
        },
    }
    response = fetch_url(
        endpoint,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        data=json.dumps(body).encode("utf-8"),
    )
    try:
        result = json.loads(response)
        text = "".join(
            part["text"]
            for part in result["candidates"][0]["content"]["parts"]
            if isinstance(part.get("text"), str)
        )
        generated = json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Gemini returned an invalid structured response: {error}") from error
    return validate_generated_content(generated)


def validate_generated_content(generated):
    if not isinstance(generated, dict):
        raise RuntimeError("Gemini response must be a JSON object.")
    summary = generated.get("summary")
    questions = generated.get("questions")
    if not isinstance(summary, str) or not summary.strip():
        raise RuntimeError("Gemini response is missing its news summary.")
    if not isinstance(questions, list) or len(questions) != 3:
        raise RuntimeError("Gemini must return exactly three questions per article.")
    for index, question in enumerate(questions, start=1):
        if not isinstance(question, dict):
            raise RuntimeError(f"Gemini question {index} must be an object.")
        if not isinstance(question.get("question_text"), str) or not question["question_text"].strip():
            raise RuntimeError(f"Gemini question {index} is missing question_text.")
        options = question.get("options")
        if (
            not isinstance(options, list)
            or len(options) != 4
            or any(not isinstance(option, str) or not option.strip() for option in options)
            or len({option.strip().casefold() for option in options}) != 4
        ):
            raise RuntimeError(f"Gemini question {index} must have four distinct options.")
        answer = question.get("correct_option_index")
        if isinstance(answer, bool) or not isinstance(answer, int) or answer not in range(4):
            raise RuntimeError(f"Gemini question {index} has an invalid correct_option_index.")
        if question.get("difficulty") not in {"Easy", "Medium", "Hard"}:
            raise RuntimeError(f"Gemini question {index} has an invalid difficulty.")
        if not isinstance(question.get("explanation"), str) or not question["explanation"].strip():
            raise RuntimeError(f"Gemini question {index} is missing its explanation.")
    return {"summary": summary.strip(), "questions": questions}


def build_question_records(scope, article, generated, today):
    article_hash = hashlib.sha256(article["link"].encode("utf-8")).hexdigest()[:10]
    answer_labels = ("A", "B", "C", "D")
    topic = f"Daily Current Affairs - {scope}"
    return [
        {
            "id": f"CA-{today}-{article_hash}-{index}",
            "subject": "Karnataka Current Affairs" if scope == "Karnataka" else "Current Affairs",
            "topic": topic,
            "chapter": article["title"],
            "difficulty": question["difficulty"],
            "language": "English",
            "question": question["question_text"].strip(),
            "options": {
                answer_labels[option_index]: option.strip()
                for option_index, option in enumerate(question["options"])
            },
            "correctAnswer": answer_labels[question["correct_option_index"]],
            "explanation": question["explanation"].strip(),
            "source": f'{article["title"]} - {article["link"]}',
            "newsDate": article.get("published_date") or today,
            "newsTitle": article["title"],
            "newsSummary": generated["summary"],
            "sourceUrl": article["link"],
        }
        for index, question in enumerate(generated["questions"], start=1)
    ]


def main():
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required. Add it as a GitHub Actions secret.")

    today = datetime.now(INDIA_TIMEZONE).date().isoformat()
    total_added = 0
    for scope, feed_url, filename in FEEDS:
        dataset_path = DATA_DIR / filename
        dataset = load_dataset(dataset_path)
        feed_entries = parse_feed(fetch_url(feed_url))
        articles = select_new_articles(
            feed_entries, dataset["questions"], QUESTIONS_PER_FEED, today
        )
        new_questions = []
        for article in articles:
            generated = generate_questions(api_key, scope, article)
            new_questions.extend(build_question_records(scope, article, generated, today))
        if new_questions:
            dataset["questions"] = new_questions + dataset["questions"]
            dataset_path.write_text(
                f"{json.dumps(dataset, indent=2, ensure_ascii=False)}\n",
                encoding="utf-8",
            )
            total_added += len(new_questions)
            print(f"Added {len(new_questions)} questions to {filename}.")
        else:
            print(f"No new articles for {scope}; {filename} is unchanged.")
    print(f"Finished current-affairs generation: {total_added} question(s) added.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ET.ParseError) as error:
        print(f"Current-affairs generation failed: {error}", file=sys.stderr)
        sys.exit(1)
