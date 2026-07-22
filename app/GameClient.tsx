"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMansePlayer, type MansePlayer, type PlayerSnapshot, type ProviderKind } from "@manse/runtime-web";
import { GAME_CONFIG, type GameLocale, UI_COPY } from "./game-config";
import { createMonkeyJumpProvider } from "./jump-provider";
import { createMonkeyBananasRendererFactory } from "./themed-renderer";

const PACK_URL = `/packs/${GAME_CONFIG.slug}/manse.pack.json`;
const EMPTY: Pick<PlayerSnapshot, "phase" | "provider" | "cameraActive" | "targetProgress" | "caption"> = {
  phase: "idle",
  provider: "simulated",
  cameraActive: false,
  targetProgress: null,
  caption: null,
};

function browserLocale(): GameLocale {
  return navigator.languages.some((language) => language.toLowerCase().startsWith("ko")) ? "ko" : "en";
}

export function GameClient() {
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<MansePlayer | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const [locale, setLocale] = useState<GameLocale>(GAME_CONFIG.defaultLocale);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = UI_COPY[locale];

  const boot = useCallback(async (provider: ProviderKind) => {
    const container = stageRef.current;
    if (container === null) return;
    const runId = ++runIdRef.current;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    const previousPlayer = playerRef.current;
    playerRef.current = null;
    await previousPlayer?.destroy();
    if (runId !== runIdRef.current) return;

    const player = createMansePlayer({
      container,
      locale,
      provider,
      providerFactory: createMonkeyJumpProvider,
      rendererFactory: createMonkeyBananasRendererFactory(locale),
      captions: true,
      reducedStimulation: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onEvent: (event) => {
        if (runId !== runIdRef.current) return;
        if (event.type === "error") setError(copy.startError);
      },
    });
    playerRef.current = player;
    unsubscribeRef.current = player.subscribe((next) => {
      if (runId === runIdRef.current) setSnapshot(next);
    });
    try {
      await player.load(PACK_URL);
      await player.setup();
      await player.play();
    } catch {
      if (runId === runIdRef.current) setError(copy.startError);
    } finally {
      if (runId === runIdRef.current) setBusy(false);
    }
  }, [copy.startError, locale]);

  useEffect(() => {
    const detectedLocale = browserLocale();
    setLocale(detectedLocale);
    document.documentElement.lang = detectedLocale;
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      runIdRef.current += 1;
      unsubscribeRef.current?.();
      void playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  const start = (provider: ProviderKind) => {
    setBusy(true);
    setError(null);
    void boot(provider);
  };

  const selectLocale = async (nextLocale: GameLocale) => {
    if (nextLocale === locale || busy) return;
    const runId = ++runIdRef.current;
    setBusy(true);
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    const player = playerRef.current;
    playerRef.current = null;
    await player?.destroy().catch(() => undefined);
    if (runId !== runIdRef.current) return;
    setError(null);
    setSnapshot(EMPTY);
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    setBusy(false);
  };

  const movePointer = (clientX: number, clientY: number) => {
    if (busy || snapshot.provider !== "simulated") return;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width === 0 || bounds.height === 0) return;
    try {
      playerRef.current?.setPointer((clientX - bounds.left) / bounds.width, (clientY - bounds.top) / bounds.height);
    } catch {
      // Mode changes can overlap one final pointer event.
    }
  };

  const progress = snapshot.targetProgress;
  const status = error !== null
    ? copy.statusAttention
    : busy
      ? copy.statusStarting
      : snapshot.phase === "complete"
        ? copy.statusComplete
        : snapshot.phase === "idle"
          ? copy.statusChoose
          : snapshot.cameraActive
            ? copy.statusCamera
            : copy.statusSimulator;

  return (
    <main>
      <header className="game-hero">
        <img className="hero-art" src={GAME_CONFIG.heroUrl} alt={copy.heroAlt} width="1672" height="941" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-topline">
          <p className="kicker">{copy.kicker}</p>
          <div className="locale-switcher" role="group" aria-label={copy.localeLabel}>
            <button type="button" className="locale-button" aria-pressed={locale === "ko"} onClick={() => void selectLocale("ko")} disabled={busy}>
              KO<span className="sr-only"> · {copy.korean}</span>
            </button>
            <button type="button" className="locale-button" aria-pressed={locale === "en"} onClick={() => void selectLocale("en")} disabled={busy}>
              EN<span className="sr-only"> · {copy.english}</span>
            </button>
          </div>
        </div>
        <div className="hero-copy">
          <h1>{copy.pageTitle}</h1>
          <p className="summary">{copy.summary}</p>
          <div className="privacy-line"><span aria-hidden="true" /> {copy.privacy}</div>
        </div>
      </header>

      <section className="player-shell" aria-label={copy.playerLabel}>
        <div className="player-bar">
          <span><i className={error === null ? "status-dot" : "status-dot status-error"} aria-hidden="true" /> {status}</span>
          <span>{copy.missionSpec}</span>
        </div>
        <div
          className="stage"
          ref={stageRef}
          onPointerDown={(event) => {
            // Keep start-card controls clickable: capturing their pointer here
            // would retarget the eventual click to the stage.
            if ((event.target as HTMLElement).closest("button, a")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            movePointer(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => movePointer(event.clientX, event.clientY)}
          aria-label={copy.stageLabel}
        >
          {snapshot.phase === "idle" && (
            <div className="start-card">
              <p>{copy.startHelp}</p>
              <div className="actions">
                <button type="button" onClick={() => start("simulated")} disabled={busy}>{copy.playPointer}</button>
                <button className="secondary" type="button" onClick={() => start("mediapipe")} disabled={busy}>{copy.useCamera}</button>
              </div>
            </div>
          )}
        </div>
        <div className="player-footer" aria-live="polite">
          <span>{error ?? snapshot.caption ?? copy.comfort}</span>
          <strong aria-label={copy.progressLabel}>{progress === null ? "—" : `${progress.completed} / ${progress.total}`}</strong>
        </div>
        {snapshot.phase !== "idle" && (
          <div className="restart-row">
            <button type="button" onClick={() => start("simulated")} disabled={busy}>{copy.restartPointer}</button>
            <button className="text-button" type="button" onClick={() => start("mediapipe")} disabled={busy}>{copy.switchCamera}</button>
          </div>
        )}
      </section>

      <footer>
        <p>{copy.footer}</p>
        <a href={GAME_CONFIG.sourceUrl}>{copy.source} <span aria-hidden="true">↗</span></a>
      </footer>
    </main>
  );
}
