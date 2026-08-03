# NFL Prop Model

An NFL player-prop betting engine: it ingests weekly data, projects player stats,
models the distribution around each projection, prices those against sportsbook
lines, and sizes the survivors with fractional Kelly. On top sits a
sportsbook-style UI for working the slate.

```
nflverse data ──▶ baselines ──▶ projections ──▶ distributions ──▶ edges ──▶ Kelly ──▶ board
                                                                     ▲
                                                          prop lines ┘
```

---

## What this proves, and what it doesn't

Read this before trusting any number the app shows you.

**There is no free source of historical player-prop lines.** Everything else the
model needs is free and public; prop lines are not. So the engine takes lines
through a provider interface with two implementations:

- `synthetic` (default) — a simulated book that sets lines from this model's own
  projections plus noise.
- `odds-api` — real lines from [The Odds API](https://the-odds-api.com), behind
  an API key.

Against synthetic lines, **ROI is circular and proves nothing.** The "edge" being
measured is the simulation's own noise read back. A real sportsbook does not set
its lines from our numbers.

What synthetic lines *do* validate, properly:

- **Calibration** — whether props the model priced at 60% actually went over
  about 60% of the time. This is scored against real NFL results, so it is not
  circular at all, and a mis-specified distribution shows up immediately.
- The mechanical correctness of projection, pricing, grading, settlement and
  staking.

Current calibration, replaying 2023–24 (36 weeks, 2,694 bets, ~21,000 props
scored): **mean error 3.16 percentage points.**

The residual is a slight over-prediction with a known cause: about 8% of graded
props are players who took the field but recorded nothing. Real production has a
spike at exactly zero that a smooth continuous distribution under-weights.
Zero-inflation would be the fix; it is not implemented.

---

## Quick start

```bash
npm install
npx tsx scripts/pipeline.ts --season 2025 --week 12   # build a slate
npm run dev                                            # http://localhost:3000
```

No API keys and no database needed — slates are written to `.data/` as JSON.

---

## The weekly loop

| Step | Command | What happens |
|---|---|---|
| 1. Refresh data | `npm run ingest -- --seasons 2022-2025` | Pulls nflverse, reports league/defensive/baseline inputs, refits the sigma models |
| 2–5. Project, price, select | `npm run pipeline -- --season 2025 --week 12` | Projects every player, prices every prop, sizes the +EV survivors |
| 6. Review & bet | the UI | Board → prop detail → bet slip → tracker |
| 7. Grade | "Grade open bets" in the tracker | Settles against actual results |

Backtest any span with
`npm run backtest -- --seasons 2023-2024 --out .data/backtest.json`, then open
`/backtest`.

---

## Data sources

All free, no key required.

| Input | Source |
|---|---|
| Weekly player stats (targets, receptions, yards, carries, attempts) | `nflverse-data` → `stats_player_week_{season}.csv` |
| Schedule + **real closing spreads, totals, roof, temp, wind** | `nflverse/nfldata` → `games.csv` |
| Snap counts (participation, and whether a player actually played) | `nflverse-data` → `snap_counts_{season}.csv` |
| Player headshots | carried on the weekly stats rows |

Files are cached under `.cache/nflverse`.

Two notes on the data. nflverse publishes `spread_line` **positive when the home
team is favoured** — the opposite of standard betting convention — so the loader
flips the sign; getting this backwards silently inverts every game-script
adjustment. And DVOA is proprietary, so EPA-style yards-per-play figures stand in
for it, named for what they actually are.

---

## Layout

```
src/lib/engine/     Pure functions — plain objects in, plain objects out, no I/O.
                    This is what makes the model testable and replayable.
src/lib/ingest/     nflverse loaders, baselines, team/defense rates, props providers
src/lib/pipeline/   The weekly loop; produces a self-contained SlateSnapshot
src/lib/backtest/   Historical replay, grading, calibration
src/lib/db/         Storage behind one interface: file store (default) or Supabase
src/app/            Board, prop detail, tracker, backtest dashboard
supabase/migrations Schema + RLS
scripts/            CLI entry points
```

`npm run test` covers the engine: 102 tests with hand-computed expectations for
odds conversion, de-vigging, Kelly (including the push case), the normal and
negative-binomial CDFs, and push handling on integer lines.

---

## Modelling decisions worth knowing about

Four places this departs from the obvious approach, each because measurement said
to.

**Edges are computed against the de-vigged fair price, not raw implied odds.**
Raw implied probabilities sum to ~1.05, so `model − rawImplied` is biased
negative on *both* sides of every market. On a standard −110/−110 line that
erases ~2.4 points of edge, which is most of the bets at a 3% threshold. Set
`odds.devigMethod: "none"` to get the naive behaviour back.

**Props on players who never took the field are void, not zero.** About 22% of
posted props have no stat line, and only a small fraction of those players
actually dressed. Settling them as zero manufactures a flood of unders: it put
calibration error at 9.41pp, versus 2.21pp once voided. Snap counts distinguish
"played and recorded nothing" (a legitimate under) from "did not play" (a
refund).

**Team share normalisation is off by default.** Reconciling target shares to team
volume is correct only if you know who is playing — and roughly a fifth of the
candidate roster will be inactive. Normalising across it hands volume to players
who never appear and takes it from those who do. Measured on 2024, it biased
every skill-position projection low by 11–16% (receiving yards −16.4%,
receptions −15.6%) while quarterback markets, where the depth chart is
unambiguous, stayed clean. Off, everything lands inside ±3%. Turn it on only with
a real inactives list.

**Sigma is modelled, not just measured.** A player's own standard deviation over
~10 games is noisy and, worse, unconditional — it does not know this week's
projected volume. So `σ = w·σ_player + (1−w)·σ_league(μ)`, with the league
relationship fit from data (`scripts/ingest.ts`) and `w = n/(n+k)`. The fit found
quarterback volume has a *flat* slope, which is real rather than an artefact:
high-attempt passers are entrenched starters, low-attempt ones are backups with
erratic usage.

Smaller ones: game script interpolates smoothly rather than stepping at a ±6
spread threshold; yardage uses a normal truncated at zero with the location
solved so the mean still equals the projection; counts use a negative binomial
(NFL receptions are overdispersed relative to Poisson); Kelly carries a push term
that reduces to the textbook formula when push probability is zero.

Every coefficient lives in `src/lib/engine/config.ts` and is snapshotted into each
run, so an old recommendation can always be reproduced.

---

## Configuration

Copy `.env.example` to `.env.local`. Everything is optional — the defaults run
offline.

| Variable | Default | Purpose |
|---|---|---|
| `PROPS_PROVIDER` | `synthetic` | `odds-api` for real lines |
| `ODDS_API_KEY` | — | required when `PROPS_PROVIDER=odds-api` |
| `STORE_BACKEND` | file store | `supabase` for hosted Postgres |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | — | required for the Supabase backend |
| `BANKROLL` | `10000` | 1 unit = 1% of this |

### Status of the two optional integrations

Both are written but **neither has been exercised against the live service**, so
treat them as unverified until they have run once:

- **The Odds API** — the network policy where this was built blocks
  `api.the-odds-api.com`, and the player-props endpoint needs a paid key. The
  parsing is defensive and `parseEventOdds` is separated out for testing, so a
  response-shape mismatch surfaces as skipped props rather than wrong lines.
- **Supabase** — the migrations and store are complete, but the project could not
  be created from this environment (the MCP call required an approval that never
  came through). Apply `supabase/migrations/*.sql` in order, set the env vars,
  then `STORE_BACKEND=supabase`.

---

## Betting responsibly

This is a modelling exercise. It has never been tested against real sportsbook
prices, its edges against simulated lines are meaningless by construction, and a
3pp calibration error is a real limitation. Do not stake money on it on the
strength of the ROI figures in this repository.
