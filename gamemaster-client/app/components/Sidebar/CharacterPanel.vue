<script setup lang="ts">
type SkillProficiency = 'none' | 'proficient' | 'expertise'

type Skill = {
  name: string
  ability: string
  proficiency: SkillProficiency
  modifier: number
}

type SavingThrowProficiency = 'none' | 'proficient'

type SavingThrow = {
  ability: string
  proficiency: SavingThrowProficiency
  modifier: number
}

type SpecialAbility = {
  id: string
  name: string
  description: string
  uses?: string | null
  uses_remaining?: number | null
}

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
  proficiency_bonus?: number
  inventory?: any[]
  equipment?: any
  spells_known?: any[]
  spell_slots?: Record<number, number>
  spell_slots_used?: Record<number, number>
  skills?: Record<string, Skill>
  saving_throws?: Record<string, SavingThrow>
  special_abilities?: SpecialAbility[]
  background?: string
  alignment?: string
  description?: string
  bio?: string
  [key: string]: any
}

const props = defineProps<{
  characters: Character[]
  selectedCharacter: Character | null
  viewMode: 'summary' | 'detail'
}>()

const emit = defineEmits<{
  selectCharacter: [character: Character]
  returnToSummary: []
}>()

// Reactive state for collapsible sections (default collapsed)
const collapsedSections = ref({
  basicInfo: true,
  combatStats: true,
  abilities: true,
  skills: true,
  savingThrows: true,
  equipment: true,
  spells: true,
  spellSlots: true,
  specialAbilities: true,
  description: true
})

function selectCharacter(character: Character) {
  emit('selectCharacter', character)
}

function returnToCharacterSummary() {
  emit('returnToSummary')
}

function toggleSection(section: keyof typeof collapsedSections.value) {
  collapsedSections.value[section] = !collapsedSections.value[section]
}
</script>

<template>
  <div class="characters-section">
    <h3>Characters
      <button
        v-if="viewMode === 'detail'"
        @click="returnToCharacterSummary"
        class="btn back-btn"
      >
        ← Back
      </button>
    </h3>

    <!-- Character Summary View -->
    <div v-if="viewMode === 'summary'" class="characters">
      <div v-if="characters.length === 0" class="no-characters">
        _No characters available_
      </div>
      <div
        v-for="character in characters"
        :key="character.id"
        class="character-card clickable"
        @click="selectCharacter(character)"
      >
        <div class="character-name">{{ character.name }}</div>
        <div v-if="character.player_name" class="character-player">{{ character.player_name }}</div>
        <div class="character-hp">
          {{ character.hit_points_current }} / {{ character.hit_points_max }} HP
        </div>
      </div>
    </div>

    <!-- Character Detail View -->
    <div v-else-if="viewMode === 'detail' && selectedCharacter" class="character-details">
      <div class="character-header">
        <h4>{{ selectedCharacter.name }}</h4>
        <div v-if="selectedCharacter.player_name" class="player-name">Player: {{ selectedCharacter.player_name }}</div>
      </div>

      <div class="character-info-grid">
        <!-- Basic Info -->
        <div class="info-section">
          <h5 class="section-header" @click="toggleSection('basicInfo')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.basicInfo }">▶</span>
            Basic Info
          </h5>
          <div v-show="!collapsedSections.basicInfo" class="section-content">
            <div v-if="selectedCharacter.character_class" class="info-item">
              <strong>Class:</strong> {{ selectedCharacter.character_class.name }}
              <span v-if="selectedCharacter.character_class.level"> (Level {{ selectedCharacter.character_class.level }})</span>
              <span v-if="selectedCharacter.character_class.subclass"> - {{ selectedCharacter.character_class.subclass }}</span>
            </div>
            <div v-if="selectedCharacter.race" class="info-item">
              <strong>Race:</strong> {{ selectedCharacter.race.name }}
              <span v-if="selectedCharacter.race.subrace"> ({{ selectedCharacter.race.subrace }})</span>
            </div>
            <div v-if="selectedCharacter.background" class="info-item">
              <strong>Background:</strong> {{ selectedCharacter.background }}
            </div>
            <div v-if="selectedCharacter.alignment" class="info-item">
              <strong>Alignment:</strong> {{ selectedCharacter.alignment }}
            </div>
          </div>
        </div>

        <!-- Combat Stats -->
        <div class="info-section">
          <h5 class="section-header" @click="toggleSection('combatStats')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.combatStats }">▶</span>
            Combat Stats
          </h5>
          <div v-show="!collapsedSections.combatStats" class="section-content">
            <div class="info-item">
              <strong>HP:</strong> {{ selectedCharacter.hit_points_current }} / {{ selectedCharacter.hit_points_max }}
            </div>
            <div v-if="selectedCharacter.armor_class" class="info-item">
              <strong>AC:</strong> {{ selectedCharacter.armor_class }}
            </div>
            <div v-if="selectedCharacter.proficiency_bonus" class="info-item">
              <strong>Proficiency Bonus:</strong> +{{ selectedCharacter.proficiency_bonus }}
            </div>
          </div>
        </div>

        <!-- Ability Scores -->
        <div v-if="selectedCharacter.abilities" class="info-section">
          <h5 class="section-header" @click="toggleSection('abilities')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.abilities }">▶</span>
            Ability Scores
          </h5>
          <div v-show="!collapsedSections.abilities" class="section-content">
            <div class="abilities-grid">
              <div v-for="(ability, name) in selectedCharacter.abilities" :key="name" class="ability-score">
                <div class="ability-name">{{ String(name).charAt(0).toUpperCase() + String(name).slice(1) }}</div>
                <div class="ability-value">{{ ability.score }} ({{ ability.mod >= 0 ? '+' : '' }}{{ ability.mod }})</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Saving Throws -->
        <div v-if="selectedCharacter.saving_throws" class="info-section">
          <h5 class="section-header" @click="toggleSection('savingThrows')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.savingThrows }">▶</span>
            Saving Throws
          </h5>
          <div v-show="!collapsedSections.savingThrows" class="section-content">
            <div class="saves-grid">
              <div v-for="(save, ability) in selectedCharacter.saving_throws" :key="ability" class="save-item">
                <div class="save-name">
                  {{ String(ability).charAt(0).toUpperCase() + String(ability).slice(1, 3) }}
                  <span v-if="save.proficiency === 'proficient'" class="proficiency-indicator" title="Proficient">●</span>
                </div>
                <div class="save-value">{{ save.modifier >= 0 ? '+' : '' }}{{ save.modifier }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Skills -->
        <div v-if="selectedCharacter.skills" class="info-section full-width">
          <h5 class="section-header" @click="toggleSection('skills')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.skills }">▶</span>
            Skills
          </h5>
          <div v-show="!collapsedSections.skills" class="section-content">
            <div class="skills-grid">
              <div v-for="(skill, skillName) in selectedCharacter.skills" :key="skillName" class="skill-item">
                <div class="skill-name">
                  <span v-if="skill.proficiency === 'proficient'" class="proficiency-indicator" title="Proficient">●</span>
                  <span v-if="skill.proficiency === 'expertise'" class="proficiency-indicator expertise" title="Expertise">◆</span>
                  {{ skill.name.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }}
                </div>
                <div class="skill-ability">{{ String(skill.ability).charAt(0).toUpperCase() + String(skill.ability).slice(1, 3) }}</div>
                <div class="skill-value">{{ skill.modifier >= 0 ? '+' : '' }}{{ skill.modifier }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Equipment -->
        <div v-if="selectedCharacter.equipment || selectedCharacter.inventory" class="info-section">
          <h5 class="section-header" @click="toggleSection('equipment')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.equipment }">▶</span>
            Equipment
          </h5>
          <div v-show="!collapsedSections.equipment" class="section-content">
            <div v-if="selectedCharacter.equipment" class="equipment-section">
              <div v-for="(item, slot) in selectedCharacter.equipment" :key="slot" class="info-item">
                <strong>{{ String(slot).replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) }}:</strong>
                {{ item ? item.name : 'None' }}
              </div>
            </div>
            <div v-if="selectedCharacter.inventory && selectedCharacter.inventory.length > 0" class="inventory-section">
              <strong>Inventory:</strong>
              <ul class="inventory-list">
                <li v-for="item in selectedCharacter.inventory" :key="item.id">
                  {{ item.name }} <span v-if="item.quantity > 1">({{ item.quantity }})</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Spells (if applicable) -->
        <div v-if="selectedCharacter.spells_known && selectedCharacter.spells_known.length > 0" class="info-section">
          <h5 class="section-header" @click="toggleSection('spells')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.spells }">▶</span>
            Spells
          </h5>
          <div v-show="!collapsedSections.spells" class="section-content">
            <div class="spells-list">
              <div v-for="spell in selectedCharacter.spells_known" :key="spell.id" class="spell-item">
                <div class="spell-header">
                  <span v-if="spell.prepared" class="prepared-check">✓</span>
                  <strong>{{ spell.name }}</strong> (Level {{ spell.level }})
                </div>
                <div class="spell-school">{{ spell.school }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Spell Slots (for spellcasters only) -->
        <div v-if="selectedCharacter.spell_slots && Object.keys(selectedCharacter.spell_slots).length > 0" class="info-section">
          <h5 class="section-header" @click="toggleSection('spellSlots')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.spellSlots }">▶</span>
            Spell Slots
          </h5>
          <div v-show="!collapsedSections.spellSlots" class="section-content">
            <div class="spell-slots-grid">
              <div
                v-for="(total, level) in selectedCharacter.spell_slots"
                :key="level"
                class="spell-slot-level"
              >
                <div class="slot-level-label">Level {{ level }}</div>
                <div class="slot-counter">
                  <span class="slots-used">{{ selectedCharacter.spell_slots_used?.[level] || 0 }} used</span>
                  <span class="slots-separator">/</span>
                  <span class="slots-total">{{ total }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Special Abilities -->
        <div v-if="selectedCharacter.special_abilities && selectedCharacter.special_abilities.length > 0" class="info-section full-width">
          <h5 class="section-header" @click="toggleSection('specialAbilities')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.specialAbilities }">▶</span>
            Special Abilities
          </h5>
          <div v-show="!collapsedSections.specialAbilities" class="section-content">
            <div class="special-abilities-list">
              <div v-for="ability in selectedCharacter.special_abilities" :key="ability.id" class="special-ability-item">
                <div class="ability-header">
                  <strong>{{ ability.name }}</strong>
                  <span v-if="ability.uses" class="ability-uses">
                    <span v-if="ability.uses_remaining !== null && ability.uses_remaining !== undefined" class="uses-remaining">
                      {{ ability.uses_remaining }}
                    </span>
                    <span class="uses-limit">{{ ability.uses }}</span>
                  </span>
                </div>
                <div class="ability-description">{{ ability.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Description/Bio -->
        <div v-if="selectedCharacter.description || selectedCharacter.bio" class="info-section full-width">
          <h5 class="section-header" @click="toggleSection('description')">
            <span class="expand-icon" :class="{ expanded: !collapsedSections.description }">▶</span>
            Character Description
          </h5>
          <div v-show="!collapsedSections.description" class="section-content">
            <div v-if="selectedCharacter.description" class="description">
              <strong>Appearance:</strong> {{ selectedCharacter.description }}
            </div>
            <div v-if="selectedCharacter.bio" class="bio">
              <strong>Background:</strong> {{ selectedCharacter.bio }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.characters-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.characters {
  flex: 1;
  overflow: auto;
}

.no-characters {
  color: #64748b;
  font-style: italic;
}

.character-card {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: #fff;
}

.character-card.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.character-card.clickable:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.character-name {
  font-weight: bold;
  color: #1f2937;
  margin-bottom: 2px;
}

.character-player {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.character-hp {
  font-size: 14px;
  color: #374151;
  font-weight: 500;
}

.back-btn {
  font-size: 12px;
  padding: 4px 8px;
  margin-left: 8px;
}

.character-details {
  flex: 1;
  overflow: auto;
}

.character-header {
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.character-header h4 {
  margin: 0;
  color: #1f2937;
  font-size: 18px;
}

.player-name {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.character-info-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.info-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
}

.info-section.full-width {
  grid-column: 1 / -1;
}

.info-section h5 {
  margin: 0 0 8px 0;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 4px;
}

.section-header {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: color 0.2s ease;
  user-select: none;
}

.section-header:hover {
  color: #1f2937;
}

.expand-icon {
  font-size: 10px;
  transition: transform 0.2s ease;
  color: #6b7280;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.section-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.info-item {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.4;
}

.info-item strong {
  color: #4b5563;
}

.abilities-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ability-score {
  text-align: center;
  padding: 6px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.ability-name {
  font-size: 10px;
  font-weight: bold;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.ability-value {
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}

.saves-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.save-item {
  text-align: center;
  padding: 6px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.save-name {
  font-size: 10px;
  font-weight: bold;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.save-value {
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}

.skills-grid {
  display: grid;
  gap: 4px;
}

.skill-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 4px 8px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  font-size: 12px;
}

.skill-name {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #374151;
}

.skill-ability {
  font-size: 10px;
  color: #9ca3af;
  text-transform: uppercase;
  font-weight: 500;
}

.skill-value {
  font-weight: 600;
  color: #1f2937;
  text-align: right;
  min-width: 30px;
}

.proficiency-indicator {
  color: #059669;
  font-size: 8px;
}

.proficiency-indicator.expertise {
  color: #dc2626;
}

.inventory-list {
  list-style: none;
  padding: 0;
  margin: 4px 0 0 0;
  font-size: 12px;
}

.inventory-list li {
  padding: 2px 0;
  color: #4b5563;
}

.spell-item {
  margin: 6px 0;
  padding: 4px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.spell-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.prepared-check {
  color: #059669;
  font-weight: bold;
  font-size: 14px;
}

.spell-school {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
}

.spell-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.spell-slot-level {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px;
  text-align: center;
}

.slot-level-label {
  font-size: 10px;
  font-weight: bold;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.slot-counter {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.slots-used {
  color: #dc2626;
}

.slots-separator {
  color: #9ca3af;
  margin: 0 2px;
}

.slots-total {
  color: #059669;
}

.more-items {
  color: #6b7280;
  font-style: italic;
  font-size: 12px;
  margin-top: 4px;
}

.description, .bio {
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}

.special-abilities-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.special-ability-item {
  padding: 10px;
  background: #f9fafb;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.ability-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  gap: 8px;
}

.ability-header strong {
  color: #1f2937;
  font-size: 14px;
}

.ability-uses {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.uses-remaining {
  font-weight: 600;
  color: #2563eb;
  background: #dbeafe;
  padding: 2px 6px;
  border-radius: 3px;
}

.uses-limit {
  font-style: italic;
}

.ability-description {
  font-size: 13px;
  line-height: 1.5;
  color: #4b5563;
}

.btn {
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: #111;
  color: #fff;
  cursor: pointer;
}
</style>