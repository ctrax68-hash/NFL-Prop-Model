import { NextResponse } from "next/server";

import { getStore } from "@/lib/data";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribeToken";

/**
 * The one-click link from an alert email. Deliberately public (no session —
 * a mail client isn't logged in) and deliberately GET (it's a link a person
 * clicks, not a form) — see `unsubscribeToken.ts` for why that's safe here.
 * Idempotent: visiting it twice, or a mail client's link-preview crawler
 * hitting it once before the person does, both just no-op the second time.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token");

  if (!id || !token || !verifyUnsubscribeToken(id, token)) {
    return new NextResponse(unsubscribePage("That unsubscribe link is invalid or has expired."), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  await getStore().removeAlertSubscriptionById(id);

  return new NextResponse(
    unsubscribePage("You will no longer receive email alerts for this prop."),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function unsubscribePage(message: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Unsubscribed</title>
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; text-align: center; color: #1a1a1a;">
    <h1 style="font-size: 20px;">Unsubscribed</h1>
    <p style="color: #555;">${message}</p>
  </body>
</html>`;
}
