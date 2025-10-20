// D&D game types based on gamemaster-mcp server models

export interface Campaign {
  name: string
  description: string
  dmName: string
  setting: string
  characters: Record<string, Character>
  npcs: Record<string, NPC>
  locations: Record<string, Location>
  quests: Record<string, Quest>
  gameState: GameState
  encounters: Record<string, CombatEncounter>
  sessions: SessionNote[]
}

export interface Character {
  name: string
  race: string
  characterClass: string
  level: number
  hitPointsMax: number
  hitPointsCurrent: number
  armorClass: number
  abilityScores: {
    strength: AbilityScore
    dexterity: AbilityScore
    constitution: AbilityScore
    intelligence: AbilityScore
    wisdom: AbilityScore
    charisma: AbilityScore
  }
  inventory: Item[]
  spells: Spell[]
  conditions: string[]
}

export interface AbilityScore {
  score: number
  modifier: number
}

export interface Item {
  name: string
  description: string
  weight: number
  value: number
  quantity: number
  equipped: boolean
}

export interface Spell {
  name: string
  level: number
  school: string
  description: string
  prepared: boolean
}

export interface NPC {
  name: string
  description: string
  location?: string
  relationships: string[]
  secrets: string[]
  stats?: Record<string, any>
}

export interface Location {
  name: string
  description: string
  notableFeatures: string[]
  npcs: string[]
  connections: string[]
  secrets: string[]
}

export interface Quest {
  title: string
  description: string
  objectives: string[]
  status: 'active' | 'completed' | 'failed'
  giver?: string
  rewards: string[]
  timeLimit?: string
}

export interface GameState {
  currentLocation: string
  partyLevel: number
  partyFunds: number
  activeQuests: string[]
  inCombat: boolean
  currentSession: number
  gameDate: string
  worldConditions: Record<string, any>
  modes?: string[] // Active game modes (e.g., ["combat", "exploration", "social"])
}

export interface CombatEncounter {
  name: string
  description: string
  participants: CombatParticipant[]
  currentTurn: number
  round: number
  isActive: boolean
}

export interface CombatParticipant {
  name: string
  initiative: number
  hitPoints: number
  maxHitPoints: number
  conditions: string[]
  isPlayerCharacter: boolean
}

export interface SessionNote {
  sessionNumber: number
  date: string
  summary: string
  attendees: string[]
  xpAwarded: number
  treasureFound: string[]
}

export interface AdventureEvent {
  id: string
  timestamp: string
  eventType: 'combat' | 'roleplay' | 'exploration' | 'quest' | 'other'
  description: string
  charactersInvolved: string[]
  location: string
  importance: 1 | 2 | 3 | 4 | 5
  tags: string[]
}