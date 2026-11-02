# DrillDeck — Karnataka State Exam Practice

DrillDeck is a customizable mock test application for Karnataka state-level exam preparation, built with **HTML5, CSS3, Vanilla JavaScript modules and Vercel Node.js functions**. Practice General Knowledge, Kannada, English and Computer using question sets loaded from JSON files under `data/`. Optional accounts and score history, plus the public score list, are stored as JSON through GitHub's Contents API.

## Features

- Configure a custom practice test by paper, subject/category, dataset, subcategory, difficulty, question count and duration.
- Discover JSON question datasets from the `data/` folder hierarchy automatically.
- Balance questions randomly across selected datasets, shuffle questions within each dataset and avoid repeats.
- Dataset- and subject-scoped question IDs; repeated IDs are disambiguated by occurrence, and gaps in source numbering are allowed.
- Invalid question records are skipped with dataset-specific warnings so one malformed record does not disable the rest of the question bank.
- One-question-at-a-time examination interface.
- Answer selection, previous/next navigation, clear response and mark-for-review.
- Clickable question palette with status indicators.
- Countdown timer with five-minute and one-minute warnings and automatic submission.
- Submission confirmation and a second browser confirmation.
- Correct +1, incorrect −0.25 and unanswered 0 scoring.
- Score, accuracy, attempt rate, subject analysis, time analysis and answer review.
- Complete submitted test results saved locally for guests and signed-in students, with refresh recovery and a **My Test History** section.
- Import/export of versioned JSON backups to transfer local test history between browsers or devices.
- Responsive desktop/mobile layout, dark theme toggle and print-friendly results.
- Creator portfolio and contact links in the setup and results footers, plus author and social profile metadata for search previews.
- Search metadata and structured data for Karnataka exam practice, creator profile links, a branded social preview, SVG/PNG/ICO browser and mobile icons, Google Search Console verification, robots.txt and an XML image sitemap.
- Optional email/password accounts, salted password hashes and up to 100 saved scores per account.
- Four-step test setup with multiple category, dataset and subcategory selection.
- Explicit opt-in before publishing a score; the global score list shows newest submissions first and never displays email addresses.
- Public shared chat messages stored in GitHub-backed JSON, with optional display names.
- HttpOnly, SameSite session cookies; GitHub credentials stay in server-side Vercel environment variables.

## Run locally

The app loads the generated `data/datasets.json` index, so it works on Vercel without public directory listings. `vercel.json` runs `npm run build`; the build generates the index and assembles the site into the configured `public/` output folder. Run the same command after adding JSON files when testing locally. Use a web server rather than opening the page through `file://`.

### Option A: VS Code Live Server

1. Extract the ZIP.
2. Open the `mock-test-platform` folder in VS Code.
3. Install/enable the **Live Server** extension.
4. Right-click `index.html` and choose **Open with Live Server**.

### Option B: Python static server

From the extracted project directory, run:

```bash
npm run build
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

No npm packages are required. Account, leaderboard and chat APIs need the Vercel serverless runtime and environment variables described below; a plain static server can run the question practice UI but cannot save accounts, scores or chat messages.

## Deploy accounts and score sharing to Vercel

1. Create a **separate private GitHub repository** for DrillDeck's JSON records. Do not use the public website repository: it will contain account email addresses and password hashes.
2. Create a fine-grained personal access token limited to that private repository. Grant **Contents: Read and write** (Metadata read access is required by GitHub); no other repository permissions are needed.
3. In Vercel, add these environment variables for the project:

   | Variable | Value |
   | --- | --- |
   | `EXAMDESK_GITHUB_TOKEN` | Fine-grained token for the private data repository |
   | `EXAMDESK_GITHUB_OWNER` | GitHub owner or organization for the private repository |
   | `EXAMDESK_GITHUB_REPO` | Private repository name |
   | `EXAMDESK_GITHUB_BRANCH` | Branch for JSON updates, normally `main` |
   | `EXAMDESK_SESSION_SECRET` | Random secret of at least 32 characters, used to sign sessions |

The older `drilldeck_*` environment variable names are also accepted for deployments that already use them.

4. Redeploy after setting the variables. The first score submission creates `accounts.json`, and the first chat message creates `chat-messages.json`, in the private repository.

Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Never put the GitHub token or session secret in frontend code, `index.html`, or a committed file. If a token is exposed, revoke it and create a replacement.

Account creation and sign-in are optional. Passwords are stored as salted scrypt hashes, not plaintext. Email addresses and account score history stay in the private repository; the public score list includes only a chosen display name, score, paper, subjects and date. Scores are private by default and are published only after selecting **Publish my score on the public leaderboard**. Signed-in users also get up to 100 published score summaries in account history. Guests are listed as `Guest` unless they enter a public name. Published scores can be renamed or removed from the leaderboard in **My Test History** or account history.

Full submitted results, including the questions and answers needed to recover the review, are saved in the browser's local storage independently of leaderboard consent and are not uploaded to GitHub. Private attempts therefore remain in **My Test History** without a public entry. Guests receive a local guest identifier; signed-in attempts also record the account ID in that browser's saved result. Use **My Test History** to reopen a result, or export/import a JSON backup to move history to another browser. Browser storage is device- and browser-specific; clearing site data removes local results, so keep an exported backup. The server requires an explicit consent flag before accepting a public score and checks score-management requests against the signed-in account or a private guest owner key.

If publishing fails, the result stays visible and a retry button reuses the same submission ID to avoid duplicate leaderboard rows. Password recovery and account deletion are not currently available.

For local serverless testing, use the Vercel CLI (`vercel dev`) with the same environment variables. A plain Python/Live Server instance has no `/api` functions, so account, leaderboard and chat requests will report that the service is unavailable.

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
All four options must be non-empty strings.

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
│   └── result.css
├── api/
│   ├── account.js
│   ├── history.js
│   ├── leaderboard.js
│   └── chat.js
├── lib/server/
│   ├── accounts.js
│   ├── github-json.js
│   └── http.js
├── js/
│   ├── app.js
│   ├── questions.js
│   ├── accounts.js
│   ├── exam.js
│   ├── timer.js
│   ├── scoring.js
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

The separate private GitHub storage repository receives the generated `accounts.json`.

## Important production limitations

The question experience remains client-side and is suitable for practice tests using a question bank whose answers are delivered to the browser. It is not a secure proctored examination system: users can inspect the downloaded JSON and alter client-side scores. Treat public leaderboard scores as practice results, not verified exam results.

The active, unsubmitted test remains in JavaScript memory only. Refreshing or closing the tab discards that in-progress attempt. After submission, the detailed result and answer review are saved locally and recoverable from the results URL or **My Test History**. Local results are not synced across devices; use a JSON backup to transfer them. Signed-in score summaries are also stored server-side and can be accessed across devices.

GitHub-backed JSON is a lightweight prototype store, not a production database. Each update creates a Git commit, repository history retains previous versions, and GitHub API limits, file growth and concurrent writes can restrict scale. Keep the data repository private, use a narrowly scoped token, and switch to a database with proper retention and deletion controls before handling sensitive data or a large audience. These client-calculated scores are not tamper-proof.

Before opening registration or public chat to a large audience, configure Vercel Firewall or another server-side rate limiter for account, score and chat API routes. Chat messages are public and have no moderation workflow. This prototype does not have durable rate-limit storage or email verification.

Search engines choose rankings and snippets independently; metadata, structured data, a sitemap and useful page content help discovery but cannot guarantee placement for broad searches. The canonical URL, robots rules, sitemap, social preview, and square browser/PWA icons use `https://drilldeck.vercel.app/`. The build copies the root favicon and Google Search Console verification file to the public site root. After deployment, open `https://drilldeck.vercel.app/googlef225cee30a4b6859.html` to confirm it is publicly served, then add the site to Google Search Console and Bing Webmaster Tools and submit `https://drilldeck.vercel.app/sitemap.xml`.

## Sample question bank

The supplied datasets under `data/General_Knowledge/CURRENT AFFAIRS/` contain 400 questions each. Independently verify syllabus alignment, wording and answers before using them for formal exam preparation.
