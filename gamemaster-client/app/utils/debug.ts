// utils/debug.ts - Environment-aware debug logging
// Logs are disabled by default, enable with DEBUG=true env var or window.enableDebug()

const isServer = typeof window === 'undefined'

// Debug logging is DISABLED by default
// Enable with:
// - Server: DEBUG=true environment variable
// - Client: window.enableDebug() in browser console
const DEBUG = isServer
  ? (process.env.DEBUG === 'true')
  : !!(window as any).__DEBUG__

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

// Allow runtime enabling of debug mode (client-side only)
if (!isServer && typeof window !== 'undefined') {
  (window as any).enableDebug = () => {
    (window as any).__DEBUG__ = true
    console.log('🐛 Debug logging enabled. Reload the page to see debug logs.')
  }

  (window as any).disableDebug = () => {
    (window as any).__DEBUG__ = false
    console.log('🐛 Debug logging disabled.')
  }
}
