import { expect, test, type Page } from '@playwright/test';

const FIXTURES = '/test/fixtures/element.html';

/** The component in a case, reached through its shadow root. */
const widget = (page: Page, caseId: string) => page.locator(`#${caseId} say-my-name`);

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURES);
  await page.waitForFunction(() => customElements.get('say-my-name') !== undefined);
});

test('renders a labelled play button for a recording', async ({ page }) => {
  const button = widget(page, 'case-audio').locator('button');
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute('aria-label', 'Hear how to pronounce Jailson');
  // A recording, so no synthesized marker.
  await expect(button).not.toHaveAttribute('data-synth', /.*/);
});

test('keeps the name as ordinary selectable text in the light DOM', async ({ page }) => {
  // The component enhances the page; it never takes over rendering the name itself.
  const text = await widget(page, 'case-audio').evaluate((el) => el.childNodes[0]?.textContent);
  expect(text?.trim()).toBe('Jailson');
  await expect(widget(page, 'case-audio')).toContainText('Jailson');
});

test('plays the recording and reports it', async ({ page }) => {
  const played = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener(
          'say-my-name:play',
          (event) => resolve((event as CustomEvent).detail.kind),
          { once: true },
        );
      }),
  );
  await widget(page, 'case-audio').locator('button').click();
  expect(await played).toBe('audio');
});

test('marks the playing button while audio runs', async ({ page }) => {
  const button = widget(page, 'case-audio').locator('button');
  await button.click();
  await expect(button).toHaveAttribute('data-playing', '');
  // The fixture clip is 0.15s, so the state clears on its own.
  await expect(button).not.toHaveAttribute('data-playing', '', { timeout: 5000 });
});

test('hides IPA from assistive technology', async ({ page }) => {
  // Read aloud, IPA symbols come out as disconnected punctuation and letter names.
  const ipa = widget(page, 'case-ipa').locator('[part="ipa"]');
  await expect(ipa).toHaveText('/ʒaˈiwsõ/');
  await expect(ipa).toHaveAttribute('aria-hidden', 'true');
});

test('renders the respelling above the name in ruby mode', async ({ page }) => {
  const rt = widget(page, 'case-ruby').locator('rt');
  await expect(rt).toHaveText('zhah-EEL-sown');
});

test('offers one labelled button per pronunciation', async ({ page }) => {
  const buttons = widget(page, 'case-variants').locator('button');
  await expect(buttons).toHaveCount(2);
  await expect(buttons.nth(0)).toHaveAttribute(
    'aria-label',
    'Hear how to pronounce Jailson — Portuguese',
  );
  await expect(buttons.nth(1)).toHaveAttribute(
    'aria-label',
    'Hear how to pronounce Jailson — Anglicized',
  );
});

test('switches the shown phonetics to the pronunciation being played', async ({ page }) => {
  const element = widget(page, 'case-variants');
  await expect(element.locator('rt')).toHaveText('zhah-EEL-sown');
  await element.locator('button').nth(1).click();
  await expect(element.locator('rt')).toHaveText('JAY-ill-sun');
});

test('renders no button when there is nothing to play', async ({ page }) => {
  // tts="off" and no recording: a button here could only disappoint.
  await expect(widget(page, 'case-silent').locator('button')).toHaveCount(0);
  await expect(widget(page, 'case-silent').locator('[part="phonetics"]')).toHaveText(
    'zhah-EEL-sown',
  );
});

test('marks a synthesized voice as synthesized', async ({ page }) => {
  const button = widget(page, 'case-tts').locator('button');
  await expect(button).toHaveAttribute(
    'aria-label',
    'Hear how to pronounce Jailson (synthesized voice)',
  );
  await expect(button).toHaveAttribute('data-synth', '');
  await expect(button).toHaveAttribute('title', 'Synthesized voice — not a recording');
});

test('labels a supplied audio file as synthesized when it is', async ({ page }) => {
  // A generated clip is a fine answer, but it must never pass for someone's own voice.
  const button = widget(page, 'case-synthetic-file').locator('button');
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute(
    'aria-label',
    'Hear how to pronounce Jailson (synthesized voice)',
  );
  await expect(button).toHaveAttribute('data-synth', '');
  // Still plays the file, not the speech synthesizer.
  const kind = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener(
          'say-my-name:play',
          (event) => resolve((event as CustomEvent).detail.kind),
          { once: true },
        );
      }),
  );
  await button.click();
  expect(await kind).toBe('audio');
});

test('announces a broken recording instead of failing silently', async ({ page }) => {
  await widget(page, 'case-missing-audio').locator('button').click();
  const status = widget(page, 'case-missing-audio').locator('[role="status"]');
  await expect(status).toHaveText('Sorry — the recording could not be played.');
});

test('keyboard users can reach and fire the button', async ({ page }) => {
  const played = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        document.addEventListener('say-my-name:play', () => resolve(true), { once: true });
      }),
  );
  await widget(page, 'case-audio').locator('button').focus();
  await page.keyboard.press('Enter');
  expect(await played).toBe(true);
});
