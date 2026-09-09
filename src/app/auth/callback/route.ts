/**
 * Supabase's PKCE magic-link callback.
 *
 * The emailed link points here with a `code` query param; exchanging it for
 * a session is the one thing this route does. A Route Handler is one of the
 * few places allowed to write session cookies (Server Components can only
 * read), which is why this can't just happen in a page component.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/tracker";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
