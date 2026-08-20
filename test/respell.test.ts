import { describe, expect, it } from 'vitest';
import { respellFromIpa } from '../src/respell.js';

describe('respellFromIpa', () => {
  it('sounds out consonants an English reader would otherwise guess at', () => {
    expect(respellFromIpa('ʒa')).toBe('zhah');
    expect(respellFromIpa('ʃu')).toBe('shoo');
    expect(respellFromIpa('θɪ')).toBe('thih');
    expect(respellFromIpa('dʒo')).toBe('joh');
    expect(respellFromIpa('tʃa')).toBe('chah');
  });

  it('capitalises the stressed syllable, the way a dictionary does', () => {
    // ma-REE-ah: stress lands on the second syllable.
    expect(respellFromIpa('maˈria')).toBe('mah-REE-ah');
  });

  it('leaves a single syllable alone rather than shouting it', () => {
    expect(respellFromIpa('ˈdʒon')).toBe('john');
  });

  it('accepts the slashes and brackets authors write around IPA', () => {
    expect(respellFromIpa('/ʒa/')).toBe('zhah');
    expect(respellFromIpa('[ʒa]')).toBe('zhah');
  });

  it('renders nasal vowels with a trailing ng, the closest English cue', () => {
    // Portuguese õ has no English equivalent; "ohng" at least points the right way.
    expect(respellFromIpa('sõ')).toBe('sohng');
  });

  it('ignores length marks, tie bars and stray joiners', () => {
    expect(respellFromIpa('iː')).toBe('ee');
    expect(respellFromIpa('d͡ʒo')).toBe('joh');
    expect(respellFromIpa('t‍ʃa')).toBe('chah');
  });

  it('handles English diphthongs as single sounds', () => {
    expect(respellFromIpa('maɪ')).toBe('meye');
    expect(respellFromIpa('naʊ')).toBe('now');
    expect(respellFromIpa('deɪ')).toBe('day');
  });

  it('starts a new syllable at a single intervening consonant', () => {
    // ah-mee, not ahm-ee: English respellings favour an onset.
    expect(respellFromIpa('ami')).toBe('ah-mee');
  });

  it('splits a consonant cluster between the two syllables', () => {
    expect(respellFromIpa('anta')).toBe('ahn-tah');
  });

  it('returns empty for input with nothing to convert', () => {
    expect(respellFromIpa('')).toBe('');
    expect(respellFromIpa('   ')).toBe('');
    expect(respellFromIpa('???')).toBe('');
  });

  it("converts eSpeak's reading of the author's own name", () => {
    // What `espeak-ng --ipa -v pt-br Jailson` actually emits, stress marks and all.
    const respelling = respellFromIpa('ʒˌaˈiʊsoŋ');
    expect(respelling).toMatch(/^zhah-/);
    expect(respelling).toMatch(/-/); // multi-syllable
    expect(respelling.toLowerCase()).toContain('zh');
  });
});
