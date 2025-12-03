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
  const provider = config.provider || 'nanobananaapi'; // Default to nanobananaapi.ai

  if (provider === 'nanobananaapi') {
    return generateWithNanoBananaAPI(config, networkConfig, params);
  } else {
    return generateWithVertexAI(config, networkConfig, params);
  }
}

/**
 * NanoBananaAPI.ai를 사용한 이미지 생성
 */
async function generateWithNanoBananaAPI(
  config: NanoBananaConfig,
  networkConfig: NetworkConfig | null,
  params: NanoBananaGenerateParams
): Promise<NanoBananaGenerateResult> {
  try {
    // Validate config
    if (!config.apiKey) {
      throw new Error('NanoBanana API Key is required');
    }

    const numberOfImages = params.numberOfImages || config.numberOfImages || 1;

    // Prepare request payload for nanobananaapi.ai
    const payload: any = {
      prompt: params.prompt,
      type: 'TEXTTOIAMGE', // Their API uses this typo
      numImages: numberOfImages,
    };

    // NanoBananaAPI.ai doesn't support all parameters, only basic ones
    const endpoint = 'https://api.nanobananaapi.ai/api/v1/nanobanana/generate';

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

    console.log('[NanoBanana] Generating image with nanobananaapi.ai:', {
      prompt: `${params.prompt.substring(0, 50)}...`,
      numberOfImages,
    });

    // Call NanoBananaAPI.ai
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
    console.log('[NanoBanana] Initial response:', result);

    // NanoBananaAPI.ai returns a taskId, need to poll for results
    if (!result.taskId) {
      throw new Error('No taskId returned from NanoBanana API');
    }

    // Poll for results
    const images = await pollForResults(config, networkConfig, result.taskId);

    console.log(`[NanoBanana] Successfully generated ${images.length} image(s)`);

    return {
      success: true,
      images,
      usage: {
        imageCount: images.length,
      },
    };
  } catch (error: any) {
    console.error('[NanoBanana] Image generation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate image with NanoBanana',
    };
  }
}

/**
 * Poll for task results from nanobananaapi.ai
 */
async function pollForResults(
  config: NanoBananaConfig,
  networkConfig: NetworkConfig | null,
  taskId: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<string[]> {
  const endpoint = `https://api.nanobananaapi.ai/api/v1/nanobanana/record-info?taskId=${taskId}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (networkConfig?.customHeaders) {
    Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    console.log(`[NanoBanana] Polling attempt ${attempt + 1}/${maxAttempts}`);

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to poll task status: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();

    // Check task status
    if (result.status === 'completed' || result.status === 'success') {
      // Extract image URLs and convert to data URLs
      const images: string[] = [];

      if (result.images && Array.isArray(result.images)) {
        for (const imageUrl of result.images) {
          // Download image and convert to base64
          const imageData = await downloadImageAsBase64(imageUrl, networkConfig);
          images.push(imageData);
        }
      } else if (result.imageUrl) {
        const imageData = await downloadImageAsBase64(result.imageUrl, networkConfig);
        images.push(imageData);
      }

      return images;
    } else if (result.status === 'failed' || result.status === 'error') {
      throw new Error(`Image generation failed: ${result.error || 'Unknown error'}`);
    }

    // Continue polling if status is 'pending' or 'processing'
  }

  throw new Error('Image generation timed out');
}

/**
 * Download image from URL and convert to base64 data URL
 */
async function downloadImageAsBase64(
  url: string,
  networkConfig: NetworkConfig | null
): Promise<string> {
  const headers: Record<string, string> = {};

  if (networkConfig?.customHeaders) {
    Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  // Determine MIME type from response headers or default to PNG
  const contentType = response.headers.get('content-type') || 'image/png';

  return `data:${contentType};base64,${base64}`;
}

/**
 * Google Vertex AI를 사용한 이미지 생성
 */
async function generateWithVertexAI(
  config: NanoBananaConfig,
  networkConfig: NetworkConfig | null,
  params: NanoBananaGenerateParams
): Promise<NanoBananaGenerateResult> {
  try {
    // Validate config
    if (!config.apiKey) {
      throw new Error('Google Cloud API Key is required');
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

    console.log('[NanoBanana] Generating image with Vertex AI:', {
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
        `Google Vertex AI error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const result = await response.json();
    console.log('[NanoBanana] Vertex AI response received');

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
      throw new Error('No images generated from Vertex AI');
    }

    // Extract usage metadata (if available)
    const usage: NanoBananaUsageInfo = {};
    if (result.metadata) {
      const metadata = result.metadata;
      if (metadata.tokenMetadata) {
        usage.promptTokenCount = metadata.tokenMetadata.inputTokenCount?.totalTokens;
        usage.candidatesTokenCount = metadata.tokenMetadata.outputTokenCount?.totalTokens;
        usage.totalTokenCount = (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
      }
      usage.imageCount = images.length;
    } else {
      usage.imageCount = images.length;
    }

    console.log(`[NanoBanana] Successfully generated ${images.length} image(s) with Vertex AI`);
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
    console.error('[NanoBanana] Vertex AI generation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate image with Vertex AI',
    };
  }
}
