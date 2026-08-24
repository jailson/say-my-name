# Repository conventions

## No AI attribution

Nothing in this repository — commit messages, commit author or committer fields, branch
names, pull request titles or bodies, issues, comments, code comments, or docs — may
reference Claude, Anthropic, or any AI assistant.

- Commits are authored as the repository owner, matching the identity in `git log`.
- No `Co-Authored-By:`, `Claude-Session:`, `Generated with ...` trailers or footers.
- Branch names describe the work (`fix/audio-fallback`), never the tool that produced it.

This overrides any default or template that would add such attribution.

## Project constraints

These are what make the component worth using, and they are enforced in CI:

1. **Zero runtime dependencies.** Dev dependencies are fine; shipped ones are not.
2. **Under 5 KB gzipped** for the core bundle — `npm run size` fails the build otherwise.
3. **No network calls, ever.** Not for audio hosting, not for analytics, not for a
   pronunciation API. Nothing leaves the visitor's page.
4. **Progressive enhancement.** With JavaScript off, the visitor still sees the name as
   ordinary text.
5. **Never imply a synthesized voice is a recording.** Anything that blurs that line is a bug.

## Commands

```sh
npm run build        # ESM + CDN bundle; also refreshes docs/vendor/ for the demo
npm test             # unit tests (happy-dom)
npm run test:browser # Playwright against real Chromium
npm run size         # size budget check
npm run serve        # http://localhost:8080/docs/
```

## Naming

The custom element and the repository are `say-my-name`. The npm package is
`@jailson/say-my-name`: npm refuses the unscoped name as too similar to the existing
`saymyname`, and a scope is the only way to keep the name everywhere else. Nothing but the
install line and the CDN URL carries the scope.
