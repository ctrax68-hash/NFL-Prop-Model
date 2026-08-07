/**
 * JSON file-backed store.
 *
 * Keeps the whole app runnable with no database: scripts write slates here and
 * the UI reads them. Also what the backtester uses, because replaying a hundred
 * weeks against a remote Postgres would be needlessly slow.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";

import { summarise, type SlateSnapshot, type SlateSummary } from "../pipeline/types";
import type { ClosingLine, PlacedBet, SlateStore } from "./store";

export class FileSlateStore implements SlateStore {
  readonly kind = "file";

  private readonly root: string;

  constructor(root?: string) {
    // `.data/` is the local working directory and is gitignored; `data/` is the
    // committed seed that ships with a deploy. Prefer live local output, fall
    // back to the seed so a fresh clone and the deployed site both render.
    if (root) {
      this.root = root;
    } else {
      const working = path.join(process.cwd(), ".data");
      const seed = path.join(process.cwd(), "data");
      this.root = existsSync(path.join(working, "slates")) ? working : seed;
    }
  }

  private get slateDir(): string {
    return path.join(this.root, "slates");
  }

  private get betsPath(): string {
    return path.join(this.root, "bets.json");
  }

  private slateStem(season: number, week: number): string {
    return path.join(
      this.slateDir,
      `${season}-${String(week).padStart(2, "0")}.json`,
    );
  }

  private slatePath(season: number, week: number): string {
    return this.slateStem(season, week);
  }

  /**
   * Where `listSlates()` gets its answer from.
   *
   * Without this it had to open and fully parse every slate just to read a
   * dozen summary fields off each. That was tolerable at two slates and is not
   * at a hundred-odd — it runs in the root layout, so it happens on every page
   * of every request. The seed writes this alongside the slates.
   */
  private get indexPath(): string {
    return path.join(this.slateDir, "index.json");
  }

  /**
   * Read a slate, transparently handling the gzipped form.
   *
   * The committed seed is gzipped (~9x on this shape of JSON — the difference
   * between a 21 MB checkout and a 190 MB one); the local working directory
   * stays plain so it can be inspected with ordinary tools.
   */
  private async readJson<T>(file: string): Promise<T | null> {
    if (existsSync(file)) {
      return JSON.parse(await readFile(file, "utf8")) as T;
    }
    if (existsSync(`${file}.gz`)) {
      return JSON.parse(gunzipSync(await readFile(`${file}.gz`)).toString("utf8")) as T;
    }
    return null;
  }

  async saveSnapshot(snapshot: SlateSnapshot): Promise<void> {
    await mkdir(this.slateDir, { recursive: true });
    await writeFile(
      this.slatePath(snapshot.season, snapshot.week),
      JSON.stringify(snapshot),
      "utf8",
    );
  }

  async loadSnapshot(season: number, week: number): Promise<SlateSnapshot | null> {
    return this.readJson<SlateSnapshot>(this.slatePath(season, week));
  }

  /**
   * A file store overwrites one JSON file per (season, week) on every run —
   * there's no format for holding more than one pricing pass. That means it
   * has no way to tell "the line a bet was placed against" apart from "the
   * closing line": they're the same single stored copy, so returning it as a
   * closing line would silently show 0 CLV on every bet rather than an
   * honest "unavailable." Only a store that actually accumulates a run per
   * pass (see SupabaseSlateStore) can answer this.
   */
  async getClosingLine(): Promise<ClosingLine | null> {
    return null;
  }

  async listSlates(): Promise<SlateSummary[]> {
    if (!existsSync(this.slateDir)) return [];

    const indexed = await this.readJson<SlateSummary[]>(this.indexPath);
    if (indexed) return FileSlateStore.newestFirst(indexed);

    // No manifest: fall back to opening every slate. Correct, and fine for the
    // handful of weeks a local working directory usually holds.
    const files = (await readdir(this.slateDir)).filter(
      (f) => f !== "index.json" && (f.endsWith(".json") || f.endsWith(".json.gz")),
    );

    const summaries = await Promise.all(
      files.map(async (file) => {
        const snapshot = await this.readJson<SlateSnapshot>(
          path.join(this.slateDir, file.replace(/\.gz$/, "")),
        );
        return snapshot ? summarise(snapshot) : null;
      }),
    );

    return FileSlateStore.newestFirst(
      summaries.filter((s): s is SlateSummary => s !== null),
    );
  }

  private static newestFirst(summaries: SlateSummary[]): SlateSummary[] {
    return [...summaries].sort((a, b) => b.season - a.season || b.week - a.week);
  }

  async placeBets(bets: readonly PlacedBet[]): Promise<void> {
    const existing = await this.listBets();
    const byId = new Map(existing.map((bet) => [bet.id, bet]));
    for (const bet of bets) byId.set(bet.id, bet);
    await this.writeBets([...byId.values()]);
  }

  async listBets(): Promise<PlacedBet[]> {
    if (!existsSync(this.betsPath)) return [];
    return JSON.parse(await readFile(this.betsPath, "utf8")) as PlacedBet[];
  }

  async updateBets(bets: readonly PlacedBet[]): Promise<void> {
    await this.placeBets(bets);
  }

  private async writeBets(bets: PlacedBet[]): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.betsPath, JSON.stringify(bets, null, 2), "utf8");
  }
}
