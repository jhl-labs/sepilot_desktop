/**
 * Skill 관련 타입 정의
 *
 * SEPilot Desktop의 Skills 시스템 타입
 * - Skills: AI 에이전트에 특정 도메인 지식을 주입하는 확장 메커니즘
 * - Claude Desktop의 Skills와 유사하지만 SEPilot에 최적화됨
 */

/**
 * Skill Category
 *
 * 스킬 분류 카테고리
 */
export type SkillCategory =
  | 'web-development'
  | 'mobile-development'
  | 'data-science'
  | 'devops'
  | 'security'
  | 'design'
  | 'writing'
  | 'productivity'
  | 'other';

/**
 * Skill Manifest
 *
 * 스킬의 메타데이터 및 설정
 * Progressive Loading을 위해 앱 시작 시 이 부분만 먼저 로드됨
 */
export interface SkillManifest {
  // 기본 정보
  id: string; // 고유 식별자 (예: 'com.sepilot.react-expert')
  name: string; // 사용자 친화적 이름 (예: 'React Expert')
  version: string; // Semantic versioning (예: '1.0.0')
  author: string; // 작성자 (예: 'SEPilot Team', 'John Doe')
  description: string; // 한 줄 설명 (최대 200자)

  // 카테고리 및 태그
  category: SkillCategory;
  tags: string[]; // 검색 및 필터링용 태그 (최대 10개)

  // 리소스
  icon?: string; // 아이콘 URL 또는 base64 이미지
  readme?: string; // README.md 파일 경로 (상세 설명)

  // 요구사항
  requiredMCPServers?: string[]; // 의존하는 MCP 서버 (예: ['@modelcontextprotocol/server-filesystem'])
  requiredExtensions?: string[]; // 의존하는 Extension (예: ['editor', 'terminal'])
  minAppVersion?: string; // 최소 앱 버전 (예: '0.8.0')

  // 실행 설정
  autoLoad?: boolean; // 앱 시작 시 자동 로드 (기본값: false)
  contextPatterns?: string[]; // 자동 활성화 패턴 (예: ['python 코드', '머신러닝', 'pandas'])
  maxTokens?: number; // 스킬 컨텍스트 최대 토큰 수 (기본값: 제한 없음)
}

/**
 * Knowledge Section
 *
 * 스킬의 지식 섹션 (예: API 레퍼런스, 가이드라인)
 */
export interface SkillKnowledge {
  title: string; // 섹션 제목
  content: string; // Markdown 형식 내용
}

/**
 * Prompt Template
 *
 * 재사용 가능한 프롬프트 템플릿
 */
export interface SkillTemplate {
  id: string; // 템플릿 식별자
  name: string; // 템플릿 이름
  description: string; // 템플릿 설명
  prompt: string; // 프롬프트 템플릿 (변수 지원: {{variable}})
  variables?: SkillTemplateVariable[];
}

/**
 * Template Variable
 *
 * 템플릿 변수 정의
 */
export interface SkillTemplateVariable {
  name: string; // 변수 이름
  description: string; // 변수 설명
  required: boolean; // 필수 여부
  default?: string; // 기본값
}

/**
 * Tool Example
 *
 * MCP 도구 사용 예시
 */
export interface SkillToolExample {
  toolName: string; // MCP 도구 이름
  scenario: string; // 사용 시나리오 설명
  example: string; // 사용 예시 코드/설명
}

/**
 * Workflow
 *
 * 다단계 워크플로우 정의
 */
export interface SkillWorkflow {
  id: string; // 워크플로우 식별자
  name: string; // 워크플로우 이름
  description: string; // 워크플로우 설명
  steps: SkillWorkflowStep[];
}

/**
 * Workflow Step
 *
 * 워크플로우 단계
 */
export interface SkillWorkflowStep {
  action: string; // 단계 설명
  tool?: string; // 사용할 도구 (선택)
  prompt?: string; // 프롬프트 (선택)
}

/**
 * Skill Content
 *
 * 스킬의 실제 컨텐츠 (지식, 프롬프트, 템플릿 등)
 * Lazy Loading: 필요할 때만 로드됨
 */
export interface SkillContent {
  // 시스템 프롬프트
  systemPrompt?: string; // LangGraph Agent에 주입될 시스템 메시지

  // 지식 섹션
  knowledge?: SkillKnowledge[];

  // 프롬프트 템플릿
  templates?: SkillTemplate[];

  // 도구 사용 예시
  toolExamples?: SkillToolExample[];

  // 워크플로우
  workflows?: SkillWorkflow[];
}

/**
 * Resource File
 *
 * 스킬에 포함된 리소스 파일 (예제 코드, 문서 등)
 */
export interface SkillResourceFile {
  path: string; // 파일 경로 (예: 'examples/react-component.tsx')
  content: string; // 파일 내용
  type: 'code' | 'document' | 'data' | 'image';
}

/**
 * Resource Image
 *
 * 스킬에 포함된 이미지 리소스
 */
export interface SkillResourceImage {
  name: string; // 이미지 이름
  base64: string; // Base64 인코딩된 이미지 데이터
  mimeType: string; // MIME 타입 (예: 'image/png')
}

/**
 * Skill Resources
 *
 * 스킬의 추가 리소스 (파일, 이미지 등)
 */
export interface SkillResources {
  files?: SkillResourceFile[];
  images?: SkillResourceImage[];
}

/**
 * Skill Package
 *
 * 전체 스킬 패키지 (manifest + content + resources)
 */
export interface SkillPackage {
  manifest: SkillManifest;
  content: SkillContent;
  resources?: SkillResources;
}

/**
 * Skill Source Type
 *
 * 스킬 설치 소스 타입
 */
export type SkillSourceType = 'github' | 'local' | 'marketplace' | 'builtin';

/**
 * Skill Trust Level
 *
 * 설치 소스의 신뢰 수준
 * - trusted: 앱 내부/검증된 소스
 * - untrusted: 외부/사용자 입력 소스
 */
export type SkillTrustLevel = 'trusted' | 'untrusted';

/**
 * Skill Source
 *
 * 스킬의 설치 소스 정보
 */
export interface SkillSource {
  type: SkillSourceType;
  url?: string; // GitHub URL 또는 마켓플레이스 URL
  repo?: string; // 'owner/repo' 형식 (GitHub)
  branch?: string; // Git branch (기본값: 'main')
  commit?: string; // 특정 커밋 해시 (버전 고정용)
  downloadedAt?: number; // 다운로드 시간 (timestamp)
}

/**
 * Installed Skill
 *
 * 설치된 스킬 정보 (DB에 저장됨)
 */
export interface InstalledSkill {
  id: string; // manifest.id와 동일
  manifest: SkillManifest; // 스킬 메타데이터
  installedAt: number; // 설치 시간 (timestamp)
  enabled: boolean; // 활성화 여부
  source: SkillSource; // 설치 소스
  localPath: string; // 로컬 저장 경로 (userData/skills/[id]/)
  usageCount: number; // 사용 횟수
  lastUsedAt?: number; // 마지막 사용 시간 (timestamp)
}

/**
 * Skill Usage History
 *
 * 스킬 사용 이력
 */
export interface SkillUsageHistory {
  id: number; // Auto increment ID
  skillId: string; // 스킬 ID
  conversationId: string; // 대화 ID
  activatedAt: number; // 활성화 시간 (timestamp)
  contextPattern?: string; // 어떤 패턴으로 활성화되었는지
}

/**
 * Skill Registry Entry
 *
 * 마켓플레이스 레지스트리 항목
 */
export interface SkillRegistryEntry {
  // Manifest 정보 (SkillManifest 확장)
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: SkillCategory;
  tags: string[];
  icon?: string;
  minAppVersion?: string;

  // 레지스트리 추가 정보
  path: string; // GitHub 경로 (예: 'skills/web-development/react-expert')
  downloads: number; // 다운로드 수
  stars: number; // GitHub Stars
  verified: boolean; // SEPilot Team 검증 여부
  changelog?: string; // 변경 이력
  createdAt?: number; // 레지스트리 등록 시간
  updatedAt?: number; // 마지막 업데이트 시간
}

/**
 * Skill Search Filters
 *
 * 스킬 검색 필터
 */
export interface SkillSearchFilters {
  categories?: SkillCategory[]; // 카테고리 필터
  tags?: string[]; // 태그 필터
  verifiedOnly?: boolean; // 검증된 스킬만 표시
  minStars?: number; // 최소 Stars 수
}

/**
 * Skill Update Info
 *
 * 스킬 업데이트 정보
 */
export interface SkillUpdate {
  skillId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  breaking?: boolean; // Breaking change 여부
}

/**
 * Skill Validation Result
 *
 * 스킬 검증 결과
 */
export interface SkillValidationResult {
  valid: boolean; // 검증 통과 여부
  errors: string[]; // 에러 목록
  warnings: string[]; // 경고 목록
  missingDependencies?: {
    // 누락된 의존성
    mcpServers: string[];
    extensions: string[];
  };
}

/**
 * Skill Statistics
 *
 * 스킬 통계 정보
 */
export interface SkillStatistics {
  skillId: string;
  skillName: string;
  usageCount: number;
  lastUsedAt?: number;
  averageActivationScore?: number; // 평균 관련성 점수
  topContextPatterns?: string[]; // 자주 매칭된 패턴
}

/**
 * Context Match Result
 *
 * 컨텍스트 매칭 결과
 */
export interface ContextMatchResult {
  skillId: string;
  score: number; // 관련성 점수 (0.0 ~ 1.0)
  matchedPatterns?: string[]; // 매칭된 contextPatterns
  matchedTags?: string[]; // 매칭된 tags
}

/**
 * Loaded Skill
 *
 * 메모리에 로드된 스킬 (SkillManager 내부 사용)
 */
export interface LoadedSkill {
  skillId: string;
  package: SkillPackage;
  loadedAt: number; // 로드 시간 (timestamp)
}

/**
 * Skill Builder Form Data
 *
 * Skill Builder UI에서 사용하는 폼 데이터
 */
export interface SkillBuilderFormData {
  // Step 1: 기본 정보
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: SkillCategory;
  tags: string[];
  icon?: string;

  // Step 2: 컨텐츠
  systemPrompt?: string;
  knowledge?: SkillKnowledge[];
  templates?: SkillTemplate[];
  toolExamples?: SkillToolExample[];
  workflows?: SkillWorkflow[];

  // Step 3: 리소스
  resources?: SkillResources;

  // Step 4: 설정
  contextPatterns?: string[];
  requiredMCPServers?: string[];
  requiredExtensions?: string[];
  minAppVersion?: string;
  autoLoad?: boolean;
  maxTokens?: number;
}

/**
 * Skill Export Format
 *
 * 스킬 내보내기 형식
 */
export type SkillExportFormat = 'zip' | 'github' | 'directory';

/**
 * Skill Import Options
 *
 * 스킬 가져오기 옵션
 */
export interface SkillImportOptions {
  overwrite?: boolean; // 기존 스킬 덮어쓰기 여부
  enableAfterInstall?: boolean; // 설치 후 자동 활성화
  skipValidation?: boolean; // 검증 건너뛰기 (위험)
}

/**
 * Skill Context Injection Result
 *
 * 스킬 컨텍스트 주입 결과
 */
export interface SkillContextInjectionResult {
  injectedSkills: string[]; // 주입된 스킬 ID 목록
  injectedSkillNames: string[]; // 주입된 스킬 표시 이름 목록
  systemPrompts: string[]; // 주입된 시스템 프롬프트 목록
  totalTokens: number; // 총 토큰 수
  skippedSkills?: string[]; // 토큰 제한으로 건너뛴 스킬
}

/**
 * Skill Manager Config
 *
 * SkillManager 설정
 */
export interface SkillManagerConfig {
  maxConcurrentSkills?: number; // 최대 동시 활성화 스킬 수 (기본값: 3)
  maxTotalTokens?: number; // 최대 총 토큰 수 (기본값: 제한 없음)
  autoUnloadAfter?: number; // 자동 언로드 시간 (밀리초, 기본값: 없음)
  cacheEnabled?: boolean; // 캐싱 활성화 (기본값: true)
}
