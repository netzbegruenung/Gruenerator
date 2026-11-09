/**
 * Eine Frist für einen ganzen Werkzeugaufruf, die jede Stufe aus der Restzeit
 * speist, statt dass jede Stufe einen festen Anteil bekommt: Titelsuche und
 * Volltext-Rückfall liefen nacheinander und summierten sich über die
 * Werkzeugfrist (#5565). `signal` bricht alles ab, was ihn bekommt; `dispose`
 * gehört in ein `finally`, damit kein Timer den Prozess hält.
 */
export class Deadline {
  readonly #controller = new AbortController();
  readonly #endsAt: number;
  readonly #timer: ReturnType<typeof setTimeout>;

  constructor(totalMs: number) {
    this.#endsAt = Date.now() + totalMs;
    this.#timer = setTimeout(() => this.#controller.abort(), totalMs);
    this.#timer.unref?.();
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  /** Verbleibende Millisekunden, nie negativ. */
  remainingMs(): number {
    return Math.max(0, this.#endsAt - Date.now());
  }

  dispose(): void {
    clearTimeout(this.#timer);
  }
}
