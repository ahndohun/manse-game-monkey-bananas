import {
  createDefaultRenderer,
  type RendererFactory,
  type RuntimeRenderFrame,
  type RuntimeRenderer,
} from "@manse/runtime-web";

const ART_URL = "/packs/monkey-bananas/assets/images/jungle-jump-hero.png";
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

type Burst = { x: number; y: number; startedAt: number };

export const createMonkeyBananasRenderer: RendererFactory = (options): RuntimeRenderer => {
  const base = createDefaultRenderer(options);
  Object.assign(base.element.style, {
    backgroundImage: `linear-gradient(rgba(3,31,18,.05), rgba(3,25,17,.34)), url('${ART_URL}')`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  });
  base.element.setAttribute(
    "aria-label",
    "Jungle jump play field with five collectible banana bunches and a cheering monkey",
  );

  const cameraSurface = base.element.firstElementChild as HTMLElement | null;
  if (cameraSurface?.tagName === "CANVAS") cameraSurface.style.opacity = "0.36";

  const canvas = options.document.createElement("canvas");
  canvas.dataset.gameForeground = "monkey-bananas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  });
  base.element.append(canvas);
  const context = canvas.getContext("2d");
  if (context === null) return base;

  let lastCompleted = 0;
  let lastTotal = 5;
  let reactionUnit = 0;
  let reactionStartedAt = Number.NEGATIVE_INFINITY;
  const bursts: Burst[] = [];

  const render = (frame: RuntimeRenderFrame) => {
    base.render(frame);
    const { width, height } = prepareCanvas(canvas, context, THEME.maxDpr);
    if (width === 0 || height === 0) return;
    context.clearRect(0, 0, width, height);

    const guide = frame.challenge?.kind === "jump" ? frame.challenge : null;
    if (guide !== null) lastTotal = Math.max(guide.totalUnits, 1);
    const completed = guide?.completedUnits ?? (frame.celebrationProgress > 0 ? lastCompleted : 0);
    const total = lastTotal;
    if (guide !== null && completed < lastCompleted) lastCompleted = 0;
    if (completed > lastCompleted) {
      for (let unit = lastCompleted; unit < completed; unit += 1) {
        const point = bananaPoint(unit, total, width, height);
        bursts.push({ x: point.x, y: point.y, startedAt: frame.timestampMs });
      }
      reactionUnit = completed;
      reactionStartedAt = frame.timestampMs;
      lastCompleted = completed;
    }

    drawCanopyFrame(context, width, height, frame.timestampMs, frame.reducedStimulation);
    drawBananaCourse(context, width, height, total, completed, frame.timestampMs, frame.reducedStimulation);
    drawBasket(context, width * 0.84, height * 0.83, Math.min(width, height) * 0.13, completed);
    drawMonkey(
      context,
      width * 0.16,
      height * 0.78,
      Math.min(width, height) * 0.15,
      frame.timestampMs,
      frame.reducedStimulation,
      guide?.phase === "active" || guide?.phase === "holding",
      reactionUnit > 0 ? Math.min(1, Math.max(0, (frame.timestampMs - reactionStartedAt) / THEME.reactionMs)) : 1,
      frame.celebrationProgress,
    );
    drawJumpCue(context, width, height, guide?.progress ?? 0, guide?.phase ?? "idle", frame.timestampMs, frame.reducedStimulation);

    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const age = frame.timestampMs - bursts[index].startedAt;
      if (age > THEME.reactionMs) {
        bursts.splice(index, 1);
        continue;
      }
      drawHarvestBurst(context, bursts[index], age / THEME.reactionMs, width, height, frame.reducedStimulation);
    }

    if (frame.celebrationProgress > 0) {
      drawCelebration(context, width, height, frame.celebrationProgress, frame.timestampMs, frame.reducedStimulation);
    }
  };

  return {
    kind: base.kind,
    element: base.element,
    render,
    destroy() {
      canvas.remove();
      base.destroy();
    },
  };
};

function prepareCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, maxDpr: number) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(0, rect.width);
  const height = Math.max(0, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
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
