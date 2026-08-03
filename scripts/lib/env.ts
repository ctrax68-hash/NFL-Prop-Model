/**
 * Load environment variables for the CLI scripts.
 *
 * Next.js loads `.env.local` automatically for the app; these scripts run
 * standalone under tsx and need to do it themselves. `.env.local` wins over
 * `.env`, matching Next's own precedence. Import this before anything that
 * reads `process.env` (Supabase client creation, in particular).
 */

import { config } from "dotenv";
import path from "node:path";

const root = path.join(__dirname, "..", "..");

config({ path: path.join(root, ".env") });
config({ path: path.join(root, ".env.local"), override: true });
