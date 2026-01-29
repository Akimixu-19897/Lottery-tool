<script setup lang="ts">
import type { Prize } from '../lib/models'
import { computed, ref } from 'vue'
import { NSelect, NSwitch, type SelectOption } from 'naive-ui'

const props = defineProps<{
  isSpinning: boolean
  peopleCount: number
  remainingPeopleCount: number
  prizes: Prize[]
  selectedPrizeId: string
  excludeWinners: boolean
  drawCountSetting: string
  displayMode: 'auto' | 'wheel' | 'marquee'
}>()

const emit = defineEmits<{
  (e: 'update:selectedPrizeId', value: string): void
  (e: 'update:excludeWinners', value: boolean): void
  (e: 'update:drawCountSetting', value: string): void
  (e: 'update:displayMode', value: 'auto' | 'wheel' | 'marquee'): void
  (e: 'importPeople', bytes: Uint8Array): void
  (e: 'importPrizes', bytes: Uint8Array): void
  (e: 'importPeopleAndPrizes', bytes: Uint8Array): void
  (e: 'updatePrizeTotal', prizeId: string, totalText: string): void
  (e: 'resetAll'): void
}>()

const peopleFileInput = ref<HTMLInputElement | null>(null)
const prizeFileInput = ref<HTMLInputElement | null>(null)
const bothFileInput = ref<HTMLInputElement | null>(null)

const prizeOptions = computed<SelectOption[]>(() =>
  props.prizes.map((p) => ({
    label: `${p.name}（剩余 ${p.remaining} / ${p.total}）`,
    value: p.id,
  })),
)

const drawCountOptions: SelectOption[] = [
  { label: '1（一次抽一个）', value: '1' },
  { label: '2（一次抽两个）', value: '2' },
  { label: '3（一次抽三个）', value: '3' },
  { label: '5（一次抽五个）', value: '5' },
  { label: '10（一次抽十个）', value: '10' },
  { label: 'all（一次抽完当前奖品剩余）', value: 'all' },
]

const displayModeOptions: SelectOption[] = [
  { label: '自动（>=2 用跑马灯）', value: 'auto' },
  { label: '转盘', value: 'wheel' },
  { label: '跑马灯', value: 'marquee' },
]

function onCreateDrawCount(label: string): SelectOption {
  const value = label.trim()
  return { label: value, value }
}

function triggerImportPeople() {
  if (props.isSpinning) return
  peopleFileInput.value?.click()
}

function triggerImportPrizes() {
  if (props.isSpinning) return
  prizeFileInput.value?.click()
}

function triggerImportBoth() {
  if (props.isSpinning) return
  bothFileInput.value?.click()
}

async function onPeopleFileChange(e: Event) {
  if (props.isSpinning) return
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  emit('importPeople', new Uint8Array(await file.arrayBuffer()))
}

async function onPrizesFileChange(e: Event) {
  if (props.isSpinning) return
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  emit('importPrizes', new Uint8Array(await file.arrayBuffer()))
}

async function onBothFileChange(e: Event) {
  if (props.isSpinning) return
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  emit('importPeopleAndPrizes', new Uint8Array(await file.arrayBuffer()))
}
</script>

<template>
  <section class="panel">
    <div class="panelTitle">配置</div>

    <div class="row">
      <button class="btn" :disabled="isSpinning" @click="triggerImportPeople">导入人员名单（Excel）</button>
      <div class="meta">已导入：{{ peopleCount }} / 剩余：{{ remainingPeopleCount }}</div>
    </div>
    <div class="hint">人员名单：取第一个工作表第一列（可带表头）。</div>

    <div class="row">
      <button class="btn" :disabled="isSpinning" @click="triggerImportPrizes">导入奖品名单（Excel）</button>
      <div class="meta">奖品：{{ prizes.length }} 项</div>
    </div>
    <div class="hint">奖品名单：取前两列（奖品、数量；数量可省略默认 1，可带表头）。</div>

    <div class="row">
      <button class="btn" :disabled="isSpinning" @click="triggerImportBoth">一次导入（sheet1 人员 + sheet2 奖品）</button>
    </div>
    <div class="hint">同一个 Excel：sheet1=人员（第一列），sheet2=奖品（前两列：奖品、数量）。</div>

    <input ref="peopleFileInput" type="file" accept=".xlsx,.xls" style="display: none" @change="onPeopleFileChange" />
    <input ref="prizeFileInput" type="file" accept=".xlsx,.xls" style="display: none" @change="onPrizesFileChange" />
    <input ref="bothFileInput" type="file" accept=".xlsx,.xls" style="display: none" @change="onBothFileChange" />

    <div class="divider" />

    <div class="panelTitle">奖品</div>
    <label class="field">
      <span>抽奖模式</span>
      <NSelect
        :value="displayMode"
        :options="displayModeOptions"
        :disabled="isSpinning"
        @update:value="(v) => emit('update:displayMode', (String(v) as any) || 'auto')"
      />
    </label>
    <label class="field">
      <span>当前奖品</span>
      <NSelect
        :value="selectedPrizeId"
        :options="prizeOptions"
        filterable
        :disabled="isSpinning"
        @update:value="(v) => emit('update:selectedPrizeId', String(v ?? ''))"
      />
    </label>
    <label class="field">
      <span>每次抽取</span>
      <NSelect
        :value="drawCountSetting"
        :options="drawCountOptions"
        filterable
        taggable
        placeholder="输入数量或选择 all"
        :disabled="isSpinning || displayMode === 'wheel'"
        :on-create="onCreateDrawCount"
        @update:value="(v) => emit('update:drawCountSetting', String(v ?? '1'))"
      />
    </label>
    <div class="hint" v-if="displayMode === 'wheel'">转盘模式固定为 1（一次抽一个）。</div>
    <label class="field">
      <span>中奖后不再参与</span>
      <NSwitch
        :value="excludeWinners"
        :disabled="isSpinning"
        @update:value="(v) => emit('update:excludeWinners', v)"
      />
    </label>

    <div class="prizeTable">
      <div class="prizeRow" v-for="p in prizes" :key="p.id">
        <div class="pName">{{ p.name }}</div>
        <input
          class="pInput"
          inputmode="numeric"
          :disabled="isSpinning"
          :value="String(p.total)"
          @input="emit('updatePrizeTotal', p.id, ($event.target as HTMLInputElement).value)"
        />
        <div class="pRemain">剩余 {{ p.remaining }}</div>
      </div>
    </div>

    <div class="divider" />

    <div class="actions">
      <button class="btn ghost" :disabled="isSpinning" @click="emit('resetAll')">重置</button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  border-radius: 16px;
  padding: 14px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.panelTitle {
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 10px;
  color: rgba(11, 18, 32, 0.9);
}

.row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.meta {
  font-size: 12px;
  color: rgba(11, 18, 32, 0.7);
}

.divider {
  height: 1px;
  background: rgba(11, 18, 32, 0.08);
  margin: 14px 0;
}

.field {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  margin-bottom: 10px;
}

select,
input {
  width: 100%;
  padding: 10px 10px;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid rgba(11, 18, 32, 0.12);
  background: rgba(255, 255, 255, 0.95);
  outline: none;
}
select:focus,
input:focus {
  border-color: rgba(96, 165, 250, 0.8);
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.18);
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
.btn.ghost {
  background: transparent;
}

.actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.hint {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(11, 18, 32, 0.65);
  line-height: 1.4;
}

.prizeTable {
  display: grid;
  gap: 8px;
}
.prizeRow {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  gap: 8px;
  align-items: center;
}
.pName {
  font-weight: 700;
  font-size: 12px;
}
.pInput {
  text-align: center;
}
.pRemain {
  font-size: 12px;
  color: rgba(11, 18, 32, 0.7);
  text-align: right;
}

.field :deep(.n-select) {
  width: 100%;
}
.field :deep(.n-switch) {
  justify-self: start;
}
</style>
