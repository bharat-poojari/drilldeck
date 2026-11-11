# DrillDeck — Karnataka State Exam Practice

DrillDeck is a customizable mock test application for Karnataka state-level exam preparation, built with **HTML5, CSS3, Vanilla JavaScript modules and Vercel Node.js functions**. Practice General Knowledge, Kannada, English and Computer using question sets loaded from JSON files under `data/`. Shared chat messages and opt-in leaderboard scores are stored as JSON through GitHub's Contents API; no user accounts are required.

## Features

- Configure a custom practice test by paper, subject/category, subcategory and its topics, difficulty, question count and duration.
- Choose difficulty in Quick Test or Custom Exam, and use A–D or 1–4 answer and arrow-key navigation shortcuts during an exam.
- Discover JSON question datasets from the `data/` folder hierarchy automatically; the production build and test suite reject invalid or empty question-bank files.
- Balance questions randomly across selected datasets, shuffle questions within each dataset and avoid repeats.
- Dataset- and subject-scoped question IDs; repeated IDs are disambiguated by occurrence, and gaps in source numbering are allowed.
- Invalid question records are skipped with dataset-specific warnings so one malformed record does not disable the rest of the question bank.
- One-question-at-a-time examination interface.
- Answer selection, previous/next navigation, clear response and mark-for-review.
- Clickable question palette with status indicators.
- Countdown timer with ten-, five- and one-minute warnings and automatic submission.
- Active-test autosave and resume after refresh, with the original timer deadline preserved.
- Submission confirmation with unanswered/review counts.
- Fullscreen option, subject-based question navigation and clear-all responses during a mock test.
- Correct +1, incorrect −0.25 and unanswered 0 scoring.
- Dedicated Practice Mode with no timer or negative marking, immediate answer feedback and explanations, bookmarks, and free question navigation.
- Practice feedback supports authored distractor explanations and important facts, and offers related questions from the same topic when available.
- Revision Mode is available from the home screen and combines questions answered incorrectly or marked for review in saved test history; the result page also offers a focused revision set.
- My Revision organizes saved questions into bookmarked, incorrect, unanswered and difficult collections, with subject/topic filters, recent/due/incorrect sorting, retry actions and custom sets saved privately in this browser.
- Revision scheduling brings incorrect answers back after one day, then spaces correct answers at 1, 3, 7, 14 and 30 day intervals as correct streaks grow. Mark a question mastered to remove it from active revision categories; bookmarks remain until removed.
- Score, accuracy, attempt rate, subject/topic insights, time analysis and answer review. Preparation insights use saved local test history to track correct/incorrect answers, average time per attempted question, test-to-test accuracy changes and repeatedly missed questions. Strong/weak classifications require at least three attempted questions; smaller samples are labeled insufficient.
- Complete a date-stable 25-question Daily Drill (10 General Knowledge, 5 Karnataka GK, 5 General Science and 5 Current Affairs), plus focused Karnataka GK and Current Affairs challenges and a Question of the Day.
- Reveal a date-stable daily fact and practice its question across Karnataka, Constitution, Geography, Science and Current Affairs when matching questions are available.
- Generate local weak-area practice from saved performance; custom test setup remains syllabus/topic-based and does not claim to reproduce an unverified official paper pattern.
- Generate daily Karnataka and national current-affairs questions from RSS headlines using Gemini; generated questions are validated as part of the existing question banks and deployed with the normal Vercel Git integration.
- Track challenge practice days, a private daily streak, weekly activity and monthly practice milestones from locally saved results. A challenge counts as a practice day after attempting at least half its questions; scores and total question volume do not increase streaks.
- Complete submitted test results saved in this browser, with refresh recovery and a **My Test History** section.
- Import/export of versioned JSON backups to transfer local test history between browsers or devices.
- Responsive desktop/mobile layout, dark theme toggle and print-friendly results.
- Dedicated About page explaining DrillDeck's practice modes, privacy model, question library and creator.
- Creator portfolio and contact links in the setup and results footers, plus author and social profile metadata for search previews.
- Search metadata and structured data for Karnataka exam practice, creator profile links, a branded social preview, SVG/PNG/ICO browser and mobile icons, Google Search Console verification, robots.txt and an XML image sitemap.
- Dedicated SEO landing pages group exam preparation, Karnataka GK, current affairs, general science, geography and mock-test searches into focused topic clusters, with links into the matching practice setup.
- Public SEO pages are available at `/exams/`, `/exams/kea-fda/`, `/exams/kea-sda/`, `/subjects/general-knowledge/`, `/subjects/current-affairs/`, `/subjects/general-science/`, `/subjects/geography/`, `/mock-tests/` and `/about/`. Short legacy-friendly paths redirect to their canonical pages.
- The production build includes a custom `404.html`; unknown routes return it with HTTP 404 in the local development server as well.
- Four-step test setup with a unified, expandable subcategory-and-topic selector.
- Searchable, collapsible topic groups with per-category and global selection controls.
- Final configuration review with editable sections and server-side validation against the available question bank before a test starts.
- Explicit opt-in before publishing a score; leaderboard filters support daily, weekly, monthly, paper and subject views, and ranks by score percentage rather than question volume.
- Public shared chat messages stored in GitHub-backed JSON, with optional display names.
- Chat users can mute a display name locally or report a public message by email; muted names are only hidden in that browser.
- The home dashboard prioritizes practice, daily learning, local performance and guest-mode privacy. Official previous-year papers are not represented as available until verified copies are added.
- Anonymous shared chat and leaderboard publishing; GitHub credentials stay in server-side Vercel environment variables.

## Run locally

The app loads the generated `data/datasets.json` index, so it works on Vercel without public directory listings. `vercel.json` runs `npm run build`; the build generates the index and assembles the site into the configured `public/` output folder. Run the same command after adding JSON files when testing locally. Use a web server rather than opening the page through `file://`.

## Daily current-affairs updates

The `.github/workflows/daily_ca.yml` workflow runs daily at 23:30 India Standard Time (18:00 UTC; GitHub Actions cron uses UTC) and can also be started manually from the GitHub Actions tab. Add a repository Actions secret named `GEMINI_API_KEY` containing a Gemini API key. The key is sent only from the workflow to Google's Gemini REST API; do not put it in the repository, frontend, or Vercel environment. Gemini quotas are enforced by Google for the API project and model associated with that key, not per GitHub workflow run; check the project's usage and billing in Google AI Studio if generation reports an exhausted quota.

The workflow asks Gemini with Google Search grounding to generate ten structured questions from recent current affairs. It validates question structure, dates, and cited sources, updates the daily question set and permanent archive, then runs the normal dataset build and commits the updated data and manifest. A successful push triggers Vercel redeployment when the repository is connected to the Vercel project. If generation, JSON validation, or the build fails, the workflow stops without committing.

### Option A: VS Code Live Server

1. Extract the ZIP.
2. Open the `mock-test-platform` folder in VS Code.
3. Install/enable the **Live Server** extension.
4. Right-click `index.html` and choose **Open with Live Server**.

### Option B: Local development server

From the extracted project directory, run:

```bash
npm run build
npm run dev
```

Then open:

```text
http://127.0.0.1:8000
```

This server provides the configuration-validation API needed to start a test. Chat and leaderboard data use local JSON files in `.local-data/` by default, so no GitHub credentials are required for local practice; this directory is ignored by Git. To use GitHub-backed chat and leaderboard storage while running this server, set `DRILLDECK_USE_GITHUB_STORAGE=true` along with `EXAMDESK_GITHUB_TOKEN`, `EXAMDESK_GITHUB_OWNER` and `EXAMDESK_GITHUB_REPO`. Production continues to use the GitHub-backed handlers. Test results and bookmarks remain local to the browser. Live Server and Python's static server only serve files; use `npm run dev` or `vercel dev` to start tests.

## Deploy chat and score sharing to Vercel

1. Create a **separate private GitHub repository** for DrillDeck's JSON records. Keep it private; an existing `accounts.json` may contain legacy account records from an earlier version.
2. Create a fine-grained personal access token limited to that private repository. Grant **Contents: Read and write** (Metadata read access is required by GitHub); no other repository permissions are needed.
3. In Vercel, add these environment variables for the project:

   | Variable | Value |
   | --- | --- |
   | `EXAMDESK_GITHUB_TOKEN` | Fine-grained token for the private data repository |
   | `EXAMDESK_GITHUB_OWNER` | GitHub owner or organization for the private repository |
   | `EXAMDESK_GITHUB_REPO` | Private repository name |
   | `EXAMDESK_GITHUB_BRANCH` | Branch for JSON updates, normally `main` |

The older `drilldeck_*` GitHub storage variable names are also accepted for existing deployments.

4. Redeploy after setting the variables. The first score submission updates the legacy `accounts.json` storage file, and the first chat message creates `chat-messages.json`, in the private repository. New score submissions do not create or update user accounts.

Never put the GitHub token in frontend code, `index.html`, or a committed file. If a token is exposed, revoke it and create a replacement.

Individual account creation, sign-in and online account history are disabled. The legacy `/api/account` and `/api/history` endpoints return `410 Gone`. The public score list includes only a display name, score, paper, subjects and date. Scores are published only after selecting **Publish my score on the public leaderboard**. A private browser key allows that browser to rename or remove its score from **My Test History**; it is never returned in the public score list.

Full submitted results, including the questions and answers needed to recover the review, are saved in the browser's local storage independently of leaderboard consent and are not uploaded to GitHub. Private attempts therefore remain in **My Test History** without a public entry. Use **My Test History** to reopen a result, or export/import a JSON backup to move history to another browser. Browser storage is device- and browser-specific; clearing site data removes local results, so keep an exported backup. The server requires explicit consent before accepting a public score and checks score-management requests against a private browser owner key.

If publishing fails, the result stays visible and a retry button reuses the same submission ID to avoid duplicate leaderboard rows. Shared chat and global rankings do not require individual accounts.

For local serverless testing, use the Vercel CLI (`vercel dev`) with the same GitHub storage environment variables. The configuration endpoint validates the selected datasets, topics, question count, duration and marking scheme against the server-side question bank before generating the test. `vercel.json` includes the data files in that function. A plain Python/Live Server instance has no `/api` functions, so test creation, leaderboard and chat requests will report that the service is unavailable; an HTTP 501 when starting a test means it must be run through `vercel dev` or a Vercel deployment.

## Add question datasets

Add a JSON file in the appropriate subject folder. Folder and file names become the configuration options; underscores and hyphens are displayed as spaces, and `.json` is removed from file titles. For example:

```text
data/
├── General_Knowledge/
│   ├── Current_Affairs/
│   │   ├── National_Affairs.json
│   │   └── Karnataka_Affairs.json
│   ├── General_Science/
│   │   └── Physics.json
│   └── Geography/
│       └── Physical_Geography.json
└── General_Kannada_English_Computer_Knowledge/
    ├── Kannada/
    │   ├── Origin.json
    │   └── Alankara.json
    ├── English/
    │   └── Grammar.json
    └── Computer/
        └── Basics.json
```

For the second paper, `data/Kannada/`, `data/English/` and `data/Computer/` can also be used instead of the combined-paper folder shown above. Select one or more dataset files in the setup screen; if enough questions are requested, every selected file contributes questions. Both the datasets and their questions are randomized for each test.

Each dataset file must contain a `questions` array. Every question must have a unique `id` within its file and the following fields. Subject/category is taken from the folder, so it does not need to be repeated on every question.

```json
{
  "id": "Q051",
  "topic": "Indian Geography",
  "chapter": "Physical Geography",
  "difficulty": "Medium",
  "question": "Your question text?",
  "options": {
    "A": "Option A",
    "B": "Option B",
    "C": "Option C",
    "D": "Option D"
  },
  "correctAnswer": "B",
  "explanation": "Why option B is correct.",
  "source": "https://example.gov.in/reference"
}
```

Valid difficulty values: `Easy`, `Medium`, `Hard`.
`correctAnswer` must be exactly one of `A`, `B`, `C` or `D`.
All four options must be non-empty strings. Each question must also include a non-empty `topic` or `chapter`, `explanation` and `source`; the build and dataset tests validate these fields. The build reports duplicate IDs and repeated prompts with sample IDs but does not remove them automatically. Add `examRelevance` and `lastVerified` when a question has been checked against a specific official notification and reference date; topic counts alone are not syllabus coverage percentages.

The setup screen displays the number of questions matching the selected filters. If there are fewer matching questions than requested, the test cannot start. The old `data/questions.json` starter bank is ignored; place new datasets in a subject folder. The deployment build regenerates `data/datasets.json` from supported dataset folders automatically and copies the runtime files into the `public/` deployment output.

## Change the marking scheme

Edit `js/scoring.js`, in `calculateResults()`:

```js
const negativeMarks = wrong * 0.25;
const score = correct - negativeMarks;
```

For example, to use a penalty of 1/3 mark per incorrect answer, change `0.25` to `1 / 3`. Also update the marking-scheme text in `index.html`.

## Architecture

```text
mock-test-platform/
├── index.html
├── package.json
├── css/
│   ├── style.css
│   ├── exam.css
│   ├── result.css
│   ├── performance-insights.css
│   ├── revision.css
│   └── daily-challenge.css
├── api/
│   ├── account.js
│   ├── history.js
│   ├── leaderboard.js
│   └── chat.js
├── lib/server/
│   ├── github-json.js
│   └── http.js
├── js/
│   ├── app.js
│   ├── questions.js
│   ├── community.js
│   ├── exam.js
│   ├── timer.js
│   ├── scoring.js
│   ├── performance-insights.js
│   ├── daily-challenge.js
│   ├── revision.js
│   └── results.js
├── assets/
│   ├── drilldeck-mark.svg
│   ├── favicon-32.png
│   ├── apple-touch-icon.png
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── drilldeck-social.png
│   └── bharat-poojari.png
├── favicon.ico
├── site.webmanifest
├── robots.txt
├── sitemap.xml
├── googlef225cee30a4b6859.html
├── data/
│   ├── General_Knowledge/
│   └── General_Kannada_English_Computer_Knowledge/
└── README.md
```

The separate private GitHub storage repository uses the legacy-named `accounts.json` for leaderboard scores; it may also contain older account records that are no longer served by the application.

## Important production limitations

The question experience remains client-side and is suitable for practice tests using a question bank whose answers are delivered to the browser. It is not a secure proctored examination system: users can inspect the downloaded JSON and alter client-side scores. Treat public leaderboard scores as practice results, not verified exam results.

The active, unsubmitted test remains in JavaScript memory only. Refreshing or closing the tab discards that in-progress attempt. After submission, the detailed result and answer review are saved locally and recoverable from the results URL or **My Test History**. Local results are not synced across devices; use a JSON backup to transfer them. Only opted-in public score summaries and shared chat messages are stored server-side.

GitHub-backed JSON is a lightweight prototype store, not a production database. Each update creates a Git commit, repository history retains previous versions, and GitHub API limits, file growth and concurrent writes can restrict scale. Keep the data repository private, use a narrowly scoped token, and switch to a database with proper retention and deletion controls before handling sensitive data or a large audience. These client-calculated scores are not tamper-proof.

Before opening public chat or leaderboard publishing to a large audience, configure Vercel Firewall or another server-side rate limiter for score and chat API routes. Chat messages are public and have no moderation workflow. This prototype does not have durable rate-limit storage.

Search engines choose rankings and snippets independently; metadata, structured data, a sitemap and useful page content help discovery but cannot guarantee placement for broad searches. The canonical URL, robots rules, sitemap, social preview, and square browser/PWA icons use `https://drilldeck.vercel.app/`. The build copies the root favicon and Google Search Console verification file to the public site root. After deployment, open `https://drilldeck.vercel.app/googlef225cee30a4b6859.html` to confirm it is publicly served, then add the site to Google Search Console and Bing Webmaster Tools and submit `https://drilldeck.vercel.app/sitemap.xml`.

## Sample question bank

The supplied datasets under `data/General_Knowledge/CURRENT AFFAIRS/` contain 400 questions each. Independently verify syllabus alignment, wording and answers before using them for formal exam preparation.
