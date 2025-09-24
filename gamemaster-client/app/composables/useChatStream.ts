// composables/useChatStream.ts
import { useClientToolCalling } from './useClientToolCalling'
import { useToolCalling } from './useToolCalling'

export function useChatStream() {
  const { isClientMcpMode } = useClientToolCalling()
  const { executeMcpTools } = useToolCalling()

  type Err = any
  type Opts = { debug?: boolean; onDone?: () => void; onToolUseEvent?: (eventData: any) => void; onToolDisplay?: (message: string) => void }

  async function openChatStreamWithToolCalling(
    payload: any,
    onText: (t: string) => void,
    onError?: (err: Err) => void,
    opts?: Opts
  ): Promise<() => void> {
    console.log('🎯 openChatStreamWithToolCalling called')
    console.log('🔍 Checking if client MCP mode:', payload.providerMode, 'isClientMcp:', isClientMcpMode(payload.providerMode))

    // For client MCP modes, we need to handle tool calling
    if (isClientMcpMode(payload.providerMode)) {
      console.log('✅ Using tool-aware streaming for client MCP mode')
      return await openToolAwareChatStream(payload, onText, onError, opts)
    }

    // For server MCP modes, use regular streaming
    console.log('✅ Using regular streaming for server MCP mode')
    return await openChatStream(payload, onText, onError, opts)
  }

  async function openToolAwareChatStream(
    payload: any,
    onText: (t: string) => void,
    onError?: (err: Err) => void,
    opts?: Opts
  ): Promise<() => void> {
    // This implements the tool calling orchestration for client MCP modes
    console.log('🚀 Starting tool-aware chat stream for client MCP mode')

    let iteration = 0
    const maxIterations = 20
    let currentPayload = { ...payload }
    let shouldContinue = true
    let closeFunction: (() => void) | null = null
    const failedToolCalls = new Set<string>() // Track failed tool calls to prevent infinite loops

    try {
      // Main tool calling loop
      while (shouldContinue && iteration < maxIterations) {
      iteration++
      console.log(`🔄 Tool calling iteration ${iteration}/${maxIterations}`)
      const lastMessage = currentPayload.messages?.[currentPayload.messages.length - 1]
      let lastMessagePreview = 'none'
      if (lastMessage?.content) {
        if (typeof lastMessage.content === 'string') {
          lastMessagePreview = lastMessage.content.substring(0, 100) + '...'
        } else if (Array.isArray(lastMessage.content)) {
          // Handle Anthropic content blocks format
          const textContent = lastMessage.content.find((block: any) => block.type === 'text')
          lastMessagePreview = textContent ? textContent.text.substring(0, 100) + '...' : '[content blocks]'
        }
      }

      console.log('📤 Current payload:', {
        provider: currentPayload.provider,
        providerMode: currentPayload.providerMode,
        model: currentPayload.model,
        toolCount: currentPayload.tools?.length || 0,
        messageCount: currentPayload.messages?.length || 0,
        lastMessage: lastMessagePreview
      })

      // State for collecting tool calls from this iteration
      const activeToolCalls = new Map<string, any>()
      let fullAssistantResponse = ''
      let hasToolCalls = false
      let streamComplete = false

      // For OpenAI: accumulate deltas by output_index until response.completed
      const pendingDeltas: Record<number, string> = {}
      const finalArgumentsByIndex: Record<number, string> = {}

      const originalOnText = onText
      const iterationOnText = (text: string) => {
        fullAssistantResponse += text
        console.log('📝 Assistant text received:', text.length > 50 ? text.substring(0, 50) + '...' : text)
        // Always pass through assistant text to the user
        originalOnText(text)
      }

      console.log('🌊 Opening chat stream for iteration', iteration)

      // Create a promise to wait for stream completion
      const streamPromise = new Promise<void>((resolve) => {
        // Enhanced options to handle tool use events
        const iterationOpts = {
          ...opts,
          onDone: () => {
            console.log('🎯 Stream iteration completed for iteration', iteration)
            console.log('🔍 Setting streamComplete = true and resolving promise')
            streamComplete = true
            resolve()
          },
          onToolUseEvent: (eventData: any) => {
            console.log('🔧 Processing tool use event:', eventData)

            // Handle Anthropic tool use events
            if (eventData.type === 'tool_use_start') {
              hasToolCalls = true
              const toolUse = eventData.tool_use
              console.log('🚀 Anthropic tool use started:', {
                id: toolUse.id,
                name: toolUse.name,
                hasInput: !!toolUse.input
              })

              // Show tool call to user (separate from response content)
              if (opts?.onToolDisplay) {
                opts.onToolDisplay(`🔧 Calling ${toolUse.name}...`)
              }

              activeToolCalls.set(toolUse.id, {
                id: toolUse.id,
                name: toolUse.name,
                input: toolUse.input || {},
                inputJson: '',
                complete: false,
                inputComplete: false
              })
            } else if (eventData.type === 'tool_input_delta') {
              // Collect input deltas to build complete JSON
              const delta = eventData.delta
              if (delta.partial_json) {
                console.log('📥 Anthropic tool input delta received:', delta.partial_json.length > 50 ?
                  delta.partial_json.substring(0, 50) + '...' : delta.partial_json)

                // Find the most recently started tool call that's still incomplete
                let targetToolCall = null
                for (const [, toolCall] of activeToolCalls) {
                  if (!toolCall.complete && !toolCall.inputComplete) {
                    targetToolCall = toolCall
                    // Don't break - keep looking for the most recent one
                  }
                }

                if (targetToolCall) {
                  targetToolCall.inputJson += delta.partial_json
                  console.log('🔧 Building tool input for', targetToolCall.id, '- current length:', targetToolCall.inputJson.length)

                  // Check if this JSON object is complete by counting braces
                  const openBraces = (targetToolCall.inputJson.match(/\{/g) || []).length
                  const closeBraces = (targetToolCall.inputJson.match(/\}/g) || []).length

                  if (openBraces > 0 && openBraces === closeBraces) {
                    console.log('✅ Tool input JSON complete for', targetToolCall.id)
                    targetToolCall.inputComplete = true
                  }
                } else {
                  console.log('⚠️ Received tool input delta but no active incomplete tool call found')
                }
              }
            } else if (eventData.type === 'tool_use_complete') {
              console.log('✅ Anthropic tool use sequence complete')

              // Mark all tool calls as complete so they can be processed
              for (const [, toolCall] of activeToolCalls) {
                toolCall.complete = true

                // If we have accumulated JSON deltas, parse them now
                if (toolCall.inputJson && !toolCall.inputComplete) {
                  try {
                    toolCall.input = JSON.parse(toolCall.inputJson)
                    toolCall.inputComplete = true
                    console.log('✅ Parsed accumulated tool input for', toolCall.id, ':', toolCall.input)
                  } catch (e) {
                    console.log('⚠️ Failed to parse accumulated JSON for', toolCall.id, '- using original input')
                    toolCall.inputComplete = true
                  }
                }
              }
            }
            // Handle OpenAI function call events (forwarded from server)
            else if (eventData.type === 'function_call_arguments_delta') {
              hasToolCalls = true
              const delta = eventData.delta
              const outputIndex = eventData.output_index

              // Store delta by output_index for later processing
              if (!pendingDeltas[outputIndex]) {
                pendingDeltas[outputIndex] = ''
              }
              pendingDeltas[outputIndex] += delta
            }
            else if (eventData.type === 'function_call_arguments_done') {
              const outputIndex = eventData.output_index
              const finalArguments = eventData.arguments

              // Store final arguments by output_index
              if (!finalArgumentsByIndex[outputIndex]) {
                finalArgumentsByIndex[outputIndex] = finalArguments
              }
            }
            else if (eventData.type === 'response_completed') {
              const outputArray = eventData.output

              // Now we have the complete output array with call_ids - process all function calls
              outputArray.forEach((outputItem: any, index: number) => {
                if (outputItem.type === 'function_call') {
                  const callId = outputItem.call_id
                  const functionName = outputItem.name
                  const finalArguments = outputItem.arguments

                  // Create tool call with correct call_id
                  const targetToolCall = {
                    id: callId, // Use call_id for tool execution
                    callId: callId,
                    name: functionName,
                    input: {},
                    inputJson: pendingDeltas[index] || '',
                    complete: true,
                    inputComplete: true
                  }

                  // Parse final arguments
                  try {
                    targetToolCall.input = JSON.parse(finalArguments)
                  } catch (e) {
                    targetToolCall.input = {}
                  }

                  // Store by call_id for tool execution
                  activeToolCalls.set(callId, targetToolCall)

                  // Show tool call to user (separate from response content)
                  if (opts?.onToolDisplay) {
                    opts.onToolDisplay(`🔧 Calling ${functionName}...`)
                  }
                }
              })
            }

            // Debug: show current state of activeToolCalls after processing this event
            console.log('🔍 Current activeToolCalls after event:', Array.from(activeToolCalls.entries()).map(([id, tc]) => ({
              mapKey: id,
              toolCallId: tc.id,
              name: tc.name,
              inputComplete: tc.inputComplete,
              inputJsonLength: tc.inputJson?.length || 0
            })))
          }
        }

        // Start the stream
        openChatStream(currentPayload, iterationOnText, onError, iterationOpts).then(closeFn => {
          closeFunction = closeFn
        }).catch(error => {
          console.error('❌ Error opening chat stream:', error)
          onError?.(error)
          resolve()
        })
      })

      // Wait for stream to complete
      console.log('⏳ Waiting for stream promise to resolve...')
      await streamPromise
      console.log('✅ Stream promise resolved!')

      console.log('🎯 Stream completed for iteration', iteration, '- hasToolCalls:', hasToolCalls)

      if (!hasToolCalls) {
        // No tool calls - we're done
        console.log('✅ No tool calls found, finishing conversation')
        shouldContinue = false
        break
      }

      // Process completed tool calls
      console.log('🔍 Processing activeToolCalls:', Array.from(activeToolCalls.entries()).map(([id, toolCall]) => ({
        id: id,
        toolCallId: toolCall.id,
        name: toolCall.name,
        hasInputJson: !!toolCall.inputJson,
        inputJsonLength: toolCall.inputJson?.length || 0,
        inputComplete: toolCall.inputComplete
      })))

      const completedToolCalls = []
      for (const [id, toolCall] of activeToolCalls) {
        toolCall.complete = true

        console.log(`🔍 Processing tool call with map key: "${id}", toolCall.id: "${toolCall.id}", name: "${toolCall.name}"`)

        // Parse the final JSON input if we have deltas
        if (toolCall.inputJson) {
          try {
            toolCall.input = JSON.parse(toolCall.inputJson)
            console.log('✅ Parsed complete tool input for', id, ':', toolCall.input)
          } catch (e) {
            console.error('❌ Failed to parse tool input JSON for', id, ':', e)
            console.log('Raw JSON:', toolCall.inputJson)
            // Keep the original input if parsing fails
          }
        } else {
          console.log('⚠️ No inputJson deltas collected for tool', id, '- using initial input:', toolCall.input)
        }

        // Skip tool calls that don't have proper ID or name
        if (!toolCall.id || !toolCall.name) {
          console.error('❌ Skipping invalid tool call - missing ID or name:', {
            id: toolCall.id,
            name: toolCall.name,
            mapKey: id
          })
          continue
        }

        const completeToolCall = {
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.input)
          }
        }

        completedToolCalls.push(completeToolCall)
        console.log('🎯 Complete tool call assembled:', {
          id: completeToolCall.id,
          name: completeToolCall.function.name,
          argumentsLength: completeToolCall.function.arguments.length
        })
        console.log('📋 Full tool call JSON payload:', JSON.stringify(completeToolCall, null, 2))
      }

      if (completedToolCalls.length > 0) {
        // Check for previously failed tool calls to prevent infinite loops
        const newToolCalls = completedToolCalls.filter(toolCall => {
          const toolSignature = `${toolCall.function.name}:${toolCall.function.arguments}`
          if (failedToolCalls.has(toolSignature)) {
            console.log('⚠️ Skipping previously failed tool call:', toolCall.function.name)
            return false
          }
          return true
        })

        if (newToolCalls.length === 0) {
          console.log('❌ All tool calls have failed before, stopping to prevent infinite loop')
          shouldContinue = false
          break
        }

        // Execute tools and prepare next iteration
        console.log(`⚙️ Executing ${newToolCalls.length} tool calls...`)
        console.log('🔍 Tool calls being executed:', newToolCalls.map(tc => ({ id: tc.id, name: tc.function.name })))
        const toolResults = await executeMcpTools(newToolCalls)
        console.log('🎯 Tool execution results:', toolResults)
        console.log('🔍 Tool result IDs:', toolResults.map(tr => ({ tool_call_id: tr.tool_call_id, hasId: !!tr.tool_call_id })))

        // Track failed tool calls
        toolResults.forEach((result, index) => {
          if (result.content.startsWith('Error')) {
            const toolCall = newToolCalls[index]
            const toolSignature = `${toolCall.function.name}:${toolCall.function.arguments}`
            failedToolCalls.add(toolSignature)
            console.log('🚫 Marking tool call as failed:', toolCall.function.name)
          }
        })

        // Format messages for next iteration
        const { assistantMessage, toolResultMessages } = formatToolMessages(
          fullAssistantResponse,
          newToolCalls,
          toolResults,
          currentPayload.provider || currentPayload.providerMode?.split('-')[0]
        )

        // Update payload for next iteration
        const baseProvider = currentPayload.provider || currentPayload.providerMode?.split('-')[0]

        if (baseProvider === 'anthropic') {
          // Anthropic uses messages array with role-based messages
          currentPayload = {
            ...currentPayload,
            messages: [
              ...currentPayload.messages,
              assistantMessage,
              ...toolResultMessages
            ]
          }
        } else {
          // OpenAI responses API uses input array with function_call_output objects
          // Convert existing messages to input format if needed
          const existingInput = currentPayload.input || currentPayload.messages?.map((m: any) => ({
            role: m.role,
            content: m.content
          })) || []

          console.log('🔍 Existing input length:', existingInput.length)
          console.log('🔍 Tool result messages to add:', toolResultMessages.length)
          console.log('🔍 Tool result messages:', JSON.stringify(toolResultMessages, null, 2))

          // Add assistant response to input
          const newInput = [
            ...existingInput,
            { role: 'assistant', content: fullAssistantResponse }
          ]

          // Add function call outputs directly to input array
          newInput.push(...toolResultMessages)

          console.log('🔍 Final input array length:', newInput.length)
          console.log('🔍 Last few items in input array:', JSON.stringify(newInput.slice(-5), null, 2))

          currentPayload = {
            ...currentPayload,
            input: newInput,
            // Keep messages field for validation, but server will use input for OpenAI
            messages: newInput.filter(item => item.role && item.content)
          }

        }

        console.log('🔄 Prepared next iteration with tool results')
      } else {
        console.log('❌ No completed tool calls found')
        shouldContinue = false
      }
      }

      if (iteration >= maxIterations) {
        console.log('⚠️ Reached maximum tool calling iterations')
      }
    } catch (error) {
      console.error('❌ Error in tool calling orchestration:', error)
    } finally {
      // Always ensure onDone is called, even if there were errors
      console.log('🏁 Tool calling orchestration complete')
      console.log('🔍 onDone callback exists:', !!opts?.onDone)

      try {
        if (opts?.onDone) {
          console.log('▶️ Calling onDone callback...')
          opts.onDone()
          console.log('✅ onDone callback completed')
        }
      } catch (error) {
        console.error('❌ Error in onDone callback:', error)
      }
    }

    return closeFunction || (() => {})
  }

  function formatToolMessages(
    fullResponse: string,
    toolCalls: any[],
    toolResults: any[],
    baseProvider: string
  ) {
    let assistantMessage: any
    let toolResultMessages: any[] = []

    if (baseProvider === 'anthropic') {
      // For Anthropic, assistant message should contain tool_use content blocks
      const content = []

      // Add text content if there is any
      if (fullResponse.trim()) {
        content.push({
          type: 'text',
          text: fullResponse
        })
      }

      // Add tool use blocks
      toolCalls.forEach(toolCall => {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments)
        })
      })

      assistantMessage = {
        role: 'assistant',
        content: content
      }

      // Anthropic format: role "user" with tool_result content blocks
      const toolResultContent = toolResults.map(result => ({
        type: 'tool_result',
        tool_use_id: result.tool_call_id,
        content: result.content
      }))

      toolResultMessages = [{
        role: 'user',
        content: toolResultContent
      }]
    } else {
      // OpenAI responses API format - different from chat completions!
      // For responses API, we need to add function call outputs to the input array
      assistantMessage = {
        role: 'assistant',
        content: fullResponse
      }

      // OpenAI responses API format: need both function_call and function_call_output objects
      const functionCallMessages: any[] = []
      const functionCallOutputMessages: any[] = []

      // Create function_call objects from the tool calls
      toolCalls.forEach(toolCall => {
        functionCallMessages.push({
          id: `fc_${toolCall.id.replace('call_', '')}`, // Convert call_id to fc_ format for id
          call_id: toolCall.id, // Use the actual call_id
          type: 'function_call',
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        })
      })

      // Create function_call_output objects from the tool results
      toolResults.forEach(result => {
        if (!result.tool_call_id) {
          console.error('❌ Missing tool_call_id in result:', result)
          throw new Error(`Missing tool_call_id in tool result: ${JSON.stringify(result)}`)
        }

        functionCallOutputMessages.push({
          type: 'function_call_output',
          call_id: result.tool_call_id,
          output: result.content
        })
      })

      // Combine both function_call and function_call_output messages
      toolResultMessages = [...functionCallMessages, ...functionCallOutputMessages]
    }

    console.log('🔧 Formatted assistant message for', baseProvider, ':', JSON.stringify(assistantMessage, null, 2))
    console.log('🔧 Formatted tool result messages for', baseProvider, ':', JSON.stringify(toolResultMessages, null, 2))

    return { assistantMessage, toolResultMessages }
  }


  async function openChatStream(
    payload: any,
    onText: (t: string) => void,
    onError?: (err: Err) => void,
    opts?: Opts
  ) {
    console.log('💫 Creating chat session...')
    console.log('📋 Session payload:', {
      provider: payload.provider,
      providerMode: payload.providerMode,
      model: payload.model,
      hasTools: !!payload.tools?.length,
      toolCount: payload.tools?.length || 0
    })

    // Store payload on window for debugging
    ;(window as any).lastPayload = payload

    // Log actual tools being sent if they exist
    if (payload.tools?.length > 0) {
      console.log('🔧 Tools being sent to LLM:')
      payload.tools.slice(0, 3).forEach((tool: any, index: number) => {
        console.log(`  ${index + 1}. ${tool.name}:`, tool)
      })
    }

    // 1) create session
    const resp = await fetch('/api/chat/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin'
    })
    if (!resp.ok) {
      const errorText = await resp.text()
      console.error('❌ Session creation failed:', resp.status, errorText)
      throw new Error(errorText)
    }
    const { sid } = await resp.json()
    console.log('✅ Session created:', sid)

    // 2) open EventSource
    const origin = window.location.origin
    const url = `${origin}/api/chat/stream?sid=${encodeURIComponent(sid)}${opts?.debug ? '&debug=1' : ''}`
    console.log('🌊 Opening EventSource stream:', url)
    const es = new EventSource(url)

    const safeDone = () => {
      console.log('🏁 Stream ending - calling onDone and closing EventSource')
      console.log('🔍 onDone callback exists:', !!opts?.onDone)
      try {
        if (opts?.onDone) {
          console.log('▶️ Calling onDone callback...')
          opts.onDone()
          console.log('✅ onDone callback completed')
        }
      } catch (error) {
        console.error('❌ Error in onDone callback:', error)
      } finally {
        console.log('🔒 Closing EventSource')
        es.close()
      }
    }

    es.onmessage = (ev) => {
      try {
        const obj = JSON.parse(ev.data)
        console.log('📨 Received message event:', obj)
        if (typeof obj.text === 'string') {
          console.log('📝 Text content:', obj.text.length > 50 ? obj.text.substring(0, 50) + '...' : obj.text)
          onText(obj.text)
        }
        if (obj.done) {
          console.log('✅ Stream marked as done')
          safeDone()
        }
      } catch (e) {
        console.log('⚠️ Ignoring non-JSON frame:', ev.data)
      }
    }

    es.addEventListener('llm-error', (ev) => {
      console.log('❌ Received llm-error event:', (ev as MessageEvent).data)
      try {
        const obj = JSON.parse((ev as MessageEvent).data)
        onError?.(obj)
      } catch (e) {
        onError?.({ code: 'bad_error_frame', raw: (ev as MessageEvent).data })
      } finally {
        safeDone()
      }
    })

    es.addEventListener('debug', (ev) => {
      console.log('🐛 Received debug event:', (ev as MessageEvent).data)
    })

    es.addEventListener('anthropic-tool-use', (ev) => {
      try {
        const eventData = JSON.parse((ev as MessageEvent).data)
        console.log('🔧 Received anthropic-tool-use event:', eventData)

        // Forward tool use events to the callback if provided
        if (opts?.onToolUseEvent) {
          opts.onToolUseEvent(eventData)
        }
      } catch (e) {
        console.error('❌ Error parsing anthropic-tool-use event:', e)
      }
    })

    es.addEventListener('openai-tool-use', (ev) => {
      try {
        const eventData = JSON.parse((ev as MessageEvent).data)
        console.log('🔧 Received openai-tool-use event:', eventData.type)

        // Forward tool use events to the callback if provided
        if (opts?.onToolUseEvent) {
          opts.onToolUseEvent(eventData)
        }
      } catch (e) {
        console.error('❌ Error parsing openai-tool-use event:', e)
      }
    })

    es.onopen = () => {
      console.log('🔗 EventSource connection opened')
    }

    es.onerror = (ev) => {
      console.error('❌ EventSource error:', ev)
      onError?.({ code: 'transport', message: 'EventSource connection error' })
      safeDone()
    }

    // Return a close function that also signals done
    return () => safeDone()
  }

  return {
    openChatStream,
    openChatStreamWithToolCalling
  }
}

