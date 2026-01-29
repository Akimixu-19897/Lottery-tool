<script setup lang="ts">
import ConfigPanel from "./components/ConfigPanel.vue";
import WheelPanel from "./components/WheelPanel.vue";
import ResultsPanel from "./components/ResultsPanel.vue";
import { useStatus } from "./composables/useStatus";
import { useLottery } from "./composables/useLottery";

const { setStatus } = useStatus();
const lottery = useLottery(setStatus);
</script>

<template>
  <div class="app">
    <main class="grid">
      <ConfigPanel
        :is-spinning="lottery.isSpinning.value"
        :people-count="lottery.people.value.length"
        :remaining-people-count="lottery.remainingPeople.value.length"
        :prizes="lottery.prizes.value"
        :selected-prize-id="lottery.selectedPrizeId.value"
        :exclude-winners="lottery.excludeWinners.value"
        :draw-count-setting="lottery.drawCountSetting.value"
        :display-mode="lottery.displayMode.value"
        @update:selectedPrizeId="lottery.setSelectedPrizeId"
        @update:excludeWinners="lottery.setExcludeWinners"
        @update:drawCountSetting="lottery.setDrawCountSetting"
        @update:displayMode="lottery.setDisplayMode"
        @importPeople="lottery.importPeopleFromBytes"
        @importPrizes="lottery.importPrizesFromBytes"
        @importPeopleAndPrizes="lottery.importPeopleAndPrizesFromBytes"
        @updatePrizeTotal="lottery.updatePrizeTotal"
        @resetAll="lottery.resetAll"
      />

      <WheelPanel
        :key="`wheelpanel_${lottery.resetSeq.value}`"
        :is-spinning="lottery.isSpinning.value"
        :can-draw="lottery.canDraw.value"
        :draw-count="lottery.requestedDrawCount.value"
        :use-marquee="lottery.shouldUseMarquee.value"
        :prizes="lottery.prizes.value"
        :selected-prize-id="lottery.selectedPrizeId.value"
        :selected-prize="lottery.selectedPrize.value"
        :displayed-wheel-prizes="lottery.displayedWheelPrizes.value"
        :marquee-candidates="lottery.remainingPeople.value.map((p) => ({ id: p.id, name: p.name }))"
        :set-selected-prize-id="lottery.setSelectedPrizeId"
        :prepare-draw="lottery.prepareDraw"
        :finalize-draw="lottery.finalizeDraw"
        :prepare-batch-draw="lottery.prepareBatchDraw"
        :finalize-batch-draw="lottery.finalizeBatchDraw"
        :cancel-batch-draw="lottery.cancelBatchDraw"
      />

      <ResultsPanel
        :results="lottery.results.value"
        :on-export="lottery.exportResults"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  margin: 0;
  padding: 20px;
  box-sizing: border-box;
}

.grid {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 320px;
  gap: 16px;
  min-height: calc(100vh - 40px);
  align-items: stretch;
}

.grid > * {
  min-height: 0;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: 1fr;
    min-height: auto;
    align-items: start;
  }
}
</style>
