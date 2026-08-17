# Contributing

Thanks for looking. This is a deliberately small project, and the constraints below are the
reason it stays small.

## Getting set up

```sh
npm install
npm run build
npm run serve   # http://localhost:8080/docs/
```

`npm run build` also refreshes `docs/vendor/say-my-name.js`, which the demo and the studio
load. The docs site will look broken until you have built at least once.

## Running the tests

```sh
npm test             # pure logic, happy-dom
npm run test:browser # real custom elements, shadow DOM, and audio in Chromium
```

Browser tests use whatever Chromium `PLAYWRIGHT_BROWSERS_PATH` points at, falling back to
Playwright's own download. Set `CHROMIUM_PATH` to override.

## The constraints

These are not negotiable without a good argument, because they are what make the component
worth using:

1. **Zero runtime dependencies.** Dev dependencies are fine; shipped ones are not.
2. **Under 5 KB gzipped.** `npm run size` fails the build otherwise. If a feature does not fit,
   it probably belongs in the studio page instead of the component.
3. **No network calls, ever.** Not for audio hosting, not for analytics, not for a
   pronunciation API. The whole point is that nothing leaves the page.
4. **Progressive enhancement.** With JavaScript off, or the script blocked, the visitor must
   still see the name as ordinary text.
5. **Never imply a synthesized voice is a recording.** Anything that blurs that line is a bug.

## Accessibility

Every change to the rendered output needs a pass with a screen reader, or at minimum an
argument for why the accessible name still reads as a sentence. IPA stays `aria-hidden` — read
aloud, the symbols are noise.

## Commits and PRs

Small, focused commits. Describe what changed and why in the body. Tests for behaviour
changes; the browser suite is the right place for anything involving the DOM.

Commits are authored by the person submitting them. No tool-attribution trailers, footers,
or generated-by notices in commit messages, pull requests, or branch names — branch names
describe the work (`fix/audio-fallback`), not what produced it.
