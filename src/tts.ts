/**
 * Speech synthesis, with the browser's rough edges sanded off.
 *
 * Two things drive the shape of this file:
 *
 * 1. The Web Speech API cannot be told how to pronounce a word. SSML `<phoneme>` is
 *    unsupported across engines, and on macOS the markup is read aloud as literal text
 *    rather than stripped. So we only ever hand it plain text — never IPA.
 * 2. Voice lists load asynchronously in Chrome but must be read synchronously inside the
 *    click handler, because iOS Safari only permits speech during a user gesture and an
 *    `await` in between forfeits it. Hence the eagerly-primed cache below.
 */

/** The parts of SpeechSynthesisVoice this module needs — kept narrow so it can be tested. */
export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

export interface SpeakOptions {
  lang?: string | undefined;
  voice?: string | undefined;
  rate?: number | undefined;
}

export interface SpeakHandlers {
  onstart?: () => void;
  onend?: () => void;
  onerror?: (err: unknown) => void;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let primed = false;

export function speechSupported(): boolean {
  return typeof globalThis.speechSynthesis !== 'undefined';
}

/**
 * Start loading voices now so they are available synchronously later.
 *
 * Chrome returns an empty list on first call and fires `voiceschanged` once the list is
 * ready; every other engine populates it immediately. Safe to call repeatedly.
 */
export function primeVoices(): void {
  if (primed || !speechSupported()) return;
  primed = true;

  const read = () => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) cachedVoices = voices;
  };

  read();
  speechSynthesis.addEventListener?.('voiceschanged', read);

  // Speech keeps going after a navigation or tab switch otherwise, which is startling.
  const stop = () => cancelSpeech();
  globalThis.addEventListener?.('pagehide', stop);
  globalThis.addEventListener?.('beforeunload', stop);
  document?.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
  });
}

/** The voice list as known right now. Never awaits — see the note at the top. */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  if (!cachedVoices.length) {
    const voices = speechSynthesis.getVoices();
    if (voices.length) cachedVoices = voices;
  }
  return cachedVoices;
}

function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Pick the best voice for a language, or null when the browser has nothing suitable.
 *
 * Returning null is a feature: the caller hides the speak button rather than rendering a
 * control that would confidently mispronounce someone's name in the wrong language.
 */
export function pickVoice(
  voices: readonly VoiceLike[],
  opts: { lang?: string | undefined; voice?: string | undefined } = {},
): VoiceLike | null {
  if (!voices.length) return null;

  // An explicitly named voice wins outright, if the machine actually has it.
  if (opts.voice) {
    const wanted = opts.voice.trim().toLowerCase();
    const exact = voices.find((v) => v.name.toLowerCase() === wanted);
    if (exact) return exact;
    const partial = voices.find((v) => v.name.toLowerCase().includes(wanted));
    if (partial) return partial;
  }

  const score = (v: VoiceLike): number => {
    let points = 0;
    if (opts.lang) {
      const want = normalizeLang(opts.lang);
      const have = normalizeLang(v.lang);
      if (have === want) points += 100;
      else if (have.split('-')[0] === want.split('-')[0]) points += 50;
      else return -1; // wrong language entirely — never acceptable for a name
    }
    if (v.localService) points += 5; // offline, and usually the better-quality one
    if (v.default) points += 2;
    return points;
  };

  let best: VoiceLike | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const points = score(voice);
    if (points > bestScore) {
      best = voice;
      bestScore = points;
    }
  }
  return bestScore < 0 ? null : best;
}

/** True when this browser can plausibly say something in `lang`. */
export function canSpeak(lang?: string): boolean {
  if (!speechSupported()) return false;
  const voices = getVoices();
  // An empty list means the engine has not reported yet. Chrome fills it after
  // `voiceschanged`; assuming "yes" here beats hiding a button that would have worked.
  if (!voices.length) return true;
  return pickVoice(voices, { lang }) !== null;
}

export function cancelSpeech(): void {
  if (speechSupported()) speechSynthesis.cancel();
}

/** Speak `text`. Must be called synchronously from a user gesture to work on iOS. */
export function speak(text: string, opts: SpeakOptions, handlers: SpeakHandlers = {}): void {
  if (!speechSupported()) {
    handlers.onerror?.(new Error('speech synthesis unavailable'));
    return;
  }

  // Clears anything stuck in the queue; a no-op when idle.
  speechSynthesis.cancel();

  const voices = getVoices();
  const voice = pickVoice(voices, { lang: opts.lang, voice: opts.voice });

  // Refuse rather than let the default voice have a go. Without a voice assigned, most
  // engines fall back to the system default and read a Brazilian name in English — the
  // exact failure this component exists to prevent. Silence is the better answer.
  // (An empty list means the engine has not reported yet; `utterance.lang` still steers
  // it, and on iOS this is the only path that works inside the first user gesture.)
  if (!voice && voices.length) {
    handlers.onerror?.(new Error(`no voice available for ${opts.lang ?? 'this name'}`));
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) utterance.voice = voice as SpeechSynthesisVoice;
  if (opts.lang) utterance.lang = opts.lang;
  // Names are short and often unfamiliar; a touch slower than default lands better.
  utterance.rate = opts.rate ?? 0.9;

  utterance.onstart = () => handlers.onstart?.();
  utterance.onend = () => handlers.onend?.();
  utterance.onerror = (event) => {
    // Cancelling mid-utterance fires an error; that is us, not a failure worth reporting.
    if (event.error === 'canceled' || event.error === 'interrupted') {
      handlers.onend?.();
      return;
    }
    handlers.onerror?.(event);
  };

  speechSynthesis.speak(utterance);
}
