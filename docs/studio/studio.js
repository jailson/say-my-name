import { ENGINE_MB, engineRequested, suggest } from './espeak.js';
import { respellFromIpa } from './vendor/respell.js';
import { encodeWav, envelope, findSpeechBounds, toMono } from './wav.js';

/**
 * The studio: record a name or generate one, trim it, download it, copy the snippet.
 *
 * GPLv3 — see the LICENSE file in this directory. It bundles eSpeak NG, which is GPLv3.
 * The say-my-name component itself is MIT and contains none of that code.
 *
 * Nothing you do here is uploaded. The only network request this page can make is fetching
 * the eSpeak engine from this same site, and only if you press "Suggest from spelling".
 * There is no other fetch, no upload, no analytics.
 */

const nameInput = document.querySelector('#name');
const pathInput = document.querySelector('#audio-path');
const displaySelect = document.querySelector('#display');
const takesEl = document.querySelector('#takes');
const previewEl = document.querySelector('#preview');
const snippetEl = document.querySelector('#snippet');
const template = document.querySelector('#take-template');

/** @type {Array<{el: HTMLElement, blob: Blob|null, buffer: AudioBuffer|null}>} */
const takes = [];
let audioContext = null;

function ctx() {
  audioContext ??= new (window.AudioContext ?? window.webkitAudioContext)();
  return audioContext;
}

function slug(text) {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'name'
  );
}

function fileNameFor(take, index) {
  const lang = take.el.querySelector('.in-lang').value.trim();
  const suffix = lang ? `-${slug(lang)}` : takes.length > 1 ? `-${index + 1}` : '';
  return `${slug(nameInput.value)}${suffix}.wav`;
}

function fields(take) {
  const get = (cls) => take.el.querySelector(cls).value.trim();
  return {
    label: get('.in-label'),
    lang: get('.in-lang'),
    respell: get('.in-respell'),
    ipa: get('.in-ipa'),
    trim: take.el.querySelector('.in-trim').checked,
    synthetic: take.el.querySelector('.in-synthetic').checked,
  };
}

/**
 * Keep the respelling in step with the IPA.
 *
 * Runs on every IPA change — typed, pasted or generated — because the conversion is a pure
 * string function with no engine behind it. Stops the moment the author edits the
 * respelling themselves: a suggestion should never overwrite a considered choice.
 */
function syncRespelling(take) {
  const respellField = take.el.querySelector('.in-respell');
  if (respellField.dataset.edited === 'true') return;

  const suggestion = respellFromIpa(take.el.querySelector('.in-ipa').value);
  if (suggestion) respellField.value = suggestion;
}

/** The trimmed mono samples for a take, or null if nothing has been recorded yet. */
function samplesFor(take) {
  if (!take.buffer) return null;
  const all = toMono(take.buffer);
  if (!fields(take).trim) return all;
  const { start, end } = findSpeechBounds(all, take.buffer.sampleRate);
  return all.subarray(start, end);
}

function drawWave(take) {
  const canvas = take.el.querySelector('.wave');
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const samples = samplesFor(take);
  canvas.hidden = !samples?.length;
  if (!samples?.length) return;

  const styles = getComputedStyle(document.body);
  context.fillStyle = styles.getPropertyValue('--accent').trim() || '#7b4bd8';

  const peaks = envelope(samples, Math.floor(width / 3));
  peaks.forEach((peak, i) => {
    const barHeight = Math.max(2, peak * height * 0.9);
    context.fillRect(i * 3, (height - barHeight) / 2, 2, barHeight);
  });
}

function humanSize(bytes) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function updateSizes(take) {
  const samples = samplesFor(take);
  const sizeEl = take.el.querySelector('.size');
  if (!samples || !take.blob) {
    sizeEl.textContent = '';
    return;
  }
  const seconds = samples.length / take.buffer.sampleRate;
  sizeEl.textContent =
    `${seconds.toFixed(1)}s · wav ${humanSize(44 + samples.length * 2)} · ` +
    `original ${humanSize(take.blob.size)}`;
}

/** Extension for the untouched take: the real one if we were handed a file, else by type. */
function rawExtension(blob) {
  if (blob.name?.includes('.')) return blob.name.split('.').pop().toLowerCase();
  const type = blob.type ?? '';
  if (/mp4|m4a|aac/.test(type)) return 'm4a';
  if (/mpeg|mp3/.test(type)) return 'mp3';
  if (/ogg|opus/.test(type)) return 'opus';
  if (/wav/.test(type)) return 'wav';
  return 'webm';
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on the next tick so the download has already started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function record(take) {
  const button = take.el.querySelector('.record');
  const status = take.el.querySelector('.rec-status');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    status.textContent = 'Microphone permission denied.';
    return;
  }

  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));

  recorder.addEventListener('stop', async () => {
    for (const track of stream.getTracks()) track.stop();
    button.textContent = '● Re-record';
    button.classList.remove('recording');

    take.blob = new Blob(chunks, { type: recorder.mimeType });
    try {
      take.buffer = await ctx().decodeAudioData(await take.blob.arrayBuffer());
    } catch {
      status.textContent = 'Could not decode that recording — try again.';
      return;
    }

    takeReady(take, 'Recorded');
  });

  recorder.start();
  button.textContent = '■ Stop';
  button.classList.add('recording');
  status.textContent = 'Recording — say your name, then press stop';

  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
    button.removeEventListener('click', stop);
  };
  button.addEventListener('click', stop);

  // A name takes a second; this is a backstop against a forgotten open microphone.
  setTimeout(stop, 15000);
}

/** Enable everything that only makes sense once a take has audio in it. */
function takeReady(take, statusText) {
  take.el.querySelector('.rec-status').textContent = statusText;
  take.el.querySelector('.play').disabled = false;
  take.el.querySelector('.dl-wav').disabled = false;
  take.el.querySelector('.dl-raw').disabled = false;
  drawWave(take);
  updateSizes(take);
  refresh();
}

/**
 * Load an audio file the user made elsewhere — a TTS site, a phone memo, anything.
 *
 * decodeAudioData runs locally on an ArrayBuffer; the file is never sent anywhere, same
 * as a recording made here.
 */
async function loadFile(take, file) {
  const status = take.el.querySelector('.rec-status');
  status.textContent = `Reading ${file.name}…`;
  try {
    const buffer = await ctx().decodeAudioData(await file.arrayBuffer());
    take.blob = file;
    take.buffer = buffer;
  } catch {
    status.textContent = 'Could not decode that file. Try .wav, .mp3, .m4a, .ogg or .opus.';
    return;
  }
  take.el.querySelector('.record').textContent = '● Record instead';
  takeReady(take, `Loaded ${file.name}`);
}

/**
 * Fill in a pronunciation from the spelling, using eSpeak's letter-to-sound rules.
 *
 * Deliberately suggests rather than decides: rule-based conversion gets names of foreign
 * origin wrong routinely, so everything it writes stays editable, and the result is marked
 * synthesized so it can never be mistaken for the owner's voice.
 */
async function suggestFor(take) {
  const status = take.el.querySelector('.rec-status');
  const button = take.el.querySelector('.suggest');
  const name = nameInput.value.trim();

  if (!name) {
    status.textContent = 'Type a name first.';
    return;
  }

  button.disabled = true;
  status.textContent = engineRequested()
    ? 'Generating…'
    : `Fetching the speech engine (~${ENGINE_MB} MB, once per visit)…`;

  try {
    const { ipa, wav } = await suggest(name, fields(take).lang);
    take.el.querySelector('.in-ipa').value = ipa;
    syncRespelling(take);
    // Non-negotiable: a generated voice is always marked as one.
    take.el.querySelector('.in-synthetic').checked = true;
    take.blob = wav;
    take.buffer = await ctx().decodeAudioData(await wav.arrayBuffer());
    take.el.querySelector('.record').textContent = '● Record instead';
    takeReady(take, 'Generated by eSpeak — a guess. Edit the IPA, or record it yourself.');
  } catch (error) {
    console.warn('<say-my-name> studio: eSpeak failed.', error);
    status.textContent = 'Could not generate that. Check the language tag, e.g. pt-BR.';
  } finally {
    button.disabled = false;
  }
}

function playTake(take) {
  const samples = samplesFor(take);
  if (!samples) return;
  const buffer = ctx().createBuffer(1, samples.length, take.buffer.sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = ctx().createBufferSource();
  source.buffer = buffer;
  source.connect(ctx().destination);
  source.start();
}

function addTake() {
  const fragment = template.content.cloneNode(true);
  const el = fragment.querySelector('.take');
  const take = { el, blob: null, buffer: null };
  takes.push(take);
  takesEl.append(el);

  el.querySelector('.record').addEventListener('click', () => {
    if (!el.querySelector('.record').classList.contains('recording')) void record(take);
  });
  el.querySelector('.play').addEventListener('click', () => playTake(take));
  el.querySelector('.suggest').addEventListener('click', () => void suggestFor(take));
  el.querySelector('.in-file').addEventListener('change', (event) => {
    const [file] = event.target.files ?? [];
    if (file) void loadFile(take, file);
  });
  el.querySelector('.remove').addEventListener('click', () => {
    takes.splice(takes.indexOf(take), 1);
    el.remove();
    refresh();
  });
  el.querySelector('.in-trim').addEventListener('change', () => {
    drawWave(take);
    updateSizes(take);
  });
  el.querySelector('.dl-wav').addEventListener('click', () => {
    const samples = samplesFor(take);
    if (samples) download(encodeWav(samples, take.buffer.sampleRate), fileNameFor(take, takes.indexOf(take)));
  });
  el.querySelector('.dl-raw').addEventListener('click', () => {
    if (!take.blob) return;
    const ext = rawExtension(take.blob);
    download(take.blob, fileNameFor(take, takes.indexOf(take)).replace(/\.wav$/, `.${ext}`));
  });

  el.querySelector('.in-ipa').addEventListener('input', () => {
    syncRespelling(take);
    refresh();
  });
  // Typing here hands control to the author for good.
  el.querySelector('.in-respell').addEventListener('input', (event) => {
    event.target.dataset.edited = 'true';
  });

  for (const input of el.querySelectorAll('input')) {
    input.addEventListener('input', refresh);
  }

  refresh();
}

/** Blob URLs handed to the preview, revoked on the next render so they don't pile up. */
let previewUrls = [];

/** Build the live preview out of the real component, fed by blob URLs. */
function renderPreview() {
  const name = nameInput.value.trim() || 'Your name';
  previewEl.replaceChildren();
  // refresh() runs on every keystroke; without this, each one leaks an encoded WAV.
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];

  const element = document.createElement('say-my-name');
  element.setAttribute('display', displaySelect.value);
  element.append(document.createTextNode(name));

  const list = takes.map((take) => {
    const { label, lang, respell, ipa, synthetic } = fields(take);
    const entry = {};
    if (label) entry.label = label;
    if (lang) entry.lang = lang;
    if (respell) entry.respell = respell;
    if (ipa) entry.ipa = ipa;
    if (synthetic) entry.synthetic = true;
    const samples = samplesFor(take);
    if (samples) {
      const url = URL.createObjectURL(encodeWav(samples, take.buffer.sampleRate));
      previewUrls.push(url);
      entry.audio = url;
    }
    return entry;
  });

  if (list.length === 1) {
    for (const [key, value] of Object.entries(list[0])) {
      element.setAttribute(key === 'ttsText' ? 'tts-text' : key, value);
    }
  } else if (list.length > 1) {
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = JSON.stringify(list);
    element.append(script);
  }

  previewEl.append(element);
}

/** The snippet the user pastes into their own site. */
function renderSnippet() {
  const name = nameInput.value.trim() || 'Your name';
  const base = pathInput.value.trim().replace(/\/?$/, '/');
  const display = displaySelect.value;

  const entries = takes.map((take, index) => {
    const { label, lang, respell, ipa, synthetic } = fields(take);
    const entry = {};
    if (label) entry.label = label;
    if (lang) entry.lang = lang;
    if (take.buffer) entry.audio = base + fileNameFor(take, index);
    if (respell) entry.respell = respell;
    if (ipa) entry.ipa = ipa;
    if (synthetic) entry.synthetic = true;
    return entry;
  });

  const attrs = [];
  if (display !== 'inline') attrs.push(`display="${display}"`);

  if (entries.length <= 1) {
    const entry = entries[0] ?? {};
    for (const key of ['audio', 'respell', 'ipa', 'lang']) {
      if (entry[key]) attrs.push(`${key}="${escapeAttr(entry[key])}"`);
    }
    if (entry.synthetic) attrs.push('synthetic');
    const open = attrs.length ? `<say-my-name ${attrs.join(' ')}>` : '<say-my-name>';
    snippetEl.textContent = `${open}${name}</say-my-name>`;
    return;
  }

  const json = JSON.stringify(entries, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

  snippetEl.textContent =
    `<say-my-name${attrs.length ? ` ${attrs.join(' ')}` : ''}>\n` +
    `  ${name}\n` +
    `  <script type="application/json">\n${json}\n  </` +
    `script>\n` +
    `</say-my-name>`;
}

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function refresh() {
  for (const [index, take] of takes.entries()) {
    take.el.querySelector('.take-title').textContent =
      takes.length > 1 ? `Pronunciation ${index + 1}` : 'Pronunciation';
    take.el.querySelector('.remove').hidden = takes.length < 2;
  }
  renderPreview();
  renderSnippet();
}

document.querySelector('#add-take').addEventListener('click', addTake);
nameInput.addEventListener('input', refresh);
pathInput.addEventListener('input', refresh);
displaySelect.addEventListener('change', refresh);

document.querySelector('#copy').addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(snippetEl.textContent);
    status.textContent = 'Copied.';
  } catch {
    status.textContent = 'Copy failed — select the snippet and copy it manually.';
  }
  setTimeout(() => (status.textContent = ''), 3000);
});

if (!navigator.mediaDevices?.getUserMedia) {
  document.querySelector('#takes').insertAdjacentHTML(
    'beforebegin',
    '<p class="warn">This browser has no microphone access — but you can still use an ' +
      'audio file, fill in the phonetic fields, and copy the snippet.</p>',
  );
}

addTake();
