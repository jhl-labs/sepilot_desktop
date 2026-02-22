/**
 * 설정 관련 타입 정의
 *
 * Extension에서 사용하는 네트워크 설정, 언어 설정, 이미지 생성 설정 등
 */

/**
 * 네트워크 설정
 */
export interface NetworkConfig {
  proxy?: {
    enabled: boolean;
    mode: 'manual' | 'none';
    url?: string;
  };
  ssl?: {
    verify: boolean;
  };
  customHeaders?: Record<string, string>;
}

/**
 * 지원 언어
 */
export type SupportedLanguage = 'ko' | 'en' | 'zh';

/**
 * ComfyUI 설정
 */
export interface ComfyUIConfig {
  enabled: boolean;
  httpUrl: string;
  wsUrl: string;
  workflowId: string;
  clientId?: string;
  apiKey?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

/**
 * NanoBanana (Google Imagen) 설정
 */
export interface NanoBananaConfig {
  enabled: boolean;
  provider?: 'nanobananaapi' | 'vertex-ai';
  apiKey: string;
  projectId?: string;
  location?: string;
  model?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  numberOfImages?: number;
  seed?: number;
  outputMimeType?: 'image/png' | 'image/jpeg';
  compressionQuality?: number;
  askOptionsOnGenerate?: boolean;
}

/**
 * 통합 이미지 생성 설정
 */
export interface ImageGenConfig {
  provider: 'comfyui' | 'nanobanana';
  comfyui?: ComfyUIConfig;
  nanobanana?: NanoBananaConfig;
}
