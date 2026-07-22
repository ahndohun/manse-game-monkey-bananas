import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseEpisodePack } from "@manse/schema";
import { EpisodeSession } from "@manse/runtime-web/testing";
import { synthesizePoseFrames } from "@manse/runtime-web/testing";

/**
 * Evaluator-level motion harness. Pointer simulation cannot jump, so this
 * drives the vendored engine exactly the way the engine's own
 * packages/runtime-web/test/motion.test.ts does: parse the real pack through
 * the shipped schema, build an EpisodeSession (the same loader path the game
 * uses: parseEpisodePack -> EpisodeSession -> createChallengeEvaluator), and
 * replay a synthesized child motion through it. Success must arrive as the
 * session's own "success" audio cue within the pack's timeBudgetMs.
 */

const PACK_URL = new URL("../public/packs/monkey-bananas/manse.pack.json", import.meta.url);
/** Matches DEFAULT_RUNTIME_TUNING.passiveSceneDurationMs in the runtime. */
const SCENE_START_MS = 2_500;

const packJson = JSON.parse(readFileSync(PACK_URL, "utf8"));
const challengeScenes = packJson.scenes.filter((scene) => scene.challenge !== null);

/**
 * A child performing jumps at a comfortable cadence, patterned on the
 * engine's own replay fixture (packages/runtime-web/fixtures/replay/jump.json):
 * stand still while the evaluator calibrates, then per jump spring the whole
 * body up 0.07 of frame height in 150ms (a ~26%-of-torso hop; the pack only
 * asks for 12%), stay airborne 300ms, land, and stand still so the pack's
 * landingStableMs window and cooldownMs elapse. One jump every 2200ms.
 */
function childJumpScript(repetitions) {
  const keyframes = [{ atMs: 0 }];
  let t = 1_500;
  for (let rep = 0; rep < repetitions; rep += 1) {
    keyframes.push({ atMs: t });
    keyframes.push({ atMs: t + 150, body: { dy: -0.07 } });
    keyframes.push({ atMs: t + 450, body: { dy: -0.07 } });
    keyframes.push({ atMs: t + 650 });
    t += 2_200;
  }
  keyframes.push({ atMs: t });
  return { fps: 30, durationMs: t, keyframes };
}

function scriptForChallenge(challenge) {
  if (challenge.type === "jump") return childJumpScript(challenge.repetitions);
  throw new Error(`No child motion script for challenge type '${challenge.type}'.`);
}

/** Run a replay through a full session; returns every event with its time. */
function driveSession(pack, frames) {
  const events = [];
  let now = 0;
  const session = new EpisodeSession(pack, {
    locale: pack.meta.locales[0] ?? "en",
    tier: "S",
    onEvent: (event) => events.push({ at: now, event }),
  });
  session.start(0);
  now = SCENE_START_MS;
  session.tick(SCENE_START_MS);
  for (const frame of frames) {
    now = frame.timestampMs + SCENE_START_MS;
    session.tick(now);
    session.updatePose({ ...frame, timestampMs: now });
  }
  // Let celebration and terminal scenes resolve.
  for (const extra of [1_600, 3_200, 6_000]) session.tick(now + extra);
  return { events, session, endedAt: now };
}

/** Isolate one scene of the real pack: intro -> that scene -> terminal. */
function harnessPackFor(sceneId) {
  const scene = packJson.scenes.find((candidate) => candidate.id === sceneId);
  const narration = {
    items: [
      { locale: "ko", text: "준비!", audioAssetId: null },
      { locale: "en", text: "Ready!", audioAssetId: null },
    ],
    captionDefaultOn: true,
  };
  return parseEpisodePack({
    ...packJson,
    entrySceneId: "harness-intro",
    scenes: [
      {
        id: "harness-intro",
        kind: "story",
        narration,
        demo: null,
        challenge: null,
        learning: null,
        artAssetId: null,
        energy: "calm",
        terminal: false,
        transitions: [{ on: "always", to: sceneId, adapt: null }],
      },
      {
        ...scene,
        transitions: [
          { on: "success", to: "harness-finish", adapt: null },
          { on: "struggle", to: "harness-finish", adapt: null },
        ],
      },
      {
        id: "harness-finish",
        kind: "celebration",
        narration,
        demo: null,
        challenge: null,
        learning: null,
        artAssetId: null,
        energy: "calm",
        terminal: true,
        transitions: [],
      },
    ],
  });
}

function successAt(events) {
  const cue = events.find(({ event }) => event.type === "audio-cue" && event.purpose === "success");
  return cue === undefined ? null : cue.at;
}

function struggled(events) {
  return events.some(({ event }) => event.type === "audio-cue" && event.purpose === "encourage");
}

function progressEvents(events) {
  return events.filter(({ event }) => event.type === "challenge-progress");
}

test("pack parses through the shipped @manse/schema validator", () => {
  const pack = parseEpisodePack(packJson);
  assert.equal(pack.scenes.length, packJson.scenes.length);
  assert.equal(challengeScenes.length > 0, true, "expected at least one challenge scene");
});

for (const scene of challengeScenes) {
  const challenge = scene.challenge;
  test(`scene '${scene.id}': a child's ${challenge.type} clears within timeBudgetMs`, () => {
    const script = scriptForChallenge(challenge);
    const { events } = driveSession(harnessPackFor(scene.id), synthesizePoseFrames(script));

    const at = successAt(events);
    assert.notEqual(at, null, `expected a success cue; events: ${JSON.stringify(events)}`);
    const measuredMs = at - SCENE_START_MS;
    const progress = progressEvents(events);
    assert.equal(progress.length, challenge.repetitions, "every repetition must be counted once");
    assert.deepEqual([...new Set(progress.map(({ event }) => event.label))], [challenge.type]);
    assert.equal(struggled(events), false, "a comfortable child cadence must never trigger struggle");
    assert.equal(
      measuredMs <= challenge.timeBudgetMs,
      true,
      `cleared in ${measuredMs}ms but budget is ${challenge.timeBudgetMs}ms`,
    );
    assert.equal(events.at(-1)?.event.type, "complete");
    console.log(
      `    [motion] ${scene.id}: ${challenge.repetitions}x ${challenge.type} cleared in `
      + `${measuredMs}ms of ${challenge.timeBudgetMs}ms budget `
      + `(${Math.round((measuredMs / challenge.timeBudgetMs) * 100)}% used, `
      + `${challenge.timeBudgetMs - measuredMs}ms headroom; script ${script.durationMs}ms @ ${script.fps}fps)`,
    );
  });
}

test("full pack: child motion completes the real scene flow end-to-end", () => {
  const pack = parseEpisodePack(packJson);
  const events = [];
  let now = 0;
  let sequenceOffset = 0;
  const session = new EpisodeSession(pack, {
    locale: "en",
    tier: "S",
    onEvent: (event) => events.push({ at: now, event }),
  });
  session.start(0);
  now = SCENE_START_MS;
  session.tick(now);

  for (const scene of challengeScenes) {
    assert.equal(session.getSnapshot(now).scene.id, scene.id);
    const frames = synthesizePoseFrames(scriptForChallenge(scene.challenge));
    const sceneStartedAt = now;
    for (const frame of frames) {
      now = sceneStartedAt + frame.timestampMs;
      session.tick(now);
      session.updatePose({ ...frame, sequence: frame.sequence + sequenceOffset, timestampMs: now });
    }
    sequenceOffset += frames.length;
    assert.equal(session.getSnapshot(now).status, "celebrating", `${scene.id} should resolve before the next beat`);
    now += 1_600;
    session.tick(now);
  }
  assert.equal(session.getSnapshot(now).scene.id, "complete");
  now += 1_600;
  session.tick(now);

  const visited = events
    .filter(({ event }) => event.type === "scene-changed")
    .map(({ event }) => event.sceneId);
  assert.deepEqual(visited, [packJson.entrySceneId, ...challengeScenes.map((scene) => scene.id), "complete"]);
  assert.equal(events.filter(({ event }) => event.type === "audio-cue" && event.purpose === "success").length, 3);
  assert.equal(progressEvents(events).length, 5);
  assert.equal(events.at(-1)?.event.type, "complete");
  console.log(
    `    [motion] full pack: five jumps across three escalating beats; scenes visited: ${visited.join(" -> ")}`,
  );
});
