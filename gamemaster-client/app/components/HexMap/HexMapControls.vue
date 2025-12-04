<script setup lang="ts">
import { computed } from 'vue'

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
  hexes: Array<{
    x: number
    y: number
    terrain: string
    pois: any[]
    explored?: boolean
    discovered?: boolean
    elevation?: string | null
  }>
  roads: any[]
  rivers: any[]
}

const props = defineProps<{
  mapData: HexMapData
  zoom: number
}>()

const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  resetView: []
}>()

// Terrain colors for legend
const terrainColors: Record<string, string> = {
  grass: '#7cb342',
  scrub: '#9ccc65',
  plains: '#aed581',
  forest: '#558b2f',
  light_forest: '#689f38',
  dense_forest: '#33691e',
  jungle: '#1b5e20',
  marsh: '#7cb342',
  swamp: '#558b2f',
  hills: '#8d6e63',
  mountains: '#5d4037',
  desert: '#fdd835',
  badlands: '#d32f2f',
  wasteland: '#616161',
  tundra: '#e0f2f1',
  glacier: '#b2ebf2',
  volcanic: '#d32f2f',
  coastal: '#ffd54f',
  water: '#2196f3',
  urban: '#757575',
  farmland: '#cddc39'
}

// Get unique terrains from the map data
const visibleTerrains = computed(() => {
  const terrainSet = new Set<string>()
  const hexes = props.mapData.hexes || []

  hexes.forEach(hex => {
    if (hex?.terrain) {
      terrainSet.add(hex.terrain)
    }
  })

  const terrains: Record<string, string> = {}
  terrainSet.forEach(terrain => {
    if (terrainColors[terrain]) {
      terrains[terrain] = terrainColors[terrain]
    }
  })

  return terrains
})

// Format terrain name
function formatTerrain(terrain: string): string {
  return terrain.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

// Map statistics
const mapStats = computed(() => {
  const hexes = props.mapData.hexes || []
  const roads = props.mapData.roads || []
  const rivers = props.mapData.rivers || []

  const hexCount = hexes.length
  const discoveredCount = hexes.filter(h => h?.explored || h?.discovered).length
  const poiCount = hexes.reduce((sum, hex) => sum + (hex?.pois?.length || 0), 0)
  const roadCount = roads.length
  const riverCount = rivers.length

  return {
    hexCount,
    discoveredCount,
    poiCount,
    roadCount,
    riverCount
  }
})
</script>

<template>
  <div class="hex-map-controls">
    <!-- Zoom Controls -->
    <div class="control-panel zoom-panel">
      <button @click="emit('zoomOut')" class="control-btn" title="Zoom Out (−)">
        −
      </button>
      <div class="zoom-indicator">
        {{ Math.round(zoom * 100) }}%
      </div>
      <button @click="emit('zoomIn')" class="control-btn" title="Zoom In (+)">
        +
      </button>
      <button @click="emit('resetView')" class="control-btn reset-btn" title="Reset View">
        ⟲
      </button>
    </div>

    <!-- Map Info -->
    <div class="control-panel info-panel">
      <h4>Map Info</h4>
      <div class="info-items">
        <div class="info-item">
          <span class="info-label">Hexes:</span>
          <span class="info-value">{{ mapStats.hexCount }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Discovered:</span>
          <span class="info-value">{{ mapStats.discoveredCount }} / {{ mapStats.hexCount }}</span>
        </div>
        <div v-if="mapStats.poiCount > 0" class="info-item">
          <span class="info-label">POIs:</span>
          <span class="info-value">{{ mapStats.poiCount }}</span>
        </div>
        <div v-if="mapStats.roadCount > 0" class="info-item">
          <span class="info-label">Roads:</span>
          <span class="info-value">{{ mapStats.roadCount }}</span>
        </div>
        <div v-if="mapStats.riverCount > 0" class="info-item">
          <span class="info-label">Rivers:</span>
          <span class="info-value">{{ mapStats.riverCount }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Scale:</span>
          <span class="info-value">{{ mapData.hex_size_miles }} mi/hex</span>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="control-panel legend-panel">
      <h4>Terrain Legend</h4>
      <div class="legend-items">
        <div
          v-for="(color, terrain) in visibleTerrains"
          :key="terrain"
          class="legend-item"
        >
          <div class="legend-color" :style="{ background: color }"></div>
          <span class="legend-label">{{ formatTerrain(terrain) }}</span>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <div class="control-panel instructions-panel">
      <h4>Controls</h4>
      <ul class="instructions-list">
        <li><strong>Drag</strong> to pan the map</li>
        <li><strong>Scroll</strong> to zoom in/out</li>
        <li><strong>Hover</strong> over hex for details</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.hex-map-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 220px;
  pointer-events: auto;
}

.control-panel {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
}

.control-panel h4 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Zoom Panel */
.zoom-panel {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  flex: 1;
  padding: 8px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1;
}

.control-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.control-btn:active {
  transform: scale(0.95);
}

.reset-btn {
  font-size: 16px;
}

.zoom-indicator {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  white-space: nowrap;
}

/* Info Panel */
.info-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
}

.info-label {
  color: #6b7280;
  font-weight: 500;
}

.info-value {
  color: #1f2937;
  font-weight: 600;
}

/* Legend Panel */
.legend-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.legend-label {
  color: #374151;
  font-weight: 500;
}

/* Instructions Panel */
.instructions-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 11px;
  color: #6b7280;
}

.instructions-list li {
  padding: 3px 0;
  line-height: 1.4;
}

.instructions-list strong {
  color: #374151;
  font-weight: 600;
}

/* Scrollbar styling for legend */
.legend-items::-webkit-scrollbar {
  width: 6px;
}

.legend-items::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 3px;
}

.legend-items::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.legend-items::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
