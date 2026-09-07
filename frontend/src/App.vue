<script setup>
import { ref, onMounted } from 'vue'

const message = ref('...')

onMounted(async () => {
  const response = await fetch('http://localhost:8080/api/hello')
  const data = await response.json()
  message.value = data.message
})
</script>

<template>
  <h1>{{ message }}</h1>
</template>
