import { ref } from 'vue'
import { useMcpClient } from './useMcpClient'
import { debug } from '../utils/debug'

export type Character = {
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

export type CombatParticipant = {
  name: string
  initiative: number
  hp: number
  ac: number
  speed: number
  attacks?: any[]
}

export type GameState = {
  in_combat: boolean
  current_turn?: string | null
  initiative_order: CombatParticipant[]
  current_location?: string | null
  current_date?: string | null
  party_level?: number
  party_funds?: string
  modes?: string[]
  notes?: string
}

export type Campaign = {
  name?: string
  description?: string
  current_date?: string
  [key: string]: any
}

export function useGameData() {
  const { getClient, fetchCurrentGameState, fetchCurrentCampaign } = useMcpClient()

  // --- character panel ---
  const characters = ref<Character[]>([])
  const selectedCharacter = ref<Character | null>(null)
  const characterViewMode = ref<'summary' | 'detail'>('summary')

  // --- game state panel ---
  const gameState = ref<GameState>({
    in_combat: false,
    current_turn: null,
    initiative_order: [],
    current_location: null,
    current_date: null,
    party_level: 1,
    party_funds: '0 gp',
    modes: [],
    notes: ''
  })

  // --- campaign data ---
  const campaign = ref<Campaign | null>(null)

  async function fetchCharacters(): Promise<void> {
    try {
      const c = await getClient()
      const r = await c.readResource({ uri: 'resource://current_campaign/characters' })
      // SDK returns a ResourceContents envelope; normalize common shapes
      const contents = (r as any)?.contents ?? (r as any)?.content ?? r
      let characterData: any[] = []

      if (Array.isArray(contents) && contents[0]?.text) {
        characterData = JSON.parse(contents[0].text)
      } else if (typeof contents?.text === 'string') {
        characterData = JSON.parse(contents.text)
      } else if (Array.isArray(contents)) {
        characterData = contents
      } else if (Array.isArray(r)) {
        characterData = r as any[]
      } else {
        characterData = []
      }

      characters.value = characterData.map((char: any) => ({
        id: char.id,
        name: char.name,
        hit_points_current: char.hit_points_current,
        hit_points_max: char.hit_points_max,
        player_name: char.player_name,
        character_class: char.character_class,
        race: char.race,
        abilities: char.abilities,
        armor_class: char.armor_class,
        inventory: char.inventory,
        equipment: char.equipment,
        spells_known: char.spells_known,
        background: char.background,
        alignment: char.alignment,
        description: char.description,
        bio: char.bio,
        ...char // Include any other fields from the full Character model
      }))
    } catch (e: any) {
      debug.error('Failed to fetch characters:', e)
      characters.value = []
    }
  }

  async function fetchGameState(): Promise<void> {
    try {
      const campaignGameState = await fetchCurrentGameState()

      if (campaignGameState) {
        gameState.value = {
          in_combat: campaignGameState.in_combat || false,
          current_turn: campaignGameState.current_turn || null,
          initiative_order: campaignGameState.initiative_order || [],
          current_location: campaignGameState.current_location || null,
          current_date: campaignGameState.current_date || null,
          party_level: campaignGameState.party_level || 1,
          party_funds: campaignGameState.party_funds || '0 gp',
          modes: campaignGameState.modes || [],
          notes: campaignGameState.notes || ''
        }
      }
    } catch (e: any) {
      debug.error('Failed to fetch game state:', e)
    }
  }

  async function fetchCampaign(): Promise<void> {
    try {
      const campaignName = await fetchCurrentCampaign()

      if (campaignName && typeof campaignName === 'string') {
        campaign.value = {
          name: campaignName,
          description: null,
          current_date: null // Will come from gameState instead
        }
      } else {
        campaign.value = null
      }
    } catch (e: any) {
      debug.error('Failed to fetch campaign:', e)
    }
  }

  function selectCharacter(character: Character) {
    selectedCharacter.value = character
    characterViewMode.value = 'detail'
  }

  function returnToCharacterSummary() {
    selectedCharacter.value = null
    characterViewMode.value = 'summary'
  }

  async function refreshGameData() {
    await Promise.all([
      fetchCharacters(),
      fetchGameState(),
      fetchCampaign()
    ])
  }

  return {
    // State
    characters,
    selectedCharacter,
    characterViewMode,
    gameState,
    campaign,

    // Actions
    fetchCharacters,
    fetchGameState,
    fetchCampaign,
    selectCharacter,
    returnToCharacterSummary,
    refreshGameData
  }
}