import { getComfyUIClient, initializeComfyUIClient } from '@/lib/comfyui/client';
import { generateWithNanoBanana } from '@/lib/imagegen/nanobanana-client';
import type { PresentationSlide } from '@/types/presentation';
import type { ComfyUIConfig, ImageGenConfig, NanoBananaConfig, NetworkConfig } from '@/types';

function loadComfyConfig(): ComfyUIConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem('sepilot_comfyui_config');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ComfyUIConfig;
  } catch (error) {
    console.error('[presentation:image] Failed to parse comfy config', error);
    return null;
  }
}

function loadImageGenConfig(): ImageGenConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem('sepilot_imagegen_config');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ImageGenConfig;
  } catch (error) {
    console.error('[presentation:image] Failed to parse imagegen config', error);
    return null;
  }
}

function loadNetworkConfig(): NetworkConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem('sepilot_network_config');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as NetworkConfig;
  } catch (error) {
    console.error('[presentation:image] Failed to parse network config', error);
    return null;
  }
}

function ensureComfyClient(): boolean {
  let client = getComfyUIClient();
  if (client) {
    return true;
  }
  const cfg = loadComfyConfig();
  if (cfg && cfg.enabled) {
    initializeComfyUIClient(cfg);
    client = getComfyUIClient();
  }
  return !!client;
}

export interface SlideImageGenOptions {
  width?: number;
  height?: number;
  styleHint?: string;
  negativeHint?: string;
}

export interface SlideImageGenResult {
  updatedSlides: PresentationSlide[];
  errors: string[];
}

export async function generateImagesForSlides(
  slides: PresentationSlide[],
  options: SlideImageGenOptions = {},
  onProgress?: (message: string) => void
): Promise<SlideImageGenResult> {
  const imageGenConfig = loadImageGenConfig();
  const networkConfig = loadNetworkConfig();

  const useComfy =
    imageGenConfig?.provider === 'comfyui' &&
    imageGenConfig.comfyui?.enabled &&
    !!imageGenConfig.comfyui.httpUrl;
  const useNano =
    imageGenConfig?.provider === 'nanobanana' &&
    imageGenConfig.nanobanana?.enabled &&
    !!imageGenConfig.nanobanana.apiKey;

  let comfyClientAvailable = false;
  if (useComfy) {
    comfyClientAvailable = ensureComfyClient();
  }

  if (!useComfy && !useNano) {
    return {
      updatedSlides: slides,
      errors: ['활성화된 이미지 생성 프로바이더가 없습니다 (ComfyUI 또는 NanoBanana 설정 필요).'],
    };
  }

  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const errors: string[] = [];
  const updated: PresentationSlide[] = [];

  for (const slide of slides) {
    if ((slide.imageUrl && slide.imageUrl.length > 0) || !slide.imagePrompt) {
      updated.push(slide);
      continue;
    }

    const styleHint =
      options.styleHint ||
      'slide-ready, clean layout, cinematic lighting, sharp focus, typography-safe, no text artifacts, 16:9 composition, center framing';
    const negativePrompt =
      options.negativeHint ||
      'text, watermark, logo, lowres, blurry, distorted hands, cropped, frame, noisy, artifacts';
    const composedPrompt = `${slide.imagePrompt} | ${styleHint} | aspect ratio 16:9 | cohesive color grading`;

    onProgress?.(`"${slide.title}" 슬라이드용 이미지를 생성 중...`);

    if (useComfy && comfyClientAvailable) {
      const comfy = getComfyUIClient();
      if (!comfy) {
        errors.push('ComfyUI 클라이언트를 가져올 수 없습니다.');
        updated.push(slide);
        continue;
      }
      const result = await comfy.generateImage({
        prompt: composedPrompt,
        width,
        height,
        cfgScale: 7,
        steps: 30,
        negativePrompt,
        onProgress: (p) => {
          if (p.status === 'executing' && p.progress !== undefined) {
            onProgress?.(`"${slide.title}" ${Math.round(p.progress)}% 진행 중...`);
          }
        },
      });

      if (result.success && result.imageBase64) {
        updated.push({
          ...slide,
          imageData: `data:image/png;base64,${result.imageBase64}`,
        });
        continue;
      }

      errors.push(result.error || 'ComfyUI 이미지 생성 실패');
    }

    if (useNano && imageGenConfig?.nanobanana) {
      try {
        const nanoConfig: NanoBananaConfig = imageGenConfig.nanobanana;
        const nanoResult = await generateWithNanoBanana(nanoConfig, networkConfig, {
          prompt: `${slide.imagePrompt} | ${styleHint} | aspect ratio 16:9 | cohesive color grading`,
          negativePrompt: nanoConfig.negativePrompt || negativePrompt,
          aspectRatio: '16:9',
          numberOfImages: 1,
        });

        if (nanoResult.success && nanoResult.images && nanoResult.images.length > 0) {
          updated.push({
            ...slide,
            imageData: `data:image/png;base64,${nanoResult.images[0]}`,
          });
          continue;
        }

        errors.push(nanoResult.error || 'NanoBanana 이미지 생성 실패');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'NanoBanana 이미지 생성 중 오류';
        errors.push(errorMessage);
      }
    }

    // 실패 시 기존 슬라이드 유지
    updated.push(slide);
  }

  return { updatedSlides: updated, errors };
}
