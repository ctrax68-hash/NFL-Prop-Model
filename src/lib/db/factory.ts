/**
 * Chooses the storage backend.
 *
 * Deliberately kept free of `server-only` so the CLI scripts can use it. The
 * app's own accessor (`getStore()` in `src/lib/data.ts`) delegates here and adds
 * the request-level memo; scripts call `createStore()` directly.
 */

import { FileSlateStore } from "./fileStore";
import { SupabaseSlateStore } from "./supabaseStore";
import type { SlateStore } from "./store";

export type StoreBackend = "file" | "supabase";

export function resolveBackend(override?: string): StoreBackend {
  const value = (override ?? process.env.STORE_BACKEND ?? "file").toLowerCase();
  if (value === "supabase") return "supabase";
  if (value === "file") return "file";
  throw new Error(
    `Unknown store backend "${value}". Expected "file" or "supabase".`,
  );
}

export function createStore(override?: string): SlateStore {
  return resolveBackend(override) === "supabase"
    ? new SupabaseSlateStore()
    : new FileSlateStore();
}
