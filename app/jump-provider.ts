import {
  createDefaultPoseProvider,
  type PoseFrameListener,
  type PoseInputSource,
  type PoseProviderMetrics,
  type ProviderFactory,
  type RuntimePoseFrame,
  type RuntimePoseProvider,
} from "@manse/runtime-web";

const TAKEOFF_POINTER_Y = 0.4;
const LANDING_POINTER_Y = 0.54;
const BODY_RISE = 0.105;

interface PointerControllableProvider extends RuntimePoseProvider {
  setPointer(x: number, y: number, side?: "left" | "right"): void;
}

class PointerJumpProvider implements RuntimePoseProvider {
  private readonly listeners = new Set<PoseFrameListener>();
  private readonly unsubscribe: () => void;
  private latest: RuntimePoseFrame | null = null;
  private bodyRise = 0;

  constructor(private readonly inner: PointerControllableProvider) {
    this.unsubscribe = inner.subscribe((frame) => this.handleFrame(frame));
  }

  get id(): string { return "monkey-pointer-jump"; }
  get kind(): "simulated" { return "simulated"; }
  get state(): RuntimePoseProvider["state"] { return this.inner.state; }

  initialize(): Promise<void> { return this.inner.initialize(); }

  async start(source?: PoseInputSource): Promise<void> {
    this.bodyRise = 0;
    this.latest = null;
    await this.inner.start(source);
  }

  pause(): void { this.inner.pause(); }
  resume(): void { this.inner.resume(); }
  stop(): Promise<void> { return this.inner.stop(); }

  async destroy(): Promise<void> {
    this.unsubscribe();
    this.listeners.clear();
    this.latest = null;
    await this.inner.destroy();
  }

  subscribe(listener: PoseFrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLatestFrame(): RuntimePoseFrame | null { return this.latest; }
  getMetrics(): PoseProviderMetrics { return this.inner.getMetrics(); }

  setPointer(x: number, y: number, side: "left" | "right" = "right"): void {
    this.inner.setPointer(x, y, side);
    if (y <= TAKEOFF_POINTER_Y) this.bodyRise = BODY_RISE;
    else if (y >= LANDING_POINTER_Y) this.bodyRise = 0;
  }

  private handleFrame(frame: RuntimePoseFrame): void {
    const rise = this.bodyRise;
    const transformed: RuntimePoseFrame = rise === 0
      ? frame
      : {
          ...frame,
          poses: frame.poses.map((pose) => ({
            ...pose,
            landmarks: pose.landmarks.map((landmark) => ({
              ...landmark,
              y: Math.max(0.01, landmark.y - rise),
            })),
          })),
        };
    this.latest = transformed;
    for (const listener of this.listeners) listener(transformed);
  }
}

export const createMonkeyJumpProvider: ProviderFactory = async (options) => {
  const provider = await createDefaultPoseProvider(options);
  if (options.kind !== "simulated" || !("setPointer" in provider)) return provider;
  return new PointerJumpProvider(provider as PointerControllableProvider);
};

export const POINTER_JUMP_GESTURE = {
  takeoffY: TAKEOFF_POINTER_Y,
  landingY: LANDING_POINTER_Y,
  bodyRise: BODY_RISE,
} as const;
