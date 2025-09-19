import { ref, watch, onMounted } from 'vue'

export function useSettings() {
  const showSettings = ref(false)

  function toggleSettings() {
    showSettings.value = !showSettings.value
  }

  return {
    showSettings,
    toggleSettings
  }
}