"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMansePlayer, type MansePlayer, type PlayerSnapshot, type ProviderKind } from "@manse/runtime-web";
import { GAME_CONFIG } from "./game-config";

const PACK_URL = `/packs/${GAME_CONFIG.slug}/manse.pack.json`;
const EMPTY: Pick<PlayerSnapshot, "phase" | "provider" | "tier" | "renderer" | "cameraActive" | "targetProgress" | "caption"> = {
  phase: "idle",
  provider: "simulated",
  tier: "A",
  renderer: null,
  cameraActive: false,
  targetProgress: null,
  caption: null,
};

export function GameClient() {
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<MansePlayer | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async (provider: ProviderKind) => {
    const container = stageRef.current;
    if (container === null) return;
    const runId = ++runIdRef.current;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    await playerRef.current?.destroy();
    if (runId !== runIdRef.current) return;

    const player = createMansePlayer({
      container,
      provider,
      captions: true,
      reducedStimulation: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onEvent: (event) => {
        if (runId !== runIdRef.current) return;
        if (event.type === "error") setError(event.error.message);
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
    } catch (cause) {
      if (runId === runIdRef.current) setError(cause instanceof Error ? cause.message : "The game could not start.");
    } finally {
      if (runId === runIdRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
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
    ? "Needs attention"
    : busy
      ? "Starting"
      : snapshot.phase === "complete"
        ? "Complete"
        : snapshot.phase === "idle"
          ? "Choose how to play"
          : snapshot.cameraActive
            ? "Camera stays on device"
            : "Simulator live";

  return (
    <section className="player-shell" aria-label="Game player">
      <div className="player-bar">
        <span><i className={error === null ? "status-dot" : "status-dot status-error"} aria-hidden="true" /> {status}</span>
        <span>{snapshot.renderer ?? "runtime ready"} · tier {snapshot.tier}</span>
      </div>
      <div
        className="stage"
        ref={stageRef}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          movePointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => movePointer(event.clientX, event.clientY)}
        aria-label="Interactive motion game stage"
      >
        {snapshot.phase === "idle" && (
          <div className="start-card">
            <p>Start with the simulator. Camera mode is optional and asks permission only after you choose it.</p>
            <div className="actions">
              <button type="button" onClick={() => start("simulated")} disabled={busy}>Play with pointer</button>
              <button className="secondary" type="button" onClick={() => start("mediapipe")} disabled={busy}>Use my camera</button>
            </div>
          </div>
        )}
      </div>
      <div className="player-footer" aria-live="polite">
        <span>{error ?? snapshot.caption ?? "Choose a private, comfortable play space."}</span>
        <strong>{progress === null ? "—" : `${progress.completed} / ${progress.total}`}</strong>
      </div>
      {snapshot.phase !== "idle" && (
        <div className="restart-row">
          <button type="button" onClick={() => start("simulated")} disabled={busy}>Restart with pointer</button>
          <button className="text-button" type="button" onClick={() => start("mediapipe")} disabled={busy}>Switch to camera</button>
        </div>
      )}
    </section>
  );
}
