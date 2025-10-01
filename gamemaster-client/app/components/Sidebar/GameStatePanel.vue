<script setup lang="ts">
type GameState = {
  in_combat: boolean
  current_turn?: string | null
  initiative_order: any[]
  current_location?: string | null
  current_date?: string | null
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
  gameState: GameState
  campaign?: Campaign | null
}>()

// Computed property to get campaign name from various possible properties
const campaignName = computed(() => {
  if (!props.campaign) return null

  // Try different possible property names for campaign name
  return props.campaign.name ||
         props.campaign.campaign_name ||
         props.campaign.title ||
         props.campaign.campaign_title ||
         (typeof props.campaign === 'string' ? props.campaign : null)
})
</script>

<template>
  <div class="game-state-section">
    <h3>{{ campaignName || 'Game State' }}</h3>

    <div class="game-state-info">

      <!-- Current Date -->
      <div v-if="gameState.current_date" class="state-item">
        <div class="state-label">Date</div>
        <div class="state-value">{{ gameState.current_date }}</div>
      </div>

      <!-- Current Location -->
      <div v-if="gameState.current_location" class="state-item">
        <div class="state-label">Location</div>
        <div class="state-value">{{ gameState.current_location }}</div>
      </div>

      <!-- Party Funds -->
      <div v-if="gameState.party_funds" class="state-item">
        <div class="state-label">Party Funds</div>
        <div class="state-value">{{ gameState.party_funds }}</div>
      </div>

      <!-- Combat Status -->
      <div class="state-item">
        <div class="state-label">Combat Status</div>
        <div class="state-value" :class="{ 'in-combat': gameState.in_combat }">
          {{ gameState.in_combat ? 'In Combat' : 'Exploration' }}
        </div>
      </div>

      <!-- Current Turn (only show if in combat) -->
      <div v-if="gameState.in_combat && gameState.current_turn" class="state-item">
        <div class="state-label">Current Turn</div>
        <div class="state-value current-turn">{{ gameState.current_turn }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-state-section {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
  margin-bottom: 12px;
}

.game-state-section h3 {
  margin: 0 0 12px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 4px;
}

.game-state-info {
  display: grid;
  gap: 8px;
}

.state-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.state-label {
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.state-value {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
  text-align: right;
}

.state-value.in-combat {
  color: #dc2626;
  font-weight: 600;
}

.state-value.current-turn {
  color: #059669;
  font-weight: 600;
}

/* Responsive adjustments for narrow sidebars */
@media (max-width: 320px) {
  .state-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .state-value {
    text-align: left;
  }
}
</style>