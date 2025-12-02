/**
 * NanoBanana (Google Imagen) API Client
 * Google Cloud Imagen API를 사용한 이미지 생성
 */

import type { NanoBananaConfig, NetworkConfig } from '@/types';

export interface NanoBananaGenerateParams {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  numberOfImages?: number;
  seed?: number;
}

export interface NanoBananaUsageInfo {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  imageCount?: number;
}

export interface NanoBananaGenerateResult {
  success: boolean;
  images?: string[]; // base64 encoded images
  error?: string;
  usage?: NanoBananaUsageInfo; // API usage/credit information
}

/**
 * NanoBanana로 이미지 생성 (Main Process에서 실행)
 */
export async function generateWithNanoBanana(
  config: NanoBananaConfig,
  networkConfig: NetworkConfig | null,
  params: NanoBananaGenerateParams
): Promise<NanoBananaGenerateResult> {
  try {
    // Validate config
    if (!config.apiKey) {
      throw new Error('NanoBanana API Key is required');
    }

    // Prepare request payload
    const payload: any = {
      instances: [
        {
          prompt: params.prompt,
        },
      ],
      parameters: {
        sampleCount: params.numberOfImages || config.numberOfImages || 1,
      },
    };

    // Add optional parameters
    if (params.negativePrompt || config.negativePrompt) {
      payload.instances[0].negativePrompt = params.negativePrompt || config.negativePrompt;
    }

    if (params.aspectRatio || config.aspectRatio) {
      payload.parameters.aspectRatio = params.aspectRatio || config.aspectRatio || '1:1';
    }

    if (params.seed !== undefined || config.seed !== undefined) {
      const seedValue = params.seed !== undefined ? params.seed : config.seed;
      if (seedValue && seedValue >= 0) {
        payload.parameters.seed = seedValue;
      }
    }

    // Prepare API endpoint
    const projectId = config.projectId || 'your-project-id';
    const location = config.location || 'us-central1';
    const model = config.model || 'imagen-3.0-generate-001';

    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    };

    // Add custom network headers (if any)
    if (networkConfig?.customHeaders) {
      Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    console.log('[NanoBanana] Generating image with params:', {
      prompt: `${params.prompt.substring(0, 50)}...`,
      numberOfImages: payload.parameters.sampleCount,
      aspectRatio: payload.parameters.aspectRatio,
    });

    // Call Google Imagen API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NanoBanana API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();
    console.log('[NanoBanana] API response received');

    // Extract base64 images from response
    const images: string[] = [];

    if (result.predictions && Array.isArray(result.predictions)) {
      for (const prediction of result.predictions) {
        if (prediction.bytesBase64Encoded) {
          // Google Imagen returns base64 encoded image
          const base64Data = prediction.bytesBase64Encoded;
          const mimeType = prediction.mimeType || 'image/png';
          images.push(`data:${mimeType};base64,${base64Data}`);
        }
      }
    }

    if (images.length === 0) {
      throw new Error('No images generated from NanoBanana API');
    }

    // Extract usage metadata (if available)
    const usage: NanoBananaUsageInfo = {};
    if (result.metadata) {
      // Google Imagen may provide usage info in metadata
      const metadata = result.metadata;
      if (metadata.tokenMetadata) {
        usage.promptTokenCount = metadata.tokenMetadata.inputTokenCount?.totalTokens;
        usage.candidatesTokenCount = metadata.tokenMetadata.outputTokenCount?.totalTokens;
        usage.totalTokenCount = (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
      }
      usage.imageCount = images.length;
    } else {
      // If no metadata, just include image count
      usage.imageCount = images.length;
    }

    console.log(`[NanoBanana] Successfully generated ${images.length} image(s)`);
    if (usage.totalTokenCount) {
      console.log(
        `[NanoBanana] Token usage: ${usage.totalTokenCount} (prompt: ${usage.promptTokenCount}, output: ${usage.candidatesTokenCount})`
      );
    }

    return {
      success: true,
      images,
      usage,
    };
  } catch (error: any) {
    console.error('[NanoBanana] Image generation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate image with NanoBanana',
    };
  }
}
