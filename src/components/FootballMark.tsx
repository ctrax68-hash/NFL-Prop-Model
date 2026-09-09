/**
 * The app's brand mark: a football, not a letterform.
 *
 * Drawn once here for the live UI (Nav's header badge) and mirrored by hand
 * in `icon.svg` and `apple-icon.tsx` — those are static/build-time file
 * conventions Next.js owns the output shape of, so they can't import a React
 * component, but all three are kept visually identical on purpose. Uses the
 * app's real theme tokens (`--gold-bright`/`--bronze`, both blue despite the
 * name — see globals.css's own header comment) rather than literal hex, so
 * a future palette change only has to happen once.
 */
export function FootballMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id="football-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold-bright)" />
          <stop offset="1" stopColor="var(--bronze)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-28 32 32)">
        <ellipse cx={32} cy={32} rx={24} ry={12.4} fill="url(#football-mark-gradient)" />
        <path
          d="M11 32 Q32 24 53 32"
          fill="none"
          stroke="var(--obsidian-1)"
          strokeWidth={1.1}
          opacity={0.35}
        />
        <path
          d="M11 32 Q32 40 53 32"
          fill="none"
          stroke="var(--obsidian-1)"
          strokeWidth={1.1}
          opacity={0.35}
        />
        <line
          x1={25}
          y1={32}
          x2={39}
          y2={32}
          stroke="var(--ink)"
          strokeWidth={2.1}
          strokeLinecap="round"
        />
        {[27.8, 30.6, 33.4, 36.2].map((x) => (
          <line
            key={x}
            x1={x}
            y1={28}
            x2={x}
            y2={36}
            stroke="var(--ink)"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
