import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the anonymous game start experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Play with pointer/);
  assert.match(html, /Camera stays on this device/);
  assert.match(html, /https:\/\/github\.com\/ahndohun\/manse-game-monkey-bananas/);
  assert.doesNotMatch(html, /replace-me/);
  assert.doesNotMatch(html, /signin-with-chatgpt|<iframe\b|<form\b/i);
});

test("keeps start controls clickable while localizing the runtime", async () => {
  const clientSource = await readFile("app/GameClient.tsx", "utf8");
  assert.match(clientSource, /closest\("button, a"\)/);
  assert.match(clientSource, /createMansePlayer\(\{[\s\S]*?locale,/);
  assert.match(clientSource, /await player\?\.destroy\(\)/);
  assert.match(clientSource, /selectLocale\("ko"\)/);
  assert.match(clientSource, /selectLocale\("en"\)/);
});

test("uses purposeful localized idle progress without dash placeholders", async () => {
  const response = await render();
  const html = await response.text();
  const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? html;
  assert.match(body, />Ready</);
  assert.doesNotMatch(body, /[—–]/);

  const copySource = await readFile("app/game-config.ts", "utf8");
  assert.match(copySource, /progressReady: "준비"/);
  assert.match(copySource, /progressReady: "Ready"/);
  assert.doesNotMatch(copySource, /[—–]/);
});

test("connects the compact platform shell to the exact public Showcase", async () => {
  const response = await render();
  const html = await response.text();
  const showcaseUrl = "https://manse-showcase.ran584000.chatgpt.site";
  assert.equal(html.match(new RegExp(`href="${showcaseUrl}"`, "g"))?.length, 2);
  assert.match(html, />MANSE</);
  assert.match(html, />Browse games</);

  const config = await readFile("app/game-config.ts", "utf8");
  assert.match(config, /browseGames: "게임 둘러보기"/);
  assert.match(config, /browseGames: "Browse games"/);

  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /\.platform-shell\s*\{[\s\S]*?height:\s*68px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.platform-shell\s*\{\s*height:\s*64px/);
  assert.match(css, /\.platform-shell-inner\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.platform-browse\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.platform-shell-inner\s*\{[^}]*overflow:\s*hidden/);
});

test("ships a locale-aware full-strength game renderer", async () => {
  const source = await readFile("app/themed-renderer.ts", "utf8");
  assert.doesNotMatch(source, /createDefaultRenderer/);
  assert.match(source, /jungle-jump-hero\.png/);
  assert.match(source, /drawImageCover/);
  assert.match(source, /implements RuntimeRenderer/);
  assert.match(source, /drawVideoCover\(context, frame\.video,[\s\S]*frame\.mirror\)/);
  assert.match(source, /drawJungleSet/);
  assert.match(source, /createMonkeyBananasRendererFactory\(locale: GameLocale\)/);
  assert.match(source, /BASKET FULL!/);
  assert.match(source, /바구니 가득!/);
});

test("wires the pointer-compatible full-body jump provider without touching camera mode", async () => {
  const client = await readFile("app/GameClient.tsx", "utf8");
  const provider = await readFile("app/jump-provider.ts", "utf8");
  assert.match(client, /providerFactory: createMonkeyJumpProvider/);
  assert.match(provider, /options\.kind !== "simulated"/);
  assert.match(provider, /landmarks: pose\.landmarks\.map/);
  assert.match(provider, /landmark\.y - rise/);
});

test("build bundles the public contract and pose runtime", async () => {
  const manifest = JSON.parse(await readFile("public/.well-known/manse-game.json", "utf8"));
  assert.equal(typeof manifest.slug, "string");
  assert.equal(manifest.slug.length > 0, true);
  await access(`public/packs/${manifest.slug}/manse.pack.json`);
  await access("dist/client/sw.js");
  await access("dist/client/models/pose_landmarker_lite.task");
  await access("dist/client/vendor/mediapipe/wasm/vision_wasm_internal.wasm");
  const clientEntries = await readdir("dist/client", { recursive: true });
  const scripts = await Promise.all(
    clientEntries.filter((entry) => entry.endsWith(".js")).map((entry) => readFile(`dist/client/${entry}`, "utf8")),
  );
  assert.equal(
    scripts.some((script) => script.includes("serviceWorker") && script.includes("/sw.js")),
    true,
    "the production client must register the bundled service worker",
  );
});
