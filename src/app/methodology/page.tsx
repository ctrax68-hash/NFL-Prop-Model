import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, SectionHeading, WarningCard } from "@/components/ui";
import { DEFAULT_CONFIG } from "@/lib/engine/config";
import { DEFAULT_BASELINE_OPTIONS } from "@/lib/ingest/baselines";
import { PROP_LABELS } from "@/lib/format";
import type { ContinuousStatType, StatType } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How the NFL Prop Model Works",
  description:
    "A full, config-sourced walkthrough of the statistical model behind every projection: baselines, priors, distribution families and variance — not a trained ML model, and not hidden.",
};

const YARDS_STATS: ContinuousStatType[] = [
  "receiving_yards",
  "rushing_yards",
  "passing_yards",
];

const ALL_STATS: StatType[] = [
  "receiving_yards",
  "receptions",
  "rushing_yards",
  "rush_attempts",
  "passing_yards",
  "pass_attempts",
  "pass_completions",
];

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`py-1.5 font-medium ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <td className={`numeric py-1.5 ${right ? "text-right" : "text-left"}`}>
      {children}
    </td>
  );
}

export default function MethodologyPage() {
  const { distribution, selection, kelly, odds, efficiency, injury } = DEFAULT_CONFIG;
  const baselineOptions = DEFAULT_BASELINE_OPTIONS;

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow">Model Transparency</div>
        <h1 className="display mt-1 text-[34px] font-black text-[var(--ink)] sm:text-[42px]">
          METHODOLOGY
        </h1>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          Config version {DEFAULT_CONFIG.configVersion} — every number below is
          read live from the file that runs the pipeline, so this page can
          never drift from the model it describes.
        </p>
      </div>

      <WarningCard title="This is not a trained ML model.">
        There is no neural network, no gradient descent, and nothing resembling
        a &ldquo;feature importance&rdquo; ranking — those questions do not
        apply here. This is a statistical/actuarial projection: usage rates and
        per-play efficiency are estimated from recent games, shrunk toward a
        league prior, combined into a mean, and priced against a fitted
        variance model. Every coefficient below lives in one versioned file
        (<code className="numeric">src/lib/engine/config.ts</code>) and is
        exactly what ran the slate you&apos;re looking at — nothing is tuned
        per-player or per-game behind the scenes.
      </WarningCard>

      <Card className="p-4">
        <SectionHeading
          title="Baselines"
          hint="How a player's expected volume and efficiency are estimated before anything else runs."
        />
        <p className="text-xs leading-relaxed text-[var(--ink-dim)]">
          Each player&apos;s recent games are weighted by recency and blended
          with a league-wide prior — more games played means more weight on
          their own history, fewer means more weight on the prior. This is
          plain shrinkage estimation, not a fitted model with hidden terms.
        </p>
        <div className="scroll-x mt-3">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="text-[var(--ink-mute)]">
                <Th>Setting</Th>
                <Th right>Value</Th>
                <Th>What it controls</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <Td>Recency window</Td>
                <Td right>{baselineOptions.windowGames} games</Td>
                <Td>Most recent games considered per player.</Td>
              </tr>
              <tr className="border-t">
                <Td>Recency decay</Td>
                <Td right>{baselineOptions.decay}</Td>
                <Td>Weight multiplier per game further in the past.</Td>
              </tr>
              <tr className="border-t">
                <Td>Games shrinkage</Td>
                <Td right>{baselineOptions.shrinkGames}</Td>
                <Td>
                  Games of history before a usage-share baseline is half the
                  player&apos;s own observed rate.
                </Td>
              </tr>
              <tr className="border-t">
                <Td>Targets shrinkage</Td>
                <Td right>{baselineOptions.shrinkTargets}</Td>
                <Td>Same idea, for yards-per-target and catch rate.</Td>
              </tr>
              <tr className="border-t">
                <Td>Carries shrinkage</Td>
                <Td right>{baselineOptions.shrinkCarries}</Td>
                <Td>Same idea, for yards-per-carry.</Td>
              </tr>
              <tr className="border-t">
                <Td>Attempts shrinkage</Td>
                <Td right>{baselineOptions.shrinkAttempts}</Td>
                <Td>
                  Same idea, for yards-per-attempt and completion rate.
                </Td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Position and depth-chart priors"
          hint="What a baseline shrinks toward when a player doesn't yet have much history."
        />
        <p className="text-xs leading-relaxed text-[var(--ink-dim)]">
          A flat position average (every WR pooled together, say) drags a
          newly-installed starter&apos;s baseline toward a backup-heavy
          number. Usage-share priors are instead bucketed by the player&apos;s
          current depth-chart rank — starter, second string, or third-string
          and deeper — computed fresh from the same nflverse data every run,
          not hand-set. A promoted RB2 shrinks toward what RB1s typically get,
          not toward the position-wide average that includes every committee
          back and emergency fill-in.
        </p>
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Distribution family per stat"
          hint="How each stat's shape is modelled once a mean is projected."
        />
        <p className="text-xs leading-relaxed text-[var(--ink-dim)]">
          Passing yards is a sum over roughly 35 pass attempts and comes out
          close to symmetric. Receiving and rushing yards are sums over a
          handful of touches, heavily right-skewed with a real chance of
          zero — one family does not fit both well, so each yardage stat is
          modelled separately and count stats (receptions, attempts) use a
          negative binomial.
        </p>
        <div className="scroll-x mt-3">
          <table className="w-full min-w-[360px] text-xs">
            <thead>
              <tr className="text-[var(--ink-mute)]">
                <Th>Stat</Th>
                <Th>Family</Th>
              </tr>
            </thead>
            <tbody>
              {YARDS_STATS.map((stat) => (
                <tr key={stat} className="border-t">
                  <Td>{PROP_LABELS[stat]}</Td>
                  <Td>{distribution.yards[stat]}</Td>
                </tr>
              ))}
              <tr className="border-t">
                <Td>Receptions / attempts / completions</Td>
                <Td>{distribution.counts}</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-dim)]">
          Measured on the full 2023-2025 pool once three seasons became
          available (a single season on the QB-only passing stat is noisy
          enough that 2025 alone actually favoured the opposite choice,
          purely from sampling variance): switching receiving and rushing
          yards to a gamma distribution cuts projection bias from -7.9pp to
          -1.4pp and -7.1pp to -1.6pp respectively. The same change applied
          to passing yards makes it worse (-0.8pp to +3.2pp), which is why
          passing stays on the symmetric family instead of one distribution
          being forced onto every stat.
        </p>
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Zero-inflation (hurdle) models"
          hint="Extra correction where a plain count/continuous distribution underestimates how often a stat lands on exactly zero."
        />
        <p className="text-xs leading-relaxed text-[var(--ink-dim)]">
          A logistic model estimates P(stat = 0) from projected volume and
          snap share, layered on top of whichever distribution above already
          applies — additive, not a replacement.
        </p>
        <div className="scroll-x mt-3">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="text-[var(--ink-mute)]">
                <Th>Stat</Th>
                <Th>Applies to</Th>
                <Th right>Intercept</Th>
                <Th right>log(mean) coef</Th>
                <Th right>Snap-share coef</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(distribution.hurdle).map(([stat, model]) => (
                <tr key={stat} className="border-t">
                  <Td>{PROP_LABELS[stat as StatType]}</Td>
                  <Td>{model?.qbOnly ? "Quarterbacks only" : "All players"}</Td>
                  <Td right>{model?.intercept}</Td>
                  <Td right>{model?.meanCoef}</Td>
                  <Td right>{model?.snapShareCoef}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-dim)]">
          Rushing yards is gated to quarterbacks specifically: a QB and a
          non-QB projected for identical rushing volume have very different
          zero-rush rates — a QB&apos;s volume comes from occasional scrambles
          even when the plan is to pass, while a non-QB&apos;s comes from
          called runs. Without this split, the model priced &ldquo;rushed for
          any positive yards&rdquo; lines on pocket passers at 86-91% when
          their own trailing zero-rush rate was 27-35%. Fitting one shared
          model across both groups measurably worsened non-QB calibration in
          the 2023-25 backtest, so this is fit on quarterback rows only and
          applied only to quarterback props.
        </p>
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Variance (sigma) models"
          hint="sigma = intercept + slope × projected mean, floored at a minimum — per stat."
        />
        <p className="text-xs leading-relaxed text-[var(--ink-dim)]">
          A player&apos;s own week-to-week standard deviation is a poor
          estimator on its own — a handful of games is a tiny sample, and it
          doesn&apos;t know this week&apos;s projected volume is unusually
          high or low. The league-wide relationship between projected mean
          and realised spread is stable and volume-aware, so the two are
          blended by sample size: a player needs {distribution.sigmaBlendK}{" "}
          games before their own variance carries half the weight.
        </p>
        <div className="scroll-x mt-3">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="text-[var(--ink-mute)]">
                <Th>Stat</Th>
                <Th right>Intercept</Th>
                <Th right>Slope</Th>
                <Th right>Minimum</Th>
              </tr>
            </thead>
            <tbody>
              {ALL_STATS.map((stat) => {
                const model = distribution.sigmaModels[stat];
                return (
                  <tr key={stat} className="border-t">
                    <Td>{PROP_LABELS[stat]}</Td>
                    <Td right>{model.intercept}</Td>
                    <Td right>{model.slope}</Td>
                    <Td right>{model.min}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeading
          title="Everything else that moves a projection"
          hint="The smaller adjustments layered on top of the baseline before it becomes a price."
        />
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--ink-dim)]">
          <li>
            Opponent strength shifts efficiency by up to{" "}
            {(efficiency.maxDefenseAdjustment * 100).toFixed(0)}% based on the
            opponent&apos;s standardised yards-allowed figure — deliberately
            modest, since defense explains far less of per-play efficiency
            than volume does.
          </li>
          <li>
            Wind above {efficiency.windThresholdMph} mph degrades passing
            efficiency by {(efficiency.windPenaltyPerMph * 100).toFixed(1)}%
            per additional mph; rain or snow costs{" "}
            {(efficiency.precipitationPenalty * 100).toFixed(0)}%, capped at a{" "}
            {(efficiency.maxWeatherPenalty * 100).toFixed(0)}% total weather
            penalty.
          </li>
          <li>
            The book&apos;s overround is removed via{" "}
            <span className="numeric">{odds.devigMethod}</span> de-vigging
            before edge is computed — comparing the model to the book&apos;s
            raw (vig-inflated) implied probability would understate edge on
            both sides of every market.
          </li>
          <li>
            A bet is only recommended at {(selection.minEdge * 100).toFixed(0)}
            %+ edge, with at least {selection.minGamesSample} games of
            baseline history behind it, sized at{" "}
            {(kelly.fraction * 100).toFixed(0)}% of full Kelly and capped at{" "}
            {kelly.maxUnits} units.
          </li>
          <li>
            A player listed <span className="font-semibold text-[var(--ink)]">Out</span>{" "}
            is excluded from the slate entirely — a factual correction, not a
            modelled one.{" "}
            <span className="font-semibold text-[var(--ink)]">Questionable</span>/
            <span className="font-semibold text-[var(--ink)]">Doubtful</span>{" "}
            currently apply
            {injury.questionableVolumeMultiplier === 1 &&
            injury.doubtfulVolumeMultiplier === 1
              ? " no volume adjustment: a real backtest comparison found the obvious haircut helped receiving-side markets but measurably hurt passing-side ones, so it stays off until that's fit properly rather than shipped on a plausible-sounding guess"
              : ` a ${((1 - injury.questionableVolumeMultiplier) * 100).toFixed(0)}%/${((1 - injury.doubtfulVolumeMultiplier) * 100).toFixed(0)}% volume haircut`}
            .
          </li>
        </ul>
      </Card>

      <Card className="p-4 text-center">
        <p className="text-xs text-[var(--ink-dim)]">
          None of this matters if the numbers aren&apos;t actually
          calibrated. See the real, non-circular test —
        </p>
        <Link
          href="/backtest"
          className="tap mt-2 inline-flex min-h-[40px] items-center rounded-[var(--radius-pill)] border border-[var(--border)] px-4 text-xs font-semibold text-[var(--gold)] transition-colors hover:border-[var(--gold)]"
        >
          View the backtest →
        </Link>
      </Card>
    </div>
  );
}
