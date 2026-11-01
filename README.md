# ExamDesk — JSON Mock Test Platform

A browser-based mock examination application built with **HTML5, CSS3 and Vanilla JavaScript modules**. Questions are loaded from JSON files under `data/`. There is no framework, database, backend or browser-based result persistence.

## Features

- Configure the fixed KEA examination by paper, subject/category, dataset, subcategory, difficulty, question count and duration.
- Discover JSON question datasets from the `data/` folder hierarchy automatically.
- Balance questions randomly across selected datasets, shuffle questions within each dataset and avoid repeats.
- JSON schema validation, duplicate ID checks and invalid-answer checks.
- One-question-at-a-time examination interface.
- Answer selection, previous/next navigation, clear response and mark-for-review.
- Clickable question palette with status indicators.
- Countdown timer with five-minute and one-minute warnings and automatic submission.
- Submission confirmation and a second browser confirmation.
- Correct +1, incorrect −0.25 and unanswered 0 scoring.
- Score, accuracy, attempt rate, subject analysis, time analysis and answer review.
- Responsive desktop/mobile layout, dark theme toggle and print-friendly results.
- Creator portfolio and contact links in the setup and results footers, plus author and social profile metadata for search previews.
- No localStorage, sessionStorage, cookies, IndexedDB or permanent result storage.

## Run locally

The app discovers newly added datasets by reading the `data/` directory listings. Because browsers cannot list files on their own, use a local web server that exposes directory listings, and do not open the page through `file://`.

### Option A: VS Code Live Server

1. Extract the ZIP.
2. Open the `mock-test-platform` folder in VS Code.
3. Install/enable the **Live Server** extension.
4. Right-click `index.html` and choose **Open with Live Server**.

### Option B: Python static server

From the extracted project directory, run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

No npm install or build step is required.

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

The setup screen displays the number of questions matching the selected filters. If there are fewer matching questions than requested, the test cannot start. The old `data/questions.json` starter bank is ignored; place new datasets in a subject folder.

Automatic folder discovery requires directory-listing support from the web server. If your production host disables directory listings, enable them for `data/` or provide a server-side dataset index; browsers cannot enumerate hidden files on a static host.

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
├── css/
│   ├── style.css
│   ├── exam.css
│   └── result.css
├── js/
│   ├── app.js
│   ├── questions.js
│   ├── exam.js
│   ├── timer.js
│   ├── scoring.js
│   └── results.js
├── data/
│   ├── General_Knowledge/
│   └── General_Kannada_English_Computer_Knowledge/
└── README.md
```

## Important production limitations

This is a **static, client-side application**. It is suitable for practice tests using a question bank whose answers are delivered to the browser. It is not a secure proctored examination system: users can inspect the downloaded JSON and see correct answers. Do not use this architecture for high-stakes exams or confidential question banks.

The application intentionally keeps the active test and result in JavaScript memory only. Refreshing, closing the tab, navigating away or losing the page discards the active test and result. There is no server-side recovery or cross-device synchronization.

For a public deployment, serve the site over HTTPS and use a trusted static host. If questions/answers must remain secret, or if users need accounts, anti-cheat controls, result history, question authoring, audit logs or reliable server-side timing, a backend and server-side question delivery are required. These requirements cannot be made secure with HTML/CSS/JavaScript alone.

## Sample question bank

The supplied datasets under `data/General_Knowledge/CURRENT AFFAIRS/` contain 400 questions each. Independently verify syllabus alignment, wording and answers before using them for formal exam preparation.
