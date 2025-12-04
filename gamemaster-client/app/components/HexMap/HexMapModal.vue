<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useMcpClient } from '@/composables/useMcpClient'
import HexMapCanvas from './HexMapCanvas.vue'

type HexCoordinate = { x: number; y: number }

type POI = {
  id: string
  name: string
  poi_type: string
  discovered: boolean
}

type Hex = {
  x: number
  y: number
  terrain: string
  pois: POI[]
  explored?: boolean
  discovered?: boolean
  elevation?: string | null
}

type Road = {
  id: string
  name?: string | null
  path: HexCoordinate[]
  start_point: string
  end_point: string
}

type RiverSegment = {
  hex: HexCoordinate
  entry_side: string
  exit_side: string
}

type River = {
  id: string
  name?: string | null
  path: RiverSegment[]
  width: string
  navigable: boolean
}

type HexMapData = {
  name: string
  description?: string | null
  hex_size_miles: number
  default_terrain: string
  bounds: {
    min_x: number
    max_x: number
    min_y: number
    max_y: number
  }
  hexes: Hex[]
  roads: Road[]
  rivers: River[]
}

const props = defineProps<{
  isOpen: boolean
  currentLocation?: string | null
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

// Handle ESC key to close modal
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.isOpen) {
    close()
  }
}

// Add/remove keyboard listener
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleKeyDown)
    if (!mapData.value) {
      loadMapData()
    }
  } else {
    document.removeEventListener('keydown', handleKeyDown)
  }
})

// Cleanup on unmount
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

const mapData = ref<HexMapData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function loadMapData() {
  loading.value = true
  error.value = null

  try {
    const { getClient } = useMcpClient()
    const client = await getClient()

    // Call the render_hex_map tool using the SDK
    const result = await client.callTool({
      name: 'render_hex_map',
      arguments: {
        render_mode: 'json',
        // map_name omitted to use current map based on location
      }
    })

    console.log('Raw tool result:', result)
    console.log('Result content:', result?.content)

    // Check if the tool call failed (isError flag)
    if (result.isError) {
      throw new Error(String(result.content || 'Tool call failed'))
    }

    // Parse tool result - SDK returns content in result.content
    let content = result?.content
    let textContent: string | null = null

    // Extract text from different content formats
    if (Array.isArray(content)) {
      // Content is an array of content blocks
      const textBlock = content.find(block => block.type === 'text')
      if (textBlock && textBlock.text) {
        textContent = textBlock.text
      } else if (content[0]?.text) {
        textContent = content[0].text
      }
    } else if (typeof content === 'string') {
      textContent = content
    } else if (content && typeof content === 'object' && 'text' in content) {
      textContent = content.text
    }

    console.log('Extracted text content:', textContent)

    // Check if we got any text content
    if (!textContent) {
      throw new Error('No content received from tool call')
    }

    // Check if it's an error message (plain text, not JSON)
    if (textContent.includes('Error calling') ||
        textContent.includes('not found') ||
        textContent.includes('No map') ||
        textContent.includes('ValueError') ||
        !textContent.trim().startsWith('{')) {
      throw new Error(textContent)
    }

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(textContent)
      mapData.value = parsed as HexMapData
      console.log('Successfully parsed map data:', mapData.value)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.error('Attempted to parse:', textContent.substring(0, 200))
      throw new Error('Failed to parse map data - server returned invalid JSON')
    }
  } catch (e: any) {
    console.error('Failed to load map data:', e)

    // Check for specific error types
    const message = e?.message || String(e)
    if (message.includes('No map') || message.includes('not found') || message.includes('no current map')) {
      error.value = 'No map available for this location. The current location does not have a hex map associated with it.'
    } else if (message.includes('ValueError')) {
      // Extract the actual error message from ValueError
      const match = message.match(/ValueError: (.+)/)
      error.value = match ? match[1] : 'Error loading map from server'
    } else if (message.includes('JSON')) {
      error.value = 'Failed to parse map data from server. The server may have returned an error.'
    } else {
      error.value = message || 'Failed to load map data'
    }
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:isOpen', false)
}

function handleRetry() {
  loadMapData()
}
</script>

<template>
  <!-- Custom Modal Overlay -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-container" @click.stop>
          <div class="hex-map-modal">
            <!-- Modal Header -->
            <div class="modal-header">
              <div class="header-content">
                <h2 class="modal-title">{{ mapData?.name || 'Hex Map' }}</h2>
                <p v-if="mapData?.description" class="modal-description">
                  {{ mapData.description }}
                </p>
              </div>
              <button @click="close" class="close-btn" title="Close (ESC)">
                ✕
              </button>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="loading-state">
              <div class="loading-spinner"></div>
              <p>Loading map...</p>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="error-state">
              <div class="error-icon">⚠️</div>
              <p class="error-message">{{ error }}</p>
              <button @click="handleRetry" class="retry-btn">
                Retry
              </button>
            </div>

            <!-- Map Display -->
            <div v-else-if="mapData" class="map-container">
              <HexMapCanvas :map-data="mapData" />
            </div>

            <!-- Empty State -->
            <div v-else class="empty-state">
              <p>No map data available for the current location.</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 1400px;
  height: 90vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
  opacity: 0;
}

.hex-map-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.header-content {
  flex: 1;
}

.modal-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

.modal-description {
  margin: 4px 0 0 0;
  font-size: 14px;
  color: #6b7280;
}

.close-btn {
  padding: 8px;
  background: transparent;
  border: none;
  font-size: 24px;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.2s ease;
  line-height: 1;
}

.close-btn:hover {
  color: #1f2937;
}

.loading-state,
.error-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 16px;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p,
.empty-state p {
  font-size: 16px;
  color: #6b7280;
}

.error-icon {
  font-size: 48px;
}

.error-message {
  font-size: 16px;
  color: #dc2626;
  text-align: center;
  max-width: 400px;
}

.retry-btn {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
}

.retry-btn:hover {
  background: #2563eb;
}

.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #f9fafb;
}
</style>
