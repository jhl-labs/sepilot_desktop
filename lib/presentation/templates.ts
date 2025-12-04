/**
 * 프레젠테이션 템플릿 시스템
 * - 엔터프라이즈 레벨의 고도화된 디자인
 * - 완성된 프레젠테이션을 즉시 제공
 */

import type {
  PresentationAgentState,
  PresentationBrief,
  PresentationDesignMaster,
  PresentationStructure,
  PresentationSlide,
} from '@/types/presentation';

/**
 * 엔터프라이즈 디자인 시스템
 * - 전문적이고 세련된 색상 팔레트
 * - 최신 타이포그래피
 * - 균형잡힌 레이아웃
 */
const ENTERPRISE_DESIGNS = {
  // 자기소개: 따뜻하고 친근한 프로페셔널
  profile: {
    name: 'Professional Warmth',
    vibe: 'warm professional modern',
    palette: {
      primary: '#2563eb', // 신뢰감 있는 블루
      secondary: '#7c3aed',
      accent: '#06b6d4', // 생동감 있는 시안
      background: '#ffffff',
      text: '#1e293b',
    },
    fonts: {
      title: 'Inter Bold',
      body: 'Inter Regular',
      titleSize: 'large' as const,
    },
    layoutPreferences: {
      preferredLayouts: ['hero', 'two-column', 'stats', 'timeline'],
      imageStyle: 'balanced' as const,
    },
  },

  // 기술 세미나: 혁신적이고 테크니컬한 느낌
  techSeminar: {
    name: 'Tech Innovation',
    vibe: 'dark tech modern bold',
    palette: {
      primary: '#8b5cf6', // 혁신적인 바이올렛
      secondary: '#ec4899',
      accent: '#06b6d4', // 하이테크 시안
      background: '#0f172a', // 다크 네이비
      text: '#f8fafc',
    },
    fonts: {
      title: 'Space Grotesk Bold',
      body: 'Inter Regular',
      titleSize: 'xl' as const,
    },
    layoutPreferences: {
      preferredLayouts: ['hero', 'two-column', 'grid', 'stats'],
      imageStyle: 'minimal' as const,
    },
  },

  // 논문 요약: 학구적이고 명료한 디자인
  paperSummary: {
    name: 'Academic Clarity',
    vibe: 'minimal clean academic',
    palette: {
      primary: '#1e40af', // 진지한 다크 블루
      secondary: '#0891b2',
      accent: '#059669', // 강조용 그린
      background: '#f8fafc', // 부드러운 화이트
      text: '#0f172a',
    },
    fonts: {
      title: 'Merriweather Bold',
      body: 'Source Serif Pro Regular',
      titleSize: 'large' as const,
    },
    layoutPreferences: {
      preferredLayouts: ['title-body', 'two-column', 'timeline'],
      imageStyle: 'minimal' as const,
    },
  },

  // 과제 소개: 명확하고 구조적인 디자인
  projectIntro: {
    name: 'Corporate Structure',
    vibe: 'corporate professional structured',
    palette: {
      primary: '#0369a1', // 기업적인 블루
      secondary: '#0284c7',
      accent: '#f59e0b', // 강조용 앰버
      background: '#ffffff',
      text: '#1e293b',
    },
    fonts: {
      title: 'Roboto Bold',
      body: 'Roboto Regular',
      titleSize: 'large' as const,
    },
    layoutPreferences: {
      preferredLayouts: ['title-body', 'two-column', 'grid', 'timeline'],
      imageStyle: 'balanced' as const,
    },
  },
} satisfies Record<string, PresentationDesignMaster>;

/**
 * 템플릿 타입
 */
export type TemplateType = 'profile' | 'tech-seminar' | 'paper-summary' | 'project-intro';

export interface PresentationTemplate {
  id: TemplateType;
  name: string;
  description: string;
  icon: string;
  targetAudience: string;
  estimatedSlides: number;
  generateState: () => PresentationAgentState;
}

/**
 * 자기소개 템플릿
 */
const profileTemplate: PresentationTemplate = {
  id: 'profile',
  name: '자기소개',
  description: '개인 소개 및 경력 발표',
  icon: '👤',
  targetAudience: '면접, 네트워킹, 팀 소개',
  estimatedSlides: 8,
  generateState: () => {
    const brief: PresentationBrief = {
      topic: '자기소개',
      purpose: '개인 소개 및 경력 소개',
      audience: '일반',
      slideCount: 8,
      duration: 10,
      language: 'ko',
    };

    const structure: PresentationStructure = {
      totalSlides: 8,
      outline: [
        {
          index: 0,
          title: '안녕하세요',
          layout: 'hero',
          keyPoints: ['이름', '직무', '한 줄 소개'],
        },
        {
          index: 1,
          title: '나를 소개합니다',
          layout: 'two-column',
          keyPoints: ['기본 정보', '관심사', '가치관'],
        },
        {
          index: 2,
          title: '경력 여정',
          layout: 'timeline',
          keyPoints: ['주요 경력', '성과', '배운 점'],
        },
        {
          index: 3,
          title: '핵심 역량',
          layout: 'stats',
          keyPoints: ['기술 스택', '전문성', '수치화된 성과'],
        },
        {
          index: 4,
          title: '대표 프로젝트',
          layout: 'title-body',
          keyPoints: ['프로젝트명', '역할', '결과'],
        },
        {
          index: 5,
          title: '성과와 인정',
          layout: 'grid',
          keyPoints: ['수상 경력', '자격증', '인증'],
        },
        {
          index: 6,
          title: '앞으로의 목표',
          layout: 'title-body',
          keyPoints: ['단기 목표', '장기 비전', '기여 방향'],
        },
        { index: 7, title: '감사합니다', layout: 'hero', keyPoints: ['연락처', '포트폴리오 링크'] },
      ],
    };

    const slides: PresentationSlide[] = [
      {
        id: 'profile-0',
        title: '안녕하세요',
        subtitle: '여러분과 함께하게 되어 기쁩니다',
        description: '간단한 자기소개로 시작합니다',
        layout: 'hero',
        accentColor: '#2563eb',
        backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
        titleSize: 'large',
        textAlign: 'center',
      },
      {
        id: 'profile-1',
        title: '나를 소개합니다',
        bullets: [
          '이름: [여기에 이름을 입력하세요]',
          '직무: [여기에 직무를 입력하세요]',
          '한 마디: [여기에 한 줄 소개를 입력하세요]',
        ],
        description: '기본 정보와 가치관',
        layout: 'two-column',
        accentColor: '#06b6d4',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
      },
      {
        id: 'profile-2',
        title: '경력 여정',
        description: '지금까지의 발자취',
        layout: 'timeline',
        accentColor: '#2563eb',
        backgroundColor: 'linear-gradient(135deg, #fefefe 0%, #f1f5f9 100%)',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
        slots: {
          timeline: {
            steps: [
              { title: '[회사명/학교]', description: '[역할 및 주요 업무]', date: '[연도]' },
              { title: '[회사명/학교]', description: '[역할 및 주요 업무]', date: '[연도]' },
              { title: '[회사명/학교]', description: '[역할 및 주요 업무]', date: '[연도]' },
            ],
            orientation: 'vertical',
          },
        },
      },
      {
        id: 'profile-3',
        title: '핵심 역량',
        description: '제가 잘하는 것들',
        layout: 'stats',
        accentColor: '#06b6d4',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
        slots: {
          stats: [
            { value: '[기술 1]', label: '핵심 기술', icon: '⚡' },
            { value: '[기술 2]', label: '전문 분야', icon: '🎯' },
            { value: '[경력 N년]', label: '경험', icon: '📊' },
          ],
        },
      },
      {
        id: 'profile-4',
        title: '대표 프로젝트',
        bullets: ['프로젝트: [프로젝트명]', '역할: [담당 역할]', '성과: [주요 성과 및 배운 점]'],
        description: '제가 참여한 의미있는 프로젝트',
        layout: 'title-body',
        accentColor: '#2563eb',
        backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
      },
      {
        id: 'profile-5',
        title: '성과와 인정',
        bullets: ['[수상/자격증 1]', '[수상/자격증 2]', '[수상/자격증 3]'],
        description: '받은 인정과 자격',
        layout: 'grid',
        accentColor: '#7c3aed',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
      },
      {
        id: 'profile-6',
        title: '앞으로의 목표',
        bullets: [
          '단기: [1년 내 목표]',
          '중기: [3년 내 목표]',
          '장기: [장기 비전 및 기여하고 싶은 방향]',
        ],
        description: '나의 성장 방향',
        layout: 'title-body',
        accentColor: '#06b6d4',
        backgroundColor: 'linear-gradient(135deg, #fefefe 0%, #f1f5f9 100%)',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
      },
      {
        id: 'profile-7',
        title: '감사합니다',
        subtitle: '함께 성장하고 싶습니다',
        bullets: ['Email: [이메일 주소]', 'LinkedIn: [링크]', 'Portfolio: [포트폴리오 URL]'],
        layout: 'hero',
        accentColor: '#2563eb',
        backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%)',
        textColor: '#1e293b',
        titleFont: 'Inter Bold',
        bodyFont: 'Inter Regular',
        vibe: 'warm professional modern',
        textAlign: 'center',
      },
    ];

    return {
      currentStep: 'review',
      brief,
      designMaster: ENTERPRISE_DESIGNS.profile,
      structure,
      slides,
      completedSlideIndices: [0, 1, 2, 3, 4, 5, 6, 7],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
};

/**
 * 기술 세미나 템플릿
 */
const techSeminarTemplate: PresentationTemplate = {
  id: 'tech-seminar',
  name: '기술 세미나',
  description: '기술 주제 발표 및 세미나',
  icon: '💻',
  targetAudience: '개발자, 엔지니어, 기술팀',
  estimatedSlides: 12,
  generateState: () => {
    const brief: PresentationBrief = {
      topic: '기술 세미나',
      purpose: '기술 지식 공유 및 교육',
      audience: '개발자',
      slideCount: 12,
      duration: 30,
      language: 'ko',
    };

    const structure: PresentationStructure = {
      totalSlides: 12,
      outline: [
        { index: 0, title: '[기술 주제]', layout: 'hero', keyPoints: ['제목', '발표자', '날짜'] },
        { index: 1, title: 'Agenda', layout: 'title-body', keyPoints: ['발표 흐름', '주요 내용'] },
        {
          index: 2,
          title: '문제 정의',
          layout: 'title-body',
          keyPoints: ['현재 상황', '해결할 문제', '필요성'],
        },
        {
          index: 3,
          title: '기술 배경',
          layout: 'two-column',
          keyPoints: ['기존 기술', '한계점', '새로운 접근'],
        },
        {
          index: 4,
          title: '핵심 개념',
          layout: 'title-body',
          keyPoints: ['주요 개념', '작동 원리', '특징'],
        },
        {
          index: 5,
          title: '아키텍처',
          layout: 'two-column',
          keyPoints: ['시스템 구조', '컴포넌트', '데이터 흐름'],
        },
        {
          index: 6,
          title: '구현 예제',
          layout: 'title-body',
          keyPoints: ['코드 예제', '설정 방법', '베스트 프랙티스'],
        },
        {
          index: 7,
          title: '성능 비교',
          layout: 'stats',
          keyPoints: ['Before/After', '벤치마크', '개선율'],
        },
        {
          index: 8,
          title: '실제 사례',
          layout: 'two-column',
          keyPoints: ['적용 사례', '결과', '교훈'],
        },
        {
          index: 9,
          title: '장단점 분석',
          layout: 'two-column',
          keyPoints: ['장점', '단점', '적용 시나리오'],
        },
        {
          index: 10,
          title: 'Q&A',
          layout: 'title-body',
          keyPoints: ['자주 묻는 질문', '답변', '추가 자료'],
        },
        {
          index: 11,
          title: 'Thank You',
          layout: 'hero',
          keyPoints: ['연락처', '참고 자료', 'GitHub'],
        },
      ],
    };

    const slides: PresentationSlide[] = [
      {
        id: 'tech-0',
        title: '[여기에 기술 주제 입력]',
        subtitle: '혁신적인 기술로 문제를 해결합니다',
        description: '기술 세미나 시작',
        layout: 'hero',
        accentColor: '#06b6d4',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
        titleSize: 'xl',
        textAlign: 'center',
      },
      {
        id: 'tech-1',
        title: 'Agenda',
        bullets: [
          '문제 정의 및 배경',
          '기술 개념 및 아키텍처',
          '구현 예제 및 성능',
          '실제 사례 및 Q&A',
        ],
        description: '오늘 다룰 내용',
        layout: 'title-body',
        accentColor: '#8b5cf6',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-2',
        title: '문제 정의',
        bullets: [
          '현재 상황: [여기에 입력]',
          '직면한 문제: [여기에 입력]',
          '해결 필요성: [여기에 입력]',
        ],
        description: '왜 이 기술이 필요한가?',
        layout: 'title-body',
        accentColor: '#ec4899',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-3',
        title: '기술 배경',
        description: '기존 접근 방식과 한계',
        bullets: [
          '기존 방식: [여기에 입력]',
          '한계점: [여기에 입력]',
          '새로운 접근: [여기에 입력]',
        ],
        layout: 'two-column',
        accentColor: '#06b6d4',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-4',
        title: '핵심 개념',
        bullets: ['개념: [핵심 개념 설명]', '작동 원리: [원리 설명]', '주요 특징: [특징 나열]'],
        description: '이 기술의 핵심은?',
        layout: 'title-body',
        accentColor: '#8b5cf6',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-5',
        title: '아키텍처',
        description: '시스템 구조 및 컴포넌트',
        bullets: [
          '전체 구조: [구조 설명]',
          '주요 컴포넌트: [컴포넌트 나열]',
          '데이터 흐름: [흐름 설명]',
        ],
        layout: 'two-column',
        accentColor: '#06b6d4',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-6',
        title: '구현 예제',
        bullets: ['Step 1: [첫 번째 단계]', 'Step 2: [두 번째 단계]', 'Best Practice: [권장 사항]'],
        description: '실제로 어떻게 구현하는가?',
        layout: 'title-body',
        accentColor: '#ec4899',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-7',
        title: '성능 비교',
        description: 'Before vs After',
        layout: 'stats',
        accentColor: '#06b6d4',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
        slots: {
          stats: [
            { value: '[%]', label: '성능 개선', icon: '⚡' },
            { value: '[ms]', label: '응답 시간', icon: '⏱️' },
            { value: '[x배]', label: '처리량 증가', icon: '📈' },
          ],
        },
      },
      {
        id: 'tech-8',
        title: '실제 사례',
        bullets: [
          '적용 사례: [실제 적용 사례]',
          '결과: [얻은 결과]',
          '배운 점: [교훈 및 인사이트]',
        ],
        description: '현업에서의 활용',
        layout: 'two-column',
        accentColor: '#8b5cf6',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-9',
        title: '장단점 분석',
        description: '객관적인 평가',
        bullets: [
          '장점: [강점 나열]',
          '단점: [약점 나열]',
          '적용 시나리오: [언제 사용하면 좋은가]',
        ],
        layout: 'two-column',
        accentColor: '#ec4899',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-10',
        title: 'Q&A',
        bullets: ['Q: [자주 묻는 질문 1]', 'A: [답변 1]', 'Q: [자주 묻는 질문 2]', 'A: [답변 2]'],
        description: '질문과 답변',
        layout: 'title-body',
        accentColor: '#06b6d4',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
      },
      {
        id: 'tech-11',
        title: 'Thank You',
        subtitle: '함께 성장하는 기술 커뮤니티',
        bullets: ['GitHub: [레포지토리 URL]', 'Email: [이메일]', 'Docs: [문서 링크]'],
        layout: 'hero',
        accentColor: '#8b5cf6',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        titleFont: 'Space Grotesk Bold',
        bodyFont: 'Inter Regular',
        vibe: 'dark tech modern bold',
        titleSize: 'xl',
        textAlign: 'center',
      },
    ];

    return {
      currentStep: 'review',
      brief,
      designMaster: ENTERPRISE_DESIGNS.techSeminar,
      structure,
      slides,
      completedSlideIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
};

/**
 * 논문 요약 템플릿
 */
const paperSummaryTemplate: PresentationTemplate = {
  id: 'paper-summary',
  name: '논문 요약',
  description: '연구 논문 요약 발표',
  icon: '📄',
  targetAudience: '학생, 연구원, 학회',
  estimatedSlides: 10,
  generateState: () => {
    const brief: PresentationBrief = {
      topic: '논문 요약',
      purpose: '연구 논문 내용 공유',
      audience: '연구자',
      slideCount: 10,
      duration: 20,
      language: 'ko',
    };

    const structure: PresentationStructure = {
      totalSlides: 10,
      outline: [
        { index: 0, title: '논문 제목', layout: 'hero', keyPoints: ['제목', '저자', '학회/저널'] },
        {
          index: 1,
          title: '연구 배경',
          layout: 'title-body',
          keyPoints: ['연구 동기', '기존 연구', '문제점'],
        },
        {
          index: 2,
          title: '연구 목적',
          layout: 'title-body',
          keyPoints: ['목표', 'Research Questions', '가설'],
        },
        {
          index: 3,
          title: '연구 방법론',
          layout: 'two-column',
          keyPoints: ['실험 설계', '데이터 수집', '분석 방법'],
        },
        {
          index: 4,
          title: '핵심 아이디어',
          layout: 'title-body',
          keyPoints: ['제안 방법', '핵심 알고리즘', '혁신성'],
        },
        {
          index: 5,
          title: '실험 설정',
          layout: 'title-body',
          keyPoints: ['데이터셋', '평가 지표', '비교 대상'],
        },
        {
          index: 6,
          title: '실험 결과',
          layout: 'stats',
          keyPoints: ['정량적 결과', '성능 비교', '통계적 유의성'],
        },
        {
          index: 7,
          title: '결과 분석',
          layout: 'two-column',
          keyPoints: ['결과 해석', '인사이트', '함의'],
        },
        {
          index: 8,
          title: '한계 및 향후 연구',
          layout: 'title-body',
          keyPoints: ['연구 한계', '향후 방향', '응용 가능성'],
        },
        {
          index: 9,
          title: '결론',
          layout: 'title-body',
          keyPoints: ['주요 기여', '의의', '참고문헌'],
        },
      ],
    };

    const slides: PresentationSlide[] = [
      {
        id: 'paper-0',
        title: '[논문 제목을 입력하세요]',
        subtitle: '저자명 et al., 학회/저널명, 연도',
        description: '논문 요약 발표',
        layout: 'hero',
        accentColor: '#059669',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
        titleSize: 'large',
        textAlign: 'center',
      },
      {
        id: 'paper-1',
        title: '연구 배경',
        bullets: [
          '연구 동기: [왜 이 연구를 수행했는가]',
          '기존 연구: [선행 연구 요약]',
          '문제점: [기존 연구의 한계]',
        ],
        description: '연구의 필요성',
        layout: 'title-body',
        accentColor: '#1e40af',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-2',
        title: '연구 목적',
        bullets: [
          '목표: [연구의 주요 목표]',
          'Research Question: [핵심 질문]',
          '가설: [검증하고자 하는 가설]',
        ],
        description: '무엇을 알아내고자 하는가',
        layout: 'title-body',
        accentColor: '#0891b2',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-3',
        title: '연구 방법론',
        description: '어떻게 연구를 수행했는가',
        bullets: [
          '실험 설계: [실험 구조]',
          '데이터 수집: [데이터 출처 및 방법]',
          '분석 방법: [통계/알고리즘]',
        ],
        layout: 'two-column',
        accentColor: '#1e40af',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-4',
        title: '핵심 아이디어',
        bullets: [
          '제안 방법: [새로운 접근법]',
          '핵심 알고리즘: [주요 알고리즘 설명]',
          '혁신성: [기존 연구 대비 차별점]',
        ],
        description: '이 논문의 기여',
        layout: 'title-body',
        accentColor: '#059669',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-5',
        title: '실험 설정',
        bullets: [
          '데이터셋: [사용한 데이터셋]',
          '평가 지표: [Accuracy, F1-score 등]',
          '비교 대상: [Baseline 모델]',
        ],
        description: '실험 환경',
        layout: 'title-body',
        accentColor: '#0891b2',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-6',
        title: '실험 결과',
        description: '정량적 성과',
        layout: 'stats',
        accentColor: '#059669',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
        slots: {
          stats: [
            { value: '[%]', label: '정확도', icon: '📊' },
            { value: '[%]', label: 'F1-Score', icon: '📈' },
            { value: '[p<0.05]', label: '통계적 유의성', icon: '✓' },
          ],
        },
      },
      {
        id: 'paper-7',
        title: '결과 분석',
        description: '결과가 의미하는 것',
        bullets: [
          '해석: [결과를 어떻게 해석하는가]',
          '인사이트: [얻은 통찰]',
          '함의: [이론적/실용적 의미]',
        ],
        layout: 'two-column',
        accentColor: '#1e40af',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-8',
        title: '한계 및 향후 연구',
        bullets: [
          '연구 한계: [제약사항 및 한계점]',
          '향후 연구: [후속 연구 방향]',
          '응용 가능성: [실제 적용 가능성]',
        ],
        description: '개선 방향',
        layout: 'title-body',
        accentColor: '#0891b2',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
      {
        id: 'paper-9',
        title: '결론',
        bullets: [
          '주요 기여: [이 논문의 핵심 기여]',
          '의의: [학문적/실무적 의의]',
          '참고문헌: [주요 참고 논문]',
        ],
        description: '요약 및 마무리',
        layout: 'title-body',
        accentColor: '#059669',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        titleFont: 'Merriweather Bold',
        bodyFont: 'Source Serif Pro Regular',
        vibe: 'minimal clean academic',
      },
    ];

    return {
      currentStep: 'review',
      brief,
      designMaster: ENTERPRISE_DESIGNS.paperSummary,
      structure,
      slides,
      completedSlideIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
};

/**
 * 과제 소개 템플릿
 */
const projectIntroTemplate: PresentationTemplate = {
  id: 'project-intro',
  name: '과제 소개',
  description: '프로젝트/과제 소개 발표',
  icon: '📁',
  targetAudience: '팀원, 이해관계자, 경영진',
  estimatedSlides: 11,
  generateState: () => {
    const brief: PresentationBrief = {
      topic: '과제 소개',
      purpose: '프로젝트 개요 및 계획 공유',
      audience: '이해관계자',
      slideCount: 11,
      duration: 25,
      language: 'ko',
    };

    const structure: PresentationStructure = {
      totalSlides: 11,
      outline: [
        { index: 0, title: '프로젝트명', layout: 'hero', keyPoints: ['제목', '팀명', '기간'] },
        {
          index: 1,
          title: 'Executive Summary',
          layout: 'title-body',
          keyPoints: ['핵심 요약', '목표', '기대효과'],
        },
        {
          index: 2,
          title: '배경 및 필요성',
          layout: 'title-body',
          keyPoints: ['현황', '문제점', '필요성'],
        },
        {
          index: 3,
          title: '프로젝트 목표',
          layout: 'stats',
          keyPoints: ['목표', 'KPI', '성공 기준'],
        },
        {
          index: 4,
          title: '범위 및 제약사항',
          layout: 'two-column',
          keyPoints: ['범위', '제약', '가정'],
        },
        {
          index: 5,
          title: '솔루션 개요',
          layout: 'title-body',
          keyPoints: ['접근 방법', '주요 기능', '차별점'],
        },
        {
          index: 6,
          title: '시스템 아키텍처',
          layout: 'two-column',
          keyPoints: ['구조', '기술 스택', '인프라'],
        },
        {
          index: 7,
          title: '추진 계획',
          layout: 'timeline',
          keyPoints: ['일정', '마일스톤', '단계별 목표'],
        },
        { index: 8, title: '팀 구성', layout: 'grid', keyPoints: ['역할', '책임', '협업 체계'] },
        { index: 9, title: '예산 및 자원', layout: 'stats', keyPoints: ['예산', '인력', '장비'] },
        {
          index: 10,
          title: '리스크 관리',
          layout: 'two-column',
          keyPoints: ['리스크', '대응책', '모니터링'],
        },
      ],
    };

    const slides: PresentationSlide[] = [
      {
        id: 'project-0',
        title: '[프로젝트명을 입력하세요]',
        subtitle: '팀명 | 시작일 ~ 종료일',
        description: '프로젝트 소개',
        layout: 'hero',
        accentColor: '#0369a1',
        backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #e0f2fe 50%, #fef3c7 100%)',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
        titleSize: 'large',
        textAlign: 'center',
      },
      {
        id: 'project-1',
        title: 'Executive Summary',
        bullets: [
          '핵심 요약: [프로젝트 한 줄 요약]',
          '목표: [달성하고자 하는 목표]',
          '기대효과: [예상되는 성과 및 효과]',
        ],
        description: '프로젝트 개요',
        layout: 'title-body',
        accentColor: '#0369a1',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
      {
        id: 'project-2',
        title: '배경 및 필요성',
        bullets: [
          '현황: [현재 상황 분석]',
          '문제점: [해결해야 할 문제]',
          '필요성: [왜 이 프로젝트가 필요한가]',
        ],
        description: 'Why Now?',
        layout: 'title-body',
        accentColor: '#0284c7',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
      {
        id: 'project-3',
        title: '프로젝트 목표',
        description: '측정 가능한 목표',
        layout: 'stats',
        accentColor: '#f59e0b',
        backgroundColor: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
        slots: {
          stats: [
            { value: '[목표 1]', label: '핵심 KPI', icon: '🎯' },
            { value: '[목표 2]', label: '부가 지표', icon: '📊' },
            { value: '[기한]', label: '달성 기한', icon: '📅' },
          ],
        },
      },
      {
        id: 'project-4',
        title: '범위 및 제약사항',
        description: '프로젝트 경계',
        bullets: [
          '범위: [포함되는 것 / 제외되는 것]',
          '제약: [시간, 예산, 기술적 제약]',
          '가정: [전제 조건]',
        ],
        layout: 'two-column',
        accentColor: '#0369a1',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
      {
        id: 'project-5',
        title: '솔루션 개요',
        bullets: [
          '접근 방법: [문제 해결 방식]',
          '주요 기능: [핵심 기능 3가지]',
          '차별점: [기존 방식 대비 장점]',
        ],
        description: '우리의 솔루션',
        layout: 'title-body',
        accentColor: '#0284c7',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
      {
        id: 'project-6',
        title: '시스템 아키텍처',
        description: '기술 구조',
        bullets: [
          '구조: [시스템 구성도]',
          '기술 스택: [사용 기술 목록]',
          '인프라: [서버, DB, 클라우드 등]',
        ],
        layout: 'two-column',
        accentColor: '#f59e0b',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
      {
        id: 'project-7',
        title: '추진 계획',
        description: '프로젝트 타임라인',
        layout: 'timeline',
        accentColor: '#0369a1',
        backgroundColor: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
        slots: {
          timeline: {
            steps: [
              { title: '1단계: 기획', description: '[주요 활동]', date: '[기간]' },
              { title: '2단계: 개발', description: '[주요 활동]', date: '[기간]' },
              { title: '3단계: 테스트', description: '[주요 활동]', date: '[기간]' },
              { title: '4단계: 배포', description: '[주요 활동]', date: '[기간]' },
            ],
            orientation: 'horizontal',
          },
        },
      },
      {
        id: 'project-8',
        title: '팀 구성',
        bullets: [
          '[역할 1]: [이름] - [책임 범위]',
          '[역할 2]: [이름] - [책임 범위]',
          '[역할 3]: [이름] - [책임 범위]',
          '[역할 4]: [이름] - [책임 범위]',
        ],
        description: '우리 팀',
        layout: 'grid',
        accentColor: '#0284c7',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
      {
        id: 'project-9',
        title: '예산 및 자원',
        description: '필요한 자원',
        layout: 'stats',
        accentColor: '#f59e0b',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
        slots: {
          stats: [
            { value: '[금액]', label: '총 예산', icon: '💰' },
            { value: '[N명]', label: '투입 인력', icon: '👥' },
            { value: '[목록]', label: '필요 장비', icon: '🔧' },
          ],
        },
      },
      {
        id: 'project-10',
        title: '리스크 관리',
        description: '위험 요소 및 대응',
        bullets: [
          '기술 리스크: [위험 요소] → [대응 방안]',
          '일정 리스크: [위험 요소] → [대응 방안]',
          '자원 리스크: [위험 요소] → [대응 방안]',
        ],
        layout: 'two-column',
        accentColor: '#0369a1',
        backgroundColor: '#ffffff',
        textColor: '#1e293b',
        titleFont: 'Roboto Bold',
        bodyFont: 'Roboto Regular',
        vibe: 'corporate professional structured',
      },
    ];

    return {
      currentStep: 'review',
      brief,
      designMaster: ENTERPRISE_DESIGNS.projectIntro,
      structure,
      slides,
      completedSlideIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
};

/**
 * 모든 템플릿 목록
 */
export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  profileTemplate,
  techSeminarTemplate,
  paperSummaryTemplate,
  projectIntroTemplate,
];

/**
 * 템플릿 ID로 템플릿 찾기
 */
export function getTemplateById(id: TemplateType): PresentationTemplate | undefined {
  return PRESENTATION_TEMPLATES.find((t) => t.id === id);
}
