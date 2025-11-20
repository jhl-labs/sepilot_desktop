import { Message, LLMConfig } from '@/types';

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  tools?: LLMTool[];
}

export interface LLMResponse {
  content: string;
  model: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export abstract class BaseLLMProvider {
  protected baseURL: string;
  protected apiKey: string;
  protected model: string;
  protected defaultOptions: LLMOptions;
  protected config: LLMConfig;

  constructor(
    baseURL: string,
    apiKey: string,
    model: string,
    defaultOptions: LLMOptions = {},
    config?: LLMConfig
  ) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.model = model;
    this.defaultOptions = {
      temperature: 0.7,
      maxTokens: 2000,
      stream: false,
      ...defaultOptions,
    };

    // Store full config for network settings
    this.config = config || {
      provider: 'openai',
      baseURL,
      apiKey,
      model,
      temperature: defaultOptions.temperature || 0.7,
      maxTokens: defaultOptions.maxTokens || 2000,
    };
  }

  /**
   * Send messages and get a complete response
   */
  abstract chat(
    messages: Message[],
    options?: LLMOptions
  ): Promise<LLMResponse>;

  /**
   * Send messages and stream the response
   */
  abstract stream(
    messages: Message[],
    options?: LLMOptions
  ): AsyncGenerator<StreamChunk>;

  /**
   * Get available models
   */
  abstract getModels(): Promise<string[]>;

  /**
   * Validate API key and configuration
   */
  abstract validate(): Promise<boolean>;

  /**
   * Format messages for the API
   */
  protected formatMessages(messages: Message[]): any[] {
    return messages.map((msg) => {
      // Handle tool messages with tool_call_id (OpenAI API requirement)
      if (msg.role === 'tool') {
        const toolMsg: any = {
          role: 'tool',
          content: msg.content,
        };

        // tool_call_id is required for tool messages
        if (msg.tool_call_id) {
          toolMsg.tool_call_id = msg.tool_call_id;
        }

        // name is optional but recommended
        if (msg.name) {
          toolMsg.name = msg.name;
        }

        return toolMsg;
      }

      // Handle assistant messages with tool_calls
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || null, // Can be null when only tool calls
          tool_calls: msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: tc.type || 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string'
                ? tc.arguments
                : JSON.stringify(tc.arguments),
            },
          })),
        };
      }

      // If message has images, format content as OpenAI Vision API format
      if (msg.images && msg.images.length > 0) {
        const content: any[] = [];

        // Add text content if present
        if (msg.content) {
          content.push({
            type: 'text',
            text: msg.content,
          });
        }

        // Add all images in OpenAI format
        for (const image of msg.images) {
          const base64 = image.base64 || '';

          console.log('[LLM] Image for OpenAI format:', {
            filename: image.filename,
            mimeType: image.mimeType,
            hasDataPrefix: base64.startsWith('data:'),
            length: base64.length,
            preview: base64.substring(0, 60) + '...'
          });

          content.push({
            type: 'image_url',
            image_url: {
              url: base64,
              // Note: 'detail' field removed for Ollama compatibility
            },
          });
        }

        const formattedMsg = {
          role: msg.role,
          content,
        };

        console.log('[LLM] Formatted OpenAI Vision message:', JSON.stringify(formattedMsg).substring(0, 300) + '...');
        return formattedMsg;
      }

      // Otherwise, use simple text content
      return {
        role: msg.role,
        content: msg.content,
      };
    });
  }

  /**
   * Merge options with defaults
   */
  protected mergeOptions(options?: LLMOptions): LLMOptions {
    return {
      ...this.defaultOptions,
      ...options,
    };
  }
}
