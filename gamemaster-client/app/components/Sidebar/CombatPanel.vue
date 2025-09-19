<script setup lang="ts">
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

defineProps<{
  gameState: GameState
}>()
</script>

<template>
  <div class="combat-section">
    <h3>Combat Initiative</h3>

    <div class="combat-info">
      <div v-if="gameState.current_location" class="info-item">
        <strong>Location:</strong> {{ gameState.current_location }}
      </div>
      <div v-if="gameState.current_turn" class="info-item current-turn">
        <strong>Current Turn:</strong> {{ gameState.current_turn }}
      </div>
      <div v-if="gameState.notes" class="info-item">
        <strong>Notes:</strong> {{ gameState.notes }}
      </div>
    </div>

    <div class="initiative-order">
      <div v-if="gameState.initiative_order.length === 0" class="no-combat-data">
        _No initiative order available_
      </div>
      <div
        v-for="participant in gameState.initiative_order"
        :key="participant.name"
        class="participant-card"
        :class="{ 'current-turn': participant.name === gameState.current_turn }"
      >
        <div class="participant-header">
          <div class="participant-name">{{ participant.name }}</div>
          <div class="initiative-value">Initiative: {{ participant.initiative }}</div>
        </div>

        <div class="participant-stats">
          <div class="stat">
            <strong>HP:</strong> {{ participant.hp }}
          </div>
          <div class="stat">
            <strong>AC:</strong> {{ participant.ac }}
          </div>
          <div class="stat">
            <strong>Speed:</strong> {{ participant.speed }}ft
          </div>
        </div>

        <div v-if="participant.attacks && participant.attacks.length > 0" class="attacks">
          <strong>Attacks:</strong>
          <div v-for="attack in participant.attacks.slice(0, 2)" :key="attack.weapon" class="attack-item">
            {{ attack.weapon }} (+{{ attack.attack_roll_modifier }}, {{ attack.damage_roll }})
          </div>
          <div v-if="participant.attacks.length > 2" class="more-attacks">
            ...and {{ participant.attacks.length - 2 }} more attacks
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.combat-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.combat-info {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.combat-info .info-item {
  margin: 4px 0;
  font-size: 13px;
}

.combat-info .current-turn {
  font-weight: 600;
  color: #dc2626;
  background: #fef2f2;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #fecaca;
}

.initiative-order {
  flex: 1;
  overflow: auto;
}

.no-combat-data {
  color: #64748b;
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.participant-card {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  background: #fff;
  transition: all 0.2s ease;
}

.participant-card.current-turn {
  border-color: #dc2626;
  background: #fef2f2;
  box-shadow: 0 2px 4px rgba(220, 38, 38, 0.1);
}

.participant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e5e7eb;
}

.participant-name {
  font-weight: bold;
  font-size: 14px;
  color: #1f2937;
}

.participant-card.current-turn .participant-name {
  color: #dc2626;
}

.initiative-value {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.participant-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.stat {
  font-size: 12px;
  color: #4b5563;
}

.stat strong {
  color: #374151;
}

.attacks {
  font-size: 12px;
  color: #4b5563;
}

.attacks strong {
  color: #374151;
  display: block;
  margin-bottom: 4px;
}

.attack-item {
  padding: 2px 0;
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.more-attacks {
  color: #6b7280;
  font-style: italic;
  margin-top: 4px;
}
</style>