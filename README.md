# say-my-name

A tiny web component that shows people how to pronounce your name — your own recording, a
dictionary-style phonetic spelling, and speech synthesis when there is no recording.

One tag. No account, no backend, nothing phoning home. About 4.4 KB gzipped, zero dependencies.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/say-my-name@0"></script>

<say-my-name audio="/audio/my-name.opus" respell="zhah-EEL-sown" ipa="ʒaˈiwsõ" lang="pt-BR">
  Jailson
</say-my-name>
```

**[Live demo and docs](https://jailson.github.io/say-my-name/)** ·
**[Record or upload your name](https://jailson.github.io/say-my-name/studio/)**

## Why this exists

Every existing option makes you depend on someone else's server for a 40 KB recording of your
own voice. NameCoach is account-gated enterprise SaaS. NameDrop is a hosted link. The
WordPress and Drupal plugins are locked to those CMSs. [Vocalizer.js][vocalizer], the closest
open-source thing, has been unmaintained since 2016 and fetches a *stranger's* recording of
your name from a third-party API.

This is the version that just works on a static site, hosts nothing, and asks for nothing.

[vocalizer]: https://github.com/atifazam/vocalizer

## Install

```sh
npm install say-my-name
```

```js
import 'say-my-name'; // registers <say-my-name>
```

Or use the CDN snippet above — no build step, no bundler.

## A name can have more than one right answer

A Brazilian name in an English-speaking country has (at least) two legitimate pronunciations:
the native one, and the one you actually answer to locally. Both are correct. Most tools make
you pick one.

```html
<say-my-name display="ruby">
  Jailson
  <script type="application/json">
    [
      { "label": "Portuguese", "lang": "pt-BR", "audio": "/audio/pt.opus",
        "respell": "zhah-EEL-sown", "ipa": "ʒaˈiwsõ" },
      { "label": "How I'm called here", "lang": "en-CA", "audio": "/audio/en.opus",
        "respell": "JAY-ill-sun" }
    ]
  </script>
</say-my-name>
```

You get one labelled button per pronunciation, and the written form follows whichever one is
playing. The JSON lives in a `<script type="application/json">` block, which browsers never
render — so if this component fails to load, the visitor still just sees your name.

## Speech synthesis is the fallback, not the answer

This component will happily synthesize your name, and there are three things worth knowing
before you rely on it:

- **Browsers cannot be told how to pronounce a word.** SSML `<phoneme>` is unsupported across
  engines, and on macOS the markup is [read aloud as literal text][ssml] rather than stripped.
  Your IPA cannot reach the synthesizer.
- **The voice is whatever the visitor's device happens to have** — different on Windows,
  macOS, Android and iOS, and missing entirely without a voice pack for your language.
- **Synthesis fails hardest on unusual names**, which are exactly the names that need a
  pronunciation widget.

So the component does three things about it: `tts-text` lets you feed the synthesizer
something other than the spelling; a synthesized button draws a dashed sound wave and says
"(synthesized voice)" in its accessible label; and if the browser has no voice for the
language, the button is not rendered at all rather than mispronouncing you confidently.

## A recording is the most faithful answer, not the only respectable one

A clean, isolated sample of your voice on a public page is exactly what voice-cloning models
want, and declining to publish one is a reasonable position. Generating a clip from a
text-to-speech tool and marking it `synthetic` is a perfectly good outcome — the component
labels it honestly either way, which is the part that actually matters.

The [studio][studio] does three things: record in the browser, load a file you made
elsewhere, or press **Suggest from spelling** — which runs eSpeak NG locally to guess the IPA
from the name and language, write a matching respelling, speak it, and tick `synthetic` for
you. Nothing is uploaded in any of the three.

The IPA and respelling **fill in by themselves** from the name and the language, as you
type — no button. The first derivation of a visit downloads eSpeak (~9 MB) and says so while
it runs; every one after that is a ~250 ms local call. **Suggest from spelling** additionally
generates the audio.

The language field autocompletes over all 133 languages eSpeak supports, generated from the
engine at build time so the list can never drift from what is actually installed.

Every field stops being overwritten the moment you write it yourself, and a recording or an
uploaded file is never replaced by a regeneration.

[ssml]: https://github.com/mdn/browser-compat-data/issues/15663
[studio]: https://jailson.github.io/say-my-name/studio/

## Attributes

| Attribute  | Default        | What it does |
| ---------- | -------------- | ------------ |
| `audio`    | —              | URL of your recording. Fetched only when someone presses play. |
| `respell`  | —              | Dictionary-style respelling for humans, e.g. `zhah-EEL-sown`. |
| `ipa`      | —              | IPA, with or without slashes. Hidden from screen readers. |
| `lang`     | —              | BCP 47 tag. Picks the speech voice; the button hides if none matches. |
| `tts`      | `fallback`     | `off` · `fallback` (only without a recording) · `on` (both, as separate buttons). |
| `tts-text` | the name       | What the synthesizer is actually given. |
| `synthetic`| absent         | Marks an `audio` file as a synthesized voice, so its button is labelled like live synthesis. |
| `voice`    | best match     | Preferred voice name, e.g. `Luciana`. |
| `rate`     | `0.9`          | Speech rate. Names land better slightly slower. |
| `display`  | `inline`       | `none` · `inline` · `ruby` (above the name) · `tooltip`. |
| `name`     | element text   | Only needed when the element has no text of its own. |

The element fires a `say-my-name:play` event (bubbles, composed) with
`{ pronunciation, kind }` in its detail, where `kind` is `'audio'` or `'tts'`.

## Styling

```css
say-my-name {
  --smn-color: #6b46c1;
  --smn-phonetic-color: #666;
  --smn-phonetic-size: 0.85em;
  --smn-respell-size: 0.5em;
  --smn-button-size: 0.9em;
  --smn-gap: 0.4em;
  --smn-focus: 2px solid #6b46c1;
}

say-my-name::part(button) { border-radius: 999px; }
say-my-name::part(ipa) { font-family: 'Doulos SIL', serif; }
```

Parts: `name`, `respell`, `phonetics`, `ipa`, `controls`, `button`, `button-synth`, `label`.

## Accessibility

- A real `<button>`, keyboard-reachable, with a focus ring that inherits from your page.
- Labels read as sentences: "Hear how to pronounce Jailson — Portuguese (synthesized voice)".
- IPA is `aria-hidden`; read aloud, the symbols come out as disconnected punctuation.
- The playing animation respects `prefers-reduced-motion`.
- Failures are announced through a polite live region rather than swallowed.
- Without JavaScript the name is still just text. The component enhances; it never replaces.

Related: the [W3C Pronunciation Task Force][w3c] is standardizing spoken-presentation markup
for exactly this class of problem.

[w3c]: https://w3c.github.io/pronunciation/use-cases/draft.html

## Frameworks

It is a custom element, so it works anywhere HTML does. React 19+ passes props to custom
elements natively. Vue needs `compilerOptions.isCustomElement`. Svelte and Astro need nothing.

To avoid a tag-name collision, register it yourself:

```js
import { defineSayMyName } from 'say-my-name/element';
defineSayMyName('my-name');
```

## Development

```sh
npm install
npm run build        # ESM + CDN bundle, and refreshes the docs demo
npm test             # unit tests
npm run test:browser # Playwright, real custom elements and audio
npm run size         # fails if the bundle outgrows its budget
npm run serve        # then open http://localhost:8080/docs/
```

## Licence

**The component is MIT.** Everything in `src/`, and the published npm package, has no
dependencies and contains no GPL code. Using `<say-my-name>` on your site carries no
copyleft obligation of any kind.

**The studio in `docs/studio/` is GPLv3**, because it bundles [eSpeak NG][espeak] for the
"suggest from spelling" feature, and eSpeak NG is GPLv3. The studio is a separate program
that happens to load the component; that boundary is why the component's licence is
unaffected. See `docs/studio/LICENSE`.

The engine is not committed here — the build stages it out of `node_modules`, and the studio
fetches it only when someone presses the button.

[espeak]: https://github.com/espeak-ng/espeak-ng
