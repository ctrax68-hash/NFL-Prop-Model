"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

/**
 * Player headshot with an initials fallback.
 *
 * The fallback has to be driven by a load error, not just a missing URL:
 * nflverse supplies a headshot URL for nearly every player, but the CDN can be
 * unreachable (offline, blocked network, a stale asset), and a bare <img> fails
 * to an empty circle with no hint of who the row belongs to.
 */
export function PlayerAvatar({
  url,
  name,
  size = 40,
  className,
}: {
  url: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // `onError` alone is not enough. The markup is server-rendered, so the
  // browser starts (and can finish failing) the image request before React
  // hydrates and attaches the handler — the error event has already fired and
  // never fires again, leaving a blank circle. A finished-but-zero-width image
  // is the reliable signal that it failed, so check for it once on mount.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const showImage = url && !failed;

  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-full bg-[var(--obsidian-3)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span
          className="grid size-full place-items-center font-semibold text-[var(--ink-mute)]"
          style={{ fontSize: Math.max(10, size * 0.32) }}
          aria-hidden
        >
          {initials}
        </span>
      )}
    </div>
  );
}
