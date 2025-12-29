import { BaseLLMProvider, LLMOptions, LLMResponse, StreamChunk } from '../base';
import { Message } from '@/types';
import { fetchWithConfig } from '../http-utils';
import { safeJsonParse } from '@/lib/http';

import { logger } from '@/lib/utils/logger';
/**
 * Ollama Native API Provider
 * Supports vision models with base64 images
 */
export class OllamaProvider extends BaseLLMProvider {
  async chat(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const mergedOptions = this.mergeOptions(options);

    try {
      const response = await fetchWithConfig(`${this.baseURL}/api/chat`, this.config, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.formatMessagesForOllama(messages),
          stream: false,
          options: {
            temperature: mergedOptions.temperature,
            num_predict: mergedOptions.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      const data = await safeJsonParse<{ message?: { content: string }; model: string }>(
        response,
        `${this.baseURL}/api/chat`
      );

      return {
        content: data.message?.content || '',
        model: data.model || this.model,
      };
    } catch (error) {
      console.error('Ollama chat error:', error);
      throw error;
    }
  }

  async *stream(messages: Message[], options?: LLMOptions): AsyncGenerator<StreamChunk> {
    const mergedOptions = this.mergeOptions(options);

    try {
      const response = await fetchWithConfig(`${this.baseURL}/api/chat`, this.config, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: this.formatMessagesForOllama(messages),
          stream: true,
          options: {
            temperature: mergedOptions.temperature,
            num_predict: mergedOptions.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { content: '', done: true };
          break;
        }

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.message?.content) {
              yield { content: data.message.content, done: false };
            }

            if (data.done) {
              yield { content: '', done: true };
              return;
            }
          } catch (e) {
            console.error('Failed to parse Ollama stream data:', e);
          }
        }
      }
    } catch (error) {
      console.error('Ollama stream error:', error);
      throw error;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetchWithConfig(`${this.baseURL}/api/tags`, this.config);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await safeJsonParse<{ models?: Array<{ name: string }> }>(
        response,
        `${this.baseURL}/api/tags`
      );
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      return [];
    }
  }

  async validate(): Promise<boolean> {
    try {
      const response = await fetchWithConfig(`${this.baseURL}/api/tags`, this.config);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Format messages for Ollama native API
   * Images are included as base64 strings in the images array
   */
  private formatMessagesForOllama(messages: Message[]): any[] {
    return messages.map((msg) => {
      if (msg.images && msg.images.length > 0) {
        // Extract pure base64 from data URLs
        const imageBase64Strings = msg.images.map((image) => {
          const base64 = image.base64 || '';
          // Remove data:image/...;base64, prefix
          return base64.includes('base64,') ? base64.split('base64,')[1] : base64;
        });

        logger.info('[Ollama] Formatting message with images:', {
          role: msg.role,
          content: msg.content.substring(0, 50),
          imageCount: imageBase64Strings.length,
        });

        return {
          role: msg.role,
          content: msg.content,
          images: imageBase64Strings,
        };
      }

      return {
        role: msg.role,
        content: msg.content,
      };
    });
  }
}
