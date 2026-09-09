/**
 * Refreshes the Supabase session cookie on every request.
 *
 * This is refresh-only, not route protection — no redirects happen here.
 * Gating happens per-page/per-route (e.g. `src/app/tracker/page.tsx`,
 * `src/app/api/bets/route.ts`), matching this app's existing preference for
 * graceful per-page degradation (see `safely()` in `src/lib/data.ts`) over a
 * hard gate at the edge.
 *
 * `getUser()` is used rather than `getSession()` deliberately: it revalidates
 * the token against Supabase, where `getSession()` would trust whatever is in
 * the (spoofable) cookie without checking.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
