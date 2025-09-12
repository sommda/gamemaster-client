# Gamemaster Client Development Plan

## Project Overview

A web-based client application for the gamemaster-mcp server featuring:
- Chat interface similar to Claude web app with streaming rich text
- Character information pane for D&D character sheets
- Tactical/map display for combat encounters
- Real-time integration with gamemaster-mcp server

## Tech Stack Decision

**Framework**: Nuxt 3 + Vue 3 + TypeScript
**Rationale**: 
- Vue's reactivity system is perfect for real-time D&D data updates
- Nuxt 3 provides excellent streaming support for chat
- Built-in TypeScript support and auto-imports
- Smaller bundle sizes and faster runtime than React
- Composition API ideal for complex business logic

**Supporting Technologies**:
- **Styling**: TailwindCSS + Nuxt UI
- **State Management**: Pinia
- **MCP Integration**: Custom WebSocket/HTTP client
- **Rich Text**: @nuxt/content + markdown-it
- **Maps**: Canvas API or SVG for tactical display

## Server Analysis Summary

The gamemaster-mcp is a **FastMCP server** with 25+ tools for D&D campaign management:

- **Data Models**: Comprehensive Pydantic models for Campaign, Character, NPC, Quest, Location, GameState, etc.
- **Communication**: Uses MCP (Model Context Protocol) - structured tool calling interface
- **Storage**: JSON file persistence with in-memory operations
- **Real-time State**: GameState tracking, combat management, adventure logging

## Application Architecture

### Project Structure
```
gamemaster-client/
├── components/
│   ├── Chat/
│   │   ├── ChatMessage.vue
│   │   ├── ChatInput.vue
│   │   └── ChatHistory.vue
│   ├── Character/
│   │   ├── CharacterSheet.vue
│   │   ├── CharacterStats.vue
│   │   └── CharacterInventory.vue
│   ├── Tactical/
│   │   ├── TacticalMap.vue
│   │   ├── MapGrid.vue
│   │   └── TokenRenderer.vue
│   └── Layout/
│       ├── AppLayout.vue
│       └── PaneResizer.vue
├── composables/
│   ├── useMcpClient.ts
│   ├── useGameState.ts
│   ├── useChatStream.ts
│   └── useCharacterData.ts
├── stores/
│   ├── campaign.ts
│   ├── chat.ts
│   ├── character.ts
│   └── tactical.ts
├── types/
│   ├── mcp.ts
│   ├── gamemaster.ts
│   └── ui.ts
└── pages/
    └── index.vue
```

### Core Architecture Components

#### 1. MCP Client Integration
```typescript
// composables/useMcpClient.ts
export const useMcpClient = () => {
  const connection = ref<WebSocket | null>(null)
  
  const callTool = async (name: string, params: any) => {
    // Tool calling implementation
  }
  
  const streamChat = async (message: string) => {
    // Streaming chat implementation
  }
  
  return { callTool, streamChat, connection }
}
```

#### 2. State Management with Pinia
```typescript
// stores/campaign.ts
export const useCampaignStore = defineStore('campaign', {
  state: () => ({
    currentCampaign: null as Campaign | null,
    gameState: null as GameState | null,
    characters: [] as Character[],
    activeLocation: null as Location | null
  }),
  
  actions: {
    async loadCampaign(name: string) {
      // Load campaign via MCP
    },
    
    async updateGameState(updates: Partial<GameState>) {
      // Real-time state updates
    }
  }
})
```

#### 3. Three-Pane Layout
```vue
<!-- components/Layout/AppLayout.vue -->
<template>
  <div class="h-screen flex">
    <!-- Main Chat Pane (60%) -->
    <div class="flex-1 flex flex-col">
      <ChatHistory />
      <ChatInput />
    </div>
    
    <!-- Character Sheet Pane (25%) -->
    <div class="w-1/4 border-l">
      <CharacterSheet />
    </div>
    
    <!-- Tactical Map Pane (15%) -->
    <div class="w-1/6 border-l">
      <TacticalMap />
    </div>
  </div>
</template>
```

#### 4. Real-time Updates Architecture
- Vue's reactivity automatically updates UI when game state changes
- WebSocket connection for live server updates
- Optimistic UI updates for immediate feedback

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- Set up Nuxt 3 project with TypeScript
- Install core dependencies (Pinia, TailwindCSS, Nuxt UI)
- Create basic three-pane layout
- Implement MCP client connection

**Key Tasks:**
- `npx nuxi@latest init gamemaster-client`
- Configure TypeScript and dependencies
- Set up basic routing and layout structure
- Test MCP server connection

### Phase 2: Chat Interface (Days 3-4)
- Build chat message components
- Implement streaming text display
- Add markdown rendering for rich content
- Create chat input with command support

**Key Tasks:**
- ChatMessage component with markdown support
- Streaming text animation
- Message history management
- Command parsing for D&D actions

### Phase 3: Character Sheet Integration (Days 5-6)
- Connect to gamemaster-mcp character data
- Display character stats, inventory, spells
- Real-time HP/status updates
- Character selection/switching

**Key Tasks:**
- Character data models and types
- Character sheet UI components
- Real-time stat updates via MCP
- Character switcher interface

### Phase 4: Game State Management (Days 7-8)
- Campaign loading and switching
- Real-time game state synchronization
- Quest tracking display
- Location awareness

**Key Tasks:**
- Campaign selection interface
- Game state synchronization
- Quest progress indicators
- Location-based context updates

### Phase 5: Tactical Display (Days 9-10)
- Basic map rendering (canvas/SVG)
- Token placement and movement
- Grid overlay for tactical combat
- Initiative tracking integration

**Key Tasks:**
- Map canvas implementation
- Token rendering and interaction
- Grid system for tactical movement
- Combat turn tracking integration

## Key Features by Component

### Chat Interface
- **Streaming Messages**: Real-time text streaming like Claude
- **Rich Text Support**: Markdown rendering for descriptions
- **Command Integration**: Natural language D&D commands
- **History Management**: Persistent chat history per session

### Character Sheet Pane
- **Live Stats**: Real-time HP, AC, stats display
- **Inventory Management**: Equipment and item tracking
- **Spell Tracking**: Prepared spells and slot management
- **Character Switching**: Multi-character party support

### Tactical Map Pane
- **Grid Display**: Tactical combat grid
- **Token Management**: Character and NPC positioning
- **Initiative Tracking**: Turn order and current actor
- **Map Interaction**: Click-to-move, range indicators

## Development Considerations

### Vue/Nuxt Advantages for This Project
- **Reactive Game State**: Perfect for D&D's constantly changing data
- **Template Syntax**: More readable for complex UI layouts
- **Built-in Transitions**: Great for combat animations and chat effects
- **Composition API**: Excellent for organizing MCP client logic
- **Performance**: Smaller bundles, faster runtime than React alternatives

### Integration Points with Gamemaster-MCP
- **Tool Calling**: Direct integration with 25+ D&D management tools
- **Real-time Sync**: GameState updates propagate to UI immediately
- **Campaign Management**: Load/switch campaigns seamlessly
- **Event Logging**: Adventure log integration for session continuity

### Future Enhancements
- **Mobile Responsiveness**: Collapsible panes for mobile play
- **Voice Integration**: Speech-to-text for hands-free play
- **Custom Maps**: Upload and annotate battle maps
- **Dice Integration**: 3D dice rolling animations
- **Multi-user Support**: Shared campaign access for players