import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputs = [
  resolve("public/packs/monkey-bananas/assets/audio/beat-en.wav"),
  resolve("public/packs/monkey-bananas/assets/audio/beat-ko.wav"),
];
const sampleRate = 24_000;
const durationSeconds = 0.42;
const frames = Math.floor(sampleRate * durationSeconds);
const bytes = Buffer.alloc(44 + frames * 2);

bytes.write("RIFF", 0);
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write("WAVEfmt ", 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(sampleRate, 24);
bytes.writeUInt32LE(sampleRate * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(frames * 2, 40);

for (let frame = 0; frame < frames; frame += 1) {
  const time = frame / sampleRate;
  const envelope = Math.min(1, time / 0.018) * Math.exp(-time * 7.2);
  const sample = Math.sin(Math.PI * 2 * 587.33 * time) * 0.7
    + Math.sin(Math.PI * 2 * 880 * time) * 0.3;
  bytes.writeInt16LE(Math.round(sample * envelope * 7_400), 44 + frame * 2);
}

for (const output of outputs) {
  await mkdir(dirname(output), { recursive: true });
  const current = await readFile(output).catch(() => null);
  if (current === null || !current.equals(bytes)) await writeFile(output, bytes);
}
