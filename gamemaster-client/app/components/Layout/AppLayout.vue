<template>
  <div class="h-screen flex bg-gray-50 dark:bg-gray-900">
    <!-- Main Chat Pane (60%) -->
    <div class="flex-1 flex flex-col border-r border-gray-300 dark:border-gray-700">
      <header class="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-4 py-3">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
          Gamemaster Chat
        </h1>
      </header>
      
      <div class="flex-1 flex flex-col">
        <ChatHistory />
        <ChatInput />
      </div>
    </div>
    
    <!-- Character Sheet Pane (25%) -->
    <div class="w-1/4 flex flex-col border-r border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
      <header class="border-b border-gray-300 dark:border-gray-700 px-4 py-3">
        <h2 class="text-md font-semibold text-gray-900 dark:text-white">
          Character Sheet
        </h2>
      </header>
      
      <div class="flex-1 overflow-y-auto">
        <CharacterSheet />
      </div>
    </div>
    
    <!-- Tactical Map Pane (15%) -->
    <div class="w-1/6 flex flex-col bg-white dark:bg-gray-800">
      <header class="border-b border-gray-300 dark:border-gray-700 px-4 py-3">
        <h2 class="text-md font-semibold text-gray-900 dark:text-white">
          Tactical Map
        </h2>
      </header>
      
      <div class="flex-1 overflow-hidden">
        <TacticalMap />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Import components (will be auto-imported by Nuxt)
</script>