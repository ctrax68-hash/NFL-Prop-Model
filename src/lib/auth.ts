/**
 * Server-side identity.
 *
 * `getCurrentUser()` is the one place the rest of the app asks "who is
 * asking" — it answers identity only. The existing `SlateStore` methods
 * (`src/lib/db/store.ts`) still do the actual reads/writes via the
 * service-role client, filtering/stamping by the id this returns; there is
 * no per-request RLS-enforced client in this app's write path (see
 * `supabase/migrations/0004_accounts.sql`'s header comment for why the RLS
 * policies are a backstop, not the enforcement mechanism).
 */

import "server-only";

import { createClient } from "./supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user || !user.email) return null;
    return { id: user.id, email: user.email };
  } catch (error) {
    console.error(
      "[auth] getCurrentUser failed; treating as logged out.",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
