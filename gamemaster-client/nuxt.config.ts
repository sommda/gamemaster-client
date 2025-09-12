// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  runtimeConfig: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 's',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      version: process.env.ANTHROPIC_VERSION || '2023-06-01', // or current
    },
  },
  routeRules: {
    '/api/chat': { headers: { 'Cache-Control': 'no-store' } },
    '/mcp/**':   { headers: { 'Cache-Control': 'no-store' } },
  },

  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: [],
  typescript: {
    strict: false
  },

  nitro: { preset: 'node-server' },
  routeRules: {
    '/api/chat/**': { headers: { 'Cache-Control': 'no-store' } },
  }
})
