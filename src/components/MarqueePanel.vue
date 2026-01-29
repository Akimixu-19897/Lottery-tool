<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { Prize } from "../lib/models";

type Candidate = { id: string; name: string };

const props = defineProps<{
  isSpinning: boolean;
  canDraw: boolean;
  selectedPrize: Prize | null;
  candidates: Candidate[];
  prepareBatchDraw: () => string[] | null; // returns winner personIds
  finalizeBatchDraw: () => void;
  cancelBatchDraw: () => void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerWidth = ref(0);
const containerHeight = ref(0);
const viewportHeight = ref(window.innerHeight);
let ro: ResizeObserver | null = null;
const onWindowResize = () => {
  viewportHeight.value = window.innerHeight;
  render();
};

type Slot = { id: string; name: string };
const slots = ref<Slot[]>([]);
const hitSlotIndices = ref<number[]>([]);

const running = ref(false);
const runnerIndices = ref<(number | null)[]>([]);
const finishedIndices = ref<Set<number>>(new Set());
let rafId: number | null = null;
let stepIntervalMs = 70;
let renderStepSeq = 0;
type RunnerAnim = {
  baseStartTime: number;
  startDelayMs: number;
  started: boolean;
  finished: boolean;
  stepTimes: number[];
  totalDuration: number;
  startIndex: number;
  targetIndex: number;
  stepCursor: number;
};
let anims: RunnerAnim[] = [];

const canvasSize = computed(() => {
  const w = containerWidth.value || 600;
  const max = 1600;
  const min = 560;
  const padding = 44;
  const width = Math.max(min, Math.min(max, Math.floor(w - padding)));
  const heightByWidth = Math.floor(width * 0.78);
  const boundH = containerHeight.value || viewportHeight.value;
  const heightByBound = Math.floor(boundH * 0.92);
  const height = Math.min(heightByWidth, heightByBound);
  return { width, height };
});

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildRingPath(cols: number, rows: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  // top row
  for (let x = 0; x < cols; x++) points.push({ x, y: 0 });
  // right col (excluding top)
  for (let y = 1; y < rows - 1; y++) points.push({ x: cols - 1, y });
  // bottom row (right -> left)
  if (rows > 1)
    for (let x = cols - 1; x >= 0; x--) points.push({ x, y: rows - 1 });
  // left col (excluding corners, bottom -> top)
  for (let y = rows - 2; y >= 1; y--) points.push({ x: 0, y });
  return points;
}

function buildStepTimes(
  totalSteps: number,
  maxIntervalMs: number,
  minIntervalMs: number,
  accelSteps: number,
  decelSteps: number,
): number[] {
  const times: number[] = [0];
  for (let step = 1; step <= totalSteps; step++) {
    let interval = minIntervalMs;
    if (accelSteps > 0 && step <= accelSteps) {
      const t = step / accelSteps;
      interval = maxIntervalMs - (maxIntervalMs - minIntervalMs) * t;
    } else if (decelSteps > 0 && step > totalSteps - decelSteps) {
      const t = (step - (totalSteps - decelSteps)) / decelSteps;
      interval = minIntervalMs + (maxIntervalMs - minIntervalMs) * t;
    }
    times.push(times[times.length - 1]! + interval);
  }
  return times;
}

function findStepIndex(stepTimes: number[], elapsedMs: number, startFrom: number): number {
  let cursor = startFrom;
  while (cursor + 1 < stepTimes.length && stepTimes[cursor + 1]! <= elapsedMs) cursor += 1;
  return cursor;
}

function chooseRingSize(targetSlots: number) {
  // ringLen ~= 4*cols - 6 when rows = cols - 1
  const cols = clamp(Math.ceil((targetSlots + 6) / 4), 6, 12);
  const rows = clamp(cols - 1, 5, 11);
  const ringLen = 2 * (cols + rows) - 4;
  return { cols, rows, ringLen };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function distributeIndices(totalSlots: number, itemCount: number): number[] {
  if (itemCount <= 0) return [];
  if (itemCount >= totalSlots) return Array.from({ length: totalSlots }, (_, i) => i);
  const indices: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < itemCount; i++) {
    const raw = Math.floor(((i + 0.5) * totalSlots) / itemCount);
    let idx = raw % totalSlots;
    while (used.has(idx)) idx = (idx + 1) % totalSlots;
    used.add(idx);
    indices.push(idx);
  }
  return indices.sort((a, b) => a - b);
}

function prepareSlots(winnerIds: string[]): Map<string, number> {
  const candidates = props.candidates;
  const candidateMap = new Map(candidates.map((c) => [c.id, c] as const));
  const winners: Candidate[] = winnerIds
    .map((id) => candidateMap.get(id))
    .filter(Boolean) as Candidate[];
  const winnerSet = new Set(winners.map((w) => w.id));

  const target = clamp(
    Math.max(20, winners.length * 6, Math.min(42, candidates.length)),
    20,
    42,
  );
  const { ringLen } = chooseRingSize(target);

  const others = shuffle(candidates.filter((c) => !winnerSet.has(c.id))).slice(
    0,
    Math.max(0, ringLen - winners.length),
  );
  const pool: Slot[] = shuffle([...winners, ...others]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  // 确保所有中奖者都在槽位里：若 winners 太多导致被 slice 掉，强制替换末尾
  for (const w of winners) {
    if (pool.some((p) => p.id === w.id)) continue;
    if (pool.length < ringLen) pool.push({ id: w.id, name: w.name });
    else pool[pool.length - 1] = { id: w.id, name: w.name };
  }

  if (pool.length >= ringLen) {
    const picked = pool.slice(0, ringLen);
    slots.value = picked;
    hitSlotIndices.value = picked
      .map((s, idx) => (winnerSet.has(s.id) ? idx : -1))
      .filter((x) => x >= 0);
    return new Map(picked.map((s, idx) => [s.id, idx] as const));
  }

  // 数量不够围成一圈：不重复填充，改为均匀分布在四边（外圈路径），其余格子留空
  const distributed = distributeIndices(ringLen, pool.length);
  const ring: Slot[] = Array.from({ length: ringLen }, () => ({ id: "", name: "" }));
  for (let i = 0; i < distributed.length; i++) {
    ring[distributed[i]!] = pool[i]!;
  }
  slots.value = ring;
  hitSlotIndices.value = ring
    .map((s, idx) => (winnerSet.has(s.id) ? idx : -1))
    .filter((x) => x >= 0);
  const map = new Map<string, number>();
  for (let i = 0; i < ring.length; i++) {
    const id = ring[i]!.id;
    if (id) map.set(id, i);
  }
  return map;
}

function prepareIdleSlots() {
  const candidates = props.candidates;
  if (!candidates.length) {
    slots.value = [];
    hitSlotIndices.value = [];
    return;
  }

  const target = clamp(Math.min(42, candidates.length), 20, 42);
  const { ringLen } = chooseRingSize(target);

  if (candidates.length >= ringLen) {
    const pool: Slot[] = candidates.slice(0, ringLen).map((c) => ({ id: c.id, name: c.name }));
    slots.value = pool;
    hitSlotIndices.value = [];
    return;
  }

  // 数量不够：均匀分布在四边，其他位置留空
  const distributed = distributeIndices(ringLen, candidates.length);
  const ring: Slot[] = Array.from({ length: ringLen }, () => ({ id: "", name: "" }));
  for (let i = 0; i < distributed.length; i++) {
    const c = candidates[i]!;
    ring[distributed[i]!] = { id: c.id, name: c.name };
  }
  slots.value = ring;
  hitSlotIndices.value = [];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function render() {
  renderStepSeq += 1;
  const canvas = canvasRef.value;
  console.log("canvas", canvas);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvasSize.value;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  drawRoundedRect(ctx, 0, 0, width, height, 18);
  ctx.fill();

  const ringSlots = slots.value;
  if (!ringSlots.length) {
    // header only
    ctx.fillStyle = "rgba(11,18,32,0.78)";
    ctx.font =
      "700 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const prizeLabel = props.selectedPrize
      ? `${props.selectedPrize.name}（剩余 ${props.selectedPrize.remaining}）`
      : "未选择奖品";
    ctx.fillText(`跑马灯抽奖 · 当前奖品：${prizeLabel}`, 16, 14);
    return;
  }

  const prizeLabel = props.selectedPrize
    ? `${props.selectedPrize.name}（剩余 ${props.selectedPrize.remaining}）`
    : "未选择奖品";

  ctx.fillStyle = "rgba(11,18,32,0.78)";
  ctx.font =
    "700 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`跑马灯抽奖 · 当前奖品：${prizeLabel}`, 16, 14);

  const padding = 16;
  const gap = 10;

  const { cols, rows } = chooseRingSize(ringSlots.length);
  const path = buildRingPath(cols, rows);

  const gridTop = 40;
  const gridW = width - padding * 2;
  const gridH = height - gridTop - padding;
  const cellW = Math.floor((gridW - gap * (cols - 1)) / cols);
  const cellH = Math.floor((gridH - gap * (rows - 1)) / rows);

  const currentRunnerIndices = runnerIndices.value;
  const hits = new Set(hitSlotIndices.value);
  const finished = finishedIndices.value;

  console.debug("[MarqueePanel.render]", {
    seq: renderStepSeq,
    running: running.value,
    stepIntervalMs,
    runners: currentRunnerIndices,
    finishedCount: finished.size,
    hitCount: hits.size,
    slotCount: ringSlots.length,
    canvas: { width, height },
  });

  // center panel (visual)
  const centerX = padding + cellW + gap;
  const centerY = gridTop + cellH + gap;
  const centerW = gridW - (cellW + gap) * 2;
  const centerH = gridH - (cellH + gap) * 2;
  ctx.fillStyle = "rgba(17, 24, 39, 0.04)";
  drawRoundedRect(ctx, centerX, centerY, centerW, centerH, 16);
  ctx.fill();

  for (let i = 0; i < path.length; i++) {
    const pos = path[i]!;
    const slot = ringSlots[i]!;
    const x = padding + pos.x * (cellW + gap);
    const y = gridTop + pos.y * (cellH + gap);

    const isFinalHit = hits.has(i) && !running.value;
    const isRunnerHere = running.value && currentRunnerIndices.some((idx) => idx === i);
    const isFinishedHere = running.value && finished.has(i);

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    drawRoundedRect(ctx, x, y, cellW, cellH, 12);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(11,18,32,0.10)";
    ctx.stroke();

    if (isRunnerHere) {
      ctx.save();
      ctx.shadowColor = "rgba(96, 165, 250, 0.6)";
      ctx.shadowBlur = 22;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(96, 165, 250, 0.98)";
      drawRoundedRect(ctx, x, y, cellW, cellH, 12);
      ctx.stroke();
      ctx.restore();
    }
    if (isFinishedHere || isFinalHit) {
      ctx.save();
      ctx.shadowColor = "rgba(251, 191, 36, 0.55)";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "rgba(251, 191, 36, 0.14)";
      drawRoundedRect(ctx, x, y, cellW, cellH, 12);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
      drawRoundedRect(ctx, x, y, cellW, cellH, 12);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = "rgba(11,18,32,0.86)";
    ctx.font =
      "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = slot.name || "";
    ctx.fillText(
      text.length > 10 ? `${text.slice(0, 10)}…` : text,
      x + cellW / 2,
      y + cellH / 2,
    );
  }
}

function tick(now: number) {
  const len = slots.value.length;
  if (!len) return;

  if (!running.value || anims.length === 0) return;

  let anyActive = false;
  for (let i = 0; i < anims.length; i++) {
    const a = anims[i]!;
    if (a.finished) continue;

    const startAt = a.baseStartTime + a.startDelayMs;
    if (now < startAt) {
      runnerIndices.value[i] = null;
      continue;
    }

    if (!a.started) {
      a.started = true;
      runnerIndices.value[i] = a.startIndex;
    }

    const elapsed = now - startAt;
    const step = findStepIndex(a.stepTimes, elapsed, a.stepCursor);
    if (step !== a.stepCursor) {
      a.stepCursor = step;
      runnerIndices.value[i] = (a.startIndex + step) % len;
      render();
    }

    if (elapsed >= a.totalDuration) {
      a.finished = true;
      runnerIndices.value[i] = a.targetIndex;
      finishedIndices.value.add(a.targetIndex);
      render();
    }

    if (!a.finished) anyActive = true;
  }

  if (!anyActive) {
    // 最后一个 runner 也停下后，再等 650ms 结算（runner 之间的停止延迟已经由 startDelay 控制）
    running.value = false;
    render();
    anims = [];
    window.setTimeout(() => props.finalizeBatchDraw(), 650);
    return;
  }

  rafId = requestAnimationFrame(tick);
}

function start() {
  if (props.isSpinning || running.value) return;
  try {
    const winnerIds = props.prepareBatchDraw();
    if (!winnerIds?.length) return;

    console.debug("[MarqueePanel.start]", {
      winnerCount: winnerIds.length,
      candidateCount: props.candidates.length,
    });

    const slotIndexById = prepareSlots(winnerIds);
    const len = slots.value.length;

    // 每个 runner 对应一个中奖者（按 winnerIds 顺序），开始/停止均依次延迟 1s
    const targets: number[] = [];
    const used = new Set<number>();
    for (const id of winnerIds) {
      const idx = slotIndexById.get(id);
      if (idx !== undefined && !used.has(idx)) {
        used.add(idx);
        targets.push(idx);
      }
    }
    // fallback：若映射不全，补随机目标位
    while (targets.length < winnerIds.length) {
      const idx = Math.floor(Math.random() * Math.max(1, len));
      if (used.has(idx)) continue;
      used.add(idx);
      targets.push(idx);
    }

    finishedIndices.value = new Set();
    runnerIndices.value = Array.from({ length: targets.length }, () => null);

    const baseStartTime = performance.now();
    anims = targets.map((targetIndex, i) => {
      const startIndex = Math.floor(Math.random() * Math.max(1, len));
      const offset = ((targetIndex - startIndex) % len + len) % len;
      const loops = clamp(Math.round(4 + Math.min(2, len / 30)), 4, 7);
      const totalSteps = loops * len + offset;

      const maxIntervalMs = 160;
      const minIntervalMs = 45;
      const accelSteps = Math.max(10, Math.round(totalSteps * 0.18));
      const decelSteps = Math.max(14, Math.round(totalSteps * 0.26));
      const stepTimes = buildStepTimes(totalSteps, maxIntervalMs, minIntervalMs, accelSteps, decelSteps);

      return {
        baseStartTime,
        startDelayMs: i * 1000,
        started: false,
        finished: false,
        stepTimes,
        totalDuration: stepTimes[stepTimes.length - 1]!,
        startIndex,
        targetIndex,
        stepCursor: 0,
      };
    });

    stepIntervalMs = 45;
    running.value = true;

    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  } catch (err) {
    console.error("[MarqueePanel.start] failed", err);
    running.value = false;
    runnerIndices.value = [];
    finishedIndices.value = new Set();
    hitSlotIndices.value = [];
    props.cancelBatchDraw();
    prepareIdleSlots();
    render();
  }
}

watch(
  () => [
    props.candidates,
    props.selectedPrize?.id,
    props.selectedPrize?.remaining,
  ],
  () => {
    if (!running.value && hitSlotIndices.value.length === 0) prepareIdleSlots();
    if (!running.value) render();
  },
);

onMounted(() => {
  if (!containerRef.value) return;
  ro = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    containerWidth.value = entry.contentRect.width;
    containerHeight.value = entry.contentRect.height;
    render();
  });
  ro.observe(containerRef.value);
  {
    const rect = containerRef.value.getBoundingClientRect();
    containerWidth.value = rect.width;
    containerHeight.value = rect.height;
  }
  window.addEventListener("resize", onWindowResize);
  if (hitSlotIndices.value.length === 0) prepareIdleSlots();
  render();
});

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  ro?.disconnect();
  ro = null;
  window.removeEventListener("resize", onWindowResize);
});
</script>

<template>
  <section class="wrap" ref="containerRef">
    <div class="card" v-if="candidates.length">
      <div class="canvasWrap">
        <canvas ref="canvasRef" />
        <button
          class="startBtn"
          :disabled="!canDraw || isSpinning || running"
          @click="start"
        >
          {{ running || isSpinning ? "抽奖中…" : "开始抽奖" }}
        </button>
      </div>
    </div>
    <div class="empty" v-else>
      <div class="emptyTitle">请先导入人员名单</div>
      <div class="emptySub">导入后可使用跑马灯抽奖（支持一次命中多个）</div>
    </div>
  </section>
</template>

<style scoped>
.wrap {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 0;
}

.card {
  width: 100%;
  border-radius: 18px;
  padding: 14px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  display: grid;
  place-items: center;
}

.canvasWrap {
  position: relative;
  width: 100%;
  display: grid;
  place-items: center;
}

canvas {
  display: block;
  width: 100%;
  height: auto;
}

.startBtn {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 132px;
  height: 132px;
  border-radius: 999px;
  border: 0;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  font-weight: 900;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.35);
}
.startBtn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.empty {
  width: 100%;
  border-radius: 18px;
  padding: 28px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  text-align: center;
}
.emptyTitle {
  font-weight: 900;
  font-size: 16px;
}
.emptySub {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(11, 18, 32, 0.65);
}

@media (max-width: 1100px) {
  .wrap {
    height: auto;
    min-height: calc(100vh - 40px);
  }
  .startBtn {
    width: 120px;
    height: 120px;
  }
}
</style>
