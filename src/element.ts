import { NamePlayer } from './audio.js';
import {
  buttonLabel,
  formatIpa,
  hasWrittenForm,
  normalizeName,
  parsePronunciations,
  speechTextFor,
  writtenForm,
} from './phonetics.js';
import { canSpeak, cancelSpeech, primeVoices, speak } from './tts.js';
import type { DisplayMode, Pronunciation, TtsPolicy } from './types.js';

const STYLES = /* css */ `
:host {
  display: inline-flex;
  align-items: baseline;
  gap: var(--smn-gap, 0.4em);
  font: inherit;
  color: inherit;
}
:host([hidden]) { display: none; }

/* The name comes from the light DOM, so it keeps the host page's styling and stays
   selectable, copyable, and readable if this script never loads. */
.name { font: inherit; }
ruby { ruby-position: over; }
rt {
  font-size: var(--smn-respell-size, 0.5em);
  font-weight: 400;
  color: var(--smn-phonetic-color, currentColor);
  opacity: var(--smn-phonetic-opacity, 0.75);
  letter-spacing: 0.02em;
}

.phonetics {
  font-size: var(--smn-phonetic-size, 0.85em);
  color: var(--smn-phonetic-color, currentColor);
  opacity: var(--smn-phonetic-opacity, 0.75);
  white-space: nowrap;
}
.phonetics:empty { display: none; }

/* Tooltip mode: revealed on hover or keyboard focus, never on hover alone. */
.phonetics.tip {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  transform: translateY(0.25em);
  transition: opacity 120ms ease, transform 120ms ease;
  background: var(--smn-tip-bg, Canvas);
  color: var(--smn-tip-color, CanvasText);
  border: 1px solid var(--smn-tip-border, currentColor);
  border-radius: 0.35em;
  padding: 0.15em 0.4em;
  font-size: 0.8em;
  z-index: 1;
}
:host(:hover) .phonetics.tip,
:host(:focus-within) .phonetics.tip {
  opacity: 1;
  transform: translateY(0);
}

.controls { display: inline-flex; gap: 0.25em; align-items: center; }

button {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  font: inherit;
  font-size: var(--smn-button-size, 0.9em);
  line-height: 1;
  color: var(--smn-color, currentColor);
  background: var(--smn-button-bg, transparent);
  border: var(--smn-button-border, 0);
  border-radius: var(--smn-button-radius, 0.35em);
  padding: var(--smn-button-padding, 0.15em 0.25em);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button:hover { opacity: 0.75; }
button:focus-visible {
  outline: var(--smn-focus, 2px solid currentColor);
  outline-offset: 2px;
}
button .label { font-size: 0.85em; }

svg { width: 1em; height: 1em; display: block; flex: none; }

/* Playing state. The animation is decorative — the sound is the real feedback. */
button[data-playing] svg { animation: smn-pulse 900ms ease-in-out infinite; }
@keyframes smn-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  button[data-playing] svg { animation: none; }
  .phonetics.tip { transition: none; }
}

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0; border: 0;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}
`;

const SPEAKER_PATH = 'M3 9v6h4l5 4V5L7 9H3z';
const WAVE_PATH = 'M16 8a5 5 0 0 1 0 8';

/** A single play button: which pronunciation it plays, and how. */
interface Control {
  pron: Pronunciation;
  kind: 'audio' | 'tts';
  index: number;
}

export class SayMyNameElement extends HTMLElement {
  static readonly observedAttributes = [
    'audio',
    'ipa',
    'respell',
    'lang',
    'name',
    'synthetic',
    'tts',
    'tts-text',
    'voice',
    'rate',
    'display',
  ];

  #root: ShadowRoot;
  #player = new NamePlayer();
  #prons: Pronunciation[] = [];
  #active = 0;
  #phonetics: HTMLElement | null = null;
  #respellNode: HTMLElement | null = null;
  #status: HTMLElement | null = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    // Voice lists load asynchronously in Chrome, and the click handler needs them
    // synchronously. Start now so they are ready by the time anyone presses a button.
    primeVoices();
    this.#render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#render();
  }

  disconnectedCallback(): void {
    this.#player.stop();
    cancelSpeech();
  }

  /** The name being pronounced: the element's own text, or the `name` attribute. */
  get name(): string {
    const fromText = normalizeName(
      Array.from(this.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join(' '),
    );
    return fromText || this.getAttribute('name')?.trim() || '';
  }

  get #ttsPolicy(): TtsPolicy {
    const raw = this.getAttribute('tts')?.trim().toLowerCase();
    return raw === 'off' || raw === 'on' || raw === 'fallback' ? raw : 'fallback';
  }

  get #displayMode(): DisplayMode {
    const raw = this.getAttribute('display')?.trim().toLowerCase();
    if (raw === 'none' || raw === 'inline' || raw === 'ruby' || raw === 'tooltip') return raw;
    return this.#prons.some(hasWrittenForm) ? 'inline' : 'none';
  }

  get #rate(): number | undefined {
    const raw = Number(this.getAttribute('rate'));
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }

  /**
   * Which buttons to show.
   *
   * `off`      recordings only — a pronunciation without one gets no button.
   * `fallback` the recording if there is one, synthesis otherwise.
   * `on`       both, as separate buttons, so the two are never confused.
   *
   * A synthesis button is dropped when the browser has no voice for that language:
   * better no button than one that says the name in confidently the wrong accent.
   */
  #controls(): Control[] {
    const policy = this.#ttsPolicy;
    const controls: Control[] = [];

    this.#prons.forEach((pron, index) => {
      const hasAudio = Boolean(pron.audio?.trim());
      if (hasAudio) controls.push({ pron, kind: 'audio', index });

      const wantsTts = policy === 'on' || (policy === 'fallback' && !hasAudio);
      if (wantsTts && canSpeak(pron.lang)) controls.push({ pron, kind: 'tts', index });
    });

    return controls;
  }

  #render(): void {
    this.#prons = parsePronunciations(this);
    this.#active = Math.min(this.#active, Math.max(this.#prons.length - 1, 0));

    const name = this.name;
    const display = this.#displayMode;
    const controls = this.#controls();

    this.#root.replaceChildren();

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.#root.append(style);

    // The name itself is always a <slot>: one copy of the text, living in the light DOM.
    const slot = document.createElement('slot');
    if (display === 'ruby' && this.#prons[this.#active]?.respell?.trim()) {
      const ruby = document.createElement('ruby');
      ruby.setAttribute('part', 'name');
      ruby.className = 'name';
      const rt = document.createElement('rt');
      rt.setAttribute('part', 'respell');
      // Filled by #paintPhonetics, which also keeps it in step with the active variant.
      this.#respellNode = rt;
      ruby.append(slot, rt);
      this.#root.append(ruby);
    } else {
      this.#respellNode = null;
      const wrap = document.createElement('span');
      wrap.setAttribute('part', 'name');
      wrap.className = 'name';
      wrap.append(slot);
      this.#root.append(wrap);
    }

    // In ruby mode the respelling already sits above the name, but IPA still needs a home,
    // so every mode except `none` gets this element. #paintPhonetics decides what goes in.
    if (display === 'none') {
      this.#phonetics = null;
    } else {
      const phonetics = document.createElement('span');
      phonetics.setAttribute('part', 'phonetics');
      phonetics.className = display === 'tooltip' ? 'phonetics tip' : 'phonetics';
      phonetics.id = 'phonetics';
      this.#phonetics = phonetics;
      this.#root.append(phonetics);
    }

    if (controls.length) {
      const bar = document.createElement('span');
      bar.setAttribute('part', 'controls');
      bar.className = 'controls';
      for (const control of controls) {
        bar.append(this.#button(control, name, controls.length > 1, display === 'tooltip'));
      }
      this.#root.append(bar);
    }

    const status = document.createElement('span');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    this.#status = status;
    this.#root.append(status);

    this.#paintPhonetics();
  }

  #button(control: Control, name: string, showLabel: boolean, describe: boolean): HTMLElement {
    // Live synthesis is obviously synthetic; a supplied audio file is only synthetic if the
    // author says so. Either way the button has to admit it.
    const synthesized = control.kind === 'tts' || Boolean(control.pron.synthetic);
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('part', synthesized ? 'button button-synth' : 'button');
    button.setAttribute(
      'aria-label',
      buttonLabel(name, control.pron, { synthesized, showLabel }),
    );
    if (synthesized) {
      button.dataset['synth'] = '';
      button.title = 'Synthesized voice — not a recording';
    }
    if (describe) button.setAttribute('aria-describedby', 'phonetics');

    button.append(icon(synthesized));

    // With one pronunciation the icon says it all; with several, the label is the only
    // way to know which is which.
    if (showLabel && control.pron.label?.trim()) {
      const label = document.createElement('span');
      label.className = 'label';
      label.setAttribute('part', 'label');
      label.textContent = control.pron.label.trim();
      label.setAttribute('aria-hidden', 'true'); // already in the button's aria-label
      button.append(label);
    }

    button.addEventListener('click', () => this.#activate(control, button));
    return button;
  }

  #activate(control: Control, button: HTMLButtonElement): void {
    this.#active = control.index;
    this.#paintPhonetics();
    this.#announce('');

    const playing = (on: boolean) => {
      for (const other of this.#root.querySelectorAll('button')) delete other.dataset['playing'];
      if (on) button.dataset['playing'] = '';
    };

    this.dispatchEvent(
      new CustomEvent('say-my-name:play', {
        bubbles: true,
        composed: true,
        detail: { pronunciation: control.pron, kind: control.kind },
      }),
    );

    if (control.kind === 'audio' && control.pron.audio) {
      this.#player.play(control.pron.audio, {
        onstart: () => playing(true),
        onend: () => playing(false),
        onerror: () => {
          playing(false);
          this.#recordingFailed(control);
        },
      });
      return;
    }

    this.#speak(control, () => playing(true), () => playing(false));
  }

  #speak(control: Control, onstart: () => void, onend: () => void): void {
    speak(
      speechTextFor(control.pron, this.name),
      { lang: control.pron.lang, voice: control.pron.voice, rate: this.#rate },
      {
        onstart,
        onend,
        onerror: () => {
          onend();
          this.#announce('Sorry — this name could not be played.');
        },
      },
    );
  }

  /**
   * A missing or broken recording falls through to synthesis when the policy allows it,
   * so a moved audio file degrades to an imperfect answer rather than to silence.
   */
  #recordingFailed(control: Control): void {
    const canFallBack = this.#ttsPolicy !== 'off' && canSpeak(control.pron.lang);
    if (canFallBack) {
      this.#announce('Recording unavailable — using a synthesized voice.');
      this.#speak(
        control,
        () => undefined,
        () => undefined,
      );
      return;
    }
    this.#announce('Sorry — the recording could not be played.');
  }

  #paintPhonetics(): void {
    const pron = this.#prons[this.#active];

    // Ruby mode puts the respelling above the name, so it has to follow the active
    // pronunciation too — not just the phonetics line below.
    if (this.#respellNode) this.#respellNode.textContent = pron?.respell?.trim() ?? '';

    if (!this.#phonetics) return;
    if (!pron) {
      this.#phonetics.replaceChildren();
      return;
    }

    if (this.#displayMode === 'ruby') {
      // The respelling is already above the name; only IPA remains.
      const ipa = pron.ipa?.trim() ? formatIpa(pron.ipa) : '';
      this.#phonetics.replaceChildren();
      if (ipa) this.#phonetics.append(ipaNode(ipa));
      return;
    }

    const respell = pron.respell?.trim() ?? '';
    const ipa = pron.ipa?.trim() ? formatIpa(pron.ipa) : '';
    this.#phonetics.replaceChildren();
    if (respell) this.#phonetics.append(document.createTextNode(respell));
    if (respell && ipa) this.#phonetics.append(document.createTextNode(' · '));
    if (ipa) this.#phonetics.append(ipaNode(ipa));
  }

  #announce(message: string): void {
    if (this.#status) this.#status.textContent = message;
  }
}

/**
 * IPA is hidden from screen readers on purpose: read aloud, the symbols come out as
 * disconnected punctuation and letter names. The button's label carries the meaning.
 */
function ipaNode(text: string): HTMLElement {
  const span = document.createElement('span');
  span.setAttribute('part', 'ipa');
  span.setAttribute('aria-hidden', 'true');
  span.textContent = text;
  return span;
}

function icon(synthesized: boolean): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const speaker = document.createElementNS(NS, 'path');
  speaker.setAttribute('d', SPEAKER_PATH);
  speaker.setAttribute('fill', 'currentColor');
  svg.append(speaker);

  // A recording gets a solid sound wave; a synthesized voice gets a dashed one, so the
  // two are distinguishable at a glance and not only through the tooltip.
  const wave = document.createElementNS(NS, 'path');
  wave.setAttribute('d', WAVE_PATH);
  if (synthesized) wave.setAttribute('stroke-dasharray', '2 2.5');
  svg.append(wave);

  return svg;
}

/**
 * Register the element. Defaults to `<say-my-name>`; pass a name to avoid a collision
 * with another copy of this component already on the page.
 */
export function defineSayMyName(tagName = 'say-my-name'): void {
  if (typeof customElements === 'undefined' || customElements.get(tagName)) return;
  customElements.define(tagName, SayMyNameElement);
}
