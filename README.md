# Career Path Services — Website Chat Assistant

A chat widget for careerpathservices.org. Answers visitor questions about our
programs using OpenAI, grounded in content from our own website.

**Three files do all the work:**

| File | What it does |
|---|---|
| `index.html` | The chat widget visitors see. Design + behavior, one self-contained file. |
| `netlify/functions/chat.mjs` | Runs on Netlify's server. Holds the API key, talks to OpenAI. **The bot's instructions live here.** |
| `netlify.toml` | Tells Netlify where things are. |

There is no build step, no framework, and no dependencies to install.

---

## Setup

### 1. Get an OpenAI API key

1. Go to **platform.openai.com** and sign in. This is the developer platform —
   separate from ChatGPT. A ChatGPT Plus subscription does *not* include API access.
2. **Settings → Billing** → add a payment method and load a small credit ($10 is
   plenty to start).
3. **Settings → Limits → set a monthly hard cap.** Do this now, not later.
   $25 while testing. This is your real protection against a runaway loop or an
   abusive visitor.
4. **API keys → Create new secret key.** Copy it immediately — you cannot view
   it again.

### 2. Put this folder on GitHub

1. At github.com, click **+ → New repository**. Name it `cps-chatbot`.
   Set it **Private**. Create.
2. On the empty repo page, click **uploading an existing file**.
3. Drag in `index.html`, `netlify.toml`, `README.md`, and `.gitignore`.
4. **Then drag the whole `netlify` folder in as well** — the
   `netlify/functions/chat.mjs` path has to survive. If you only see
   `chat.mjs` in the upload list with no folder in front of it, start over and
   drag the folder itself.
5. Click **Commit changes**.

Command line equivalent:

```bash
git init
git add .
git commit -m "Chat widget"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/cps-chatbot.git
git push -u origin main
```

### 3. Connect Netlify

1. Sign up at netlify.com — choose **Sign up with GitHub**.
2. **Add new site → Import an existing project → GitHub** → pick `cps-chatbot`.
3. Leave the build command blank. Publish directory `.`, functions directory
   `netlify/functions` — Netlify reads both from `netlify.toml` automatically.
4. **Deploy.**

You'll get a URL like `curious-otter-a1b2c3.netlify.app`. The chat will not work
yet — you haven't given it the key.

### 4. Add the API key

1. **Site configuration → Environment variables → Add a variable →
   Add a single variable.**
2. Key: `OPENAI_API_KEY` — exactly that, capitals and underscores.
   Value: paste your OpenAI key.
3. Scope: **Functions** (or all scopes).
4. Save, then **Deploys → Trigger deploy → Deploy site**.

**Environment variables are only picked up on a new deploy.** Forgetting this
redeploy is the single most common reason people think they've broken something.

### 5. Test

Open your Netlify URL, click the green bubble, ask a question.

---

## When something goes wrong

The real error is always in **Netlify → Logs → Functions → `chat`**. Visitors
only ever see a friendly message; the detail goes to the logs.

| Symptom | Cause |
|---|---|
| "I'm not set up correctly yet" | `OPENAI_API_KEY` missing, misspelled, or you didn't redeploy after adding it |
| "having trouble answering right now" | Check the logs — usually a 401 or 429 from OpenAI |
| 404 on `/api/chat` | The `netlify/functions/` folder structure didn't upload correctly. See step 2.4. |
| 401 from OpenAI | Key is wrong or was revoked |
| 429 from OpenAI | No billing credit on the OpenAI account |
| Error mentioning `temperature` | This model only accepts its default. Delete the `temperature:` line in `chat.mjs`. |

---

## Changing what the bot says

Edit `SYSTEM_PROMPT` in `netlify/functions/chat.mjs`, commit, push. Netlify
redeploys in about 30 seconds. **This is the whole maintenance loop** — you will
never need to touch anything else.

The prompt contains 11 markers that look like `[BLANK 1 — office locations...]`.
Each one is a gap in what our website publishes. Until filled in, the bot routes
that question to a phone call instead of guessing. To fill one in, delete the
whole bracket and write the real answer in plain sentences.

**Highest value to fill in first:** office locations (BLANK 1). The site has no
working locations page, so the bot currently cannot tell anyone where to go.

### Ground rules for editing the prompt

- Never add a fact the bot should not state confidently. It will repeat anything
  in there as truth.
- Never remove the crisis instructions (HARD RULE 5).
- Never put the API key in the prompt, in `index.html`, or anywhere in this repo.

---

## Changing how it looks

Everything visual is in the `<style>` block at the top of `index.html`. Brand
colors are CSS variables in the first few lines — change `--cps-green-dark` once
and the header, bubbles, and buttons all follow.

The three example questions are `<button>` elements inside
`<ul id="suggestions">`. Edit the text; they wire themselves up automatically.

---

## Embedding on careerpathservices.org

See the steps document for the iframe snippet and the resize handler. The
important part: a full-size iframe silently blocks clicks in that corner of the
page, so it must start small and grow when the widget opens.

---

## Cost

Roughly **$0.001 per message** on the cheap model tier — about $10/month at
10,000 messages. The system prompt is identical on every call, so OpenAI caches
it and bills the repeat at about 10% of normal.

Two things control the bill: the model named at the top of `chat.mjs`, and
`HISTORY_LIMIT` (how much conversation gets resent each turn).

---

## Security notes

- The API key exists only in Netlify's environment variables. It is never sent
  to the browser and never committed to this repo.
- `.gitignore` blocks `.env` files from being committed by accident.
- Message bubbles are built with `textContent`, never `innerHTML`, so a model
  reply cannot inject markup into the page.
- Incoming messages are capped at 2,000 characters and 12 turns server-side.
- The rate limiter in `chat.mjs` is a speed bump, not a wall — serverless
  instances are ephemeral. **Your real protection is the OpenAI spending cap.**

---

## Before real visitors see it

- [ ] OpenAI monthly hard cap is set
- [ ] Ran the ten test questions (see the system prompt document)
- [ ] Verified it does not invent office addresses
- [ ] Verified the crisis response triggers
- [ ] Tested on a real phone over cellular
- [ ] Disclaimer line is still visible in the widget — do not remove it
- [ ] Decided whether to log conversations, and said so publicly if you do
