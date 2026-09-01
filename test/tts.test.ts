import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickVoice, type VoiceLike } from '../src/tts.js';

const voice = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({
  name,
  lang,
  ...extra,
});

const VOICES: VoiceLike[] = [
  voice('Samantha', 'en-US', { localService: true, default: true }),
  voice('Daniel', 'en-GB', { localService: true }),
  voice('Google US English', 'en-US'),
  voice('Luciana', 'pt-BR', { localService: true }),
  voice('Joana', 'pt-PT', { localService: true }),
];

describe('pickVoice', () => {
  it('prefers an exact language match', () => {
    expect(pickVoice(VOICES, { lang: 'pt-BR' })?.name).toBe('Luciana');
  });

  it('falls back to the same primary language when the region differs', () => {
    // Only pt-PT is installed; a Portuguese voice beats no voice at all.
    const withoutBrazilian = VOICES.filter((v) => v.lang !== 'pt-BR');
    expect(pickVoice(withoutBrazilian, { lang: 'pt-BR' })?.name).toBe('Joana');
  });

  it('never crosses into the wrong language', () => {
    const englishOnly = VOICES.filter((v) => v.lang.startsWith('en'));
    // An English voice reading a Brazilian name is exactly the failure this prevents.
    expect(pickVoice(englishOnly, { lang: 'pt-BR' })).toBeNull();
  });

  it('honours an explicitly named voice', () => {
    expect(pickVoice(VOICES, { lang: 'en-US', voice: 'Daniel' })?.name).toBe('Daniel');
  });

  it('matches a named voice case-insensitively and by substring', () => {
    expect(pickVoice(VOICES, { voice: 'google us' })?.name).toBe('Google US English');
  });

  it('ignores a named voice the machine does not have, and still matches the language', () => {
    expect(pickVoice(VOICES, { lang: 'pt-BR', voice: 'Nonexistent' })?.name).toBe('Luciana');
  });

  it('prefers local voices over remote ones at the same language', () => {
    const both = [voice('Remote US', 'en-US'), voice('Local US', 'en-US', { localService: true })];
    expect(pickVoice(both, { lang: 'en-US' })?.name).toBe('Local US');
  });

  it('normalizes underscore-style and mixed-case language tags', () => {
    expect(pickVoice(VOICES, { lang: 'PT_br' })?.name).toBe('Luciana');
  });

  it('returns null when there are no voices at all', () => {
    expect(pickVoice([], { lang: 'en-US' })).toBeNull();
  });

  it('picks something sensible when no language is requested', () => {
    expect(pickVoice(VOICES, {})?.name).toBe('Samantha');
  });
});

describe('speak', () => {
  /**
   * A fresh module per case: the voice list is cached the first time it is read, which is
   * the point of it — but it means one test's machine cannot leak into the next.
   */
  const withVoices = async (voices: VoiceLike[]) => {
    vi.resetModules();
    const spoken: { text: string; voice: VoiceLike | null }[] = [];
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        voice: VoiceLike | null = null;
        lang = '';
        rate = 1;
        constructor(public text: string) {}
      },
    );
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => voices,
      cancel: () => undefined,
      speak: (utterance: { text: string; voice: VoiceLike | null }) => spoken.push(utterance),
    });
    return { tts: await import('../src/tts.js'), spoken };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays silent rather than let the wrong language have a go at the name', async () => {
    const { tts, spoken } = await withVoices(VOICES.filter((v) => v.lang.startsWith('en')));
    const onerror = vi.fn();

    tts.speak('Jailson', { lang: 'pt-BR' }, { onerror });

    // Unassigned, the utterance falls to the system default and reads a Brazilian name in
    // English — the exact failure this component exists to prevent.
    expect(spoken).toEqual([]);
    expect(onerror).toHaveBeenCalledOnce();
  });

  it('speaks in the matching voice when the machine has one', async () => {
    const { tts, spoken } = await withVoices(VOICES);

    tts.speak('Jailson', { lang: 'pt-BR' }, {});

    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.voice?.name).toBe('Luciana');
  });
});
