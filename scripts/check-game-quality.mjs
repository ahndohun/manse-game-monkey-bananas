import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const release = process.argv.includes("--release");
const root = process.cwd();
const failures = [];
const experience = await readJson(".manse/experience.json");
const manifest = await readJson("public/.well-known/manse-game.json");
const pack = await readJson(`public/packs/${manifest.slug}/manse.pack.json`);

requireText(experience.identity?.fantasy, "identity.fantasy", 24);
requireText(experience.identity?.playerVerb, "identity.playerVerb", 12);
requireText(experience.identity?.targetMetaphor, "identity.targetMetaphor", 24);

const beats = Array.isArray(experience.beats) ? experience.beats : [];
if (beats.length < 3) failures.push("experience.beats must define at least three authored beats.");
const beatIds = beats.map((beat) => beat?.id).filter((id) => typeof id === "string");
if (new Set(beatIds).size !== beatIds.length) failures.push("experience beat ids must be unique.");
const challenges = (pack.scenes ?? []).filter((scene) => scene?.challenge !== null);
if (challenges.length < 3) failures.push("the pack must contain at least three challenge beats.");
if (new Set(challenges.map((scene) => JSON.stringify(scene.challenge))).size < 3) {
  failures.push("challenge beats must use observably distinct parameters.");
}
for (const beatId of beatIds.slice(0, 3)) {
  if (!challenges.some((scene) => scene.id === beatId)) failures.push(`experience beat '${beatId}' has no matching challenge scene.`);
}
if ((pack.assets?.audio?.length ?? 0) < 3) failures.push("the declarative pack must contain at least three gameplay audio cues.");
const appSource = await readFile("app/GameClient.tsx", "utf8");
if (/\b(?:runtime ready|device tier|TIER [A-C])\b/iu.test(appSource)) failures.push("debug runtime/tier copy must not appear in the player UI.");

const presenterPath = await evidenceFile(experience.presenter?.source, "presenter.source", 500, [".ts", ".tsx"]);
if (presenterPath !== null) {
  const source = await readFile(presenterPath, "utf8");
  if (source.includes("createDefaultRenderer")) failures.push("the game renderer must not compose createDefaultRenderer.");
  for (const marker of ["implements RuntimeRenderer", "drawVideoCover", "frame.video", "frame.mirror", "drawJungleSet", "GameLocale", "COPY"]) {
    if (!source.includes(marker)) failures.push(`presenter is missing required camera/simulator/locale marker '${marker}'.`);
  }
}
if (!Array.isArray(experience.presenter?.themedEntities) || experience.presenter.themedEntities.length < 3) {
  failures.push("presenter.themedEntities must name at least three in-play fantasy objects.");
}
if (!Array.isArray(experience.presenter?.reactiveStates) || experience.presenter.reactiveStates.length < 3) {
  failures.push("presenter.reactiveStates must document at least three visible states.");
}
requireText(experience.presenter?.continuousFeedback, "presenter.continuousFeedback", 32);
requireText(experience.presenter?.scoreAndResolution, "presenter.scoreAndResolution", 32);

if (release) {
  if (experience.status !== "approved") failures.push("experience.status must be 'approved' before release.");
  const gates = experience.qualityGates ?? {};
  for (const gate of [
    "themedEntitiesInPlay", "threeReactiveStates", "continuousInputFeedback", "authoredEscalation",
    "scoreAndResolution", "threeGameplaySounds", "noDebugChrome", "cameraSimulatorParity", "reducedMotionVerified",
  ]) {
    if (gates[gate] !== true) failures.push(`qualityGates.${gate} must be verified true before release.`);
  }
  await evidenceFile(experience.evidence?.gameplayScreenshot, "evidence.gameplayScreenshot", 40_000, [".png", ".jpg", ".jpeg", ".webp"]);
  await evidenceFile(experience.evidence?.completionScreenshot, "evidence.completionScreenshot", 40_000, [".png", ".jpg", ".jpeg", ".webp"]);
  await evidenceFile(experience.evidence?.playtestNotes, "evidence.playtestNotes", 120, [".md", ".txt"]);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(release ? "Game-quality release gate passed." : "Game-quality concept contract passed.");
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    failures.push(`${path} is missing or invalid JSON.`);
    return {};
  }
}

function requireText(value, name, minimum) {
  if (typeof value !== "string" || value.trim().length < minimum) failures.push(`${name} must contain at least ${minimum} characters.`);
}

async function evidenceFile(value, name, minimumBytes, extensions = null) {
  if (typeof value !== "string" || value.trim() === "") {
    failures.push(`${name} must point to real release evidence.`);
    return null;
  }
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (rel.startsWith(`..${sep}`) || rel === ".." || rel.startsWith(sep)) {
    failures.push(`${name} must stay inside the game project.`);
    return null;
  }
  if (extensions !== null && !extensions.some((extension) => absolute.toLowerCase().endsWith(extension))) {
    failures.push(`${name} has an unsupported file extension.`);
    return null;
  }
  try {
    const info = await stat(absolute);
    if (!info.isFile() || info.size < minimumBytes) failures.push(`${name} is too small to be credible release evidence.`);
    return absolute;
  } catch {
    failures.push(`${name} does not exist.`);
    return null;
  }
}
