/**
 * WalletSessionManager
 *
 * Manages auto-lock timers and activity listeners.
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

    const handleVisibility = () => {
      if (document.hidden) {
        this.config.onLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
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
