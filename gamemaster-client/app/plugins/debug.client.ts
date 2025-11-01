// plugins/debug.client.ts - Initialize client-side debug mode from runtime config
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()

  // Always log the config value for debugging
  console.log('📝 Debug plugin loaded. config.public.debug =', config.public.debug)

  // If DEBUG=true was set when starting the server, enable debug mode
  if (config.public.debug) {
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG__ = true
      console.log('🐛 Debug logging enabled via DEBUG=true environment variable')
      console.log('🐛 window.__DEBUG__ =', (window as any).__DEBUG__)
    }
  } else {
    console.log('ℹ️ Debug logging disabled. Run with DEBUG=true or call window.enableDebug()')
  }
})
