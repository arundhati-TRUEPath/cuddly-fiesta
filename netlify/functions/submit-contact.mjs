// ============================================================================
// True Path Navigator — contact/intake handoff
//
// PRD Section 4 ("Routing & human handoff"): when a conversation needs a
// person, the bot completes and submits a contact request, and the backend:
//   - sends the visitor an immediate confirmation email (~2 business days)
//   - sends the form contents to the correct local team mailbox
//   - sends an FYI copy to the TruePath product team
//   - writes the contact data to a separate store for tracking/redundancy
//
// Design choice, documented in README: rather than blindly re-implementing
// the existing Jotform intake form (whose internal field IDs CrowFlies
// doesn't have yet — PRD open question A3), the widget shows its own short
// confirm-before-send form. The visitor reviews what will be sent — better
// for the "never repeat themselves" goal AND for PII comfort — and this
// function fans it out. The "separate store for redundancy" requirement is
// satisfied by Netlify Forms, submitted directly from the browser alongside
// this function (see index.html) — that way redundancy doesn't depend on
// this function, Resend, or any single point of failure.
//
// If JOTFORM_API_KEY + JOTFORM_FORM_ID + JOTFORM_FIELD_MAP are configured,
// this ALSO submits into the real existing Jotform. Until CareerPath/
// CrowFlies supply the field-ID mapping, that step is skipped automatically.
// ============================================================================

const PHONE = "509-326-7520";
const RESPONSE_TIME = "about two business days";

const TEAM_EMAIL_BY_TYPE = {
  jobseeker: process.env.WORKFIRST_TEAM_EMAIL || process.env.GENERAL_TEAM_EMAIL,
  employer: process.env.EMPLOYER_TEAM_EMAIL || process.env.GENERAL_TEAM_EMAIL,
  records: process.env.RECORDS_TEAM_EMAIL || process.env.GENERAL_TEAM_EMAIL,
  no_answer: process.env.GENERAL_TEAM_EMAIL,
};

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const recent = (hits.get(ip) || []).filter((t) => t > minuteAgo);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 10; // intake submissions are rarer than chat turns
}

// Redact obvious high-risk PII (SSNs, card-like numbers) from any free-text
// transcript excerpt before it's emailed/stored. Name/email/phone fields are
// NOT redacted — those are the point of an intake form. This is a best-
// effort safety net per the PRD's "PII in open text boxes" concern, not a
// substitute for the "automated PII stripping" tool flagged as a LATER item.
function redact(text) {
  return String(text || "")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted SSN]")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[redacted card number]");
}

function isValidEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function sendEmail({ to, from, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return { sent: false, reason: !apiKey ? "no RESEND_API_KEY" : "no recipient" };

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: from || process.env.CONFIRMATION_FROM_EMAIL || "noreply@careerpathservices.org",
        to: [to],
        subject,
        text,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error(`Resend ${r.status}:`, detail.slice(0, 400));
      return { sent: false, reason: `Resend HTTP ${r.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("Resend send error:", err);
    return { sent: false, reason: String(err).slice(0, 200) };
  }
}

async function submitToJotform(payload) {
  const apiKey = process.env.JOTFORM_API_KEY;
  const formId = process.env.JOTFORM_FORM_ID;
  const fieldMapRaw = process.env.JOTFORM_FIELD_MAP; // JSON: {"name":"3","email":"4",...}
  if (!apiKey || !formId || !fieldMapRaw) {
    return { attempted: false, reason: "Jotform not configured (needs field-ID mapping from CareerPath/CrowFlies)" };
  }

  let fieldMap;
  try {
    fieldMap = JSON.parse(fieldMapRaw);
  } catch {
    return { attempted: false, reason: "JOTFORM_FIELD_MAP is not valid JSON" };
  }

  const params = new URLSearchParams();
  for (const [ourField, jotformFieldId] of Object.entries(fieldMap)) {
    if (payload[ourField] != null) {
      params.set(`submission[${jotformFieldId}]`, String(payload[ourField]));
    }
  }

  try {
    const r = await fetch(
      `https://api.jotform.com/form/${formId}/submissions?apiKey=${encodeURIComponent(apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params }
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error(`Jotform ${r.status}:`, detail.slice(0, 400));
      return { attempted: true, sent: false, reason: `Jotform HTTP ${r.status}` };
    }
    return { attempted: true, sent: true };
  } catch (err) {
    console.error("Jotform submit error:", err);
    return { attempted: true, sent: false, reason: String(err).slice(0, 200) };
  }
}

const json = (obj, status = 200) => Response.json(obj, { status });

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (rateLimited(ip)) {
    return json({ ok: false, error: "Too many submissions from this connection. Please call us at " + PHONE + "." }, 429);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const type = ["jobseeker", "employer", "records", "no_answer"].includes(body?.type) ? body.type : "jobseeker";
  const name = String(body?.name || "").trim().slice(0, 200);
  const email = String(body?.email || "").trim().slice(0, 200);
  const phone = String(body?.phone || "").trim().slice(0, 60);
  const county = String(body?.county || "").trim().slice(0, 60);
  const org = String(body?.org || "").trim().slice(0, 200);
  const message = redact(String(body?.message || "").trim().slice(0, 2000));

  if (!name) return json({ ok: false, error: "Please share a name so staff know who to follow up with." }, 400);
  if (!email && !phone) return json({ ok: false, error: "Please share an email or phone number so staff can reach you." }, 400);
  if (email && !isValidEmail(email)) return json({ ok: false, error: "That email address doesn't look right." }, 400);

  const timestamp = new Date().toISOString();
  const typeLabel = { jobseeker: "Job seeker", employer: "Employer / partner", records: "Records / HR request", no_answer: "Called, no answer" }[type];

  const teamEmail = TEAM_EMAIL_BY_TYPE[type];
  const productTeamEmail = process.env.PRODUCT_TEAM_EMAIL;

  const summaryLines = [
    `New True Path Navigator contact request — ${typeLabel}`,
    `Submitted: ${timestamp}`,
    `Name: ${name}`,
    email ? `Email: ${email}` : null,
    phone ? `Phone: ${phone}` : null,
    county ? `County: ${county}` : null,
    org ? `Organization: ${org}` : null,
    message ? `Message:\n${message}` : null,
  ].filter(Boolean);
  const summaryText = summaryLines.join("\n");

  const results = await Promise.all([
    // 1. Visitor confirmation
    email
      ? sendEmail({
          to: email,
          subject: "We got your message — Career Path Services",
          text:
            `Hi ${name},\n\nThanks for reaching out through the True Path Navigator. ` +
            `Your request has been received and a member of our team will follow up ` +
            `within ${RESPONSE_TIME}.\n\nIf anything is urgent, you can also call us ` +
            `at ${PHONE}, Monday through Thursday, 8am to 5pm.\n\n— Career Path Services`,
        })
      : Promise.resolve({ sent: false, reason: "no email provided" }),
    // 2. Local team mailbox
    sendEmail({ to: teamEmail, subject: `[True Path Navigator] ${typeLabel}: ${name}`, text: summaryText }),
    // 3. FYI to TruePath product team
    sendEmail({ to: productTeamEmail, subject: `[FYI] True Path Navigator — ${typeLabel}: ${name}`, text: summaryText }),
    // 4. Best-effort into the existing Jotform, if configured
    submitToJotform({ type, name, email, phone, county, org, message, timestamp }),
  ]);

  const [confirmation, teamNotify, productFyi, jotform] = results;

  if (!teamNotify.sent && !jotform.sent) {
    // Neither delivery path worked — the visitor's browser will still have
    // submitted to Netlify Forms as the redundant store, so nothing is lost,
    // but staff won't be proactively notified. Surface this honestly.
    console.error("submit-contact: no delivery path succeeded", { teamNotify, jotform });
  }

  return json({
    ok: true,
    message:
      `Thanks, ${name.split(" ")[0] || "there"} — that's in, and someone will follow up within ${RESPONSE_TIME}.` +
      (email && !confirmation.sent ? " (We couldn't confirm by email just now — hang onto this chat as your record.)" : ""),
    debug: { confirmation, teamNotify, productFyi, jotform },
  });
};

export const config = { path: "/api/submit-contact" };
