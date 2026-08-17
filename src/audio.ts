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

  play(src: string, handlers: PlayHandlers = {}): void {
    this.stop();
    cancelSpeech();

    // Created lazily and never preloaded: a pronunciation clip is not worth a request
    // on every page load, and most visitors never press the button.
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = src;
    this.#audio = audio;

    audio.addEventListener('playing', () => handlers.onstart?.(), { once: true });
    audio.addEventListener('ended', () => handlers.onend?.(), { once: true });
    audio.addEventListener(
      'error',
      () => handlers.onerror?.(audio.error ?? new Error(`could not load ${src}`)),
      { once: true },
    );

    // Rejects if the file is missing or the browser blocks playback.
    void audio.play().catch((err: unknown) => handlers.onerror?.(err));
  }

  stop(): void {
    if (!this.#audio) return;
    this.#audio.pause();
    this.#audio.src = '';
    this.#audio = null;
  }
}
