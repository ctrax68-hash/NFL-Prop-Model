"use client";

import { useEffect, useRef } from "react";

import styles from "./SplashScreen.module.css";

/** Held on screen at least this long once the page is actually showing. */
const MIN_VISIBLE_MS = 1400;
/** How long to wait for `load` before treating the page as shown anyway, so a
 * slow headshot image can't hold the splash over already-rendered content. */
const LOAD_WAIT_CAP_MS = 3000;
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
 * Dismissal is anchored to the page being seen, not to a fixed CSS timer
 * from first style: an installed iOS app keeps its own launch screen up until
 * the document has fully loaded (a screen recording showed the Board appear
 * already hydrated, ticker and all, straight out of the white launch screen),
 * and a force-dynamic page here can take several seconds to arrive — so a
 * timer that starts when the CSS applies has expired before anyone can see
 * the page. It therefore waits for `load` (capped) and for the document to be
 * visible, then holds a minimum. Rendered server-side so it is in the first
 * paint, `pointer-events: none` from the first frame so it can never block a
 * click, and hidden entirely under `<noscript>` since without JS nothing
 * could dismiss it. A CSS-only failsafe still cuts it at 7s in case
 * hydration itself fails.
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

    if (document.readyState === "complete") {
      shown();
    } else {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        shown();
      };
      later(settle, isStandalone() ? STANDALONE_LOAD_WAIT_CAP_MS : LOAD_WAIT_CAP_MS);
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
