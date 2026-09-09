"use client";

import { useEffect, useRef } from "react";

import styles from "./SplashScreen.module.css";

/** Held on screen at least this long once the page is actually showing. */
const MIN_VISIBLE_MS = 1400;
/** Installed to the home screen the OS launch screen covers the page until
 * `load`, so waiting longer for it costs nothing and giving up early would
 * dismiss the splash before anyone could see it. */
const STANDALONE_LOAD_WAIT_CAP_MS = 10000;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Full-viewport launch splash for a fresh page load — the browser-tab
 * counterpart of the iOS `apple-touch-startup-image` in `splash/[dims]`,
 * which only renders inside the installed home-screen app.
 *
 * Two different dismissal strategies, because "when can the user actually see
 * this" is answered differently in each context:
 *
 *   - Installed as a home-screen app, the OS's own native launch screen
 *     covers the page until `load` fires (a screen recording showed the
 *     Board appear already hydrated, ticker and all, straight out of the
 *     white OS screen), and a force-dynamic page here can take several
 *     seconds to arrive — so a timer counting from first style, while still
 *     hidden behind that OS screen, can finish and fade before the OS screen
 *     ever lifts. This path waits for `load` (capped) before holding.
 *   - In a plain browser tab there is no such OS overlay: first paint is
 *     already what the user sees, so there is nothing to wait for. Gating
 *     dismissal on `load` here only adds a dependency on exactly when
 *     third-party resources (e.g. remote player headshots) finish, which
 *     doesn't protect against anything real in this context and was the
 *     likely cause of the splash intermittently not being visible in Safari.
 *     This path holds from mount.
 *
 * Both paths still respect `document.visibilityState` (a tab opened in the
 * background doesn't burn its hold time unseen). Rendered server-side so it
 * is in the first paint, `pointer-events: none` from the first frame so it
 * can never block a click, and hidden entirely under `<noscript>` since
 * without JS nothing could dismiss it. A CSS-only failsafe still cuts it at
 * 15s in case hydration itself fails.
 */
export function SplashScreen() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cleanups: Array<() => void> = [];
    const later = (fn: () => void, ms: number) => {
      const t = window.setTimeout(fn, ms);
      cleanups.push(() => window.clearTimeout(t));
    };
    const once = (
      target: Window | Document,
      event: string,
      fn: () => void,
    ) => {
      target.addEventListener(event, fn);
      cleanups.push(() => target.removeEventListener(event, fn));
    };

    const dismiss = () => el.classList.add(styles.done);

    const whenVisible = (fn: () => void) => {
      if (document.visibilityState !== "hidden") return fn();
      const onChange = () => {
        if (document.visibilityState === "hidden") return;
        document.removeEventListener("visibilitychange", onChange);
        fn();
      };
      once(document, "visibilitychange", onChange);
    };

    const shown = () => whenVisible(() => later(dismiss, MIN_VISIBLE_MS));

    if (!isStandalone()) {
      // Nothing can be covering a plain browser tab's first paint — hold
      // from mount instead of waiting on `load`.
      shown();
    } else if (document.readyState === "complete") {
      shown();
    } else {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        shown();
      };
      later(settle, STANDALONE_LOAD_WAIT_CAP_MS);
      once(window, "load", settle);
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <>
      <noscript>
        <style>{`.${styles.overlay}{display:none}`}</style>
      </noscript>
      <div ref={ref} className={styles.overlay} aria-hidden role="presentation">
        <div className={styles.stage}>
          <div className={styles.glow} />
          <div className={styles.markWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/helmet-512.png" alt="" className={styles.mark} />
            <div className={styles.shine} />
          </div>
          <div className={styles.wordmark}>NFL EDGE</div>
          <div className={styles.tagline}>LOADING PROJECTIONS</div>
          <div className={styles.track}>
            <div className={styles.fill} />
          </div>
        </div>
      </div>
    </>
  );
}
