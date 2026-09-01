import { cancelSpeech } from './tts.js';

export interface PlayHandlers {
  onstart?: () => void;
  onend?: () => void;
  onerror?: (err: unknown) => void;
}

/**
 * Plays one recording at a time.
 *
 * Single-flight on purpose: clicking a second pronunciation while the first is still
 * going should replace it, not talk over it. Speech synthesis is cancelled too, since
 * the two share the same "is this widget making noise" state.
 */
export class NamePlayer {
  #audio: HTMLAudioElement | null = null;
  #detach: AbortController | null = null;

  /** How far through the clip we are, 0–1, or null while the duration is unknown. */
  get progress(): number | null {
    const audio = this.#audio;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return null;
    return Math.min(audio.currentTime / audio.duration, 1);
  }

  play(src: string, handlers: PlayHandlers = {}): void {
    this.stop();
    cancelSpeech();

    // Created lazily and never preloaded: a pronunciation clip is not worth a request
    // on every page load, and most visitors never press the button.
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = src;

    // Every listener hangs off this signal so `#release` can detach them all at once,
    // *before* the element is torn down. Tearing down provokes a stray `error` event;
    // left connected, it used to reach `onerror` and start a synthesized voice over the
    // top of the clip the next press had already begun.
    const detach = new AbortController();
    const on = (type: string, fn: () => void) =>
      audio.addEventListener(type, fn, { signal: detach.signal });

    this.#audio = audio;
    this.#detach = detach;

    on('playing', () => handlers.onstart?.());
    on('ended', () => {
      this.#release();
      handlers.onend?.();
    });
    on('error', () => {
      const err = audio.error ?? new Error(`could not load ${src}`);
      this.#release();
      handlers.onerror?.(err);
    });

    // Rejects if the file is missing or the browser blocks playback. A rejection caused
    // by our own `stop()` arrives after the signal is aborted, and is not a failure.
    void audio.play().catch((err: unknown) => {
      if (detach.signal.aborted) return;
      this.#release();
      handlers.onerror?.(err);
    });
  }

  /** Silence whatever is playing. Handlers are detached, so nothing is reported. */
  stop(): void {
    this.#release();
  }

  #release(): void {
    const audio = this.#audio;
    this.#detach?.abort();
    this.#detach = null;
    this.#audio = null;
    if (!audio) return;
    audio.pause();
    // Frees the decoded buffer. `removeAttribute` rather than `src = ''`, which resolves
    // to the page URL and makes the browser try to play the HTML document.
    audio.removeAttribute('src');
    audio.load();
  }
}
