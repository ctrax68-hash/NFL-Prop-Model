/**
 * Server-side Supabase client, scoped to the current request's session
 * cookies.
 *
 * Must be constructed fresh on every call — `cookies()` (from `next/headers`)
 * is only valid inside a request's execution context, so this can never be a
 * module-level singleton the way `getStore()` in `src/lib/data.ts` is. A
 * cached client here would leak one user's session into another user's
 * request on the same server process.
 *
 * Server Components can read cookies but not write them (Next.js throws on
 * `.set()` outside a Route Handler, Server Action, or Middleware) — the
 * `setAll` below is a no-op in that context by design. `middleware.ts` is
 * what actually refreshes and writes the session cookie on every request, so
 * by the time a Server Component calls this, the cookies it reads are
 * already current.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookies can't be written here.
            // Session refresh already happened in middleware.ts, so this is
            // safe to ignore rather than throw.
          }
        },
      },
    },
  );
}
