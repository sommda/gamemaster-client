<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import HexMapControls from './HexMapControls.vue'

type HexCoordinate = { x: number; y: number }

type POI = {
  id: string
  name: string
  poi_type: string
  discovered?: boolean
  explored?: boolean
}

type Hex = {
  x: number
  y: number
  terrain: string
  pois: POI[]
  explored: boolean
  discovered?: boolean  // Fallback
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
  mapData: HexMapData
}>()

// State
const zoom = ref(1.0)
const panX = ref(0)
const panY = ref(0)
const hexSize = ref(40) // base size in pixels
const svgRef = ref<SVGSVGElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

// Tooltip state
const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  hex: null as Hex | null
})

// Panning state
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })

// Terrain colors mapping
const terrainColors: Record<string, string> = {
  // Grasslands
  grass: '#7cb342',
  scrub: '#9ccc65',
  plains: '#aed581',
  // Forests
  forest: '#558b2f',
  light_forest: '#689f38',
  dense_forest: '#33691e',
  jungle: '#1b5e20',
  // Wetlands
  marsh: '#7cb342',
  swamp: '#558b2f',
  // Elevation
  hills: '#8d6e63',
  mountains: '#5d4037',
  // Arid
  desert: '#fdd835',
  badlands: '#d32f2f',
  wasteland: '#616161',
  // Cold
  tundra: '#e0f2f1',
  glacier: '#b2ebf2',
  // Special
  volcanic: '#d32f2f',
  coastal: '#ffd54f',
  water: '#2196f3',
  // Populated
  urban: '#757575',
  farmland: '#cddc39'
}

// POI icons mapping
const poiIcons: Record<string, string> = {
  city: '🏙️',
  town: '🏘️',
  village: '🏡',
  inn: '🏨',
  castle: '🏰',
  temple: '🏛️',
  tower: '🗼',
  shrine: '⛩️',
  dungeon: '🚪',
  ruins: '🏚️',
  cave: '🕳️',
  camp: '⛺',
  landmark: '📍'
}

// Calculate hex pixel position (flat-top hexagon)
function hexToPixel(coord: { x: number; y: number }): { x: number; y: number } {
  const size = hexSize.value * zoom.value

  // For flat-top hexagons:
  // - Width (horizontal span) = 2 * size
  // - Height (vertical span) = √3 * size
  // - Horizontal spacing between columns = 1.5 * size
  // - Vertical spacing between rows = √3 * size
  const hexWidth = 2 * size
  const hexHeight = Math.sqrt(3) * size
  const horizontalSpacing = 1.5 * size
  const verticalSpacing = hexHeight

  // Columns are evenly spaced horizontally
  const x = coord.x * horizontalSpacing

  // Odd columns (x=1, 3, 5...) are offset downward by half the vertical spacing
  const y = coord.y * verticalSpacing + (coord.x % 2) * (verticalSpacing / 2)

  return { x: x + panX.value, y: y + panY.value }
}

// Generate hex corner points (flat-top)
function hexCorners(center: { x: number; y: number }): string {
  const size = hexSize.value * zoom.value
  const angles = [0, 60, 120, 180, 240, 300]

  return angles
    .map(angle => {
      const rad = (Math.PI / 180) * angle
      const x = center.x + size * Math.cos(rad)
      const y = center.y + size * Math.sin(rad)
      return `${x},${y}`
    })
    .join(' ')
}

// Get terrain color
function getTerrainColor(terrain: string): string {
  return terrainColors[terrain] || '#cccccc'
}

// Get POI icon
function getPOIIcon(poiType: string): string {
  return poiIcons[poiType] || '📍'
}

// Check if terrain should have tree decorations
function shouldHaveTrees(terrain: string): boolean {
  return ['forest', 'light_forest', 'dense_forest', 'jungle'].includes(terrain)
}

// Get tree positions for a hex (returns multiple positions for variety)
function getTreePositions(hex: { x: number; y: number }): Array<{ x: number; y: number }> {
  const center = hexToPixel({ x: hex.x, y: hex.y })
  const size = hexSize.value * zoom.value
  const offset = size * 0.3

  // Return 3-4 tree positions around the hex center
  return [
    { x: center.x - offset, y: center.y - offset * 0.5 },
    { x: center.x + offset, y: center.y - offset * 0.5 },
    { x: center.x, y: center.y + offset * 0.6 }
  ]
}

// Render a simple tree shape (triangle with trunk)
function renderTree(position: { x: number; y: number }, terrain: string): string {
  const size = hexSize.value * zoom.value
  const treeHeight = size * 0.25
  const treeWidth = size * 0.15
  const trunkHeight = size * 0.08
  const trunkWidth = size * 0.04

  const { x, y } = position

  // Tree foliage (triangle)
  const foliagePoints = `${x},${y - treeHeight} ${x - treeWidth / 2},${y} ${x + treeWidth / 2},${y}`

  // Tree trunk (small rectangle)
  const trunkPath = `M ${x - trunkWidth / 2} ${y} L ${x + trunkWidth / 2} ${y} L ${x + trunkWidth / 2} ${y + trunkHeight} L ${x - trunkWidth / 2} ${y + trunkHeight} Z`

  // Different shades for different forest types
  let foliageColor = '#2e7d32' // darker green
  if (terrain === 'light_forest') foliageColor = '#43a047'
  if (terrain === 'dense_forest') foliageColor = '#1b5e20'
  if (terrain === 'jungle') foliageColor = '#004d40'

  return { foliagePoints, trunkPath, foliageColor }
}

// Get hexes that should have tree decorations
const hexesWithTrees = computed(() => {
  return validHexes.value.filter(hex => shouldHaveTrees(hex.terrain))
})

// Check if terrain should have grass
function shouldHaveGrass(terrain: string): boolean {
  return ['grass', 'plains', 'scrub'].includes(terrain)
}

// Get grass blade positions (scattered around hex)
function getGrassPositions(hex: { x: number; y: number }): Array<{ x: number; y: number }> {
  const center = hexToPixel({ x: hex.x, y: hex.y })
  const size = hexSize.value * zoom.value
  const spread = size * 0.4

  // Use hex coordinates for pseudo-random positioning
  const seed = hex.x * 7 + hex.y * 13
  const positions: Array<{ x: number; y: number }> = []

  for (let i = 0; i < 8; i++) {
    const angle = (seed + i * 45) % 360
    const rad = (angle * Math.PI) / 180
    const distance = spread * (0.4 + ((seed + i) % 6) / 10)
    positions.push({
      x: center.x + Math.cos(rad) * distance,
      y: center.y + Math.sin(rad) * distance
    })
  }

  return positions
}

// Render grass blade (short vertical line)
function renderGrassBlade(position: { x: number; y: number }): string {
  const size = hexSize.value * zoom.value
  const bladeHeight = size * 0.08
  const { x, y } = position

  return `M ${x} ${y} L ${x} ${y - bladeHeight}`
}

const hexesWithGrass = computed(() => {
  return validHexes.value.filter(hex => shouldHaveGrass(hex.terrain))
})

// Check if terrain should have hills
function shouldHaveHills(terrain: string): boolean {
  return terrain === 'hills'
}

// Render hill humps
function getHillHumps(hex: { x: number; y: number }): Array<{ path: string; color: string }> {
  const center = hexToPixel({ x: hex.x, y: hex.y })
  const size = hexSize.value * zoom.value
  const humpWidth = size * 0.3
  const humpHeight = size * 0.15

  const humps = [
    {
      x: center.x - size * 0.15,
      y: center.y,
      color: '#a1887f'
    },
    {
      x: center.x + size * 0.2,
      y: center.y + size * 0.1,
      color: '#8d6e63'
    },
    {
      x: center.x - size * 0.1,
      y: center.y + size * 0.15,
      color: '#795548'
    }
  ]

  return humps.map(hump => ({
    path: `M ${hump.x - humpWidth / 2} ${hump.y + humpHeight / 2} Q ${hump.x} ${hump.y - humpHeight} ${hump.x + humpWidth / 2} ${hump.y + humpHeight / 2} Z`,
    color: hump.color
  }))
}

const hexesWithHills = computed(() => {
  return validHexes.value.filter(hex => shouldHaveHills(hex.terrain))
})

// Check if terrain should have mountains
function shouldHaveMountains(terrain: string): boolean {
  return terrain === 'mountains'
}

// Render mountain peaks
function getMountainPeaks(hex: { x: number; y: number }): Array<{ path: string; snowPath: string; hasSnow: boolean }> {
  const center = hexToPixel({ x: hex.x, y: hex.y })
  const size = hexSize.value * zoom.value
  const peakHeight = size * 0.35
  const peakWidth = size * 0.25

  // Use hex coordinates to determine which peaks have snow
  const seed = hex.x * 11 + hex.y * 7

  const peaks = [
    {
      x: center.x - size * 0.2,
      y: center.y + size * 0.1,
      height: peakHeight * 0.8,
      hasSnow: seed % 3 === 0
    },
    {
      x: center.x + size * 0.15,
      y: center.y,
      height: peakHeight,
      hasSnow: seed % 2 === 0
    },
    {
      x: center.x - size * 0.05,
      y: center.y + size * 0.15,
      height: peakHeight * 0.9,
      hasSnow: seed % 3 === 1
    }
  ]

  return peaks.map(peak => {
    const peakPath = `M ${peak.x} ${peak.y - peak.height} L ${peak.x - peakWidth / 2} ${peak.y} L ${peak.x + peakWidth / 2} ${peak.y} Z`

    // Snow cap path (top third of peak)
    const snowPath = peak.hasSnow
      ? `M ${peak.x} ${peak.y - peak.height} L ${peak.x - peakWidth / 6} ${peak.y - peak.height * 0.6} L ${peak.x + peakWidth / 6} ${peak.y - peak.height * 0.6} Z`
      : ''

    return {
      path: peakPath,
      snowPath,
      hasSnow: peak.hasSnow
    }
  })
}

const hexesWithMountains = computed(() => {
  return validHexes.value.filter(hex => shouldHaveMountains(hex.terrain))
})

// Calculate viewBox (fixed size, doesn't scale with zoom)
const viewBox = computed(() => {
  const { bounds } = props.mapData
  const size = hexSize.value  // Use base size without zoom

  // For flat-top hexagons:
  const hexHeight = Math.sqrt(3) * size
  const horizontalSpacing = 1.5 * size
  const verticalSpacing = hexHeight

  // Calculate total dimensions at base scale
  const numColumns = bounds.max_x - bounds.min_x + 1
  const numRows = bounds.max_y - bounds.min_y + 1

  // Total width accounts for column spacing plus half a hex on each end
  const totalWidth = numColumns * horizontalSpacing + size

  // Total height accounts for row spacing, plus half spacing for odd column offset, plus extra for hex height
  const totalHeight = numRows * verticalSpacing + verticalSpacing

  // Adjust viewBox size inversely with zoom (smaller viewBox = zoomed in)
  const viewWidth = totalWidth / zoom.value
  const viewHeight = totalHeight / zoom.value

  // Center the viewBox on the panned position
  const centerX = totalWidth / 2
  const centerY = totalHeight / 2

  return {
    x: centerX - viewWidth / 2 - panX.value / zoom.value,
    y: centerY - viewHeight / 2 - panY.value / zoom.value,
    width: viewWidth,
    height: viewHeight
  }
})

// Filter valid hexes (with proper coordinates)
const validHexes = computed(() => {
  console.log('Filtering hexes, total count:', props.mapData.hexes?.length)
  if (props.mapData.hexes && props.mapData.hexes.length > 0) {
    console.log('First hex sample:', props.mapData.hexes[0])
  }

  const filtered = props.mapData.hexes.filter(hex => {
    const hasX = typeof hex?.x === 'number'
    const hasY = typeof hex?.y === 'number'

    if (!hasX || !hasY) {
      console.log('Invalid hex:', hex, { hasX, hasY })
    }

    return hasX && hasY
  })

  console.log('Filtered valid hexes:', filtered.length)
  return filtered
})

// Get hexes with POIs
const hexesWithPOIs = computed(() => {
  return validHexes.value.filter(hex =>
    hex?.pois &&
    Array.isArray(hex.pois) &&
    hex.pois.length > 0
  )
})

// Filter valid roads
const validRoads = computed(() => {
  if (!props.mapData.roads || !Array.isArray(props.mapData.roads)) return []

  return props.mapData.roads.filter(road =>
    road?.path &&
    Array.isArray(road.path) &&
    road.path.length > 0 &&
    road.path.every(coord => coord && typeof coord.x === 'number' && typeof coord.y === 'number')
  )
})

// Filter valid rivers
const validRivers = computed(() => {
  if (!props.mapData.rivers || !Array.isArray(props.mapData.rivers)) return []

  return props.mapData.rivers.filter(river =>
    river?.path &&
    Array.isArray(river.path) &&
    river.path.length > 0 &&
    river.path.every(segment =>
      segment?.hex &&
      typeof segment.hex.x === 'number' &&
      typeof segment.hex.y === 'number'
    )
  )
})

// Tooltip handlers
function showTooltip(hex: Hex, event: MouseEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  tooltip.value = {
    visible: true,
    x: event.clientX - rect.left + 10,
    y: event.clientY - rect.top + 10,
    hex
  }
}

function hideTooltip() {
  tooltip.value.visible = false
}

// Mouse event handlers for panning
function handleMouseDown(event: MouseEvent) {
  isPanning.value = true
  panStart.value = { x: event.clientX - panX.value, y: event.clientY - panY.value }
}

function handleMouseMove(event: MouseEvent) {
  if (isPanning.value) {
    panX.value = event.clientX - panStart.value.x
    panY.value = event.clientY - panStart.value.y
  }
}

function handleMouseUp() {
  isPanning.value = false
}

// Wheel event handler for zoom
function handleWheel(event: WheelEvent) {
  event.preventDefault()
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(0.5, Math.min(3, zoom.value * delta))
  zoom.value = newZoom
}

// River width mapping
function riverWidth(width: string | undefined): number {
  if (!width) return 4
  const widths: Record<string, number> = {
    stream: 2,
    river: 4,
    wide_river: 6
  }
  return widths[width] || 4
}

// Render road path
function renderRoadPath(road: Road): string {
  if (!road?.path || road.path.length === 0) return ''

  try {
    const points = road.path
      .filter(coord => coord && typeof coord.x === 'number' && typeof coord.y === 'number')
      .map(coord => hexToPixel(coord))

    if (points.length === 0) return ''

    const pathData = points.map((point, i) => {
      return i === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    }).join(' ')

    return pathData
  } catch (e) {
    console.warn('Error rendering road path:', e, road)
    return ''
  }
}

// Render river path
function renderRiverPath(river: River): string {
  if (!river?.path || river.path.length === 0) return ''

  try {
    const points = river.path
      .filter(segment => segment?.hex && typeof segment.hex.x === 'number' && typeof segment.hex.y === 'number')
      .map(segment => hexToPixel(segment.hex))

    if (points.length === 0) return ''

    const pathData = points.map((point, i) => {
      return i === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    }).join(' ')

    return pathData
  } catch (e) {
    console.warn('Error rendering river path:', e, river)
    return ''
  }
}

// Initialize view
onMounted(() => {
  console.log('HexMapCanvas mounted with data:', props.mapData)
  console.log('Valid hexes:', validHexes.value.length)
  console.log('Valid roads:', validRoads.value.length)
  console.log('Valid rivers:', validRivers.value.length)

  if (containerRef.value && props.mapData?.bounds) {
    // Center the view on mount
    const { bounds } = props.mapData
    const centerX = (bounds.max_x + bounds.min_x) / 2
    const centerY = (bounds.max_y + bounds.min_y) / 2

    // Adjust initial zoom based on map size
    const mapWidth = bounds.max_x - bounds.min_x + 1
    const mapHeight = bounds.max_y - bounds.min_y + 1
    const maxDimension = Math.max(mapWidth, mapHeight)

    if (maxDimension > 30) {
      zoom.value = 0.6
    } else if (maxDimension > 20) {
      zoom.value = 0.8
    }
  }
})

// Control methods
function handleZoomIn() {
  zoom.value = Math.min(3, zoom.value * 1.2)
}

function handleZoomOut() {
  zoom.value = Math.max(0.5, zoom.value / 1.2)
}

function handleResetView() {
  zoom.value = 1.0
  panX.value = 0
  panY.value = 0

  // Adjust initial zoom based on map size
  const { bounds } = props.mapData
  const mapWidth = bounds.max_x - bounds.min_x + 1
  const mapHeight = bounds.max_y - bounds.min_y + 1
  const maxDimension = Math.max(mapWidth, mapHeight)

  if (maxDimension > 30) {
    zoom.value = 0.6
  } else if (maxDimension > 20) {
    zoom.value = 0.8
  }
}

// Cleanup
onUnmounted(() => {
  // Any cleanup if needed
})
</script>

<template>
  <div ref="containerRef" class="hex-map-canvas-container">
    <svg
      ref="svgRef"
      class="hex-map-svg"
      :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    >
      <!-- Hex tiles layer -->
      <g class="hex-layer">
        <polygon
          v-for="hex in validHexes"
          :key="`${hex.x},${hex.y}`"
          :points="hexCorners(hexToPixel({ x: hex.x, y: hex.y }))"
          :fill="getTerrainColor(hex.terrain)"
          :opacity="(hex.explored || hex.discovered) ? 1.0 : 0.5"
          :stroke="(hex.explored || hex.discovered) ? '#333' : '#999'"
          :stroke-width="1"
          class="hex-tile"
          @mouseenter="showTooltip(hex, $event)"
          @mouseleave="hideTooltip"
        />
      </g>

      <!-- Grass decorations layer -->
      <g class="grass-layer">
        <g v-for="hex in hexesWithGrass" :key="`grass-${hex.x},${hex.y}`">
          <path
            v-for="(pos, idx) in getGrassPositions(hex)"
            :key="`blade-${hex.x}-${hex.y}-${idx}`"
            :d="renderGrassBlade(pos)"
            stroke="#8bc34a"
            stroke-width="1"
            stroke-linecap="round"
            class="grass-blade"
          />
        </g>
      </g>

      <!-- Hill decorations layer -->
      <g class="hills-layer">
        <g v-for="hex in hexesWithHills" :key="`hills-${hex.x},${hex.y}`">
          <path
            v-for="(hump, idx) in getHillHumps(hex)"
            :key="`hump-${hex.x}-${hex.y}-${idx}`"
            :d="hump.path"
            :fill="hump.color"
            stroke="#6d4c41"
            stroke-width="1"
            class="hill-hump"
          />
        </g>
      </g>

      <!-- Mountain decorations layer -->
      <g class="mountains-layer">
        <g v-for="hex in hexesWithMountains" :key="`mountains-${hex.x},${hex.y}`">
          <g v-for="(peak, idx) in getMountainPeaks(hex)" :key="`peak-${hex.x}-${hex.y}-${idx}`">
            <!-- Mountain peak -->
            <path
              :d="peak.path"
              fill="#4e342e"
              stroke="#3e2723"
              stroke-width="1.5"
              class="mountain-peak"
            />
            <!-- Snow cap -->
            <path
              v-if="peak.hasSnow && peak.snowPath"
              :d="peak.snowPath"
              fill="#ffffff"
              stroke="#e0e0e0"
              stroke-width="0.5"
              class="snow-cap"
            />
          </g>
        </g>
      </g>

      <!-- Forest decorations layer -->
      <g class="forest-layer">
        <g v-for="hex in hexesWithTrees" :key="`trees-${hex.x},${hex.y}`">
          <g v-for="(pos, idx) in getTreePositions(hex)" :key="`tree-${hex.x}-${hex.y}-${idx}`">
            <path
              :d="renderTree(pos, hex.terrain).trunkPath"
              fill="#654321"
              class="tree-trunk"
            />
            <polygon
              :points="renderTree(pos, hex.terrain).foliagePoints"
              :fill="renderTree(pos, hex.terrain).foliageColor"
              stroke="#1b5e20"
              stroke-width="0.5"
              class="tree-foliage"
            />
          </g>
        </g>
      </g>

      <!-- Roads layer -->
      <g class="roads-layer">
        <path
          v-for="road in validRoads"
          :key="road.id"
          :d="renderRoadPath(road)"
          stroke="#8B4513"
          :stroke-width="3"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="road"
        />
      </g>

      <!-- Rivers layer -->
      <g class="rivers-layer">
        <path
          v-for="river in validRivers"
          :key="river.id"
          :d="renderRiverPath(river)"
          stroke="#2196F3"
          :stroke-width="riverWidth(river.width)"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="river"
          opacity="0.8"
        />
      </g>

      <!-- POIs layer -->
      <g class="poi-layer">
        <text
          v-for="(hex, idx) in hexesWithPOIs"
          :key="`poi-${idx}`"
          :x="hexToPixel({ x: hex.x, y: hex.y }).x"
          :y="hexToPixel({ x: hex.x, y: hex.y }).y"
          text-anchor="middle"
          dominant-baseline="middle"
          :font-size="hexSize * zoom * 0.6"
          class="poi-marker"
        >
          {{ getPOIIcon(hex.pois[0].poi_type) }}
        </text>
      </g>
    </svg>

    <!-- Tooltip -->
    <div
      v-if="tooltip.visible && tooltip.hex"
      class="hex-tooltip"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="tooltip-header">
        [{{ tooltip.hex.x }}, {{ tooltip.hex.y }}]
      </div>
      <div class="tooltip-terrain">
        {{ tooltip.hex.terrain.replace('_', ' ') }}
      </div>
      <div v-if="tooltip.hex.elevation" class="tooltip-elevation">
        {{ tooltip.hex.elevation }}
      </div>
      <div v-if="tooltip.hex.pois && tooltip.hex.pois.length" class="tooltip-pois">
        <div v-for="poi in tooltip.hex.pois" :key="poi.id" class="tooltip-poi">
          {{ getPOIIcon(poi.poi_type) }} {{ poi.name }}
          <span v-if="!(poi.explored || poi.discovered)" class="undiscovered">(undiscovered)</span>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <HexMapControls
      :map-data="mapData"
      :zoom="zoom"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @reset-view="handleResetView"
    />
  </div>
</template>

<style scoped>
.hex-map-canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.hex-map-svg {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.hex-map-svg:active {
  cursor: grabbing;
}

.hex-tile {
  transition: opacity 0.2s ease;
  cursor: pointer;
}

.hex-tile:hover {
  stroke: #000;
  stroke-width: 2;
}

.road {
  pointer-events: none;
}

.river {
  pointer-events: none;
}

.poi-marker {
  pointer-events: none;
  user-select: none;
}

.grass-layer,
.hills-layer,
.mountains-layer,
.forest-layer {
  pointer-events: none;
}

.grass-blade {
  opacity: 0.7;
}

.hill-hump {
  opacity: 0.85;
}

.mountain-peak {
  opacity: 0.9;
}

.snow-cap {
  opacity: 0.95;
}

.tree-trunk {
  opacity: 0.8;
}

.tree-foliage {
  opacity: 0.9;
}

.hex-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  pointer-events: none;
  z-index: 1000;
  min-width: 150px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
}

.tooltip-header {
  font-weight: 600;
  margin-bottom: 4px;
  font-family: monospace;
  color: #fbbf24;
}

.tooltip-terrain {
  text-transform: capitalize;
  margin-bottom: 2px;
  color: #a3e635;
}

.tooltip-elevation {
  font-size: 11px;
  color: #d1d5db;
  margin-bottom: 4px;
}

.tooltip-pois {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.tooltip-poi {
  margin: 2px 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.undiscovered {
  font-size: 10px;
  color: #9ca3af;
  font-style: italic;
}
</style>
