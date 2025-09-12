<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  source: string
}>()

const html = ref('<p></p>')
let md: MarkdownIt
let purify: any = { sanitize: (x: string) => x } // no-op until client

// Throttle renders to next animation frame
let raf = 0
const scheduleRender = () => {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const raw = md.render(props.source || '')
    html.value = purify.sanitize(raw)
  })
}

onMounted(async () => {
  // Lazy-load DOMPurify only on client
  const dompurify = await import('dompurify')
  purify = dompurify.default

  // Configure markdown-it (safe defaults for streaming)
  md = new MarkdownIt({
    html: false,     // prevent raw HTML (safer)
    linkify: true,
    breaks: true
  })

  // First render
  scheduleRender()
})

watch(() => props.source, scheduleRender)
</script>

<template>
  <!-- Render sanitized HTML -->
  <div class="prose prose-slate max-w-none" v-html="html" />
</template>

<style scoped>
/* Basic readable defaults; swap for your design system / Tailwind Typography if you use it */
.prose :deep(pre) { background: #0f172a0d; padding: 0.75rem; border-radius: 0.5rem; overflow:auto; }
.prose :deep(code) { background: #0f172a0d; padding: 0.1rem 0.25rem; border-radius: 0.25rem; }
.prose :deep(a) { text-decoration: underline; }
</style>
