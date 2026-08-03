"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero numerals that animate up on mount.
 *
 * Two things worth noting:
 *  - It starts at the FINAL value, not zero. The server renders the real
 *    number, so there is no flash of "0" before hydration and no layout shift;
 *    the animation only starts once the effect runs on the client.
 *  - Under `prefers-reduced-motion` it never animates at all.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  durationMs = 900,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out quint: fast arrival, long settle. Reads as precise rather
      // than bouncy, which suits numbers people are about to bet on.
      const eased = 1 - Math.pow(1 - t, 5);
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
