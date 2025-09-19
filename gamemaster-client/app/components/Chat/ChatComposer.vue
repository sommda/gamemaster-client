<script setup lang="ts">
const userInput = defineModel<string>('userInput', { required: true })

const emit = defineEmits<{
  send: []
  keydown: [event: KeyboardEvent]
}>()

function onKeydown(e: KeyboardEvent) {
  emit('keydown', e)
}

function onSend() {
  emit('send')
}
</script>

<template>
  <div class="composer">
    <textarea
      v-model="userInput"
      class="input"
      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
      rows="3"
      @keydown="onKeydown"
    />
    <button class="send btn" @click="onSend" :disabled="!userInput.trim()">Send</button>
  </div>
</template>

<style scoped>
.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.input {
  flex: 1;
  resize: vertical;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ccc;
}

.send {
  margin-left: 6px;
}

.btn {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: #111;
  color: #fff;
  cursor: pointer;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>