<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { LuckyWheel } from '@lucky-canvas/vue'
import { NSelect, type SelectOption } from 'naive-ui'
import type { Prize } from '../lib/models'
import MarqueePanel from './MarqueePanel.vue'

type LuckyWheelInstance = InstanceType<typeof LuckyWheel>
type LuckyWheelPrizeItem = { background: string; fonts: { text: string; fontColor: string; fontSize: string }[] }
type Candidate = { id: string; name: string }

const props = defineProps<{
  isSpinning: boolean
  canDraw: boolean
  drawCount: number
  useMarquee: boolean
  prizes: Prize[]
  selectedPrizeId: string
  selectedPrize: Prize | null
  displayedWheelPrizes: LuckyWheelPrizeItem[]
  marqueeCandidates: Candidate[]
  setSelectedPrizeId: (id: string) => void
  prepareDraw: () => number | null
  finalizeDraw: () => number | null
  prepareBatchDraw: () => string[] | null
  finalizeBatchDraw: () => void
  cancelBatchDraw: () => void
}>()

const stageRef = ref<HTMLElement | null>(null)
const stageWidth = ref(0)
const stageHeight = ref(0)
let ro: ResizeObserver | null = null

const prizeOptions = computed<SelectOption[]>(() =>
  props.prizes.map((p) => ({
    label: `${p.name}（剩余 ${p.remaining} / ${p.total}）`,
    value: p.id,
  })),
)

function measureStage() {
  const el = stageRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  stageWidth.value = rect.width
  stageHeight.value = rect.height
}

const wheelRef = shallowRef<LuckyWheelInstance | null>(null)
const wheelBlocks = [{ padding: '14px', background: '#f5f5f7' }]
const wheelButtons = [
  {
    radius: '28%',
    background: '#111827',
    pointer: true,
    fonts: [{ text: '抽', fontColor: '#ffffff', fontSize: '22px', top: '-12px' }],
  },
]

const wheelSizePx = computed(() => {
  // 让中间区域继续放大时，转盘也随之增大（上限防止过大影响观感）。
  const w = stageWidth.value || 600
  const max = 1400
  const min = 460
  const padding = 44
  const byWidth = Math.floor(w - padding)
  // 按容器高度约束，保证不超过窗口高度；预留标题/按钮/内边距空间
  const h = stageHeight.value || window.innerHeight
  const byHeight = Math.floor(h - 140)
  return Math.max(min, Math.min(max, byWidth, byHeight))
})

const wheelKey = computed(() => `wheel_${wheelSizePx.value}`)

function beginSpin() {
  const stopIndex = props.prepareDraw()
  if (stopIndex === null) return

  wheelRef.value?.play?.()
  window.setTimeout(() => {
    wheelRef.value?.stop?.(stopIndex)
  }, 900 + Math.floor(Math.random() * 600))
}

function onSpinEnd() {
  const nextStopIndex = props.finalizeDraw()
  if (nextStopIndex === null) return

  window.setTimeout(() => {
    wheelRef.value?.play?.()
    window.setTimeout(() => {
      wheelRef.value?.stop?.(nextStopIndex)
    }, 700 + Math.floor(Math.random() * 500))
  }, 450)
}

onMounted(() => {
  const el = stageRef.value
  if (el) {
    ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      stageWidth.value = entry.contentRect.width
      stageHeight.value = entry.contentRect.height
    })
    ro.observe(el)
  }
  window.addEventListener('resize', measureStage)
  measureStage()
})

onUnmounted(() => {
  window.removeEventListener('resize', measureStage)
  ro?.disconnect()
  ro = null
})

watch(
  () => props.useMarquee,
  async () => {
    await nextTick()
    measureStage()
  },
)

watch(
  () => props.displayedWheelPrizes.length,
  async () => {
    await nextTick()
    measureStage()
  },
)
</script>

<template>
  <section class="stage">
    <div class="stageHeader">
      <div class="prizeLabel">当前奖品</div>
      <NSelect
        :value="selectedPrizeId"
        :options="prizeOptions"
        filterable
        :disabled="isSpinning"
        @update:value="(v) => setSelectedPrizeId(String(v ?? ''))"
      />
    </div>

    <div class="stageBody" ref="stageRef">
      <MarqueePanel
        v-if="useMarquee"
        :is-spinning="isSpinning"
        :can-draw="canDraw"
        :selected-prize="selectedPrize"
        :candidates="marqueeCandidates"
        :prepare-batch-draw="prepareBatchDraw"
        :finalize-batch-draw="finalizeBatchDraw"
        :cancel-batch-draw="cancelBatchDraw"
      />
      <div v-else class="wheelWrap">
        <div class="wheelCard" v-if="displayedWheelPrizes.length">
          <LuckyWheel
            :key="wheelKey"
            ref="wheelRef"
            :width="`${wheelSizePx}px`"
            :height="`${wheelSizePx}px`"
            :blocks="wheelBlocks"
            :buttons="wheelButtons"
            :prizes="displayedWheelPrizes"
            @start="beginSpin"
            @end="onSpinEnd"
          />
          <div class="wheelSub">
            <span>剩余</span>
            <b>{{ selectedPrize?.remaining ?? 0 }}</b>
          </div>
          <div class="actions wheelActions">
            <button class="btn primary" :disabled="!canDraw || isSpinning" @click="beginSpin">
              {{ isSpinning ? '抽奖中…' : '开始抽奖' }}
            </button>
          </div>
        </div>
        <div class="wheelEmpty" v-else>
          <div class="emptyTitle">请先导入人员名单</div>
          <div class="emptySub">导入后转盘会显示剩余可抽人员</div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stage {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.stageHeader {
  width: 100%;
  border-radius: 16px;
  padding: 12px 14px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  align-items: center;
}
.prizeLabel {
  font-weight: 800;
  font-size: 12px;
  color: rgba(11, 18, 32, 0.85);
}
.stageHeader :deep(.n-select) {
  width: 100%;
}

.stageBody {
  height: 100%;
  min-height: 0;
}

.wheelWrap {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 0;
}

.wheelCard {
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

.wheelSub {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(11, 18, 32, 0.75);
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.muted {
  color: rgba(11, 18, 32, 0.55);
}

.wheelEmpty {
  width: 100%;
  border-radius: 18px;
  padding: 28px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  text-align: center;
  align-self: stretch;
  justify-self: stretch;
  display: grid;
  place-content: center;
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

.actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.wheelActions {
  width: 100%;
  max-width: 360px;
  margin-top: 12px;
}

.btn {
  border: 1px solid rgba(11, 18, 32, 0.12);
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 10px 12px;
  box-sizing: border-box;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.btn:hover {
  border-color: rgba(96, 165, 250, 0.9);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn.primary {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  border-color: transparent;
  color: white;
}
.btn.primary:hover {
  filter: brightness(1.03);
}

@media (max-width: 1100px) {
  .wheelWrap {
    height: auto;
    min-height: calc(100vh - 40px);
  }
  .stageHeader {
    grid-template-columns: 84px 1fr;
  }
}

@media (max-height: 820px) {
  .stageHeader {
    padding: 10px 12px;
  }
}
</style>
