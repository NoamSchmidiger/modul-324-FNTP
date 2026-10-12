<script setup>
import { computed } from "vue";

const props = defineProps({
  size: {
    type: Number,
    default: 10,
  },
  // Map von Feld-ID (z.B. "A1") auf einen Status wie "ship", "hit" oder "miss".
  cellStates: {
    type: Object,
    default: () => ({}),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["cell-click"]);

const columnLabels = computed(() =>
  Array.from({ length: props.size }, (_, i) => String.fromCharCode(65 + i)),
);
const rowLabels = computed(() =>
  Array.from({ length: props.size }, (_, i) => i + 1),
);

function cellId(column, row) {
  return `${column}${row}`;
}

function stateOf(id) {
  return props.cellStates[id] || "empty";
}

function onCellClick(column, row) {
  if (props.disabled) {
    return;
  }
  const id = cellId(column, row);
  emit("cell-click", { id, column, row });
}
</script>

<template>
  <div class="game-board" :style="{ '--size': size }">
    <div class="corner"></div>
    <div
      v-for="column in columnLabels"
      :key="`col-${column}`"
      class="column-label"
    >
      {{ column }}
    </div>

    <template v-for="row in rowLabels" :key="`row-${row}`">
      <div class="row-label">{{ row }}</div>
      <button
        v-for="column in columnLabels"
        :key="cellId(column, row)"
        type="button"
        class="cell"
        :class="stateOf(cellId(column, row))"
        :disabled="disabled"
        :aria-label="`Feld ${cellId(column, row)}`"
        :data-cell-id="cellId(column, row)"
        @click="onCellClick(column, row)"
      ></button>
    </template>
  </div>
</template>

<style scoped>
.game-board {
  display: grid;
  grid-template-columns: 2rem repeat(var(--size), 2rem);
  grid-auto-rows: 2rem;
  gap: 2px;
  width: fit-content;
}

.corner {
  width: 2rem;
  height: 2rem;
}

.column-label,
.row-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
}

.cell {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid #7fb3d5;
  background-color: #eaf4fb;
  cursor: pointer;
}

.cell:hover:not(:disabled) {
  background-color: #cfe7f7;
}

.cell:disabled {
  cursor: default;
}

.cell.ship {
  background-color: #5d6d7e;
}

.cell.hit {
  background-color: #e74c3c;
}

.cell.miss {
  background-color: #bfc9ca;
}
</style>
