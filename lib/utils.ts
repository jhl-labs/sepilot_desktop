import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (diffInDays === 1) {
    return '어제';
  } else if (diffInDays < 7) {
    return `${diffInDays}일 전`;
  } else {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) {
    return str;
  }
  return `${str.substring(0, length)}...`;
}

/**
 * 파일이 텍스트 파일인지 확인
 * @param file - File 객체
 * @returns 텍스트 파일 여부
 */
export function isTextFile(file: File): boolean {
  return (
    file.type.startsWith('text/') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.js') ||
    file.name.endsWith('.ts') ||
    file.name.endsWith('.tsx') ||
    file.name.endsWith('.jsx') ||
    file.name.endsWith('.css') ||
    file.name.endsWith('.html') ||
    file.name.endsWith('.xml') ||
    file.name.endsWith('.yaml') ||
    file.name.endsWith('.yml') ||
    file.name.endsWith('.py') ||
    file.name.endsWith('.java') ||
    file.name.endsWith('.c') ||
    file.name.endsWith('.cpp') ||
    file.name.endsWith('.h') ||
    file.name.endsWith('.sh') ||
    file.name.endsWith('.sql') ||
    file.name.endsWith('.csv')
  );
}
