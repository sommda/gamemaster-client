# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web-based client application for the gamemaster-mcp server, built with Nuxt 3 + Vue 3 + TypeScript. Features a three-pane interface:
- Main chat pane with streaming responses (Claude-like interface)
- Character sheet pane for D&D character management
- Tactical map pane for combat visualization

## Development Commands

### Development Server
```bash
npm run dev
```
Starts the Nuxt development server at http://localhost:3000

### Building
```bash
npm run build
npm run preview
```

### Dependencies Installation
```bash
npm install
```

## Tech Stack

- **Framework**: Nuxt 3 + Vue 3 + TypeScript
- **Styling**: TailwindCSS (via Nuxt UI)
- **UI Components**: Nuxt UI
- **State Management**: Pinia
- **MCP Integration**: Custom WebSocket/HTTP client

## Project Structure

```
gamemaster-client/
├── components/
│   ├── Chat/              # Chat interface components
│   │   ├── ChatHistory.vue
│   │   └── ChatInput.vue
│   ├── Character/         # Character sheet components
│   │   └── CharacterSheet.vue
│   ├── Tactical/          # Tactical map components
│   │   └── TacticalMap.vue
│   └── Layout/
│       └── AppLayout.vue  # Main three-pane layout
├── composables/
│   └── useMcpClient.ts    # MCP client integration
├── stores/
│   └── chat.ts            # Chat state management
├── types/
│   ├── mcp.ts             # MCP protocol types
│   └── gamemaster.ts      # D&D game types
└── assets/css/
    └── main.css           # TailwindCSS styles
```

## Architecture

### MCP Client Integration
- `useMcpClient.ts` composable handles connection to gamemaster-mcp server
- Currently simulated for development (WebSocket integration pending)
- Supports tool calling and streaming chat responses

### State Management
- Pinia stores manage application state
- Chat store handles message history and streaming
- Real-time reactivity for game state updates

### UI Components
- Three-pane responsive layout
- Streaming chat interface with typing indicators
- Real-time character sheet updates
- Tactical map placeholder for future combat features

## Development Notes

### Phase 1 Complete ✅
- Basic Nuxt 3 project setup with TypeScript
- Core dependencies installed (Pinia, Nuxt UI)
- Three-pane layout implementation
- MCP client foundation with mock responses
- Chat interface with streaming simulation

### Next Development Phases
- Phase 2: Real MCP server connection and chat integration
- Phase 3: Character sheet data integration
- Phase 4: Game state management
- Phase 5: Tactical display implementation

### Configuration
- TailwindCSS handled automatically by Nuxt UI
- TypeScript strict mode enabled
- Auto-imports configured for components and composables