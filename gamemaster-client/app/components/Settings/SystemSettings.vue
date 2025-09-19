<script setup lang="ts">
const systemMsg = defineModel<string>('systemMsg', { required: true })

const emit = defineEmits<{
  reset: []
}>()

function resetSystem() {
  emit('reset')
}
</script>

<template>
  <div class="settings">
    <div class="settings-row">
      <label class="settings-label">System message</label>
      <textarea
        v-model="systemMsg"
        class="settings-input"
        rows="4"
        placeholder="Enter the system prompt for this chat..."
      />
    </div>
    <div class="settings-actions">
      <button class="btn" @click="resetSystem">Reset to default</button>
      <span class="hint">Saved to this browser (localStorage)</span>
    </div>
  </div>
</template>

<style scoped>
.settings {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}

.settings-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  align-items: start;
}

.settings-label {
  padding-top: 6px;
  color: #475569;
}

.settings-input {
  width: 100%;
  resize: vertical;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-family: system-ui, sans-serif;
}

.settings-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 8px;
}

.hint {
  color: #64748b;
  font-size: 12px;
}

.btn {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: #111;
  color: #fff;
  cursor: pointer;
}
</style>