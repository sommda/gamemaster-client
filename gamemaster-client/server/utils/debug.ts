// server/utils/debug.ts - Server-side environment-aware debug logging
// Logs are disabled by default, enable with DEBUG=true environment variable

const DEBUG = process.env.DEBUG === 'true'

export const debug = {
  // Regular debug logs - only in debug mode
  log: (...args: any[]) => {
    if (DEBUG) console.log(...args)
  },

  // Warnings - only in debug mode (critical warnings should use console.warn directly)
  warn: (...args: any[]) => {
    if (DEBUG) console.warn(...args)
  },

  // Errors - always logged
  error: (...args: any[]) => {
    console.error(...args)
  },

  // Check if debug mode is enabled
  enabled: DEBUG
}
