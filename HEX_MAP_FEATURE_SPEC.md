# Hex Map Display Feature Specification

## Overview

Add a hex map visualization feature to display outdoor wilderness maps for the current location. Maps will be shown in a modal/overlay panel with scalable hex tiles rendered graphically using SVG.

## Requirements Summary

- Display hex maps of outdoor locations fetched from the MCP server
- Add a "Show Map" button in the GameStatePanel component (upper-right panel)
- Render maps in a modal/overlay panel with graphical hex tiles
- Support maps up to 40x40 hexes with scalable rendering
- Fetch map data using the `render_hex_map` MCP tool in JSON mode
- Show terrain types, POIs, roads, and rivers visually

## Architecture

### 1. Component Structure

```
GameStatePanel.vue (existing - modified)
├── Button: "Show Map" (new)
│
└── triggers → HexMapModal.vue (new)
                ├── HexMapCanvas.vue (new)
                │   └── renders SVG hex grid
                └── HexMapControls.vue (new)
                    └── zoom, pan, legend controls
```

### 2. Data Flow

```
1. User clicks "Show Map" button in GameStatePanel
2. GameStatePanel emits 'show-map' event
3. Parent component (index.vue) opens HexMapModal
4. HexMapModal calls useMcp().rpc('tools/call', {name: 'render_hex_map', ...})
5. MCP server returns JSON map data with hexes, terrain, POIs, roads, rivers
6. HexMapCanvas receives data and renders SVG hex grid
7. User can zoom, pan, and interact with map
```

## Detailed Component Specifications

### 3. GameStatePanel.vue (Modified)

**Location**: `app/components/Sidebar/GameStatePanel.vue`

**Changes**:
- Add "Show Map" button next to the current location display
- Only show button when `gameState.current_location` is not null
- Button should be styled consistently with existing UI (using TailwindCSS)
- Emit `show-map` event when clicked

**Template Addition** (after location display, around line 54):
```vue
<!-- Current Location -->
<div v-if="gameState.current_location" class="state-item">
  <div class="state-label">Location</div>
  <div class="state-value location-with-button">
    <span>{{ gameState.current_location }}</span>
    <button @click="$emit('show-map')" class="show-map-btn" title="Show Map">
      🗺️
    </button>
  </div>
</div>
```

**Emit Declaration**:
```typescript
const emit = defineEmits<{
  showMap: []
}>()
```

**Style Additions**:
```css
.location-with-button {
  display: flex;
  align-items: center;
  gap: 8px;
}

.show-map-btn {
  padding: 2px 6px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s ease;
}

.show-map-btn:hover {
  background: #2563eb;
}
```

### 4. HexMapModal.vue (New Component)

**Location**: `app/components/HexMap/HexMapModal.vue`

**Purpose**: Modal/overlay container for the hex map viewer

**Props**:
```typescript
type HexMapModalProps = {
  isOpen: boolean
  currentLocation?: string | null
}
```

**State**:
```typescript
const mapData = ref<HexMapData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
```

**Key Features**:
- Full-screen modal overlay using Nuxt UI's `<UModal>` component
- Loads map data on open using `useMcp().rpc()`
- Shows loading state while fetching
- Displays error if map data unavailable
- Closes on ESC key or close button

**Map Data Fetch**:
```typescript
async function loadMapData() {
  loading.value = true
  error.value = null

  try {
    const mcp = useMcp()
    const result = await mcp.rpc('tools/call', {
      name: 'render_hex_map',
      arguments: {
        render_mode: 'json',
        // map_name omitted to use current map
      }
    })

    // Parse tool result
    const content = result?.content?.[0]?.text || result?.text || result
    mapData.value = typeof content === 'string' ? JSON.parse(content) : content
  } catch (e: any) {
    error.value = e?.message || 'Failed to load map data'
  } finally {
    loading.value = false
  }
}
```

**Template Structure**:
```vue
<UModal v-model="isOpen" :ui="{ width: 'w-full max-w-7xl' }">
  <div class="hex-map-modal">
    <div class="modal-header">
      <h2>{{ mapData?.name || 'Hex Map' }}</h2>
      <button @click="close" class="close-btn">✕</button>
    </div>

    <div v-if="loading" class="loading-state">
      Loading map...
    </div>

    <div v-else-if="error" class="error-state">
      {{ error }}
    </div>

    <div v-else-if="mapData" class="map-container">
      <HexMapCanvas :map-data="mapData" />
      <HexMapControls />
    </div>
  </div>
</UModal>
```

### 5. HexMapCanvas.vue (New Component)

**Location**: `app/components/HexMap/HexMapCanvas.vue`

**Purpose**: Renders the actual hex grid using SVG

**Props**:
```typescript
type HexCoordinate = { x: number; y: number }

type POI = {
  id: string
  name: string
  poi_type: string
  discovered: boolean
}

type Hex = {
  coordinate: HexCoordinate
  terrain: string
  pois: POI[]
  discovered: boolean
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

type HexMapCanvasProps = {
  mapData: HexMapData
}
```

**State**:
```typescript
const zoom = ref(1.0)
const panX = ref(0)
const panY = ref(0)
const hexSize = ref(40) // base size in pixels
```

**Key Features**:
- SVG-based rendering for scalability
- Hex tiles colored by terrain type
- POI markers shown on hexes
- Road and river overlays
- Tooltip on hex hover showing details
- Support for zoom and pan
- Efficient rendering (only visible hexes)

**Hex Geometry Calculations**:
```typescript
// Flat-top hexagon geometry
function hexToPixel(hex: HexCoordinate): { x: number; y: number } {
  const size = hexSize.value * zoom.value
  const width = Math.sqrt(3) * size
  const height = 2 * size

  const x = hex.x * width + (hex.y % 2) * (width / 2)
  const y = hex.y * (height * 0.75)

  return { x: x + panX.value, y: y + panY.value }
}

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
```

**Terrain Color Mapping**:
```typescript
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
```

**POI Icon Mapping**:
```typescript
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
```

**SVG Template Structure**:
```vue
<div class="hex-map-canvas-container">
  <svg
    ref="svgRef"
    class="hex-map-svg"
    :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
    @wheel="handleWheel"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
  >
    <!-- Hex tiles -->
    <g class="hex-layer">
      <polygon
        v-for="hex in mapData.hexes"
        :key="`${hex.coordinate.x},${hex.coordinate.y}`"
        :points="hexCorners(hexToPixel(hex.coordinate))"
        :fill="terrainColors[hex.terrain] || '#cccccc'"
        :opacity="hex.discovered ? 1.0 : 0.5"
        :stroke="hex.discovered ? '#333' : '#999'"
        :stroke-width="1"
        class="hex-tile"
        @mouseenter="showTooltip(hex, $event)"
        @mouseleave="hideTooltip"
      />
    </g>

    <!-- Roads -->
    <g class="roads-layer">
      <path
        v-for="road in mapData.roads"
        :key="road.id"
        :d="renderRoadPath(road)"
        stroke="#8B4513"
        :stroke-width="3"
        fill="none"
        class="road"
      />
    </g>

    <!-- Rivers -->
    <g class="rivers-layer">
      <path
        v-for="river in mapData.rivers"
        :key="river.id"
        :d="renderRiverPath(river)"
        stroke="#2196F3"
        :stroke-width="riverWidth(river.width)"
        fill="none"
        class="river"
      />
    </g>

    <!-- POIs -->
    <g class="poi-layer">
      <text
        v-for="(hex, idx) in hexesWithPOIs"
        :key="`poi-${idx}`"
        :x="hexToPixel(hex.coordinate).x"
        :y="hexToPixel(hex.coordinate).y"
        text-anchor="middle"
        dominant-baseline="middle"
        :font-size="hexSize * zoom * 0.6"
        class="poi-marker"
      >
        {{ poiIcons[hex.pois[0].poi_type] || '📍' }}
      </text>
    </g>
  </svg>

  <!-- Tooltip -->
  <div
    v-if="tooltip.visible"
    class="hex-tooltip"
    :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
  >
    <div class="tooltip-header">{{ tooltip.hex?.coordinate.x }}, {{ tooltip.hex?.coordinate.y }}</div>
    <div class="tooltip-terrain">{{ tooltip.hex?.terrain }}</div>
    <div v-if="tooltip.hex?.pois.length" class="tooltip-pois">
      <div v-for="poi in tooltip.hex.pois" :key="poi.id">
        {{ poi.name }} ({{ poi.poi_type }})
      </div>
    </div>
  </div>
</div>
```

### 6. HexMapControls.vue (New Component)

**Location**: `app/components/HexMap/HexMapControls.vue`

**Purpose**: Provides UI controls for map interaction

**Features**:
- Zoom in/out buttons (+/-)
- Reset view button
- Legend showing terrain colors
- Toggle for showing/hiding POI labels

**Template Structure**:
```vue
<div class="hex-map-controls">
  <div class="zoom-controls">
    <button @click="$emit('zoom-in')" class="control-btn">+</button>
    <button @click="$emit('zoom-out')" class="control-btn">−</button>
    <button @click="$emit('reset-view')" class="control-btn">⟲</button>
  </div>

  <div class="legend">
    <h4>Terrain Legend</h4>
    <div class="legend-items">
      <div v-for="(color, terrain) in visibleTerrains" :key="terrain" class="legend-item">
        <div class="legend-color" :style="{ background: color }"></div>
        <span class="legend-label">{{ formatTerrain(terrain) }}</span>
      </div>
    </div>
  </div>
</div>
```

### 7. Index.vue (Modified)

**Location**: `app/pages/index.vue`

**Changes**:
- Add state for hex map modal visibility
- Pass `show-map` event handler to GameSidebar
- Include HexMapModal component

**State Addition**:
```typescript
const showHexMap = ref(false)

function handleShowMap() {
  showHexMap.value = true
}
```

**Template Additions**:
```vue
<GameSidebar
  :characters="gameData.characters.value"
  :selected-character="gameData.selectedCharacter.value"
  :character-view-mode="gameData.characterViewMode.value"
  :game-state="gameData.gameState.value"
  :campaign="gameData.campaign.value"
  @select-character="gameData.selectCharacter"
  @return-to-character-summary="gameData.returnToCharacterSummary"
  @show-map="handleShowMap"
/>

<HexMapModal
  v-model:is-open="showHexMap"
  :current-location="gameData.gameState.value.current_location"
/>
```

### 8. GameSidebar.vue (Modified)

**Location**: `app/components/Sidebar/GameSidebar.vue`

**Changes**:
- Forward `show-map` event from GameStatePanel to parent

**Emit Declaration**:
```typescript
const emit = defineEmits<{
  selectCharacter: [character: Character]
  returnToCharacterSummary: []
  showMap: []
}>()
```

**Template Addition**:
```vue
<GameStatePanel
  :game-state="gameState"
  :campaign="campaign"
  @show-map="emit('showMap')"
/>
```

## Implementation Plan

### Phase 1: Basic Structure (2-3 hours)
1. Create `HexMapModal.vue` with basic modal structure
2. Create `HexMapCanvas.vue` with empty SVG canvas
3. Add "Show Map" button to `GameStatePanel.vue`
4. Wire up event handling in parent components
5. Test modal open/close functionality

### Phase 2: Data Fetching (1-2 hours)
1. Implement MCP tool call to fetch map data
2. Add loading and error states
3. Parse and validate JSON response
4. Test with actual MCP server

### Phase 3: Hex Rendering (3-4 hours)
1. Implement hex geometry calculations
2. Render basic hex grid with terrain colors
3. Add hex borders and styling
4. Implement discovered/undiscovered visual states
5. Test with various map sizes (up to 40x40)

### Phase 4: Map Features (2-3 hours)
1. Add POI markers with icons
2. Render roads as paths connecting hexes
3. Render rivers as flowing paths
4. Implement hex tooltip on hover
5. Style and polish visuals

### Phase 5: Interactivity (2-3 hours)
1. Implement zoom in/out functionality
2. Implement pan/drag functionality
3. Add zoom/pan controls UI
4. Implement view reset
5. Optimize rendering for performance

### Phase 6: Polish & Legend (1-2 hours)
1. Create terrain legend component
2. Add map name and description display
3. Implement toggle for POI labels
4. Responsive design adjustments
5. Accessibility improvements (keyboard nav)

**Total Estimated Time**: 11-17 hours

## Technical Considerations

### Scalability for Large Maps
- **Viewport Culling**: Only render hexes within visible viewport plus buffer
- **Lazy Rendering**: Use `requestAnimationFrame` for smooth rendering
- **Memoization**: Cache hex pixel positions and corner calculations
- **Virtual Scrolling**: Consider virtual scrolling for very large maps (>40x40)

### Performance Optimizations
```typescript
// Only render hexes in viewport
const visibleHexes = computed(() => {
  const buffer = 2 // hexes outside viewport to render
  return mapData.value?.hexes.filter(hex => {
    const pos = hexToPixel(hex.coordinate)
    return pos.x >= -hexSize.value * buffer &&
           pos.x <= viewportWidth + hexSize.value * buffer &&
           pos.y >= -hexSize.value * buffer &&
           pos.y <= viewportHeight + hexSize.value * buffer
  })
})
```

### Responsive Design
- Modal should work on various screen sizes
- Consider mobile touch gestures for pan/zoom
- Adjust hex size dynamically based on map bounds
- Ensure minimum hex size for readability

### Accessibility
- Keyboard navigation (Arrow keys to pan, +/- to zoom)
- Screen reader support for hex information
- High contrast mode for terrain colors
- Tooltip info accessible via keyboard

### Error Handling
- Graceful fallback if map data unavailable
- Clear error messages for users
- Retry mechanism for failed fetches
- Handle malformed JSON responses

## Testing Strategy

### Unit Tests
- Hex geometry calculations (hexToPixel, hexCorners)
- Terrain color mapping
- POI icon mapping
- Coordinate bounds calculations

### Integration Tests
- MCP tool calling and response parsing
- Modal open/close event flow
- Zoom/pan state management
- Tooltip show/hide behavior

### Visual Tests
- Render various terrain types correctly
- POI markers positioned accurately
- Roads and rivers display properly
- Zoom levels render correctly
- Different map sizes (5x5, 20x20, 40x40)

### Manual Testing Checklist
- [ ] "Show Map" button appears when location is set
- [ ] Button doesn't appear when no location
- [ ] Modal opens on button click
- [ ] Map data loads from MCP server
- [ ] Loading state displays during fetch
- [ ] Error state shows if fetch fails
- [ ] Hex grid renders correctly
- [ ] Terrain colors match legend
- [ ] POIs show with correct icons
- [ ] Roads connect hexes properly
- [ ] Rivers flow across hexes
- [ ] Tooltip shows on hex hover
- [ ] Zoom in/out works smoothly
- [ ] Pan/drag works smoothly
- [ ] Reset view returns to default
- [ ] Modal closes on ESC and close button
- [ ] Works on different screen sizes
- [ ] Performance acceptable for 40x40 map

## Future Enhancements (Out of Scope)

### V2 Features
- **Party Position Marker**: Show current party location on map
- **Fog of War**: Dim undiscovered areas more prominently
- **Hex Selection**: Click hex to see detailed info in sidebar
- **Distance Measurement**: Click two hexes to calculate distance
- **Travel Path**: Show path between locations using roads
- **Search/Filter**: Find POIs by name or type
- **Mini-map**: Small overview map showing current viewport
- **Export**: Save map as PNG or SVG file

### V3 Features
- **Animation**: Animated party movement on map
- **Weather Overlay**: Show weather conditions per hex
- **Time of Day**: Change colors based on in-game time
- **Custom Markers**: Add temporary markers for notes
- **Multi-map Support**: Switch between different maps
- **3D Terrain**: Add elevation visualization
- **Interactive POIs**: Click POI to navigate to location details

## API Documentation Reference

### MCP Tool: `render_hex_map`

**Description**: Renders a hex map in the specified format

**Parameters**:
- `render_mode` (string, optional): "json" | "ascii" | "emoji" (default: "emoji")
- `center_x` (int, optional): X coordinate to center the view
- `center_y` (int, optional): Y coordinate to center the view
- `radius` (int, optional): Radius in hexes around center point
- `map_name` (str, optional): Name of map (uses current map if not provided)

**Returns** (JSON mode):
```json
{
  "name": "Sword Coast",
  "description": "The northwestern coast of Faerûn",
  "hex_size_miles": 6,
  "default_terrain": "plains",
  "bounds": {
    "min_x": 0,
    "max_x": 39,
    "min_y": 0,
    "max_y": 39
  },
  "hexes": [
    {
      "coordinate": { "x": 12, "y": 8 },
      "terrain": "urban",
      "pois": [
        {
          "id": "POI12345",
          "name": "Waterdeep",
          "poi_type": "city",
          "discovered": true
        }
      ],
      "discovered": true,
      "elevation": null
    }
  ],
  "roads": [
    {
      "id": "ROAD123",
      "name": "King's Road",
      "path": [
        { "x": 5, "y": 3 },
        { "x": 6, "y": 3 }
      ],
      "start_point": "center",
      "end_point": "center"
    }
  ],
  "rivers": [
    {
      "id": "RIV123",
      "name": "Dessarin River",
      "path": [
        {
          "hex": { "x": 3, "y": 2 },
          "entry_side": "N",
          "exit_side": "SE"
        }
      ],
      "width": "river",
      "navigable": true
    }
  ]
}
```

## File Structure Summary

```
gamemaster-client/app/
├── components/
│   ├── HexMap/                          # New directory
│   │   ├── HexMapModal.vue              # New: Modal container
│   │   ├── HexMapCanvas.vue             # New: SVG hex renderer
│   │   └── HexMapControls.vue           # New: Zoom/pan controls
│   └── Sidebar/
│       ├── GameStatePanel.vue           # Modified: Add "Show Map" button
│       └── GameSidebar.vue              # Modified: Forward show-map event
├── pages/
│   └── index.vue                        # Modified: Add modal state & handler
└── composables/
    └── useMcp.ts                        # Existing: Use rpc() method

New file: HEX_MAP_FEATURE_SPEC.md        # This document
```

## Dependencies

No new dependencies required! All features can be implemented using:
- Vue 3 built-in features (ref, computed, etc.)
- Nuxt UI components (UModal)
- TailwindCSS for styling
- Existing useMcp() composable for data fetching
- Native SVG for rendering

## Conclusion

This specification provides a comprehensive plan for implementing hex map visualization in the gamemaster-client. The feature integrates seamlessly with existing components, leverages the MCP server's hex map capabilities, and provides a scalable, interactive map experience for players.

The modular component design allows for incremental development and testing, with clear separation of concerns between data fetching, rendering, and user interaction. The scalable SVG-based approach ensures maps up to 40x40 hexes can be displayed smoothly while maintaining visual quality at any zoom level.
