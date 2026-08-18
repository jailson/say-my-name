import type { Pronunciation } from './types.js';

/**
 * Wrap IPA in the slashes readers expect, unless the author already delimited it
 * (slashes for phonemic, square brackets for phonetic — both are left alone).
 */
export function formatIpa(ipa: string): string {
  const trimmed = ipa.trim();
  if (!trimmed) return '';
  const delimited =
    (trimmed.startsWith('/') && trimmed.endsWith('/')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));
  return delimited ? trimmed : `/${trimmed}/`;
}

/**
 * What the synthesizer should say.
 *
 * Deliberately NOT the respelling: a respelling like "zhah-EEL-sown" is written for an
 * English reader, and handing it to a Portuguese voice produces nonsense. The spelled
 * name is right far more often than not, and `tts-text` exists for when it isn't.
 */
export function speechTextFor(pron: Pronunciation, name: string): string {
  return pron.ttsText?.trim() || name;
}

/** True when there is anything written to show for this pronunciation. */
export function hasWrittenForm(pron: Pronunciation): boolean {
  return Boolean(pron.respell?.trim() || pron.ipa?.trim());
}

/** The written forms, joined for the inline and tooltip displays. */
export function writtenForm(pron: Pronunciation): string {
  const parts: string[] = [];
  if (pron.respell?.trim()) parts.push(pron.respell.trim());
  if (pron.ipa?.trim()) parts.push(formatIpa(pron.ipa));
  return parts.join(' · ');
}

/**
 * Accessible label for a play button.
 *
 * Reads as a sentence rather than a fragment, names the language when there is more than
 * one pronunciation to choose between, and says outright when the voice is synthesized so
 * nobody mistakes a machine guess for the owner's own voice.
 */
export function buttonLabel(
  name: string,
  pron: Pronunciation,
  opts: { synthesized: boolean; showLabel: boolean },
): string {
  let label = `Hear how to pronounce ${name}`;
  if (opts.showLabel && pron.label?.trim()) label += ` — ${pron.label.trim()}`;
  if (opts.synthesized) label += ' (synthesized voice)';
  return label;
}

/** Collapse the whitespace an HTML author's indentation leaves behind. */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Read pronunciations off the element: an inner <script type="application/json"> when
 * there are several, plain attributes when there is one.
 *
 * A malformed JSON block warns and falls back to the attributes rather than throwing —
 * a broken pronunciation widget must never take a page's rendering down with it.
 */
export function parsePronunciations(el: Element): Pronunciation[] {
  // Direct children only — a JSON block belonging to some nested element is not ours.
  // Walked by hand rather than with `:scope >`, which not every DOM implementation has.
  const script = Array.from(el.children).find(
    (child) =>
      child.tagName === 'SCRIPT' && child.getAttribute('type') === 'application/json',
  );
  if (script?.textContent?.trim()) {
    try {
      const parsed: unknown = JSON.parse(script.textContent);
      const list = (Array.isArray(parsed) ? parsed : [parsed]).filter(
        (v): v is Pronunciation => typeof v === 'object' && v !== null,
      );
      if (list.length) return list;
    } catch (err) {
      console.warn('<say-my-name>: could not parse the JSON pronunciation list.', err);
    }
  }

  const attr = (n: string) => el.getAttribute(n)?.trim() || undefined;
  const single: Pronunciation = {
    audio: attr('audio'),
    ipa: attr('ipa'),
    respell: attr('respell'),
    lang: attr('lang'),
    ttsText: attr('tts-text'),
    voice: attr('voice'),
    // Presence is enough: `synthetic` and `synthetic="true"` both count, `synthetic="false"`
    // does not — matching how boolean HTML attributes normally read.
    synthetic: el.hasAttribute('synthetic') && el.getAttribute('synthetic') !== 'false',
  };
  return [single];
}
