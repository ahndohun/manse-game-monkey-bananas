import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

async function loadProviderModule() {
  const runtimeUrl = pathToFileURL(resolve("node_modules/@manse/runtime-web/lib/index.js")).href;
  const source = (await readFile("app/jump-provider.ts", "utf8"))
    .replace('"@manse/runtime-web"', JSON.stringify(runtimeUrl));
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

function manualTiming() {
  let now = 0;
  let nextHandle = 1;
  const callbacks = new Map();
  return {
    now: () => now,
    setTimeout(callback) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    clearTimeout(handle) { callbacks.delete(handle); },
    async frame(delta = 40) {
      now += delta;
      const entry = callbacks.entries().next().value;
      assert.notEqual(entry, undefined, "simulated provider should schedule a frame");
      callbacks.delete(entry[0]);
      await entry[1]();
    },
  };
}

test("pointer Y gesture drives a full-body takeoff and landing through the real provider factory", async () => {
  const { createMonkeyJumpProvider, POINTER_JUMP_GESTURE } = await loadProviderModule();
  const timing = manualTiming();
  const provider = await createMonkeyJumpProvider({
    kind: "simulated",
    tier: "A",
    mirror: true,
    mediaPipeAssets: { wasmBaseUrl: "/wasm", fullModelUrl: "/full.task", liteModelUrl: "/lite.task" },
    document: {},
    timing,
  });
  const frames = [];
  provider.subscribe((frame) => frames.push(frame));
  await provider.initialize();
  await provider.start();

  provider.setPointer(0.5, 0.7);
  for (let index = 0; index < 5; index += 1) await timing.frame();
  const groundedHip = frames.at(-1).poses[0].landmarks.find((landmark) => landmark.name === "left_hip").y;

  provider.setPointer(0.5, 0.24);
  await timing.frame();
  const airborneHip = frames.at(-1).poses[0].landmarks.find((landmark) => landmark.name === "left_hip").y;
  assert.equal(groundedHip - airborneHip >= POINTER_JUMP_GESTURE.bodyRise - 0.001, true);

  provider.setPointer(0.5, 0.72);
  await timing.frame();
  const landedHip = frames.at(-1).poses[0].landmarks.find((landmark) => landmark.name === "left_hip").y;
  assert.equal(Math.abs(landedHip - groundedHip) < 0.001, true);
  assert.equal(provider.kind, "simulated");
  assert.equal(provider.id, "monkey-pointer-jump");
  await provider.destroy();
});

test("camera providers remain the engine default and are never pointer-adapted", async () => {
  const { createMonkeyJumpProvider } = await loadProviderModule();
  const timing = manualTiming();
  const provider = await createMonkeyJumpProvider({
    kind: "mediapipe",
    tier: "A",
    mirror: true,
    mediaPipeAssets: { wasmBaseUrl: "/wasm", fullModelUrl: "/full.task", liteModelUrl: "/lite.task" },
    document: {},
    timing,
  });
  assert.equal(provider.id, "mediapipe");
  assert.equal("setPointer" in provider, false);
  await provider.destroy();
});
