import { describe, expect, it, vi } from 'vitest';
import {
  buttonLabel,
  formatIpa,
  normalizeName,
  parsePronunciations,
  speechTextFor,
  writtenForm,
} from '../src/phonetics.js';

describe('formatIpa', () => {
  it('adds the phonemic slashes readers expect', () => {
    expect(formatIpa('ʒaˈiwsõ')).toBe('/ʒaˈiwsõ/');
  });

  it('leaves author-supplied delimiters alone', () => {
    expect(formatIpa('/ʒaˈiwsõ/')).toBe('/ʒaˈiwsõ/');
    expect(formatIpa('[ʒaˈiwsõ]')).toBe('[ʒaˈiwsõ]');
  });

  it('returns empty for blank input rather than a stray pair of slashes', () => {
    expect(formatIpa('   ')).toBe('');
  });
});

describe('speechTextFor', () => {
  it('says the name itself by default', () => {
    // Not the respelling: "zhah-EEL-sown" handed to a Portuguese voice is nonsense.
    expect(speechTextFor({ respell: 'zhah-EEL-sown' }, 'Jailson')).toBe('Jailson');
  });

  it('uses tts-text when the author overrides it', () => {
    expect(speechTextFor({ ttsText: 'Jay ill sun' }, 'Jailson')).toBe('Jay ill sun');
  });

  it('ignores a blank override', () => {
    expect(speechTextFor({ ttsText: '  ' }, 'Jailson')).toBe('Jailson');
  });
});

describe('buttonLabel', () => {
  it('reads as a sentence', () => {
    expect(buttonLabel('Jailson', {}, { synthesized: false, showLabel: false })).toBe(
      'Hear how to pronounce Jailson',
    );
  });

  it('says outright when the voice is synthesized', () => {
    expect(buttonLabel('Jailson', {}, { synthesized: true, showLabel: false })).toBe(
      'Hear how to pronounce Jailson (synthesized voice)',
    );
  });

  it('names the variant when there is more than one', () => {
    expect(
      buttonLabel('Jailson', { label: 'Portuguese' }, { synthesized: false, showLabel: true }),
    ).toBe('Hear how to pronounce Jailson — Portuguese');
  });
});

describe('writtenForm', () => {
  it('joins respelling and IPA', () => {
    expect(writtenForm({ respell: 'zhah-EEL-sown', ipa: 'ʒaˈiwsõ' })).toBe(
      'zhah-EEL-sown · /ʒaˈiwsõ/',
    );
  });

  it('degrades to whichever one exists', () => {
    expect(writtenForm({ respell: 'zhah-EEL-sown' })).toBe('zhah-EEL-sown');
    expect(writtenForm({ ipa: 'ʒaˈiwsõ' })).toBe('/ʒaˈiwsõ/');
    expect(writtenForm({})).toBe('');
  });
});

describe('normalizeName', () => {
  it('collapses the whitespace HTML indentation leaves behind', () => {
    expect(normalizeName('\n      Jailson\n    ')).toBe('Jailson');
  });
});

describe('parsePronunciations', () => {
  const el = (html: string): Element => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as Element;
  };

  it('reads a single pronunciation from attributes', () => {
    const parsed = parsePronunciations(
      el('<x-n audio="/a.opus" ipa="ʒaˈiwsõ" respell="zhah-EEL-sown" lang="pt-BR">Jailson</x-n>'),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      audio: '/a.opus',
      ipa: 'ʒaˈiwsõ',
      respell: 'zhah-EEL-sown',
      lang: 'pt-BR',
    });
  });

  it('reads the synthetic flag as a boolean attribute', () => {
    expect(parsePronunciations(el('<x-n audio="/a.wav" synthetic>Jailson</x-n>'))[0]?.synthetic)
      .toBe(true);
    expect(
      parsePronunciations(el('<x-n audio="/a.wav" synthetic="true">Jailson</x-n>'))[0]?.synthetic,
    ).toBe(true);
    // An explicit "false" opts out, the way a reader would expect it to.
    expect(
      parsePronunciations(el('<x-n audio="/a.wav" synthetic="false">Jailson</x-n>'))[0]?.synthetic,
    ).toBe(false);
    expect(parsePronunciations(el('<x-n audio="/a.wav">Jailson</x-n>'))[0]?.synthetic).toBe(false);
  });

  it('reads several pronunciations from the inner JSON block', () => {
    const parsed = parsePronunciations(
      el(`<x-n>Jailson<script type="application/json">
        [{"label":"Portuguese","lang":"pt-BR","audio":"/pt.opus"},
         {"label":"Anglicized","lang":"en-CA","audio":"/en.opus"}]
      </script></x-n>`),
    );
    expect(parsed).toHaveLength(2);
    expect(parsed.map((p) => p.label)).toEqual(['Portuguese', 'Anglicized']);
  });

  it('accepts a bare object as well as an array', () => {
    const parsed = parsePronunciations(
      el('<x-n>Jailson<script type="application/json">{"lang":"pt-BR"}</script></x-n>'),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.lang).toBe('pt-BR');
  });

  it('falls back to attributes when the JSON is malformed, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parsed = parsePronunciations(
      el('<x-n respell="zhah-EEL-sown">Jailson<script type="application/json">{oops</script></x-n>'),
    );
    // A broken pronunciation widget must not take the surrounding page down with it.
    expect(parsed[0]?.respell).toBe('zhah-EEL-sown');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores a JSON block belonging to a nested element', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<x-n respell="mine">Jailson<span><script type="application/json">[{"label":"theirs"}]</script></span></x-n>';
    const parsed = parsePronunciations(host.firstElementChild as Element);
    expect(parsed[0]?.respell).toBe('mine');
  });
});
