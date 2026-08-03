/** Minimal argv parsing for the CLI scripts. */

export type Args = Record<string, string | boolean>;

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function requireNumber(args: Args, key: string): number {
  const value = args[key];
  if (typeof value !== "string" || !Number.isFinite(Number(value))) {
    throw new Error(`Missing or invalid --${key}`);
  }
  return Number(value);
}

export function optionalNumber(args: Args, key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Parse "2022-2024" or "2024" into an inclusive list of seasons. */
export function parseSeasonRange(value: string): number[] {
  const match = /^(\d{4})(?:-(\d{4}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid season range: ${value}`);

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  if (end < start) throw new Error(`Invalid season range: ${value}`);

  const out: number[] = [];
  for (let season = start; season <= end; season += 1) out.push(season);
  return out;
}
