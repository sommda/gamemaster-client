<script setup lang="ts">
import CharacterPanel from './CharacterPanel.vue'
import CombatPanel from './CombatPanel.vue'
import GameStatePanel from './GameStatePanel.vue'

type Character = {
  id: string
  name: string
  hit_points_current: number
  hit_points_max: number
  player_name?: string | null
  character_class?: any
  race?: any
  abilities?: any
  armor_class?: number
  inventory?: any[]
  equipment?: any
  spells_known?: any[]
  background?: string
  alignment?: string
  description?: string
  bio?: string
  [key: string]: any
}

type CombatParticipant = {
  name: string
  initiative: number
  hp: number
  ac: number
  speed: number
  attacks?: any[]
}

type GameState = {
  in_combat: boolean
  current_turn?: string | null
  initiative_order: CombatParticipant[]
  current_location?: string | null
  party_level?: number
  party_funds?: string
  notes?: string
}

type Campaign = {
  name?: string
  description?: string
  current_date?: string
  [key: string]: any
}

const props = defineProps<{
  characters: Character[]
  selectedCharacter: Character | null
  characterViewMode: 'summary' | 'detail'
  gameState: GameState
  campaign?: Campaign | null
}>()

const emit = defineEmits<{
  selectCharacter: [character: Character]
  returnToCharacterSummary: []
}>()

function selectCharacter(character: Character) {
  emit('selectCharacter', character)
}

function returnToCharacterSummary() {
  emit('returnToCharacterSummary')
}
</script>

<template>
  <aside class="right">
    <!-- Game State Panel (always shown) -->
    <GameStatePanel :game-state="gameState" :campaign="campaign" />

    <!-- Combat Pane (shown when in combat) -->
    <CombatPanel v-if="gameState.in_combat" :game-state="gameState" />

    <!-- Characters Pane (shown when not in combat) -->
    <CharacterPanel
      v-else
      :characters="characters"
      :selected-character="selectedCharacter"
      :view-mode="characterViewMode"
      @select-character="selectCharacter"
      @return-to-summary="returnToCharacterSummary"
    />
  </aside>
</template>

<style scoped>
.right {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.right h3 {
  margin: 0 0 8px;
}
</style>