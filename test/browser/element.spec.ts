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

test('stacks the written forms around the name in ruby mode', async ({ page }) => {
  // "Above and below": respelling over the name like a dictionary entry, IPA under it.
  const widgetEl = widget(page, 'case-ruby');
  const boxes = await widgetEl.evaluate((el) => {
    const root = el.shadowRoot!;
    const pick = (part: string) =>
      root.querySelector(`[part~="${part}"]`)!.getBoundingClientRect();
    const name = root.querySelector('ruby')!.getBoundingClientRect();
    return { respell: pick('respell').top, name: name.top, ipa: pick('ipa').top };
  });

  expect(boxes.respell).toBeLessThan(boxes.name + 1);
  expect(boxes.ipa).toBeGreaterThan(boxes.name);

  // The button stays on the name's own line rather than being pushed down with the IPA.
  const rows = await widgetEl.evaluate((el) => {
    const root = el.shadowRoot!;
    return {
      button: root.querySelector('button')!.getBoundingClientRect().top,
      ipa: root.querySelector('[part~="ipa"]')!.getBoundingClientRect().top,
    };
  });
  expect(rows.button).toBeLessThan(rows.ipa);
});

test('shows the respelling alone when asked to', async ({ page }) => {
  const el = widget(page, 'case-respell-only');
  await expect(el.locator('[part~="respell"]')).toHaveText('zhah-EEL-sown');
  await expect(el.locator('[part~="ipa"]')).toHaveCount(0);
});

test('shows the IPA alone when asked to', async ({ page }) => {
  const el = widget(page, 'case-ipa-only');
  await expect(el.locator('[part~="ipa"]')).toHaveText('/ʒaˈiwsõ/');
  // Ruby mode would normally put the respelling over the name; show="ipa" outranks it.
  await expect(el.locator('[part~="respell"]')).toHaveCount(0);
  await expect(el.locator('rt')).toHaveCount(0);
});

test('hangs the tooltip under the name it belongs to', async ({ page }) => {
  const el = widget(page, 'case-tooltip');
  const tip = el.locator('[part~="phonetics"]');

  // Hidden until asked for, but present so it can be described by aria-describedby.
  await expect(tip).toHaveCSS('opacity', '0');

  await el.hover();
  await expect(tip).toHaveCSS('opacity', '1');

  const geometry = await el.evaluate((host) => {
    const box = host.getBoundingClientRect();
    const tipBox = host.shadowRoot!.querySelector('[part~="phonetics"]')!.getBoundingClientRect();
    return {
      below: tipBox.top >= box.bottom - 1,
      // Anchored to the name it describes, not to some corner of the page.
      fromNameStart: Math.abs(tipBox.left - box.left),
      onPage: tipBox.left >= 0 && tipBox.right <= document.documentElement.clientWidth,
      coversName: tipBox.top < box.bottom - 1,
    };
  });

  expect(geometry.below).toBe(true);
  expect(geometry.coversName).toBe(false);
  expect(geometry.onPage).toBe(true);
  expect(geometry.fromNameStart).toBeLessThan(2);
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

test('pressing the button again stops it, and once more starts it over', async ({ page }) => {
  // Driven synchronously so the 0.15s fixture clip cannot end mid-test and shift the
  // meaning of the next press.
  const playing = await widget(page, 'case-audio').evaluate((el) => {
    const button = el.shadowRoot?.querySelector('button');
    const seen: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      button?.click();
      seen.push(button?.dataset['playing'] !== undefined);
    }
    return seen;
  });
  expect(playing).toEqual([true, false, true]);
  await expect(widget(page, 'case-audio').locator('button')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('tearing a clip down never starts a synthesized voice over the next one', async ({
  page,
}) => {
  // Detaching the old <audio> fires a stray `error`. Read as a broken recording, it used
  // to answer with synthesis — which then talked over the clip the new press had begun.
  await page.evaluate(() => {
    const spoken: string[] = [];
    (window as unknown as { spoken: string[] }).spoken = spoken;
    const original = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
      spoken.push(utterance.text);
      original(utterance);
    };
  });

  await widget(page, 'case-audio').evaluate((el) => {
    const button = el.shadowRoot?.querySelector('button');
    button?.click(); // play
    button?.click(); // stop, tearing the element down
    button?.click(); // play again
  });

  // The stray error lands a few tens of milliseconds after the teardown, so give it room.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { spoken: string[] }).spoken)).toEqual(
    [],
  );
  await expect(widget(page, 'case-audio').locator('[role="status"]')).toHaveText('');
});
