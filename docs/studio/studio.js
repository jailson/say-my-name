import { encodeWav, envelope, findSpeechBounds, toMono } from './wav.js';

/**
 * The studio: record a name, trim it, download it, copy the snippet.
 *
 * Deliberately has no network code of any kind. If you are reading this to check whether
 * your voice goes anywhere — it doesn't. There is no fetch, no upload, no analytics.
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
  };
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

    status.textContent = 'Recorded';
    take.el.querySelector('.play').disabled = false;
    take.el.querySelector('.dl-wav').disabled = false;
    take.el.querySelector('.dl-raw').disabled = false;
    drawWave(take);
    updateSizes(take);
    refresh();
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
    const ext = take.blob.type.includes('mp4') ? 'm4a' : 'webm';
    download(take.blob, fileNameFor(take, takes.indexOf(take)).replace(/\.wav$/, `.${ext}`));
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
    const { label, lang, respell, ipa } = fields(take);
    const entry = {};
    if (label) entry.label = label;
    if (lang) entry.lang = lang;
    if (respell) entry.respell = respell;
    if (ipa) entry.ipa = ipa;
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
    const { label, lang, respell, ipa } = fields(take);
    const entry = {};
    if (label) entry.label = label;
    if (lang) entry.lang = lang;
    if (take.buffer) entry.audio = base + fileNameFor(take, index);
    if (respell) entry.respell = respell;
    if (ipa) entry.ipa = ipa;
    return entry;
  });

  const attrs = [];
  if (display !== 'inline') attrs.push(`display="${display}"`);

  if (entries.length <= 1) {
    const entry = entries[0] ?? {};
    for (const key of ['audio', 'respell', 'ipa', 'lang']) {
      if (entry[key]) attrs.push(`${key}="${escapeAttr(entry[key])}"`);
    }
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
    '<p class="warn">This browser has no microphone access. You can still fill in the ' +
      'phonetic fields and copy a snippet, then add an audio file yourself.</p>',
  );
}

addTake();
