/**
 * Thin fetch wrapper over Resend's email-sending API.
 *
 * NOTE ON VERIFICATION: written against Resend's documented, stable public
 * API (`POST https://api.resend.com/emails`, bearer auth, a JSON body of
 * `from`/`to`/`subject`/`html`), but this sandbox's network policy blocks
 * `api.resend.com` outright, so it has NOT been exercised against the live
 * service — same caveat this codebase already carries for the Odds API and
 * NWS providers (`src/lib/ingest/props/oddsApi.ts`, `src/lib/ingest/weather.ts`).
 * The GitHub Actions cron this feeds has normal outbound internet access and
 * is the first place this can actually be confirmed.
 *
 * Unlike those two providers, this one does NOT fail soft on missing
 * config. A forecast silently skipped is a smaller board with one fewer
 * badge; an alert silently skipped is a promise to the user ("we'll email
 * you when this moves") quietly not being kept, with nothing in the UI to
 * suggest anything is wrong. `scripts/send-alerts.ts` checks the required
 * env vars up front and refuses to run rather than exiting 0 having sent
 * nothing.
 */

const RESEND_API = "https://api.resend.com/emails";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend's message id on success, or the error body's message on failure. */
  detail: string;
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERTS_FROM_EMAIL);
}

export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error(
      "RESEND_API_KEY and ALERTS_FROM_EMAIL must both be set to send email.",
    );
  }

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };

  if (!response.ok) {
    return { ok: false, detail: body.message ?? `HTTP ${response.status}` };
  }
  return { ok: true, detail: body.id ?? "sent" };
}
