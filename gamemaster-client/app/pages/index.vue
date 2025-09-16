<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, watch } from 'vue'
import StreamMarkdown from '@/components/StreamMarkdown.vue'
import { useChatStream } from '@/composables/useChatStream'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

const { openChatStream } = useChatStream()
const { recordInteraction, fetchCurrentTranscript, getClient } = useMcpClient()

// --- provider + models ---
const provider = ref<'anthropic' | 'openai'>('anthropic')
const modelByProvider: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-5'
}

// --- system message (configurable) ---
const DEFAULT_SYSTEM = 'You are a helpful assistant.'
const systemMsg = ref<string>(DEFAULT_SYSTEM)
const showSettings = ref(false)

// --- conversation state ---
const messages = ref<Msg[]>([{ role: 'system', content: systemMsg.value }])
const visibleMessages = computed(() => messages.value.filter(m => m.role !== 'system'))

const userInput = ref('')
const error = ref<string | null>(null)
const stop = ref<null | (() => void)>(null) // active stream closer
const chatBox = ref<HTMLElement | null>(null)

// --- transcript panel ---
const showTranscript = ref(true)
const transcript = ref<string>('') // latest transcript text

// --- character panel ---
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
  [key: string]: any // Allow for other Character model fields
}
const characters = ref<Character[]>([])
const selectedCharacter = ref<Character | null>(null)
const characterViewMode = ref<'summary' | 'detail'>('summary')

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
    console.error('Failed to fetch characters:', e)
    characters.value = []
  }
}

function scrollToBottom() {
  nextTick(() => chatBox.value?.scrollTo({ top: chatBox.value!.scrollHeight, behavior: 'smooth' }))
}

function onComposerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function cancel() {
  stop.value?.()
  stop.value = null
}

function newChat() {
  messages.value = [{ role: 'system', content: systemMsg.value }]
  error.value = null
  userInput.value = ''
  transcript.value = ''
  characters.value = []
  selectedCharacter.value = null
  characterViewMode.value = 'summary'
}

function selectCharacter(character: Character) {
  selectedCharacter.value = character
  characterViewMode.value = 'detail'
}

function returnToCharacterSummary() {
  selectedCharacter.value = null
  characterViewMode.value = 'summary'
}

function resetSystem() {
  systemMsg.value = DEFAULT_SYSTEM
}

// Persist + bind system message
onMounted(() => {
  try { const saved = localStorage.getItem('systemMessage'); if (saved) systemMsg.value = saved } catch {}
  messages.value[0] = { role: 'system', content: systemMsg.value }
})
watch(systemMsg, (val) => {
  if (!messages.value.length || messages.value[0].role !== 'system') {
    messages.value.unshift({ role: 'system', content: val })
  } else {
    messages.value[0] = { role: 'system', content: val }
  }
  try { localStorage.setItem('systemMessage', val) } catch {}
})

async function send() {
  const text = userInput.value.trim()
  if (!text || stop.value) return
  error.value = null

  // add user msg
  const userMsg: Msg = { role: 'user', content: text }
  messages.value.push(userMsg)
  userInput.value = ''
  scrollToBottom()

  // reactive assistant placeholder
  const assistant = reactive<Msg>({ role: 'assistant', content: '' })
  messages.value.push(assistant)
  scrollToBottom()

  const payload = {
    provider: provider.value,
    model: modelByProvider[provider.value],
    system: systemMsg.value,
    messages: messages.value.filter(m => m.role !== 'system'),
    maxTokens: 1024,
    temperature: 0.2
  }

  // batch tiny deltas to the next animation frame
  let pending = ''
  let raf = 0
  const flush = () => {
    if (!pending) return
    assistant.content += pending
    pending = ''
    raf = 0
    scrollToBottom()
  }

  try {
    stop.value = await openChatStream(
      payload,
      (delta: string) => {
        pending += delta
        if (!raf) raf = requestAnimationFrame(flush)
      },
      (err: any) => {
        error.value = typeof err === 'string' ? err : JSON.stringify(err, null, 2)
      },
      {
        debug: false,
        // ✅ When the stream ends, record interaction and refresh transcript
        onDone: async () => {
          stop.value = null
          try {
            await recordInteraction({
              player_entry: userMsg.content,
              game_response: assistant.content,
            })
            transcript.value = await fetchCurrentTranscript()
            await fetchCharacters()
          } catch (e: any) {
            error.value = `MCP error: ${e?.message ?? String(e)}`
          }
        }
      }
    )
  } catch (e: any) {
    error.value = e?.message ?? String(e)
    cancel()
  }
}
</script>

<template>
  <div class="layout">
    <div class="left">
      <div class="toolbar">
        <div class="left-side">
          <label class="toolbar-item">
            Provider:
            <select v-model="provider">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <button class="btn" @click="newChat">New chat</button>
        </div>
        <div class="right-side">
          <button class="btn secondary" @click="showSettings = !showSettings">⚙️ System</button>
          <button class="btn secondary" @click="showTranscript = !showTranscript">{{ showTranscript ? 'Hide' : 'Show' }} Transcript</button>
          <button class="btn danger" :disabled="!stop" @click="cancel">Cancel</button>
        </div>
      </div>

      <transition name="fade">
        <div v-if="showSettings" class="settings">
          <div class="settings-row">
            <label class="settings-label">System message</label>
            <textarea
              v-model="systemMsg"
              class="settings-input"
              rows="4"
              placeholder="Enter the system prompt for this chat..."
            />
          </div>
          <div class="settings-actions">
            <button class="btn" @click="resetSystem">Reset to default</button>
            <span class="hint">Saved to this browser (localStorage)</span>
          </div>
        </div>
      </transition>

      <div ref="chatBox" class="chat-box">
        <div v-for="(m, i) in visibleMessages" :key="i" class="msg" :class="m.role">
          <strong class="role">{{ m.role }}</strong>
          <div class="bubble">
            <StreamMarkdown v-if="m.role === 'assistant'" :source="m.content" />
            <div v-else class="user-text">{{ m.content }}</div>
          </div>
        </div>
      </div>

      <div class="composer">
        <textarea
          v-model="userInput"
          class="input"
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows="3"
          @keydown="onComposerKeydown"
        />
        <button class="send btn" @click="send" :disabled="!userInput.trim()">Send</button>
      </div>

      <pre v-if="error" class="error">⚠️ {{ error }}</pre>
    </div>

    <aside v-if="showTranscript" class="right">
      <div class="transcript-section">
        <h3>Transcript</h3>
        <div class="transcript">
          <StreamMarkdown :source="transcript || '_No transcript yet_'"/>
        </div>
      </div>

      <div class="characters-section">
        <h3>Characters
          <button
            v-if="characterViewMode === 'detail'"
            @click="returnToCharacterSummary"
            class="btn back-btn"
          >
            ← Back
          </button>
        </h3>

        <!-- Character Summary View -->
        <div v-if="characterViewMode === 'summary'" class="characters">
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
        <div v-else-if="characterViewMode === 'detail' && selectedCharacter" class="character-details">
          <div class="character-header">
            <h4>{{ selectedCharacter.name }}</h4>
            <div v-if="selectedCharacter.player_name" class="player-name">Player: {{ selectedCharacter.player_name }}</div>
          </div>

          <div class="character-info-grid">
            <!-- Basic Info -->
            <div class="info-section">
              <h5>Basic Info</h5>
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

            <!-- Combat Stats -->
            <div class="info-section">
              <h5>Combat Stats</h5>
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

            <!-- Ability Scores -->
            <div v-if="selectedCharacter.abilities" class="info-section">
              <h5>Ability Scores</h5>
              <div class="abilities-grid">
                <div v-for="(ability, name) in selectedCharacter.abilities" :key="name" class="ability-score">
                  <div class="ability-name">{{ String(name).charAt(0).toUpperCase() + String(name).slice(1) }}</div>
                  <div class="ability-value">{{ ability.score }} ({{ ability.mod >= 0 ? '+' : '' }}{{ ability.mod }})</div>
                </div>
              </div>
            </div>

            <!-- Equipment -->
            <div v-if="selectedCharacter.equipment || selectedCharacter.inventory" class="info-section">
              <h5>Equipment</h5>
              <div v-if="selectedCharacter.equipment" class="equipment-section">
                <div v-for="(item, slot) in selectedCharacter.equipment" :key="slot" class="info-item">
                  <strong>{{ String(slot).replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) }}:</strong>
                  {{ item ? item.name : 'None' }}
                </div>
              </div>
              <div v-if="selectedCharacter.inventory && selectedCharacter.inventory.length > 0" class="inventory-section">
                <strong>Inventory:</strong>
                <ul class="inventory-list">
                  <li v-for="item in selectedCharacter.inventory.slice(0, 5)" :key="item.id">
                    {{ item.name }} <span v-if="item.quantity > 1">({{ item.quantity }})</span>
                  </li>
                  <li v-if="selectedCharacter.inventory.length > 5" class="more-items">
                    ...and {{ selectedCharacter.inventory.length - 5 }} more items
                  </li>
                </ul>
              </div>
            </div>

            <!-- Spells (if applicable) -->
            <div v-if="selectedCharacter.spells_known && selectedCharacter.spells_known.length > 0" class="info-section">
              <h5>Spells</h5>
              <div class="spells-list">
                <div v-for="spell in selectedCharacter.spells_known.slice(0, 3)" :key="spell.id" class="spell-item">
                  <strong>{{ spell.name }}</strong> (Level {{ spell.level }})
                  <div class="spell-school">{{ spell.school }}</div>
                </div>
                <div v-if="selectedCharacter.spells_known.length > 3" class="more-items">
                  ...and {{ selectedCharacter.spells_known.length - 3 }} more spells
                </div>
              </div>
            </div>

            <!-- Description/Bio -->
            <div v-if="selectedCharacter.description || selectedCharacter.bio" class="info-section full-width">
              <h5>Character Description</h5>
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
    </aside>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 1fr 360px; gap: 16px; max-width: 1200px; margin: 0 auto; padding: 16px; }
.left { display: flex; flex-direction: column; gap: 12px; }
.right { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #f8fafc; max-height: 80vh; display: flex; flex-direction: column; gap: 12px; }
.right h3 { margin: 0 0 8px; }

.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.left-side, .right-side { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.toolbar-item { display: flex; gap: 8px; align-items: center; }
.btn { padding: 8px 14px; border: 0; border-radius: 8px; background: #111; color: #fff; cursor: pointer; }
.btn.secondary { background: #334155; }
.btn.danger { background: #b91c1c; }
.btn:disabled { opacity: .5; cursor: not-allowed; }

.settings { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #f8fafc; }
.settings-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: start; }
.settings-label { padding-top: 6px; color: #475569; }
.settings-input { width: 100%; resize: vertical; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-family: system-ui, sans-serif; }
.settings-actions { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
.hint { color: #64748b; font-size: 12px; }

.chat-box { height: 60vh; overflow: auto; border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: #fafafa; }
.msg { display: flex; gap: 8px; margin: 6px 0; }
.msg.user .bubble { background: #e8f0fe; }
.msg.assistant .bubble { background: #f1f5f9; }
.role { width: 80px; text-transform: capitalize; }
.bubble { padding: 8px 10px; border-radius: 10px; white-space: normal; flex: 1; }
.user-text { white-space: pre-wrap; }

.composer { display: flex; gap: 8px; align-items: flex-end; }
.input { flex: 1; resize: vertical; padding: 10px; border-radius: 8px; border: 1px solid #ccc; }
.send { margin-left: 6px; }

.error { color: #b00020; white-space: pre-wrap; background: #fff3f3; border: 1px solid #f3c0c0; border-radius: 8px; padding: 8px; }

.fade-enter-active, .fade-leave-active { transition: opacity .15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.transcript-section { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.transcript { flex: 1; overflow: auto; }

.characters-section { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.characters { flex: 1; overflow: auto; }

.no-characters { color: #64748b; font-style: italic; }

.character-card {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: #fff;
}

.character-name {
  font-weight: bold;
  color: hsl(215, 28%, 17%);
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

.spell-school {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
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
</style>
