<script setup lang="ts">
import type { DrawResult } from '../lib/models'

defineProps<{
  results: DrawResult[]
  onExport: () => void
}>()
</script>

<template>
  <section class="panel">
    <div class="panelTitle">中奖名单</div>
    <div class="resultsMeta">已中奖：{{ results.length }} 人</div>

    <div class="results">
      <div class="resultRow" v-for="r in results" :key="r.id">
        <div class="rLeft">
          <div class="rName">{{ r.personName }}</div>
          <div class="rTime">{{ r.timestamp }}</div>
        </div>
        <div class="rPrize">{{ r.prizeName }}</div>
      </div>
      <div class="resultsEmpty" v-if="!results.length">还没有人中奖，开始抽奖吧。</div>
    </div>

    <div class="actions">
      <button class="btn" :disabled="!results.length" @click="onExport">导出中奖名单（Excel）</button>
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panelTitle {
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 10px;
  color: rgba(11, 18, 32, 0.9);
}

.resultsMeta {
  font-size: 12px;
  color: rgba(11, 18, 32, 0.7);
  margin-bottom: 10px;
}

.results {
  display: grid;
  gap: 10px;
  overflow: auto;
  padding-right: 4px;
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
}

.resultRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  border: 1px solid rgba(11, 18, 32, 0.08);
  border-radius: 14px;
  padding: 10px 10px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.95);
}
.rName {
  font-weight: 900;
  font-size: 14px;
}
.rTime {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(11, 18, 32, 0.6);
}
.rPrize {
  font-weight: 900;
  font-size: 13px;
  padding: 6px 10px;
  box-sizing: border-box;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.06);
}
.resultsEmpty {
  font-size: 12px;
  color: rgba(11, 18, 32, 0.6);
  text-align: center;
  padding: 18px 0;
  box-sizing: border-box;
}

.actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 10px;
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
</style>
