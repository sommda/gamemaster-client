// server/utils/fileLogger.ts - Simple file logging utility
import { appendFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const LOG_FILE = join(process.cwd(), 'openai-events.log')

const PAYLOAD_LOG_FILE = join(process.cwd(), 'openai-payload.log')

export function logOpenAIEvent(event: any, context: string = '') {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    context,
    event
  }

  try {
    appendFileSync(LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n---\n')
  } catch (error) {
    console.error('Failed to write to log file:', error)
  }
}

export function logOpenAIPayload(payload: any, context: string = '') {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    context,
    payload
  }

  try {
    appendFileSync(PAYLOAD_LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n---\n')
  } catch (error) {
    console.error('Failed to write to payload log file:', error)
  }
}

export function clearOpenAILog() {
  try {
    if (existsSync(LOG_FILE)) {
      unlinkSync(LOG_FILE)
    }
  } catch (error) {
    console.error('Failed to clear log file:', error)
  }
}