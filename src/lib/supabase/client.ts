/**
 * Browser-side Supabase client, for use in Client Components only (the
 * login form, and anything else that needs to call `supabase.auth.*`
 * directly rather than going through a Route Handler).
 *
 * Distinct from `createServiceClient` in `src/lib/db/supabaseStore.ts`,
 * which is a privileged server-only client keyed on the service-role key.
 * This one is scoped to the anon/publishable key and a real user session —
 * it should never be given elevated access.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
