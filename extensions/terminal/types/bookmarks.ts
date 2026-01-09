/**
 * Terminal Bookmarks Types
 *
 * 자주 사용하는 명령어를 북마크하여 빠르게 실행
 */

export interface CommandBookmark {
  id: string;
  name: string; // 북마크 이름 (예: "서버 시작", "테스트 실행")
  command: string; // 실제 명령어
  description?: string; // 설명
  tags?: string[]; // 태그 (예: ["git", "deploy"])
  createdAt: number; // 생성 시각
  lastUsedAt?: number; // 마지막 사용 시각
  usageCount: number; // 사용 횟수
  cwd?: string; // 특정 디렉토리에서 실행해야 하는 경우
}
