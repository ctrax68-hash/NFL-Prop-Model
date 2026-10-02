"use client";

/**
 * The top-level error boundary — the only one that can catch a throw in the
 * root layout itself (where `BetSlipProvider`, `Nav` and `TabBar` all live).
 * Next requires this file to render its own `<html>`/`<body>`, since it
 * replaces the entire page when it's active; it can't assume `globals.css`,
 * fonts or any provider actually mounted, since the thing that crashed may
 * have been one of those. Kept deliberately minimal and inline-styled.
 *
 * Without this (and `error.tsx` for page-level throws), an uncaught client
 * exception anywhere had no boundary to catch it at all — React would detach
 * from the already-painted server HTML with nothing left listening for taps,
 * which looks exactly like a frozen, unresponsive page with no explanation
 * and no way to recover short of reinstalling the app.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // `reset()` only re-renders the boundary's own subtree with the same
  // in-memory app state — if whatever threw is still sitting in that state
  // (e.g. corrupted data that gets re-read on every mount), it would just
  // throw again immediately. A full reload re-runs everything from scratch,
  // which is the more reliable recovery for a failure with no known cause.
  void error;
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          background: "#05080f",
          color: "#e8ecf4",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.5,
            color: "#9aa4b8",
            margin: 0,
            maxWidth: "320px",
          }}
        >
          The app hit an error it couldn&apos;t recover from on its own.
          Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            minHeight: "44px",
            padding: "0 20px",
            borderRadius: "999px",
            border: "none",
            background: "#ffc24b",
            color: "#04101f",
            fontWeight: 700,
            fontSize: "14px",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
