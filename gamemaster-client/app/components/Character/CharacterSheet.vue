<template>
  <div class="p-4 space-y-4">
    <!-- Character Name -->
    <div class="text-center">
      <h3 class="text-lg font-bold text-gray-900 dark:text-white">
        {{ character?.name || 'No Character Selected' }}
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ character?.race }} {{ character?.characterClass }} • Level {{ character?.level || 1 }}
      </p>
    </div>
    
    <!-- Basic Stats -->
    <div v-if="character" class="space-y-3">
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="text-sm font-medium">
          <span class="text-gray-500 dark:text-gray-400">HP:</span>
          <span class="ml-1 font-semibold">
            {{ character.hitPointsCurrent }}/{{ character.hitPointsMax }}
          </span>
        </div>
        <div class="text-sm font-medium">
          <span class="text-gray-500 dark:text-gray-400">AC:</span>
          <span class="ml-1 font-semibold">{{ character.armorClass }}</span>
        </div>
      </div>
      
      <!-- Ability Scores -->
      <div class="border-t border-gray-300 dark:border-gray-700 pt-3">
        <h4 class="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
          Ability Scores
        </h4>
        <div class="grid grid-cols-2 gap-1 text-xs">
          <div v-for="(score, ability) in character.abilityScores" :key="ability">
            <span class="text-gray-500 dark:text-gray-400 capitalize">{{ ability }}:</span>
            <span class="ml-1 font-semibold">{{ score.score }}</span>
            <span class="text-gray-400 ml-1">({{ score.modifier >= 0 ? '+' : '' }}{{ score.modifier }})</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- No Character State -->
    <div v-else class="text-center text-gray-500 dark:text-gray-400 mt-8">
      <p>No character loaded</p>
      <UButton size="sm" class="mt-2">
        Load Character
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
// TODO: Get character data from store
const character = ref(null)

// Mock character data for display
onMounted(() => {
  character.value = {
    name: 'Aria Nightwhisper',
    race: 'Elf',
    characterClass: 'Rogue',
    level: 3,
    hitPointsCurrent: 22,
    hitPointsMax: 28,
    armorClass: 15,
    abilityScores: {
      strength: { score: 12, modifier: 1 },
      dexterity: { score: 16, modifier: 3 },
      constitution: { score: 14, modifier: 2 },
      intelligence: { score: 13, modifier: 1 },
      wisdom: { score: 11, modifier: 0 },
      charisma: { score: 15, modifier: 2 }
    }
  }
})
</script>