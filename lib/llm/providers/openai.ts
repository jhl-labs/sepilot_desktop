import {
  BaseLLMProvider,
  LLMOptions,
  LLMResponse,
  StreamChunk,
} from '../base';
import { Message } from '@/types';
import { fetchWithConfig, createAuthHeader } from '../http-utils';

// Logger that works in both Electron Main Process and Browser
const log = {
  info: (...args: any[]) => {
    if (typeof process !== 'undefined' && process.versions?.electron) {
      // Electron Main Process
      try {
         
        const { logger } = require('../../../electron/services/logger');
        logger.info(...args);
      } catch {
        console.log(...args);
      }
    } else {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (typeof process !== 'undefined' && process.versions?.electron) {
      try {
         
        const { logger } = require('../../../electron/services/logger');
        logger.warn?.(...args) || logger.info(...args);
      } catch {
        console.warn(...args);
      }
    } else {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (typeof process !== 'undefined' && process.versions?.electron) {
      try {
         
        const { logger } = require('../../../electron/services/logger');
        logger.error(...args);
      } catch {
        console.error(...args);
      }
    } else {
      console.error(...args);
    }
  },
};

export class OpenAIProvider extends BaseLLMProvider {
  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const isElectron = typeof process !== 'undefined' && process.versions?.electron;
    log.info('[OpenAIProvider] chat() called, isElectron:', isElectron, 'baseURL:', this.baseURL);

    const mergedOptions = this.mergeOptions(options);
    const formattedMessages = this.formatMessages(messages);

    try {
      const authHeaders = createAuthHeader(this.config.provider, this.apiKey);

      const requestBody: any = {
        model: this.model,
        messages: formattedMessages,
        temperature: mergedOptions.temperature,
        max_tokens: mergedOptions.maxTokens,
        top_p: mergedOptions.topP,
        stream: false,
      };

      // Add tools if provided
      if (mergedOptions.tools && mergedOptions.tools.length > 0) {
        requestBody.tools = mergedOptions.tools;
        requestBody.tool_choice = 'auto';
      }

      const response = await fetchWithConfig(
        `${this.baseURL}/chat/completions`,
        this.config,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(this.config.customHeaders || {}),
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const error = JSON.parse(errorText);
          throw new Error(
            error.error?.message || `API error: ${response.status}`
          );
        } catch (parseError) {
          throw new Error(`API error: ${response.status} - ${errorText.substring(0, 500)}`);
        }
      }

      // Safe JSON parsing with better error handling
      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // If JSON parsing fails, try to extract the first valid JSON object
        log.error('[OpenAI] JSON parse error, response text (first 500 chars):', responseText.substring(0, 500));

        // Try to find and parse the first complete JSON object
        const firstBraceIndex = responseText.indexOf('{');
        if (firstBraceIndex !== -1) {
          let braceCount = 0;
          let endIndex = -1;

          for (let i = firstBraceIndex; i < responseText.length; i++) {
            if (responseText[i] === '{') {braceCount++;}
            if (responseText[i] === '}') {braceCount--;}
            if (braceCount === 0) {
              endIndex = i + 1;
              break;
            }
          }

          if (endIndex !== -1) {
            const firstJsonStr = responseText.substring(firstBraceIndex, endIndex);
            try {
              data = JSON.parse(firstJsonStr);
              log.warn('[OpenAI] Successfully extracted first JSON object from malformed response');
            } catch (extractError) {
              throw new Error(`unmarshal: invalid character '{' after top-level value (response: ${responseText.substring(0, 200)})`);
            }
          } else {
            throw new Error(`Failed to extract valid JSON from response: ${responseText.substring(0, 200)}`);
          }
        } else {
          throw new Error(`No JSON object found in response: ${responseText.substring(0, 200)}`);
        }
      }

      if (!data || !data.choices || !data.choices[0]) {
        throw new Error(`Invalid API response structure: ${JSON.stringify(data).substring(0, 200)}`);
      }

      const message = data.choices[0].message;

      // Debug logging for autocomplete
      log.info('[OpenAI] Response data:', {
        model: data.model,
        choicesCount: data.choices?.length,
        messageContent: message.content,
        contentLength: message.content?.length || 0,
        hasToolCalls: !!message.tool_calls,
        finishReason: data.choices[0].finish_reason,
      });

      return {
        content: message.content || '',
        model: data.model,
        toolCalls: message.tool_calls,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } catch (error) {
      log.error('OpenAI chat error:', error);
      throw error;
    }
  }

  async *stream(
    messages: Message[],
    options?: LLMOptions
  ): AsyncGenerator<StreamChunk> {
    const isElectron = typeof process !== 'undefined' && process.versions?.electron;
    log.info('[OpenAIProvider] stream() called, isElectron:', isElectron, 'baseURL:', this.baseURL);

    const mergedOptions = this.mergeOptions(options);
    const formattedMessages = this.formatMessages(messages);

    try {
      const authHeaders = createAuthHeader(this.config.provider, this.apiKey);

      const requestBody: any = {
        model: this.model,
        messages: formattedMessages,
        stream: true,
      };

      // Only add optional parameters if they're defined (for Ollama compatibility)
      if (mergedOptions.temperature !== undefined) {
        requestBody.temperature = mergedOptions.temperature;
      }
      if (mergedOptions.maxTokens !== undefined) {
        requestBody.max_tokens = mergedOptions.maxTokens;
      }
      if (mergedOptions.topP !== undefined) {
        requestBody.top_p = mergedOptions.topP;
      }

      // Add tools if provided (for tool calling support)
      if (mergedOptions.tools && mergedOptions.tools.length > 0) {
        requestBody.tools = mergedOptions.tools;
        requestBody.tool_choice = 'auto';
        log.info('[OpenAI] Stream request with tools:', mergedOptions.tools.length);
      }

      const requestUrl = `${this.baseURL}/chat/completions`;

      log.info('[OpenAI] Stream request:', {
        url: requestUrl,
        model: this.model,
        messageCount: formattedMessages.length,
        hasImages: formattedMessages.some((m: any) => Array.isArray(m.content)),
      });

      // Log the full request body for debugging
      const requestBodyStr = JSON.stringify(requestBody);
      log.info('[OpenAI] Request body size:', requestBodyStr.length);
      log.info('[OpenAI] Request parameters:', {
        temperature: requestBody.temperature,
        max_tokens: requestBody.max_tokens,
        stream: requestBody.stream,
        top_p: requestBody.top_p,
      });
      log.info('[OpenAI] Request body (first 1000 chars):', requestBodyStr.substring(0, 1000));

      // Log messages detail
      if (formattedMessages && formattedMessages.length > 0) {
        formattedMessages.forEach((msg: any, idx: number) => {
          if (msg.content && Array.isArray(msg.content)) {
            msg.content.forEach((item: any, itemIdx: number) => {
              if (item.type === 'image_url' && item.image_url) {
                log.info(`[OpenAI] Message ${idx} item ${itemIdx}: image_url with length ${item.image_url.url?.length || 0}`);
              } else if (item.type === 'text') {
                log.info(`[OpenAI] Message ${idx} item ${itemIdx}: text with length ${item.text?.length || 0}`);
              }
            });
          } else {
            log.info(`[OpenAI] Message ${idx}: ${msg.role} with content length ${msg.content?.length || 0}`);
          }
        });
      }

      const response = await fetchWithConfig(
        requestUrl,
        this.config,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(this.config.customHeaders || {}),
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error('[OpenAI] Error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });

        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error?.message || `${response.status} ${response.statusText}: ${errorText}`);
        } catch (parseError) {
          throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Tool calls accumulator (for streaming tool calls)
      const toolCallsAccumulator: Map<number, any> = new Map();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Convert accumulated tool calls to array
          const toolCalls = toolCallsAccumulator.size > 0
            ? Array.from(toolCallsAccumulator.values()).map((tc: any) => ({
                id: tc.id,
                type: tc.type || 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              }))
            : undefined;

          yield { content: '', done: true, toolCalls };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {continue;}

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);

            // Skip empty data
            if (!jsonStr || jsonStr === '{}') {
              continue;
            }

            try {
              const data = JSON.parse(jsonStr);
              const delta = data.choices?.[0]?.delta;

              // Handle content chunks
              const content = delta?.content;
              if (content) {
                yield { content, done: false };
              }

              // Handle tool_calls delta (OpenAI streaming format)
              const toolCallsDeltas = delta?.tool_calls;
              if (toolCallsDeltas && Array.isArray(toolCallsDeltas)) {
                for (const tcDelta of toolCallsDeltas) {
                  const index = tcDelta.index;
                  if (index === undefined) {continue;}

                  // Get or create tool call accumulator for this index
                  let toolCall = toolCallsAccumulator.get(index);
                  if (!toolCall) {
                    toolCall = {
                      id: tcDelta.id || '',
                      type: tcDelta.type || 'function',
                      function: {
                        name: '',
                        arguments: '',
                      },
                    };
                    toolCallsAccumulator.set(index, toolCall);
                  }

                  // Accumulate delta fields
                  if (tcDelta.id) {
                    toolCall.id = tcDelta.id;
                  }
                  if (tcDelta.type) {
                    toolCall.type = tcDelta.type;
                  }
                  if (tcDelta.function?.name) {
                    toolCall.function.name += tcDelta.function.name;
                  }
                  if (tcDelta.function?.arguments) {
                    toolCall.function.arguments += tcDelta.function.arguments;
                  }
                }
              }
            } catch (e) {
              log.error('Failed to parse SSE data:', e, 'Raw line:', trimmed);
            }
          }
        }
      }
    } catch (error) {
      log.error('OpenAI stream error:', error);
      throw error;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const authHeaders = createAuthHeader(this.config.provider, this.apiKey);

      const response = await fetchWithConfig(
        `${this.baseURL}/models`,
        this.config,
        {
          headers: authHeaders,
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data.data.map((model: any) => model.id);
    } catch (error) {
      log.error('Failed to fetch models:', error);
      return [];
    }
  }

  async validate(): Promise<boolean> {
    try {
      const authHeaders = createAuthHeader(this.config.provider, this.apiKey);

      const response = await fetchWithConfig(
        `${this.baseURL}/models`,
        this.config,
        {
          headers: authHeaders,
        }
      );

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
