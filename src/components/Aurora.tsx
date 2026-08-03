/**
 * The atmosphere layer.
 *
 * Four drifting radial fields (three gold/amber, one azure for depth), a faint
 * conic shaft of volumetric light from above, a fine measurement grid, and a
 * film-grain layer. Together they turn a flat black page into something with
 * air in it.
 *
 * Deliberately CSS-only — no canvas, no rAF loop. This sits behind a board that
 * can render 649 rows, and a JS-driven background would compete with scrolling
 * for the main thread. `will-change: transform` keeps the blobs on the
 * compositor.
 *
 * Server component: it has no state and no interactivity.
 */

export function Aurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base wash — keeps the corners from reading as flat black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 85% at 50% -12%, rgba(255,194,75,0.13), transparent 62%), " +
            "radial-gradient(100% 65% at 50% 112%, rgba(94,200,255,0.07), transparent 68%)",
        }}
      />

      {/* Drifting fields. */}
      <div
        className="aurora-layer absolute -top-[20%] -left-[15%] h-[70vh] w-[70vw] rounded-full opacity-75 blur-[95px]"
        style={{
          background:
            "radial-gradient(circle, rgba(255,194,75,0.34), transparent 66%)",
          animation: "aurora-drift-a 26s ease-in-out infinite",
          willChange: "transform",
        }}
      />
      <div
        className="aurora-layer absolute top-[25%] -right-[20%] h-[65vh] w-[65vw] rounded-full opacity-65 blur-[105px]"
        style={{
          background:
            "radial-gradient(circle, rgba(214,148,52,0.32), transparent 66%)",
          animation: "aurora-drift-b 32s ease-in-out infinite",
          willChange: "transform",
        }}
      />
      <div
        className="aurora-layer absolute -bottom-[25%] left-[15%] h-[60vh] w-[60vw] rounded-full opacity-60 blur-[115px]"
        style={{
          background:
            "radial-gradient(circle, rgba(94,200,255,0.24), transparent 68%)",
          animation: "aurora-drift-c 38s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Volumetric shaft from the top edge. */}
      <div
        className="absolute inset-x-0 top-0 h-[65vh] opacity-40"
        style={{
          background:
            "conic-gradient(from 200deg at 50% -20%, transparent 0deg, rgba(255,217,138,0.18) 25deg, transparent 55deg)",
        }}
      />

      {/* Measurement grid — the trading-desk cue. */}
      <div
        className="absolute inset-0 opacity-[0.32]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,194,75,0.075) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(255,194,75,0.075) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 75%)",
        }}
      />

      {/* Film grain. Inline SVG turbulence — no asset request. */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.16]">
        <filter id="vault-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vault-grain)" />
      </svg>

      {/* Centre scrim: the content column runs down the middle, so the
          atmosphere is damped exactly where text sits and left bright at the
          margins. Without this the gold wash eats the low-contrast labels. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(8,6,10,0.55) 22%, rgba(8,6,10,0.62) 50%, rgba(8,6,10,0.55) 78%, transparent 100%)",
        }}
      />

      {/* Vignette. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(135% 100% at 50% 35%, transparent 38%, rgba(8,6,10,0.72) 100%)",
        }}
      />
    </div>
  );
}
