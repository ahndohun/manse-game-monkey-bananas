import {
  type RendererFactory,
  type RendererFactoryOptions,
  type RuntimeRenderFrame,
  type RuntimeRenderer,
} from "@manse/runtime-web";
import type { GameLocale } from "./game-config";

const THEME = {
  banana: "#ffd447",
  bananaShade: "#e9a91d",
  bananaLight: "#fff2a6",
  leaf: "#318457",
  leafDark: "#123d2b",
  bark: "#8e4b25",
  cream: "#fff4cf",
  reactionMs: 760,
  maxDpr: 2,
} as const;

const TOTAL_BANANAS = 5;
const SIMULATOR_ART_URL = "/packs/monkey-bananas/assets/images/jungle-jump-hero.png";
const FONT = '"Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif';
const COPY = {
  en: {
    aria: "Jungle jump play field with five collectible banana bunches and a cheering monkey",
    mission: "CANOPY HARVEST",
    progress: "BANANAS",
    cue: "JUMP TO PICK",
    reactions: ["GREAT PICK!", "NICE LEAP!", "BANANA CAUGHT!", "WHAT A JUMP!", "BASKET READY!"],
    complete: "BASKET FULL!",
    completeBody: "Five golden bananas are safe. The jungle is celebrating!",
    camera: "LOCAL CAMERA · LIVE",
    simulator: "JUNGLE TRAINING · LIVE",
  },
  ko: {
    aria: "바나나 다섯 송이와 응원하는 원숭이가 있는 정글 점프 게임 공간",
    mission: "정글 바나나 수확",
    progress: "모은 바나나",
    cue: "점프해서 따기",
    reactions: ["멋지게 땄어요!", "좋은 점프예요!", "바나나 획득!", "정말 높이 뛰었어요!", "바구니 준비 완료!"],
    complete: "바구니 가득!",
    completeBody: "황금 바나나 다섯 송이를 모두 모았어요. 정글 친구들이 축하해요!",
    camera: "기기 내 카메라 · 실행 중",
    simulator: "정글 포인터 훈련 · 실행 중",
  },
} as const;

type Burst = { x: number; y: number; startedAt: number };

export function createMonkeyBananasRendererFactory(locale: GameLocale): RendererFactory {
  return (options) => new MonkeyBananasRenderer(options, locale);
}

class MonkeyBananasRenderer implements RuntimeRenderer {
  readonly kind = "canvas2d" as const;
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly simulatorArt: HTMLImageElement;
  private readonly copy: (typeof COPY)[GameLocale];
  private readonly bursts: Burst[] = [];
  private sceneCompleted = 0;
  private missionCompleted = 0;
  private reactionUnit = 0;
  private reactionStartedAt = Number.NEGATIVE_INFINITY;
  private destroyed = false;

  constructor(options: RendererFactoryOptions, locale: GameLocale) {
    this.copy = COPY[locale];
    this.element = options.document.createElement("div");
    this.element.dataset.manseRenderer = "monkey-bananas";
    this.element.setAttribute("role", "img");
    this.element.setAttribute("aria-label", this.copy.aria);
    Object.assign(this.element.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: "320px",
      overflow: "hidden",
      background: THEME.leafDark,
      touchAction: "none",
    });
    this.canvas = options.document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    const context = this.canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.simulatorArt = options.document.createElement("img");
    this.simulatorArt.decoding = "async";
    this.simulatorArt.src = SIMULATOR_ART_URL;
    this.element.append(this.canvas);
    options.container.append(this.element);
  }

  render(frame: RuntimeRenderFrame): void {
    if (this.destroyed) return;
    const { canvas, context } = this;
    const { width, height } = prepareCanvas(this.element, canvas, context, frame.tier);
    if (width === 0 || height === 0) return;
    context.clearRect(0, 0, width, height);

    if (frame.video !== null && frame.video.readyState >= 2) {
      drawVideoCover(context, frame.video, width, height, frame.mirror);
      drawCameraGrade(context, width, height);
    } else if (this.simulatorArt.complete && this.simulatorArt.naturalWidth > 0) {
      drawImageCover(context, this.simulatorArt, width, height);
      drawSimulatorGrade(context, width, height);
    } else {
      drawJungleSet(context, width, height, frame.timestampMs, frame.reducedStimulation);
    }

    const guide = frame.challenge?.kind === "jump" ? frame.challenge : null;
    if (guide !== null && guide.completedUnits < this.sceneCompleted) this.sceneCompleted = 0;
    if (guide !== null && guide.completedUnits > this.sceneCompleted) {
      const gained = guide.completedUnits - this.sceneCompleted;
      for (let step = 0; step < gained; step += 1) {
        const nextUnit = Math.min(TOTAL_BANANAS, this.missionCompleted + step + 1);
        const point = bananaPoint(nextUnit - 1, TOTAL_BANANAS, width, height);
        this.bursts.push({ x: point.x, y: point.y, startedAt: frame.timestampMs });
      }
      this.missionCompleted = Math.min(TOTAL_BANANAS, this.missionCompleted + gained);
      this.reactionUnit = this.missionCompleted;
      this.reactionStartedAt = frame.timestampMs;
      this.sceneCompleted = guide.completedUnits;
    }

    drawCanopyFrame(context, width, height, frame.timestampMs, frame.reducedStimulation);
    drawBananaCourse(context, width, height, TOTAL_BANANAS, this.missionCompleted, frame.timestampMs, frame.reducedStimulation);
    drawBasket(context, width * 0.84, height * 0.83, Math.min(width, height) * 0.13, this.missionCompleted);
    drawMonkey(
      context,
      width * 0.16,
      height * 0.78,
      Math.min(width, height) * 0.15,
      frame.timestampMs,
      frame.reducedStimulation,
      guide?.phase === "active" || guide?.phase === "holding",
      this.reactionUnit > 0 ? Math.min(1, Math.max(0, (frame.timestampMs - this.reactionStartedAt) / THEME.reactionMs)) : 1,
      frame.celebrationProgress,
    );
    drawJumpCue(context, width, height, guide?.progress ?? 0, guide?.phase ?? "idle", frame.timestampMs, frame.reducedStimulation);

    for (let index = this.bursts.length - 1; index >= 0; index -= 1) {
      const age = frame.timestampMs - this.bursts[index].startedAt;
      if (age > THEME.reactionMs) {
        this.bursts.splice(index, 1);
        continue;
      }
      drawHarvestBurst(context, this.bursts[index], age / THEME.reactionMs, width, height, frame.reducedStimulation);
    }

    if (frame.celebrationProgress > 0) {
      drawCelebration(context, width, height, frame.celebrationProgress, frame.timestampMs, frame.reducedStimulation);
    }
    drawMonkeyHud(
      context,
      width,
      height,
      frame,
      this.copy,
      this.missionCompleted,
      this.reactionUnit,
      this.reactionStartedAt,
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.bursts.length = 0;
    this.element.remove();
  }
}

function prepareCanvas(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  tier: RuntimeRenderFrame["tier"],
) {
  const width = Math.max(1, element.clientWidth || 960);
  const height = Math.max(1, element.clientHeight || 620);
  const deviceRatio = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const tierLimit = tier === "S" || tier === "A" ? THEME.maxDpr : tier === "B" ? 1.5 : 1;
  const dpr = Math.min(deviceRatio, tierLimit);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function drawVideoCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  mirror: boolean,
) {
  const sourceWidth = Math.max(1, video.videoWidth || 1280);
  const sourceHeight = Math.max(1, video.videoHeight || 720);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  context.save();
  if (mirror) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  context.restore();
}

function drawCameraGrade(context: CanvasRenderingContext2D, width: number, height: number) {
  const vignette = context.createRadialGradient(width * 0.5, height * 0.44, width * 0.08, width * 0.5, height * 0.48, width * 0.74);
  vignette.addColorStop(0, "rgba(6,35,24,.02)");
  vignette.addColorStop(0.7, "rgba(6,35,24,.12)");
  vignette.addColorStop(1, "rgba(3,22,15,.68)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  if (sourceRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }
  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

function drawSimulatorGrade(context: CanvasRenderingContext2D, width: number, height: number) {
  const grade = context.createLinearGradient(0, 0, 0, height);
  grade.addColorStop(0, "rgba(3,24,16,.1)");
  grade.addColorStop(0.58, "rgba(3,24,16,.18)");
  grade.addColorStop(1, "rgba(3,20,14,.68)");
  context.fillStyle = grade;
  context.fillRect(0, 0, width, height);
}

function drawJungleSet(context: CanvasRenderingContext2D, width: number, height: number, time: number, reduced: boolean) {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#4fa17b");
  sky.addColorStop(0.52, "#1f6a45");
  sky.addColorStop(1, "#071d16");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  const sun = context.createRadialGradient(width * 0.72, height * 0.18, 0, width * 0.72, height * 0.18, width * 0.42);
  sun.addColorStop(0, "rgba(255,238,155,.42)");
  sun.addColorStop(1, "rgba(255,238,155,0)");
  context.fillStyle = sun;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#0d422d";
  context.beginPath();
  context.moveTo(0, height * 0.72);
  for (let index = 0; index <= 10; index += 1) {
    const x = (index / 10) * width;
    const y = height * (0.68 + (index % 3) * 0.045);
    context.lineTo(x, y);
  }
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.fill();
  const drift = reduced ? 0 : Math.sin(time / 1_500) * width * 0.008;
  context.fillStyle = "rgba(8,48,32,.72)";
  for (let index = 0; index < 6; index += 1) {
    context.beginPath();
    context.arc(width * (index * 0.2) + drift, height * (0.68 + (index % 2) * 0.06), width * 0.13, 0, Math.PI * 2);
    context.fill();
  }
}

function drawMonkeyHud(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: RuntimeRenderFrame,
  copy: (typeof COPY)[GameLocale],
  completed: number,
  reactionUnit: number,
  reactionStartedAt: number,
) {
  context.save();
  context.fillStyle = "rgba(4,29,20,.82)";
  context.strokeStyle = "rgba(255,244,207,.36)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.roundRect(width * 0.03, height * 0.035, width * 0.3, Math.max(54, height * 0.09), 18);
  context.fill();
  context.stroke();
  context.fillStyle = THEME.banana;
  context.font = `800 ${Math.max(12, width * 0.014)}px ${FONT}`;
  context.textAlign = "left";
  context.fillText(copy.mission, width * 0.052, height * 0.072);
  context.fillStyle = THEME.cream;
  context.font = `900 ${Math.max(18, width * 0.025)}px ${FONT}`;
  context.fillText(`${copy.progress}  ${completed}/${TOTAL_BANANAS}`, width * 0.052, height * 0.115);
  context.textAlign = "right";
  context.font = `750 ${Math.max(11, width * 0.012)}px ${FONT}`;
  context.fillText(frame.video !== null ? copy.camera : copy.simulator, width * 0.97, height * 0.07);

  const reactionAge = frame.timestampMs - reactionStartedAt;
  if (reactionUnit > 0 && reactionAge >= 0 && reactionAge < THEME.reactionMs) {
    const alpha = Math.sin((reactionAge / THEME.reactionMs) * Math.PI);
    context.globalAlpha = alpha;
    context.textAlign = "center";
    context.fillStyle = THEME.cream;
    context.strokeStyle = "rgba(43,31,8,.75)";
    context.lineWidth = 6;
    context.font = `950 ${Math.max(30, width * 0.052)}px ${FONT}`;
    const text = copy.reactions[Math.min(copy.reactions.length - 1, reactionUnit - 1)];
    context.strokeText(text, width * 0.5, height * 0.46);
    context.fillText(text, width * 0.5, height * 0.46);
  } else if (frame.challenge !== null && frame.celebrationProgress === 0) {
    context.globalAlpha = 0.94;
    context.textAlign = "center";
    context.fillStyle = THEME.cream;
    context.font = `850 ${Math.max(16, width * 0.022)}px ${FONT}`;
    context.fillText(copy.cue, width * 0.5, height * 0.92);
  }
  context.globalAlpha = 1;
  if (frame.celebrationProgress > 0 && completed >= TOTAL_BANANAS) {
    context.fillStyle = "rgba(4,29,20,.86)";
    context.beginPath();
    context.roundRect(width * 0.2, height * 0.34, width * 0.6, height * 0.27, 28);
    context.fill();
    context.textAlign = "center";
    context.fillStyle = THEME.banana;
    context.font = `950 ${Math.max(34, width * 0.065)}px ${FONT}`;
    context.fillText(copy.complete, width * 0.5, height * 0.46);
    context.fillStyle = THEME.cream;
    context.font = `650 ${Math.max(14, width * 0.018)}px ${FONT}`;
    context.fillText(copy.completeBody, width * 0.5, height * 0.535, width * 0.52);
  }
  if (frame.caption !== null && frame.celebrationProgress === 0) {
    context.fillStyle = "rgba(3,20,15,.78)";
    context.beginPath();
    context.roundRect(width * 0.16, height * 0.79, width * 0.68, height * 0.075, 16);
    context.fill();
    context.textAlign = "center";
    context.fillStyle = "white";
    context.font = `650 ${Math.max(13, width * 0.017)}px ${FONT}`;
    context.fillText(frame.caption, width * 0.5, height * 0.838, width * 0.62);
  }
  context.restore();
}

function bananaPoint(index: number, total: number, width: number, height: number) {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  return {
    x: width * (0.28 + t * 0.55),
    y: height * (0.23 - Math.sin(t * Math.PI) * 0.08 + (index % 2) * 0.025),
  };
}

function drawCanopyFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  context.save();
  context.globalAlpha = 0.9;
  context.strokeStyle = THEME.bark;
  context.lineWidth = Math.max(10, width * 0.022);
  context.beginPath();
  context.moveTo(-width * 0.02, height * 0.18);
  context.bezierCurveTo(width * 0.18, height * 0.08, width * 0.55, height * 0.17, width * 1.03, height * 0.04);
  context.stroke();
  const sway = reduced ? 0 : Math.sin(time / 900) * 0.012;
  for (let i = 0; i < 8; i += 1) {
    const x = width * (0.04 + i * 0.135);
    const y = height * (0.08 + (i % 3) * 0.035);
    drawLeaf(context, x, y, Math.min(width, height) * 0.075, (i % 2 ? -0.8 : 0.8) + sway);
  }
  context.restore();
}

function drawLeaf(context: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillStyle = THEME.leaf;
  context.strokeStyle = THEME.leafDark;
  context.lineWidth = Math.max(1.5, size * 0.045);
  context.beginPath();
  context.moveTo(0, 0);
  context.bezierCurveTo(size * 0.2, -size * 0.52, size * 0.95, -size * 0.48, size, 0);
  context.bezierCurveTo(size * 0.72, size * 0.43, size * 0.18, size * 0.42, 0, 0);
  context.fill();
  context.stroke();
  context.restore();
}

function drawBananaCourse(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  total: number,
  completed: number,
  time: number,
  reduced: boolean,
) {
  const size = Math.min(width, height) * 0.075;
  for (let index = 0; index < total; index += 1) {
    const point = bananaPoint(index, total, width, height);
    const collected = index < completed;
    const active = index === completed;
    const pulse = active && !reduced ? 1 + Math.sin(time / 150) * 0.08 : 1;
    context.save();
    context.translate(point.x, point.y);
    context.scale(pulse, pulse);
    if (active) {
      const glow = context.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.45);
      glow.addColorStop(0, "rgba(255,244,164,.48)");
      glow.addColorStop(1, "rgba(255,212,71,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, size * 1.45, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = collected ? 0.3 : 1;
    drawBananaBunch(context, 0, 0, size, collected);
    if (collected) {
      context.globalAlpha = 0.95;
      context.strokeStyle = THEME.cream;
      context.lineWidth = Math.max(2.5, size * 0.09);
      context.beginPath();
      context.moveTo(-size * 0.25, 0);
      context.lineTo(-size * 0.04, size * 0.22);
      context.lineTo(size * 0.31, -size * 0.24);
      context.stroke();
    }
    context.restore();
  }
}

function drawBananaBunch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  muted = false,
) {
  context.save();
  context.translate(x, y);
  context.strokeStyle = muted ? "#e8d999" : THEME.bananaShade;
  context.fillStyle = muted ? "#eadf9f" : THEME.banana;
  context.lineWidth = Math.max(1.5, size * 0.055);
  for (const rotation of [-0.56, -0.2, 0.18, 0.52]) {
    context.save();
    context.rotate(rotation);
    context.beginPath();
    context.moveTo(0, -size * 0.34);
    context.bezierCurveTo(size * 0.08, -size * 0.12, size * 0.12, size * 0.28, size * 0.38, size * 0.38);
    context.bezierCurveTo(size * 0.14, size * 0.48, -size * 0.12, size * 0.13, 0, -size * 0.34);
    context.fill();
    context.stroke();
    context.restore();
  }
  context.fillStyle = THEME.bark;
  context.fillRect(-size * 0.055, -size * 0.48, size * 0.11, size * 0.2);
  context.restore();
}

function drawBasket(context: CanvasRenderingContext2D, x: number, y: number, size: number, completed: number) {
  context.save();
  context.translate(x, y);
  context.strokeStyle = "#f1b36e";
  context.fillStyle = "rgba(112,54,25,.9)";
  context.lineWidth = Math.max(2, size * 0.055);
  context.beginPath();
  context.moveTo(-size * 0.55, -size * 0.16);
  context.lineTo(size * 0.55, -size * 0.16);
  context.lineTo(size * 0.4, size * 0.52);
  context.lineTo(-size * 0.4, size * 0.52);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(0, -size * 0.13, size * 0.42, Math.PI, 0);
  context.stroke();
  for (let index = 0; index < Math.min(completed, 5); index += 1) {
    drawBananaBunch(context, (index - 2) * size * 0.13, -size * (0.2 + (index % 2) * 0.1), size * 0.28, false);
  }
  context.restore();
}

function drawMonkey(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  time: number,
  reduced: boolean,
  active: boolean,
  reactionProgress: number,
  celebration: number,
) {
  const reacting = reactionProgress < 1;
  const bounce = reduced ? 0 : reacting ? -size * 0.18 * Math.sin(reactionProgress * Math.PI) : Math.sin(time / 330) * size * 0.02;
  const dance = reduced ? 0 : celebration > 0 ? Math.sin(time / 105) * 0.16 : 0;
  context.save();
  context.translate(x, y + bounce);
  context.rotate(dance);
  context.strokeStyle = "#5d2c1c";
  context.fillStyle = "#8f4b2e";
  context.lineWidth = Math.max(2, size * 0.035);
  context.beginPath();
  context.arc(size * 0.08, size * 0.12, size * 0.34, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(0, -size * 0.28, size * 0.3, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(-size * 0.25, -size * 0.34, size * 0.12, 0, Math.PI * 2);
  context.arc(size * 0.25, -size * 0.34, size * 0.12, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#e7ad72";
  context.beginPath();
  context.ellipse(0, -size * 0.22, size * 0.22, size * 0.19, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#1a1712";
  context.beginPath();
  context.arc(-size * 0.08, -size * 0.31, size * 0.025, 0, Math.PI * 2);
  context.arc(size * 0.08, -size * 0.31, size * 0.025, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#5d2c1c";
  context.beginPath();
  context.arc(0, -size * 0.2, size * 0.08, 0.15, Math.PI - 0.15);
  context.stroke();
  context.lineWidth = Math.max(5, size * 0.11);
  context.beginPath();
  context.moveTo(-size * 0.24, 0);
  context.quadraticCurveTo(-size * 0.55, active ? -size * 0.34 : size * 0.18, -size * 0.5, active ? -size * 0.58 : size * 0.42);
  context.moveTo(size * 0.28, 0);
  context.quadraticCurveTo(size * 0.57, active ? -size * 0.38 : size * 0.16, size * 0.54, active ? -size * 0.62 : size * 0.4);
  context.stroke();
  context.beginPath();
  context.arc(size * 0.25, size * 0.16, size * 0.56, -0.1, Math.PI * 1.25);
  context.stroke();
  context.restore();
}

function drawJumpCue(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  phase: string,
  time: number,
  reduced: boolean,
) {
  if (phase === "idle" || phase === "done") return;
  const x = width * 0.16;
  const y = height * 0.49;
  const bob = reduced ? 0 : Math.sin(time / 180) * height * 0.012;
  context.save();
  context.translate(0, bob);
  context.strokeStyle = "rgba(255,244,207,.9)";
  context.fillStyle = "rgba(18,61,43,.76)";
  context.lineWidth = Math.max(2, width * 0.004);
  context.beginPath();
  context.roundRect(x - width * 0.047, y - height * 0.06, width * 0.094, height * 0.12, 18);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(x, y + height * 0.026);
  context.lineTo(x, y - height * 0.026);
  context.moveTo(x, y - height * 0.026);
  context.lineTo(x - width * 0.014, y - height * 0.005);
  context.moveTo(x, y - height * 0.026);
  context.lineTo(x + width * 0.014, y - height * 0.005);
  context.stroke();
  context.fillStyle = THEME.banana;
  context.fillRect(x - width * 0.035, y + height * 0.043, width * 0.07 * Math.min(1, progress), Math.max(3, height * 0.008));
  context.restore();
}

function drawHarvestBurst(
  context: CanvasRenderingContext2D,
  burst: Burst,
  progress: number,
  width: number,
  height: number,
  reduced: boolean,
) {
  const eased = 1 - (1 - progress) ** 3;
  const x = burst.x + (width * 0.84 - burst.x) * eased;
  const y = burst.y + (height * 0.77 - burst.y) * eased + (reduced ? 0 : Math.sin(progress * Math.PI) * -height * 0.12);
  drawBananaBunch(context, x, y, Math.min(width, height) * 0.06 * (1 - progress * 0.35));
  context.save();
  context.globalAlpha = 1 - progress;
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.08 * progress;
    context.fillStyle = index % 2 ? THEME.bananaLight : THEME.banana;
    context.beginPath();
    context.arc(burst.x + Math.cos(angle) * radius, burst.y + Math.sin(angle) * radius, 3 + (index % 2) * 2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawCelebration(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  time: number,
  reduced: boolean,
) {
  context.save();
  const glow = context.createRadialGradient(width * 0.5, height * 0.38, 0, width * 0.5, height * 0.38, width * 0.55);
  glow.addColorStop(0, `rgba(255,227,113,${0.22 * progress})`);
  glow.addColorStop(1, "rgba(255,227,113,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  const count = reduced ? 12 : 28;
  for (let index = 0; index < count; index += 1) {
    const seed = (index * 0.61803398875) % 1;
    const x = seed * width;
    const travel = reduced ? progress : (progress * 1.3 + (time / 2800 + seed) % 1) % 1;
    const y = -height * 0.08 + travel * height * 1.08;
    context.save();
    context.translate(x, y);
    context.rotate(index + (reduced ? 0 : time / 500));
    context.fillStyle = index % 3 === 0 ? THEME.banana : index % 3 === 1 ? THEME.cream : THEME.leaf;
    context.fillRect(-3, -8, 6, 16);
    context.restore();
  }
  context.restore();
}
