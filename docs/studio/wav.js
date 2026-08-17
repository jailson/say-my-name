/**
 * Minimal 16-bit PCM WAV encoder.
 *
 * Exists because MediaRecorder hands back webm/opus in Chrome and Firefox but mp4/aac in
 * Safari, and neither can be trimmed without re-encoding. Decoding to an AudioBuffer,
 * cutting it, and writing a WAV by hand keeps this page dependency-free and gives a file
 * every browser can play back.
 */

/** Mix an AudioBuffer down to one channel — a name clip has no use for stereo. */
export function toMono(buffer, from = 0, to = buffer.length) {
  const length = Math.max(0, to - from);
  const out = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) out[i] += data[from + i] / buffer.numberOfChannels;
  }
  return out;
}

/**
 * Find the speech inside a take, so the button plays a name and not two seconds of room
 * tone. Threshold is relative to the loudest sample, with a little padding kept either
 * side so the first consonant is not clipped off.
 */
export function findSpeechBounds(samples, sampleRate, { threshold = 0.06, padSeconds = 0.08 } = {}) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return { start: 0, end: samples.length };

  const floor = peak * threshold;
  let start = 0;
  let end = samples.length - 1;
  while (start < samples.length && Math.abs(samples[start]) < floor) start += 1;
  while (end > start && Math.abs(samples[end]) < floor) end -= 1;

  const pad = Math.round(padSeconds * sampleRate);
  return {
    start: Math.max(0, start - pad),
    end: Math.min(samples.length, end + pad),
  };
}

/** Wrap mono float samples in a WAV container. */
export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** Peak envelope for drawing a waveform, reduced to `buckets` columns. */
export function envelope(samples, buckets) {
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const peaks = [];
  for (let i = 0; i < buckets; i += 1) {
    let peak = 0;
    const start = i * size;
    for (let j = start; j < start + size && j < samples.length; j += 1) {
      peak = Math.max(peak, Math.abs(samples[j]));
    }
    peaks.push(peak);
  }
  return peaks;
}
