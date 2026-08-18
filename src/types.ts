/** One way of saying a name. A name may legitimately have several. */
export interface Pronunciation {
  /** Shown on the button when there is more than one, e.g. "Portuguese". */
  label?: string | undefined;
  /** BCP 47 tag, e.g. "pt-BR". Used to pick a speech voice and to mark up the audio. */
  lang?: string | undefined;
  /** URL of a recording. The best answer there is — always preferred over synthesis. */
  audio?: string | undefined;
  /** International Phonetic Alphabet, with or without the surrounding slashes. */
  ipa?: string | undefined;
  /** Dictionary-style respelling for humans to read, e.g. "zhah-EEL-sown". */
  respell?: string | undefined;
  /**
   * What the speech synthesizer is actually given. Defaults to the name itself.
   * Set this when the spelled name makes the synthesizer say the wrong thing.
   */
  ttsText?: string | undefined;
  /** Preferred voice name, e.g. "Luciana". Falls back to the best match for `lang`. */
  voice?: string | undefined;
  /**
   * True when `audio` is a synthesized voice rather than a recording of a person.
   *
   * A generated clip is a perfectly good answer — but the widget must never let it pass
   * for someone's own voice, so this marks the button the same way live synthesis is.
   */
  synthetic?: boolean | undefined;
}

/** How the widget is allowed to use speech synthesis. */
export type TtsPolicy =
  /** Never synthesize. Recordings only. */
  | 'off'
  /** Synthesize only when a pronunciation has no recording. The default. */
  | 'fallback'
  /** Always offer synthesis, alongside any recording. */
  | 'on';

/** How the written pronunciation is displayed next to the name. */
export type DisplayMode = 'none' | 'inline' | 'ruby' | 'tooltip';
