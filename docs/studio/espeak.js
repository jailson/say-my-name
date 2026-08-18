/**
 * eSpeak NG, loaded on demand.
 *
 * NOTE ON LICENSING: eSpeak NG is GPLv3, so everything in docs/studio/ is GPLv3 too — see
 * the LICENSE file in this directory. The say-my-name component in src/ contains none of
 * this code and remains MIT; the studio merely loads it, which GPL permits.
 *
 * Nothing here talks to a network beyond fetching the engine itself from this same site.
 * The name you type, the phonemes and the audio never leave the tab.
 */

/**
 * Roughly what the visitor downloads the first time they press the button, gzipped.
 * Stated in the UI up front — 9 MB should be a choice, not a surprise.
 */
export const ENGINE_MB = 9;

let enginePromise = null;

/** Fetched on first use only. The studio is useless-but-light until someone opts in. */
function engine() {
  enginePromise ??= import('./vendor/espeak-ng.js').then((m) => m.default);
  return enginePromise;
}

/** True once the engine has been requested, so the UI can stop warning about the download. */
export function engineRequested() {
  return enginePromise !== null;
}

/** eSpeak wants `pt-br`, not `pt-BR`. An empty tag falls back to English. */
export function espeakVoice(lang) {
  return (lang ?? '').trim().toLowerCase() || 'en-us';
}

/**
 * Ask eSpeak how it would read `text` in `lang`.
 *
 * Returns the IPA it derived and a WAV of it saying exactly that, so the written and spoken
 * forms are consistent by construction rather than by the author's ear.
 *
 * Both are guesses. eSpeak applies one language's letter-to-sound rules, so a name of
 * foreign origin will often come out wrong — which is why the caller presents this as a
 * starting point and leaves every field editable.
 */
export async function suggest(text, lang) {
  const ESpeakNg = await engine();

  // One invocation produces both outputs; instantiating the module twice would mean
  // compiling 18 MB of wasm twice.
  const espeak = await ESpeakNg({
    arguments: [
      '-w',
      'out.wav',
      '--phonout',
      'ipa',
      '--ipa', // plain IPA: no tie bars or zero-width joiners to strip
      '-v',
      espeakVoice(lang),
      text,
    ],
    print: () => {},
    printErr: () => {},
  });

  const ipa = espeak.FS.readFile('ipa', { encoding: 'utf8' }).trim();
  const wav = espeak.FS.readFile('out.wav');
  if (!wav?.length) throw new Error('eSpeak produced no audio');

  return { ipa, wav: new Blob([wav], { type: 'audio/wav' }) };
}
