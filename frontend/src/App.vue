<script setup>
import { ref } from "vue";

const game = ref(null);
const loading = ref(false);
const error = ref("");

async function startGame() {
  loading.value = true;
  error.value = "";
  try {
    const response = await fetch("/api/games/start", {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Das Spiel konnte nicht gestartet werden.");
    }
    game.value = data;
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <h1>Schiffe versenken</h1>
  <button :disabled="loading || !!game" @click="startGame">
    {{ loading ? "Spiel wird gestartet..." : "Spiel starten" }}
  </button>
  <p v-if="error" role="alert">{{ error }}</p>
  <div v-if="game">
    <p>Spiel-ID: {{ game.gameSessionId }}</p>
    <p>Status: {{ game.phase }}</p>
  </div>
</template>
