/**
 * Turn IPA into a dictionary-style respelling an English reader can sound out:
 * `ʒaˈiwsõ` becomes something like `zhah-EE-soh(ng)`.
 *
 * This is deliberately approximate. A respelling is a reading aid, not a transcription —
 * it trades precision for being legible to someone who has never seen IPA. The output is
 * always a starting point the author is expected to edit.
 *
 * MIT, like the rest of `src/`. The studio loads it, but it contains no GPL code and needs
 * no speech engine: it is a pure string function.
 */

/** Multi-character IPA sequences, tried before single characters. */
const DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  // affricates
  ['tʃ', 'ch'],
  ['dʒ', 'j'],
  ['ts', 'ts'],
  ['dz', 'dz'],
  // English diphthongs
  ['aɪ', 'eye'],
  ['aʊ', 'ow'],
  ['eɪ', 'ay'],
  ['oʊ', 'oh'],
  ['əʊ', 'oh'],
  ['ɔɪ', 'oy'],
  ['ɪə', 'eer'],
  ['eə', 'air'],
  ['ʊə', 'oor'],
  // long vowels written with the length mark
  ['iː', 'ee'],
  ['uː', 'oo'],
  ['ɑː', 'ah'],
  ['ɔː', 'aw'],
  ['ɜː', 'ur'],
  ['eː', 'ay'],
  ['oː', 'oh'],
  ['aː', 'ah'],
];

/** Single IPA characters. Anything missing falls through unchanged. */
const SINGLES: Readonly<Record<string, string>> = {
  // consonants
  p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'g', ɡ: 'g',
  f: 'f', v: 'v', s: 's', z: 'z', h: 'h',
  θ: 'th', ð: 'th', ʃ: 'sh', ʒ: 'zh', ç: 'h', x: 'kh', ɣ: 'gh',
  m: 'm', n: 'n', ŋ: 'ng', ɲ: 'ny', ɱ: 'm',
  l: 'l', ʎ: 'ly', ɫ: 'l',
  r: 'r', ɹ: 'r', ɾ: 'r', ʁ: 'r', ʀ: 'r', ɽ: 'r',
  j: 'y', w: 'w', ɥ: 'w',
  // vowels
  i: 'ee', ɪ: 'ih', e: 'ay', ɛ: 'eh', æ: 'a',
  a: 'ah', ɑ: 'ah', ɐ: 'uh', ʌ: 'uh', ə: 'uh',
  ɒ: 'aw', ɔ: 'aw', o: 'oh',
  ʊ: 'uu', u: 'oo', ɯ: 'oo',
  y: 'ew', ø: 'er', œ: 'er', ɜ: 'ur', ɝ: 'ur', ɨ: 'ih', ʉ: 'oo',
};

const VOWEL_SOUNDS = new Set([
  'ee', 'ih', 'ay', 'eh', 'a', 'ah', 'uh', 'aw', 'oh', 'uu', 'oo', 'ew', 'er', 'ur',
  'eye', 'ow', 'oy', 'eer', 'air', 'oor',
]);

const PRIMARY_STRESS = 'ˈ';

interface Token {
  sound: string;
  vowel: boolean;
  /** Nasalized by a combining tilde — rendered as a trailing (ng) hint. */
  nasal: boolean;
}

/**
 * Strip the delimiters authors write around IPA, plus anything non-phonetic.
 *
 * Tie bars and joiners are removed *before* tokenizing, not during: in `d͡ʒ` the tie sits
 * between the two letters, so leaving it in place hides the digraph from the lookup.
 * NFD is applied first so precomposed nasal vowels like `õ` split into `o` + tilde, which
 * is how nasalization is detected.
 */
function clean(ipa: string): string {
  return ipa
    .trim()
    .replace(/^[/[]/, '')
    .replace(/[/\]]$/, '')
    .normalize('NFD')
    .replace(/[͜͡‍ːˌ.\s]/g, '');
}

function tokenize(ipa: string): { tokens: Token[]; stressAt: number } {
  const tokens: Token[] = [];
  let stressAt = -1;
  let pendingStress = false;

  for (let i = 0; i < ipa.length; ) {
    const char = ipa[i] ?? '';

    if (char === PRIMARY_STRESS) {
      pendingStress = true;
      i += 1;
      continue;
    }
    const pair = ipa.slice(i, i + 2);
    const digraph = DIGRAPHS.find(([from]) => from === pair);
    const sound = digraph ? digraph[1] : SINGLES[char];
    const consumed = digraph ? 2 : 1;

    if (sound === undefined) {
      i += consumed;
      continue; // unknown symbol: drop it rather than emit noise
    }

    // A combining tilde right after the vowel marks nasalization.
    let nasal = false;
    let next = i + consumed;
    while (ipa[next] === '̃') {
      nasal = true;
      next += 1;
    }

    const vowel = VOWEL_SOUNDS.has(sound);
    if (vowel && pendingStress) {
      stressAt = tokens.length;
      pendingStress = false;
    }
    tokens.push({ sound, vowel, nasal });
    i = next;
  }

  return { tokens, stressAt };
}

/**
 * Group sounds into syllables around their vowels.
 *
 * A single consonant between two vowels starts the next syllable ("maximal onset"), which
 * is what English respellings usually do; a run of two or more splits, the first closing
 * the previous syllable.
 */
function syllabify(tokens: Token[]): Token[][] {
  const syllables: Token[][] = [];
  let current: Token[] = [];
  let seenVowel = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as Token;

    if (token.vowel && seenVowel) {
      // Consonants already collected since the last vowel are this syllable's onset.
      const onset: Token[] = [];
      while (current.length && !(current[current.length - 1] as Token).vowel) {
        onset.unshift(current.pop() as Token);
      }
      // Two or more: leave the first behind to close the previous syllable.
      if (onset.length > 1) current.push(onset.shift() as Token);
      if (current.length) syllables.push(current);
      current = onset;
    }

    current.push(token);
    if (token.vowel) seenVowel = true;
  }

  if (current.length) syllables.push(current);
  return syllables;
}

/**
 * Convert IPA to a hyphenated respelling, with the stressed syllable in capitals.
 *
 * Returns an empty string when there is nothing recognisable to convert, so callers can
 * treat "no suggestion" and "bad input" the same way.
 */
export function respellFromIpa(ipa: string): string {
  if (!ipa?.trim()) return '';

  const { tokens, stressAt } = tokenize(clean(ipa));
  if (!tokens.length) return '';

  const syllables = syllabify(tokens);

  // Which syllable holds the primary-stressed vowel?
  let stressedSyllable = -1;
  if (stressAt >= 0) {
    let index = 0;
    outer: for (let s = 0; s < syllables.length; s += 1) {
      for (const _ of syllables[s] as Token[]) {
        if (index === stressAt) {
          stressedSyllable = s;
          break outer;
        }
        index += 1;
      }
    }
  }

  return syllables
    .map((syllable, index) => {
      const text = syllable
        .map((token) => token.sound + (token.nasal ? 'ng' : ''))
        .join('');
      // Capitals are how dictionary respellings mark stress; only mark it when there is
      // more than one syllable, since a lone shouted syllable just looks odd.
      return index === stressedSyllable && syllables.length > 1 ? text.toUpperCase() : text;
    })
    .join('-');
}
