import { ComfyUIConfig } from '@/types';

export interface ComfyUIGenerateOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  onProgress?: (progress: ComfyUIProgress) => void;
}

export interface ComfyUIProgress {
  status: 'queued' | 'executing' | 'completed' | 'error';
  message: string;
  progress?: number; // 0-100
  currentStep?: number;
  totalSteps?: number;
}

export interface ComfyUIGenerateResult {
  success: boolean;
  imageUrl?: string;
  imageBase64?: string;
  error?: string;
}

export class ComfyUIClient {
  private config: ComfyUIConfig;
  private clientId: string;

  constructor(config: ComfyUIConfig) {
    this.config = config;
    this.clientId = config.clientId || this.generateClientId();
  }

  private generateClientId(): string {
    return `sepilot-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * 이미지 생성
   */
  async generateImage(options: ComfyUIGenerateOptions): Promise<ComfyUIGenerateResult> {
    try {
      if (!this.config.enabled) {
        throw new Error('ComfyUI is not enabled');
      }

      // 진행 상황 알림: 대기 중
      options.onProgress?.({
        status: 'queued',
        message: '🎨 이미지 생성 요청을 대기열에 추가하는 중...',
        progress: 0,
      });

      // ComfyUI workflow 구성
      const workflow = this.buildWorkflow(options);

      // Network Config 가져오기
      const networkConfigStr = typeof localStorage !== 'undefined'
        ? localStorage.getItem('sepilot_network_config')
        : null;
      const networkConfig = networkConfigStr ? JSON.parse(networkConfigStr) : null;

      // Electron 환경: IPC를 통해 Main Process에서 호출
      if (typeof window !== 'undefined' && (window as any).electronAPI?.comfyui) {
        const queueResult = await (window as any).electronAPI.comfyui.queuePrompt(
          this.config.httpUrl,
          workflow,
          this.clientId,
          this.config.apiKey,
          networkConfig
        );

        if (!queueResult.success || !queueResult.data) {
          throw new Error(queueResult.error || 'Failed to queue prompt');
        }

        const promptId = queueResult.data.prompt_id;

        // 진행 상황 알림: 실행 중
        options.onProgress?.({
          status: 'executing',
          message: '🖼️ 이미지를 생성하고 있습니다...',
          progress: 20,
        });

        // WebSocket으로 진행 상황 모니터링
        const imageData = await this.waitForCompletion(promptId, networkConfig, options.onProgress);

        // 진행 상황 알림: 완료
        options.onProgress?.({
          status: 'completed',
          message: '✅ 이미지 생성 완료!',
          progress: 100,
        });

        return {
          success: true,
          imageBase64: imageData,
        };
      } else {
        // 브라우저 환경 (fallback): 직접 fetch
        console.warn('[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied');
        const queueResponse = await fetch(`${this.config.httpUrl}/prompt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: workflow,
            client_id: this.clientId,
          }),
        });

        if (!queueResponse.ok) {
          throw new Error(`Failed to queue prompt: ${queueResponse.statusText}`);
        }

        const queueResult = await queueResponse.json();
        const promptId = queueResult.prompt_id;

        // WebSocket으로 진행 상황 모니터링
        const imageData = await this.waitForCompletion(promptId, networkConfig);

        return {
          success: true,
          imageBase64: imageData,
        };
      }
    } catch (error: any) {
      console.error('ComfyUI generation error:', error);
      return {
        success: false,
        error: error.message || 'Image generation failed',
      };
    }
  }

  /**
   * Workflow 구성
   */
  private buildWorkflow(options: ComfyUIGenerateOptions): Record<string, any> {
    // Seed 값 처리: -1이면 랜덤 생성, 아니면 0 이상으로 보정
    let seedValue = options.seed ?? this.config.seed ?? -1;
    if (seedValue < 0) {
      seedValue = Math.floor(Math.random() * 4294967295); // ComfyUI seed 최대값
    }

    // Qwen Image 모델 워크플로우
    return {
      '60': {
        inputs: {
          filename_prefix: 'sepilot_qwen',
          images: ['75:8', 0],
        },
        class_type: 'SaveImage',
        _meta: {
          title: '이미지 저장',
        },
      },
      '75:58': {
        inputs: {
          width: options.width || 1328,
          height: options.height || 1328,
          batch_size: 1,
        },
        class_type: 'EmptySD3LatentImage',
        _meta: {
          title: '빈 잠재 이미지 (SD3)',
        },
      },
      '75:7': {
        inputs: {
          text: options.negativePrompt || this.config.negativePrompt || '',
          clip: ['75:38', 0],
        },
        class_type: 'CLIPTextEncode',
        _meta: {
          title: 'CLIP Text Encode (Negative Prompt)',
        },
      },
      '75:66': {
        inputs: {
          shift: 3.1,
          model: ['75:73', 0],
        },
        class_type: 'ModelSamplingAuraFlow',
        _meta: {
          title: '모델 샘플링 (AuraFlow)',
        },
      },
      '75:8': {
        inputs: {
          samples: ['75:3', 0],
          vae: ['75:39', 0],
        },
        class_type: 'VAEDecode',
        _meta: {
          title: 'VAE 디코드',
        },
      },
      '75:37': {
        inputs: {
          unet_name: 'qwen_image_fp8_e4m3fn.safetensors',
          weight_dtype: 'default',
        },
        class_type: 'UNETLoader',
        _meta: {
          title: '확산 모델 로드',
        },
      },
      '75:6': {
        inputs: {
          text: options.prompt,
          clip: ['75:38', 0],
        },
        class_type: 'CLIPTextEncode',
        _meta: {
          title: 'CLIP Text Encode (Positive Prompt)',
        },
      },
      '75:38': {
        inputs: {
          clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
          type: 'qwen_image',
          device: 'default',
        },
        class_type: 'CLIPLoader',
        _meta: {
          title: 'CLIP 로드',
        },
      },
      '75:39': {
        inputs: {
          vae_name: 'qwen_image_vae.safetensors',
        },
        class_type: 'VAELoader',
        _meta: {
          title: 'VAE 로드',
        },
      },
      '75:3': {
        inputs: {
          seed: seedValue,
          steps: options.steps || this.config.steps || 4,
          cfg: options.cfgScale || this.config.cfgScale || 1,
          sampler_name: 'euler',
          scheduler: 'simple',
          denoise: 1,
          model: ['75:66', 0],
          positive: ['75:6', 0],
          negative: ['75:7', 0],
          latent_image: ['75:58', 0],
        },
        class_type: 'KSampler',
        _meta: {
          title: 'KSampler',
        },
      },
      '75:73': {
        inputs: {
          lora_name: 'Qwen-Image-Lightning-4steps-V1.0.safetensors',
          strength_model: 1,
          model: ['75:37', 0],
        },
        class_type: 'LoraLoaderModelOnly',
        _meta: {
          title: 'LoRA 로드 (모델 전용)',
        },
      },
    };
  }

  /**
   * WebSocket으로 완료 대기
   */
  private async waitForCompletion(
    promptId: string,
    networkConfig: any,
    onProgress?: (progress: ComfyUIProgress) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.config.wsUrl}?clientId=${this.clientId}`);
      let currentStep = 0;
      const totalSteps = this.config.steps || 4;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Image generation timeout (60s)'));
      }, 60000);

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        // 진행 상황 업데이트
        if (data.type === 'progress' && data.data.prompt_id === promptId) {
          currentStep = data.data.value || currentStep;
          const maxSteps = data.data.max || totalSteps;
          const progress = 20 + Math.floor((currentStep / maxSteps) * 70); // 20-90%

          onProgress?.({
            status: 'executing',
            message: `🎨 이미지 생성 중... (${currentStep}/${maxSteps} 단계)`,
            progress,
            currentStep,
            totalSteps: maxSteps,
          });
        }

        // 실행 중 알림
        if (data.type === 'executing' && data.data.prompt_id === promptId) {
          onProgress?.({
            status: 'executing',
            message: '⚙️ 워크플로우를 실행하고 있습니다...',
            progress: 30,
          });
        }

        // 실행 완료 확인
        if (data.type === 'executed' && data.data.prompt_id === promptId) {
          clearTimeout(timeout);

          onProgress?.({
            status: 'executing',
            message: '📥 생성된 이미지를 다운로드하는 중...',
            progress: 90,
          });

          try {
            // 이미지 가져오기
            const imageData = await this.fetchGeneratedImage(data.data.output, networkConfig);
            ws.close();
            resolve(imageData);
          } catch (error: any) {
            ws.close();
            reject(error);
          }
        }

        // 에러 처리
        if (data.type === 'execution_error' && data.data.prompt_id === promptId) {
          clearTimeout(timeout);
          ws.close();
          onProgress?.({
            status: 'error',
            message: '❌ 이미지 생성 중 오류 발생',
            progress: 0,
          });
          reject(new Error(`Execution error: ${JSON.stringify(data.data)}`));
        }
      };

      ws.onerror = (_error) => {
        clearTimeout(timeout);
        onProgress?.({
          status: 'error',
          message: '❌ WebSocket 연결 오류',
          progress: 0,
        });
        reject(new Error('WebSocket connection error'));
      };

      ws.onclose = () => {
        clearTimeout(timeout);
      };
    });
  }

  /**
   * 생성된 이미지 가져오기
   */
  private async fetchGeneratedImage(output: any, networkConfig: any): Promise<string> {
    // ComfyUI 출력에서 이미지 정보 추출
    // 실제 구조에 맞게 조정 필요
    const images = output?.images || [];
    if (images.length === 0) {
      throw new Error('No images in output');
    }

    const imageInfo = images[0];

    // Electron 환경: IPC를 통해 Main Process에서 호출
    if (typeof window !== 'undefined' && (window as any).electronAPI?.comfyui) {
      const result = await (window as any).electronAPI.comfyui.fetchImage(
        this.config.httpUrl,
        imageInfo.filename,
        imageInfo.subfolder || '',
        imageInfo.type || 'output',
        this.config.apiKey,
        networkConfig
      );

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch generated image');
      }

      return result.data;
    } else {
      // 브라우저 환경 (fallback): 직접 fetch
      console.warn('[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied');
      const imageUrl = `${this.config.httpUrl}/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch generated image');
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to convert image to base64'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.httpUrl}/system_stats`);
      return response.ok;
    } catch (_error) {
      return false;
    }
  }
}

// Singleton instance
let comfyUIClient: ComfyUIClient | null = null;

export function getComfyUIClient(): ComfyUIClient | null {
  return comfyUIClient;
}

export function initializeComfyUIClient(config: ComfyUIConfig): void {
  if (config.enabled) {
    comfyUIClient = new ComfyUIClient(config);
  } else {
    comfyUIClient = null;
  }
}

export function isComfyUIEnabled(): boolean {
  return comfyUIClient !== null;
}
