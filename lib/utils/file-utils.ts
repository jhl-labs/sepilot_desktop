/**
 * 파일 변환 유틸리티
 */

/**
 * File 객체를 Data URL(base64)로 변환
 * @param file - File 객체
 * @returns Promise<string> - data:image/...;base64,... 형식
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * File 객체를 Base64 문자열로 변환 (data URL prefix 제외)
 * @param file - File 객체
 * @returns Promise<string> - base64 문자열
 */
export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  // data:image/png;base64,... -> ...
  const base64 = dataUrl.split(',')[1];
  return base64 || '';
}

/**
 * Data URL에서 base64 부분만 추출
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  if (!dataUrl.includes(',')) {
    return dataUrl;
  }
  return dataUrl.split(',')[1];
}
