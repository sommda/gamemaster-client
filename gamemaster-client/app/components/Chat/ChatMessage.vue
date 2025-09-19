<script setup lang="ts">
type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

defineProps<{
  message: Msg
}>()
</script>

<template>
  <div class="msg" :class="message.role">
    <strong class="role">{{ message.role }}</strong>
    <div class="bubble">
      <StreamMarkdown v-if="message.role === 'assistant'" :source="message.content" />
      <div v-else class="user-text">{{ message.content }}</div>
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  gap: 8px;
  margin: 6px 0;
}

.msg.user .bubble {
  background: #e8f0fe;
}

.msg.assistant .bubble {
  background: #f1f5f9;
}

.role {
  width: 80px;
  text-transform: capitalize;
}

.bubble {
  padding: 8px 10px;
  border-radius: 10px;
  white-space: normal;
  flex: 1;
}

.user-text {
  white-space: pre-wrap;
}
</style>