<script setup lang="ts">
// Purely presentational - click handling done by parent
</script>

<template>
  <div class="more-indicator">
    <div class="more-content">
      <div class="more-text">-- MORE --</div>
      <div class="more-hint">click to continue (or start typing to interrupt)</div>
    </div>
  </div>
</template>

<style scoped>
.more-indicator {
  position: relative;
  width: 100%;
  padding: 16px 0;
  margin: 8px 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.more-content {
  background: rgba(17, 17, 17, 0.9);
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.3s ease-in-out;
}

.more-text {
  font-weight: bold;
  font-size: 18px;
  margin-bottom: 6px;
  letter-spacing: 2px;
}

.more-hint {
  font-size: 12px;
  color: #d1d5db;
  font-style: italic;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
