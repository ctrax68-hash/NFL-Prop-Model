import styles from "./SplashScreen.module.css";

/**
 * Full-viewport launch splash for a fresh page load (the browser-tab
 * equivalent of the iOS `apple-touch-startup-image` in `splash/[dims]`,
 * which only ever renders inside the installed home-screen app). Pure CSS,
 * no client JS: the overlay animates itself out via `animation-fill-mode:
 * forwards` so it disappears even with JS disabled, and is `pointer-events:
 * none` from the very first frame so it can never block a real click even
 * on a slow device. `prefers-reduced-motion` gets a plain instant fade
 * instead of the pulse/shine/progress choreography.
 */
export function SplashScreen() {
  return (
    <div className={styles.overlay} aria-hidden role="presentation">
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
  );
}
