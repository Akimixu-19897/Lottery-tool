import { computed, ref } from 'vue'
import type { Prize } from '../lib/models'
import { createId, defaultPrizes, type DrawResult, type Person } from '../lib/models'
import { buildResultsXlsx, parsePeopleAndPrizesExcel, parsePeopleExcel, parsePrizesExcel } from '../lib/excel'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

type StatusFn = (message: string) => void

type PendingDraw = { personId: string; prizeId: string; stopIndex: number }
type LuckyWheelPrizeItem = { background: string; fonts: { text: string; fontColor: string; fontSize: string }[] }

function wheelColorForIndex(index: number): string {
  // 用黄金角分布色相，理论上可生成无限多种且分布均匀的颜色（满足“几百种颜色”需求）。
  const goldenAngle = 137.50776405003785
  const hue = (index * goldenAngle) % 360
  // 保持较高明度，保证文字可读性
  return `hsl(${hue.toFixed(2)} 80% 72%)`
}

export function useLottery(setStatus?: StatusFn) {
  const isSpinning = ref(false)
  const resetSeq = ref(0)

  const excludeWinners = ref(true)
  const drawCountSetting = ref<string>('1') // '1' | '2' | ... | 'all' | custom number as string
  const lastNonWheelDrawCountSetting = ref<string>('1')
  const displayMode = ref<'auto' | 'wheel' | 'marquee'>('auto')

  const people = ref<Person[]>([])
  const prizes = ref<Prize[]>(defaultPrizes())
  const selectedPrizeId = ref<string>(prizes.value[0]?.id ?? '')
  const results = ref<DrawResult[]>([])

  const remainingPeople = computed(() => (excludeWinners.value ? people.value.filter((p) => p.wins === 0) : people.value))
  const selectedPrize = computed(() => prizes.value.find((p) => p.id === selectedPrizeId.value) ?? null)
  const requestedDrawCount = computed(() => {
    const raw = drawCountSetting.value.trim().toLowerCase()
    if (raw === 'all') return 999999
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 1
  })
  const shouldUseMarquee = computed(
    () => displayMode.value === 'marquee' || (displayMode.value === 'auto' && requestedDrawCount.value >= 2),
  )
  const resolvedDrawCount = computed(() => {
    const prize = selectedPrize.value
    if (!prize) return 1
    return resolveDrawCount(prize, remainingPeople.value.length)
  })
  const canDraw = computed(
    () => !!selectedPrize.value && selectedPrize.value.remaining > 0 && remainingPeople.value.length > 0,
  )

  const displayedWheelPrizes = ref<LuckyWheelPrizeItem[]>([])
  const pendingQueue = ref<PendingDraw[]>([])
  const currentPending = ref<PendingDraw | null>(null)
  const pendingBatch = ref<PendingDraw[]>([])

  function notify(message: string) {
    setStatus?.(message)
  }

  function ensureSelectedPrizeStillValid() {
    const prize = selectedPrize.value
    if (prize && prize.remaining > 0) return
    const next = prizes.value.find((p) => p.remaining > 0)
    selectedPrizeId.value = next?.id ?? prizes.value[0]?.id ?? ''
  }

  function refreshWheelPrizesFromRemainingPeople() {
    const candidates = remainingPeople.value
    displayedWheelPrizes.value = candidates.map((p, idx) => ({
      background: wheelColorForIndex(idx),
      fonts: [{ text: p.name, fontColor: '#0b1220', fontSize: '14px' }],
    }))
  }

  function importPeopleFromBytes(bytes: Uint8Array | ArrayBuffer) {
    if (isSpinning.value) return
    const names = parsePeopleExcel(bytes)
    if (!names.length) {
      notify('没有解析到人员名单（默认取第一个工作表的第一列）')
      return
    }
    people.value = names.map((name) => ({ id: createId(), name, wins: 0 }))
    results.value = []
    prizes.value = prizes.value.map((p) => ({ ...p, remaining: p.total }))
    ensureSelectedPrizeStillValid()
    refreshWheelPrizesFromRemainingPeople()
    notify(`已导入人员：${people.value.length} 人`)
  }

  function importPrizesFromBytes(bytes: Uint8Array | ArrayBuffer) {
    if (isSpinning.value) return
    const list = parsePrizesExcel(bytes)
    if (!list.length) {
      notify('没有解析到奖品名单（默认取第一个工作表的前两列：奖品、数量）')
      return
    }
    prizes.value = list
    selectedPrizeId.value = prizes.value[0]?.id ?? ''
    results.value = []
    people.value = people.value.map((p) => ({ ...p, wins: 0 }))
    refreshWheelPrizesFromRemainingPeople()
    notify(`已导入奖品：${prizes.value.length} 项`)
  }

  function importPeopleAndPrizesFromBytes(bytes: Uint8Array | ArrayBuffer) {
    if (isSpinning.value) return
    const parsed = parsePeopleAndPrizesExcel(bytes)
    if (!parsed.peopleNames.length) {
      notify('没有解析到人员名单（sheet1 默认取第一列）')
      return
    }

    people.value = parsed.peopleNames.map((name) => ({ id: createId(), name, wins: 0 }))
    prizes.value = parsed.prizes
    selectedPrizeId.value = prizes.value[0]?.id ?? ''
    results.value = []
    ensureSelectedPrizeStillValid()
    refreshWheelPrizesFromRemainingPeople()
    notify(`已导入：人员 ${people.value.length} 人，奖品 ${prizes.value.length} 项`)
  }

  function updatePrizeTotal(prizeId: string, totalText: string) {
    const prize = prizes.value.find((p) => p.id === prizeId)
    if (!prize) return
    const used = prize.total - prize.remaining
    const total = Number.parseInt(totalText, 10)
    const nextTotal = Number.isFinite(total) && total > 0 ? total : prize.total
    const clampedTotal = Math.max(used, nextTotal)
    prize.total = clampedTotal
    prize.remaining = clampedTotal - used
    ensureSelectedPrizeStillValid()
  }

  function resetAll() {
    if (isSpinning.value) return
    pendingQueue.value = []
    currentPending.value = null
    pendingBatch.value = []
    people.value = people.value.map((p) => ({ ...p, wins: 0 }))
    prizes.value = prizes.value.map((p) => ({ ...p, remaining: p.total }))
    results.value = []
    ensureSelectedPrizeStillValid()
    refreshWheelPrizesFromRemainingPeople()
    resetSeq.value += 1
    notify('已重置抽奖状态')
  }

  function setSelectedPrizeId(id: string) {
    selectedPrizeId.value = id
    ensureSelectedPrizeStillValid()
  }

  // 返回 stopIndex；若当前不可抽返回 null。
  // 若本轮需要连抽，会把 stopIndex 依次返回给 UI；抽中后不刷新，让转盘停在中奖位置。
  function prepareDraw(): number | null {
    if (isSpinning.value) return null
    if (!canDraw.value) {
      if (!remainingPeople.value.length) notify('请先导入人员名单')
      else if (!selectedPrize.value) notify('请先选择一个奖品')
      else notify('当前奖品剩余数量为 0')
      return null
    }

    refreshWheelPrizesFromRemainingPeople()

    const candidates = remainingPeople.value
    const prize = selectedPrize.value!
    const count = resolveDrawCount(prize, candidates.length)
    pendingQueue.value = buildPendingQueue(candidates, prize.id, count)
    const first = pendingQueue.value.shift()
    if (!first) return null
    currentPending.value = first
    isSpinning.value = true
    return first.stopIndex
  }

  function finalizeDraw(): number | null {
    const p = currentPending.value
    currentPending.value = null
    if (!p) return null

    const person = people.value.find((x) => x.id === p.personId)
    const prize = prizes.value.find((x) => x.id === p.prizeId)
    if (!person || !prize || prize.remaining <= 0) return null
    if (excludeWinners.value && person.wins > 0) return null

    person.wins += 1
    prize.remaining -= 1
    results.value.unshift({
      id: createId(),
      personName: person.name,
      prizeName: prize.name,
      timestamp: new Date().toLocaleString(),
    })

    ensureSelectedPrizeStillValid()

    const next = pendingQueue.value.shift()
    if (!next) {
      isSpinning.value = false
      return null
    }
    currentPending.value = next
    return next.stopIndex
  }

  function prepareBatchDraw(): string[] | null {
    if (isSpinning.value) return null
    if (!canDraw.value) {
      if (!remainingPeople.value.length) notify('请先导入人员名单')
      else if (!selectedPrize.value) notify('请先选择一个奖品')
      else notify('当前奖品剩余数量为 0')
      return null
    }

    const candidates = remainingPeople.value
    const prize = selectedPrize.value!
    const count = resolveDrawCount(prize, candidates.length)
    if (count <= 0) return null

    pendingBatch.value = buildPendingQueue(candidates, prize.id, count)
    if (!pendingBatch.value.length) return null
    isSpinning.value = true
    return pendingBatch.value.map((x) => x.personId)
  }

  function finalizeBatchDraw() {
    const batch = pendingBatch.value
    pendingBatch.value = []
    if (!batch.length) {
      isSpinning.value = false
      return
    }

    for (const p of batch) {
      const person = people.value.find((x) => x.id === p.personId)
      const prize = prizes.value.find((x) => x.id === p.prizeId)
      if (!person || !prize || prize.remaining <= 0) continue
      if (excludeWinners.value && person.wins > 0) continue

      person.wins += 1
      prize.remaining -= 1
      results.value.unshift({
        id: createId(),
        personName: person.name,
        prizeName: prize.name,
        timestamp: new Date().toLocaleString(),
      })
    }

    ensureSelectedPrizeStillValid()
    refreshWheelPrizesFromRemainingPeople()
    isSpinning.value = false
  }

  function cancelBatchDraw() {
    pendingBatch.value = []
    isSpinning.value = false
  }

  function resolveDrawCount(prize: Prize, candidatesCount: number): number {
    const raw = drawCountSetting.value.trim().toLowerCase()
    const desired = raw === 'all' ? prize.remaining : Number.parseInt(raw, 10)
    const count = Number.isFinite(desired) && desired > 0 ? desired : 1
    const maxByCandidates = excludeWinners.value ? candidatesCount : Number.MAX_SAFE_INTEGER
    return Math.max(1, Math.min(count, prize.remaining, maxByCandidates))
  }

  function buildPendingQueue(candidates: Person[], prizeId: string, count: number): PendingDraw[] {
    if (!candidates.length || count <= 0) return []

    if (excludeWinners.value) {
      // 不放回抽样：一次 batch 内不会重复。
      const indices = candidates.map((_, i) => i)
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[indices[i], indices[j]] = [indices[j]!, indices[i]!]
      }
      return indices.slice(0, count).map((idx) => ({
        stopIndex: idx,
        personId: candidates[idx]!.id,
        prizeId,
      }))
    }

    // 可重复：放回抽样。
    return Array.from({ length: count }).map(() => {
      const stopIndex = Math.floor(Math.random() * candidates.length)
      return { stopIndex, personId: candidates[stopIndex]!.id, prizeId }
    })
  }

  function setExcludeWinners(next: boolean) {
    excludeWinners.value = next
    refreshWheelPrizesFromRemainingPeople()
  }

  function setDrawCountSetting(next: string) {
    if (displayMode.value === 'wheel') {
      drawCountSetting.value = '1'
      return
    }
    drawCountSetting.value = next.trim() || '1'
    lastNonWheelDrawCountSetting.value = drawCountSetting.value
  }

  function setDisplayMode(next: 'auto' | 'wheel' | 'marquee') {
    if (next === 'wheel') {
      if (displayMode.value !== 'wheel') {
        lastNonWheelDrawCountSetting.value = drawCountSetting.value
      }
      drawCountSetting.value = '1'
    } else if (displayMode.value === 'wheel') {
      drawCountSetting.value = lastNonWheelDrawCountSetting.value || '1'
    }
    displayMode.value = next
  }

  function isTauriRuntime(): boolean {
    return typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
  }

  async function exportResults() {
    if (!results.value.length) {
      notify('暂无中奖数据可导出')
      return
    }

    const bytes = buildResultsXlsx([...results.value].reverse())
    const defaultName = `中奖名单_${new Date().toISOString().slice(0, 10)}.xlsx`

    if (!isTauriRuntime()) {
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName
      a.click()
      URL.revokeObjectURL(url)
      notify('已导出中奖名单')
      return
    }

    const path = await save({
      title: '导出中奖名单',
      defaultPath: defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (typeof path !== 'string') return
    await invoke('save_binary_file', { path, bytes: Array.from(bytes) })
    notify('已导出中奖名单')
  }

  return {
    isSpinning,
    resetSeq,
    excludeWinners,
    drawCountSetting,
    requestedDrawCount,
    displayMode,
    shouldUseMarquee,
    resolvedDrawCount,
    people,
    prizes,
    selectedPrizeId,
    results,
    remainingPeople,
    selectedPrize,
    canDraw,
    displayedWheelPrizes,
    setSelectedPrizeId,
    setExcludeWinners,
    setDrawCountSetting,
    setDisplayMode,
    importPeopleFromBytes,
    importPrizesFromBytes,
    importPeopleAndPrizesFromBytes,
    updatePrizeTotal,
    resetAll,
    prepareDraw,
    finalizeDraw,
    prepareBatchDraw,
    finalizeBatchDraw,
    cancelBatchDraw,
    exportResults,
    refreshWheelPrizesFromRemainingPeople,
  }
}
