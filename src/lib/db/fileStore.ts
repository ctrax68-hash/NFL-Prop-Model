/**
 * JSON file-backed store.
 *
 * Keeps the whole app runnable with no database: scripts write slates here and
 * the UI reads them. Also what the backtester uses, because replaying a hundred
 * weeks against a remote Postgres would be needlessly slow.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { summarise, type SlateSnapshot, type SlateSummary } from "../pipeline/types";
import type { PlacedBet, SlateStore } from "./store";

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

  private slatePath(season: number, week: number): string {
    return path.join(this.slateDir, `${season}-${String(week).padStart(2, "0")}.json`);
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
    const file = this.slatePath(season, week);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, "utf8")) as SlateSnapshot;
  }

  async listSlates(): Promise<SlateSummary[]> {
    if (!existsSync(this.slateDir)) return [];
    const files = (await readdir(this.slateDir)).filter((f) => f.endsWith(".json"));

    const summaries = await Promise.all(
      files.map(async (file) => {
        const snapshot = JSON.parse(
          await readFile(path.join(this.slateDir, file), "utf8"),
        ) as SlateSnapshot;
        return summarise(snapshot);
      }),
    );

    return summaries.sort(
      (a, b) => b.season - a.season || b.week - a.week,
    );
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
