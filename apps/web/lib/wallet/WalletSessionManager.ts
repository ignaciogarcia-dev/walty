/**
 * WalletSessionManager
 *
 * Manages auto-lock: 2-min idle timer + visibility-change lock (prod only).
 * Pure service — no React state, no hooks.
 */

export interface WalletSessionConfig {
  timeoutMs: number;
  onLock: () => void;
  isProd: boolean;
}

export class WalletSessionManager {
  private config: WalletSessionConfig;
  private timerRef: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WalletSessionConfig) {
    this.config = config;
  }

  private scheduleTimeout(): void {
    this.clearTimeout();
    this.timerRef = setTimeout(() => {
      this.config.onLock();
    }, this.config.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timerRef) {
      globalThis.clearTimeout(this.timerRef);
      this.timerRef = null;
    }
  }

  private resetTimer(): void {
    this.scheduleTimeout();
  }

  private attachActivityListeners(): () => void {
    const events = ["mousemove", "keydown", "click", "touchstart"] as const;
    const listener = () => this.resetTimer();

    for (const event of events) {
      window.addEventListener(event, listener, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, listener);
      }
    };
  }

  private attachVisibilityListener(): () => void {
    if (!this.config.isProd) return () => {};

    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibility = () => {
      if (document.hidden) {
        // Lock only after staying hidden for 3s — prevents spurious re-locks
        // from transient hides (OS notifications, quick tab switches).
        if (!hideTimer) {
          hideTimer = setTimeout(() => {
            hideTimer = null;
            this.config.onLock();
          }, 3_000);
        }
      } else {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
  }

  /**
   * Start the session: schedule timeout + attach listeners.
   * @returns Cleanup function
   */
  startSession(): () => void {
    this.scheduleTimeout();

    const cleanupActivity = this.attachActivityListeners();
    const cleanupVisibility = this.attachVisibilityListener();

    return () => {
      this.clearTimeout();
      cleanupActivity();
      cleanupVisibility();
    };
  }
}

export function createWalletSessionManager(
  config: WalletSessionConfig,
): WalletSessionManager {
  return new WalletSessionManager(config);
}
