# True Path Navigator — CareerPath Website Chatbot

A full Netlify deployment of the MVP described in the CrowFlies requirements
brief ("CareerPath Website Chatbot," Draft v2, June 2026): a service-locator
chatbot with three entry points (job seeker / employer / career navigation),
crisis and spam pre-checks, a compliance-safe "no eligibility
determinations" rule, human handoff with email routing, and the embedded
TruePath career navigator.

**Five files do the work:**

| File | What it does |
|---|---|
| `index.html` | The widget visitors see — entry points, county capture, streaming chat, embedded TruePath, intake form. |
| `netlify/functions/chat.mjs` | The bot's brain: knowledge base, crisis/spam pre-checks, streaming to OpenAI. |
| `netlify/functions/submit-contact.mjs` | Handles the human handoff: emails + optional Jotform submission. |
| `netlify.toml` | Tells Netlify where things are and sets security headers. |
| `.env.example` | Documents every environment variable — copy values into Netlify, not into this file. |

No build step, no framework, no npm dependencies to install.

---

## 1. Setup

### 1.1 Get an OpenAI API key

1. platform.openai.com → sign in (this is separate from a ChatGPT
   subscription).
2. Settings → Billing → add a payment method, load ~$10.
3. Settings → Limits → set a monthly hard cap. **Do this before anything
   else** — Section 6b of the PRD expects ad-driven traffic spikes.
4. API keys → Create new secret key → copy it.

### 1.2 (Optional but recommended) Get a Resend key for email handoff

Without this, the bot still works end-to-end — the intake form still
displays, validates, and stores a redundant copy via Netlify Forms — it just
won't send the confirmation/notification emails from Section 4 of the PRD.

1. resend.com → sign up (free tier: 3,000 emails/month).
2. Verify a sending domain (or use `onboarding@resend.dev` for testing only
   — real visitor emails should come from a verified `careerpathservices.org`
   address).
3. API Keys → Create API Key.

### 1.3 Put this folder on GitHub

```bash
git init
git add .
git commit -m "True Path Navigator MVP"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/truepath-navigator.git
git push -u origin main
```

### 1.4 Connect Netlify

1. netlify.com → Sign up with GitHub.
2. Add new site → Import an existing project → pick the repo.
3. Leave the build command blank. Netlify reads `publish` and `functions`
   from `netlify.toml` automatically.
4. Deploy.

### 1.5 Add environment variables

Site configuration → Environment variables → add each one from
`.env.example`. At minimum: `OPENAI_API_KEY`. For email handoff, also add
`RESEND_API_KEY`, `CONFIRMATION_FROM_EMAIL`, and the team mailbox variables.

**Variables only apply on the next deploy.** After adding them: Deploys →
Trigger deploy → Deploy site.

### 1.6 Test

1. Open your Netlify URL, click the launcher bubble.
2. Try all three entry points.
3. Ask a program question, confirm streaming works and a citation chip
   appears.
4. Trigger a handoff (e.g. "I need to talk to someone") and submit the
   intake card — check Netlify → Forms for the redundant copy, and check
   your inbox if Resend is configured.
5. Type something like "I don't want to be here anymore" in a throwaway test
   — confirm the crisis response fires immediately (no OpenAI call, no
   delay).
6. Visit `/api/chat` directly in a browser (GET request) for a plain-English
   connection diagnostic if anything looks wrong.

---

## 2. Embedding on careerpathservices.org

Same iframe pattern as any embedded widget — exact placement is PRD open
question A1 (all pages vs. just Contact). Once decided:

```html
<iframe
  id="truepath-navigator"
  src="https://YOUR-NETLIFY-URL.netlify.app/"
  title="True Path Navigator"
  style="position:fixed; right:0; bottom:0; width:90px; height:90px; border:none; z-index:9999;"
></iframe>
<script>
  // Grow the iframe when the widget opens, shrink it when it closes, so it
  // doesn't block clicks elsewhere on the page. Requires a small postMessage
  // handshake — ask CrowFlies to wire this the same way as the original
  // Career Path chatbot embed, or keep the widget on its own dedicated route
  // for the MVP demo.
</script>
```

For the September 3 demo, the simplest reliable option is to point a "Ask
True Path Navigator" button/link at the Netlify URL directly rather than
solving iframe-resize-on-the-live-site in the same push — that's a fast
follow, not a blocker.

---

## 3. Editing the knowledge base

Edit `KNOWLEDGE_BASE` and `SERVED_COUNTIES` in
`netlify/functions/chat.mjs`, commit, push. Netlify redeploys in ~30
seconds. **If you change `SERVED_COUNTIES`, also update the matching array
in `index.html`** (`SERVED_COUNTIES` near the top of the `<script>` block) —
the frontend uses its own copy for the instant out-of-area message, so the
two need to stay in sync. This duplication is a deliberate MVP tradeoff (see
Section 5 open item below) — the PRD's "Later refinement" is a single
source-of-truth document editable without a developer; for now this is two
files, both plain text, both editable without touching any function logic.

`[BLANK — ...]` markers are gaps in the published website content. Replace
the whole bracket with the real answer once confirmed.

---

## 4. PRD requirements — what's built, what needs your input

Traceability against Section 3 ("Functional requirements") and the
Appendix ("Best-practice requirements"), both tagged MVP-NOW in the brief.

| Requirement | Status |
|---|---|
| Answer common program questions from website content | **Done** — `KNOWLEDGE_BASE` in chat.mjs, closed-system (model instructed to answer only from this block) |
| Identify county early, redirect out-of-area to WorkSource | **Done** — county picker before chat starts; instant client-side redirect message for unserved counties, plus WorkSource locator link |
| Never make an eligibility determination | **Done** — enforced three ways: system-prompt hard rule, regex backstop that short-circuits "am I eligible" phrasing before the model sees it, and the model is told to always route to staff instead |
| Complete/submit contact form for anything needing a person | **Done, with a design change** — see §6 below (in-widget confirm-before-send form instead of blind auto-submission) |
| Embedded TruePath career navigator | **Done** — iframe entry point 3, plus a same-link nudge for healthcare-specific job questions in job-seeker mode |
| Recognize/deflect spam without consuming staff time | **Done** — regex pre-check, no LLM call, no handoff |
| Set ~2-business-day expectation | **Done** — in every handoff response and confirmation email |
| Crisis handling, hard-coded, day one | **Done** — deterministic regex pre-check runs before the model; system prompt also carries it as a backstop for phrasing regex misses |
| Label bot messages as AI-generated; cite source | **Done** — "AI-generated" label under every bot bubble; citation chip parsed from a `[[SOURCE: url\|label]]` marker, restricted to a fixed URL allowlist so the model can't invent links |
| Streamed responses, Stop/Retry | **Done** — SSE streaming from `chat.mjs`, visible Stop button (aborts the fetch) and Retry button |
| Guided quick-reply buttons vs. empty box first | **Done** — entry-point buttons, then county picker, then topic chips |
| `aria-live="polite"` on the log; keyboard nav; contrast | **Done** — see §7 |
| PII disclaimer above input | **Done** — static text above the input box |
| Automated PII stripping before storage/logging | **Partial** — regex redaction of SSN- and card-like patterns on the intake form's free-text field before it's emailed/logged. This is a safety net, not the dedicated PII-stripping tool the PRD flags as an unresolved gap (Appendix, "Two gaps the research did not resolve") |
| Curated source-of-truth doc, editable without a developer | **Not built** — explicitly "Should have (later)" in the PRD, not MVP |
| Barrier/special-population-sensitive routing | **Not built** — explicitly "Should have (later)" |
| Spanish / other languages | **Partial** — the model will reply in whatever language the visitor writes in and still offers a handoff, but there's no dedicated Spanish UI copy (buttons, labels) — PRD open question A5, needs a decision |

---

## 5. Design decisions worth knowing about

**County selection uses a dropdown of all 39 WA counties, not a zip code.**
The PRD's UX best-practice suggests opening with a zip code for
"hyper-local" results. A zip-to-county mapping needs either an external API
or a few-hundred-row embedded dataset; a county dropdown gets the same
service-area routing with zero extra dependencies and no risk of a bad zip
match. If hyper-local zip-level results become a real requirement later,
that's a scoped addition, not a rebuild.

**The knowledge base and served-county list live in two files** (`chat.mjs`
for the model, `index.html` for the instant client-side out-of-area check).
The PRD's later-refinement goal — one editable source of truth, non-
developer-editable, refreshed in under a day — isn't built yet; for the MVP,
"editable by someone comfortable in plain text, redeployed by git push" is
the tradeoff. Refresh time today is however long a `git push` + Netlify
build takes, typically under a minute.

## 6. About the contact-form handoff

The PRD says the bot "completes and submits the existing CareerPath
contact/intake form on the visitor's behalf." This build does something
adjacent on purpose: when the bot decides a handoff is needed, it opens an
**in-chat form pre-filled with context** (their last message, their county)
that the **visitor reviews and confirms** before anything sends.

Two reasons for the change:
1. We don't yet have the real Jotform's internal field-ID mapping (numeric
   IDs, not the visible labels) — that's PRD open question A3/B-adjacent,
   and blocks wiring the *exact* existing form directly.
2. A visible confirm step is safer for the PII concern in Section 7 — the
   visitor sees exactly what's about to be sent, rather than the bot
   silently forwarding whatever they typed.

`submit-contact.mjs` is already wired to submit into the real Jotform too —
set `JOTFORM_API_KEY`, `JOTFORM_FORM_ID`, and `JOTFORM_FIELD_MAP` (a small
JSON mapping of our field names to Jotform's field IDs) once that mapping is
available, and it activates with no code changes.

**Redundant storage** (PRD: "writes the contact data to a separate store...
so staff don't all need access to the bot") is handled by **Netlify Forms**
— built into Netlify, zero extra signup, visible under your site's Forms
tab. It fires independently of the email step, so a submission is captured
even if Resend/OpenAI/Jotform are all misconfigured.

---

## 7. Accessibility (WCAG 2.1 AA)

- Every interactive element has a visible focus ring (`:focus-visible`),
  reachable by keyboard alone.
- `#log` is `aria-live="polite"` so screen readers announce new bot replies
  without interrupting.
- Brand green-on-white and white-on-green pairs are ≥ 4.5:1 contrast (dark
  green `#55691A` on white is 6.0:1).
- No motion beyond a subtle typing-dots animation, which respects
  `prefers-reduced-motion`.
- Text is 16px minimum throughout; the intake form and county picker use
  real `<label>`/`<select>`/`<input>` elements, not custom widgets.

---

## 8. Security & privacy notes

- `OPENAI_API_KEY`, `RESEND_API_KEY`, and `JOTFORM_API_KEY` exist only in
  Netlify's environment variables — never sent to the browser, never
  committed to this repo (`.gitignore` blocks `.env*`).
- Message bubbles render bot text as parsed paragraphs/links, not raw HTML —
  a model reply can't inject markup into the page. User-typed text uses
  `textContent` exclusively.
- Incoming chat messages are capped at 2,000 characters and 12 turns of
  history server-side; intake form fields are capped and validated.
- Free-text intake messages are scanned for SSN- and card-number-shaped
  strings and redacted before they're emailed or logged (see §4 — this is a
  safety net, not a certified PII-stripping pipeline).
- Rate limiting on both endpoints is a speed bump, not a wall — serverless
  instances are ephemeral. **Real protection is the OpenAI monthly spending
  cap** (§1.1) plus Netlify's own bot/abuse protections.
- CareerPath's data-processing agreement with OpenAI (so conversation data
  isn't used for model training) and the retention/storage policy for
  captured contact data are both organizational decisions, not something
  this codebase can resolve — see PRD Section 7 and open question B3.

---

## 9. Cost

Roughly **$0.001–0.002 per message** on `gpt-4o-mini` (default model,
`MODEL` in `.env.example`). Streaming doesn't change the per-token cost. At
the PRD's estimate of 45% fully-automatable + 18% hybrid of ~870 contacts/
year, expect well under $30/month in OpenAI spend even with meaningful
growth from the ad campaigns in Section 6b. Resend's free tier covers email
volume for a long time before any cost kicks in.

---

## 10. Open items — needs CareerPath / CrowFlies input

Directly from PRD Section 8, still open as of this build:

- **A1** — Where the bot lives on the site (all pages vs. Contact page only).
- **A3** — Exact team mailboxes per program/county (placeholders are in
  `.env.example` — replace with real addresses).
- **A4** — This build uses Netlify Forms for redundant storage (resolves the
  "which database/tool" question with a zero-setup option); confirm that's
  acceptable or specify a different target.
- **A5** — Spanish/other-language support: model already replies in-
  language, but UI copy (buttons, labels, disclaimer) is English-only until
  a language is chosen.
- **A6** — WorkSource-by-county redirect list: currently every out-of-area
  redirect points to the general WorkSource site locator
  (`worksource.my.site.com/worksourcewa/site-locator`); a specific
  county-by-county list from Jasmine can replace this with exact local
  contacts.
- **A7** — Amy Trosine's compliance sign-off on the chatbot/hybrid/human
  split — this build is ready for that review; nothing here should be
  treated as launched until she's signed off.
- **B3 (from CrowFlies' side, now answered by this build)** — captured data
  goes to Netlify Forms (redundant store) + email (via Resend, optional) +
  optionally the real Jotform once field IDs are supplied. Where it's
  encrypted/retained long-term is a Netlify account-level and
  organizational-policy decision, not a code change.
- **Jotform field-ID mapping** — needed from Sean/CrowFlies or whoever owns
  the existing form, to wire direct submission (see §6).

---

## 11. Before real visitors see it

- [ ] OpenAI monthly hard cap is set
- [ ] Amy Trosine compliance review complete (PRD A7 — gate before launch)
- [ ] Real team mailbox addresses in place of placeholders
- [ ] Ran crisis-trigger test phrases, confirmed immediate response with no
      OpenAI delay
- [ ] Ran the eligibility-question backstop ("am I eligible for BFET?"),
      confirmed it never states a determination
- [ ] Confirmed spam test messages get deflected without opening a handoff
- [ ] Verified Netlify Forms shows a test submission end-to-end
- [ ] Verified confirmation + team + FYI emails all arrive (if Resend is
      configured)
- [ ] Tested keyboard-only navigation through all three entry points
- [ ] Tested on a real phone over cellular
- [ ] Decided on conversation logging/retention policy and reflected it in
      CareerPath's terms-of-use / privacy policy (Jasmine leading)
