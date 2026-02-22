/**
 * Skill Validator
 *
 * 스킬 패키지 검증 및 보안 체크
 * - Manifest 스키마 검증 (Zod)
 * - Content 안전성 검증
 * - 파일 크기 제한
 * - 의존성 검증
 * - 버전 호환성 체크
 */

import { z } from 'zod';
import type {
  SkillPackage,
  SkillManifest,
  SkillContent,
  SkillResources,
} from '../../../types/skill';

/**
 * Validation Result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: string[];
}

/**
 * Validation Options
 */
export interface ValidationOptions {
  checkSecurity?: boolean; // 보안 패턴 검사 (기본값: true)
  strictMode?: boolean; // 엄격 모드 (경고도 에러로 처리)
  maxManifestSize?: number; // Manifest 최대 크기 (bytes)
  maxContentSize?: number; // Content 최대 크기 (bytes)
  maxResourceSize?: number; // 개별 리소스 최대 크기 (bytes)
}

/**
 * Zod Schema for SkillManifest
 */
const SkillManifestSchema = z.object({
  // 기본 정보
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/, {
      message: 'ID must use lowercase letters/numbers and may include dot, underscore, hyphen',
    }),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/, {
    message: 'Version must follow Semantic Versioning (e.g., 1.0.0)',
  }),
  author: z.string().min(1).max(100),
  description: z.string().min(1).max(500),

  // 카테고리 및 태그
  category: z.enum([
    'web-development',
    'mobile-development',
    'data-science',
    'devops',
    'security',
    'design',
    'writing',
    'productivity',
    'other',
  ]),
  tags: z.array(z.string()).max(10),

  // 선택 필드
  icon: z.string().optional(),
  readme: z.string().optional(),
  requiredMCPServers: z.array(z.string()).optional(),
  requiredExtensions: z.array(z.string()).optional(),
  minAppVersion: z.string().optional(),
  autoLoad: z.boolean().optional(),
  contextPatterns: z.array(z.string()).optional(),
  maxTokens: z.number().positive().optional(),
});

/**
 * Skill Validator 클래스
 */
export class SkillValidator {
  private options: Required<ValidationOptions>;

  // 위험한 패턴 (정규식)
  private readonly dangerousPatterns = [
    // JavaScript eval/Function
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /setTimeout\s*\(\s*["'`]/,
    /setInterval\s*\(\s*["'`]/,

    // 파일 시스템 접근
    /require\s*\(\s*["']fs["']\)/,
    /import.*from\s*["']fs["']/,
    /process\.exit/,
    /process\.kill/,

    // 네트워크 요청 (허용된 방식 외)
    /require\s*\(\s*["']child_process["']\)/,
    /import.*from\s*["']child_process["']/,
    /\.exec\s*\(/,
    /\.spawn\s*\(/,

    // Python exec/eval
    /\bexec\s*\(/,
    /__import__\s*\(/,
    /\bcompile\s*\(/,

    // Shell commands
    /os\.system\s*\(/,
    /subprocess\./,
  ];

  constructor(options: ValidationOptions = {}) {
    this.options = {
      checkSecurity: options.checkSecurity ?? true,
      strictMode: options.strictMode ?? false,
      maxManifestSize: options.maxManifestSize ?? 50 * 1024, // 50KB
      maxContentSize: options.maxContentSize ?? 500 * 1024, // 500KB
      maxResourceSize: options.maxResourceSize ?? 1 * 1024 * 1024, // 1MB
    };
  }

  /**
   * 스킬 패키지 전체 검증
   */
  async validate(skillPackage: SkillPackage): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
    };

    try {
      // 1. Manifest 검증
      const manifestResult = this.validateManifest(skillPackage.manifest);
      this.mergeResults(result, manifestResult);

      // 2. Content 검증
      if (skillPackage.content) {
        const contentResult = this.validateContent(skillPackage.content);
        this.mergeResults(result, contentResult);
      }

      // 3. Resources 검증
      if (skillPackage.resources) {
        const resourcesResult = this.validateResources(skillPackage.resources);
        this.mergeResults(result, resourcesResult);
      }

      // 4. 보안 검사
      if (this.options.checkSecurity) {
        const securityResult = this.checkSecurity(skillPackage);
        this.mergeResults(result, securityResult);
      }

      // 5. 전체 크기 체크
      const sizeResult = this.validateTotalSize(skillPackage);
      this.mergeResults(result, sizeResult);

      // Strict Mode: 경고도 에러로 처리
      if (this.options.strictMode && result.warnings.length > 0) {
        result.errors.push(...result.warnings);
        result.warnings = [];
      }

      // 보안 이슈가 있으면 무효화
      if (result.securityIssues.length > 0) {
        result.valid = false;
      }

      // 에러가 있으면 무효화
      if (result.errors.length > 0) {
        result.valid = false;
      }

      console.log(
        `[SkillValidator] Validation result: ${result.valid ? 'PASS' : 'FAIL'} (errors: ${result.errors.length}, warnings: ${result.warnings.length}, security: ${result.securityIssues.length})`
      );

      return result;
    } catch (error) {
      console.error('[SkillValidator] Validation failed with exception:', error);
      return {
        valid: false,
        errors: [`Validation exception: ${error}`],
        warnings: [],
        securityIssues: [],
      };
    }
  }

  /**
   * Manifest 검증
   */
  private validateManifest(manifest: SkillManifest): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
    };

    try {
      // Zod 스키마 검증
      SkillManifestSchema.parse(manifest);

      // 크기 검증
      const manifestSize = JSON.stringify(manifest).length;
      if (manifestSize > this.options.maxManifestSize) {
        result.errors.push(
          `Manifest too large: ${manifestSize} bytes (max: ${this.options.maxManifestSize})`
        );
      }

      // contextPatterns 길이 체크
      if (manifest.contextPatterns && manifest.contextPatterns.length > 20) {
        result.warnings.push(
          `Too many context patterns: ${manifest.contextPatterns.length} (recommended: ≤20)`
        );
      }

      // tags 중복 체크
      if (manifest.tags) {
        const uniqueTags = new Set(manifest.tags);
        if (uniqueTags.size !== manifest.tags.length) {
          result.warnings.push('Duplicate tags found');
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        result.errors.push(...error.issues.map((e) => `${e.path.join('.')}: ${e.message}`));
      } else {
        result.errors.push(`Manifest validation error: ${error}`);
      }
    }

    return result;
  }

  /**
   * Content 검증
   */
  private validateContent(content: SkillContent): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
    };

    // systemPrompt 검증
    if (content.systemPrompt) {
      if (content.systemPrompt.length > 20000) {
        result.warnings.push(
          `System prompt very long: ${content.systemPrompt.length} characters (recommended: ≤20000)`
        );
      }

      if (content.systemPrompt.length < 10) {
        result.warnings.push('System prompt too short');
      }
    }

    // knowledge 검증
    if (content.knowledge) {
      if (content.knowledge.length > 50) {
        result.warnings.push(
          `Too many knowledge sections: ${content.knowledge.length} (recommended: ≤50)`
        );
      }

      for (let i = 0; i < content.knowledge.length; i++) {
        const item = content.knowledge[i];
        if (!item.title || !item.content) {
          result.errors.push(`Knowledge item ${i} missing title or content`);
        }

        if (item.content.length > 50000) {
          result.warnings.push(
            `Knowledge item ${i} (${item.title}) very long: ${item.content.length} characters`
          );
        }
      }
    }

    // templates 검증
    if (content.templates) {
      const templateIds = new Set<string>();

      for (let i = 0; i < content.templates.length; i++) {
        const template = content.templates[i];

        if (!template.id || !template.name || !template.prompt) {
          result.errors.push(`Template ${i} missing required fields`);
        }

        // ID 중복 체크
        if (templateIds.has(template.id)) {
          result.errors.push(`Duplicate template ID: ${template.id}`);
        }
        templateIds.add(template.id);

        // 변수 검증
        if (template.variables) {
          const varNames = new Set<string>();
          for (const variable of template.variables) {
            if (varNames.has(variable.name)) {
              result.warnings.push(
                `Duplicate variable name in template ${template.id}: ${variable.name}`
              );
            }
            varNames.add(variable.name);
          }
        }
      }
    }

    // toolExamples 검증
    if (content.toolExamples) {
      for (let i = 0; i < content.toolExamples.length; i++) {
        const example = content.toolExamples[i];
        if (!example.toolName || !example.scenario || !example.example) {
          result.errors.push(`Tool example ${i} missing required fields`);
        }
      }
    }

    // workflows 검증
    if (content.workflows) {
      const workflowIds = new Set<string>();

      for (let i = 0; i < content.workflows.length; i++) {
        const workflow = content.workflows[i];

        if (!workflow.id || !workflow.name || !workflow.steps || workflow.steps.length === 0) {
          result.errors.push(`Workflow ${i} missing required fields or has no steps`);
        }

        // ID 중복 체크
        if (workflowIds.has(workflow.id)) {
          result.errors.push(`Duplicate workflow ID: ${workflow.id}`);
        }
        workflowIds.add(workflow.id);
      }
    }

    return result;
  }

  /**
   * Resources 검증
   */
  private validateResources(resources: SkillResources): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
    };

    // files 검증
    if (resources.files) {
      for (let i = 0; i < resources.files.length; i++) {
        const file = resources.files[i];

        if (!file.path || !file.content) {
          result.errors.push(`File ${i} missing path or content`);
          continue;
        }

        if (
          file.path.includes('\0') ||
          file.path.startsWith('/') ||
          file.path.startsWith('\\') ||
          file.path.includes('..')
        ) {
          result.errors.push(`File ${i} has invalid path: ${file.path}`);
          continue;
        }

        // 파일 크기 체크
        const fileSize = new TextEncoder().encode(file.content).length;
        if (fileSize > this.options.maxResourceSize) {
          result.errors.push(
            `File ${file.path} too large: ${fileSize} bytes (max: ${this.options.maxResourceSize})`
          );
        }
      }
    }

    // images 검증
    if (resources.images) {
      for (let i = 0; i < resources.images.length; i++) {
        const image = resources.images[i];

        if (!image.name || !image.base64) {
          result.errors.push(`Image ${i} missing name or base64`);
          continue;
        }

        if (image.name.includes('/') || image.name.includes('\\') || image.name.includes('\0')) {
          result.errors.push(`Image ${i} has invalid name: ${image.name}`);
          continue;
        }

        // 이미지 크기 체크 (decoded bytes)
        let imageSize = 0;
        try {
          const sanitized = image.base64.replace(/\s/g, '');
          if (!/^[A-Za-z0-9+/=]*$/.test(sanitized)) {
            result.errors.push(`Image ${image.name} has invalid base64 content`);
            continue;
          }
          const padding = sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0;
          imageSize = Math.floor((sanitized.length * 3) / 4) - padding;
        } catch {
          result.errors.push(`Image ${image.name} has invalid base64 payload`);
          continue;
        }

        if (imageSize > this.options.maxResourceSize) {
          result.errors.push(
            `Image ${image.name} too large: ${imageSize} bytes (max: ${this.options.maxResourceSize})`
          );
        }

        // MIME type 확인
        if (!image.mimeType || !image.mimeType.startsWith('image/')) {
          result.warnings.push(`Image ${image.name} has invalid MIME type: ${image.mimeType}`);
        }
      }
    }

    return result;
  }

  /**
   * 보안 검사
   */
  private checkSecurity(skillPackage: SkillPackage): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
    };

    // 검사할 텍스트 수집
    const textsToCheck: string[] = [];

    // systemPrompt
    if (skillPackage.content?.systemPrompt) {
      textsToCheck.push(skillPackage.content.systemPrompt);
    }

    // knowledge
    if (skillPackage.content?.knowledge) {
      for (const item of skillPackage.content.knowledge) {
        textsToCheck.push(item.content);
      }
    }

    // templates
    if (skillPackage.content?.templates) {
      for (const template of skillPackage.content.templates) {
        textsToCheck.push(template.prompt);
      }
    }

    // toolExamples
    if (skillPackage.content?.toolExamples) {
      for (const example of skillPackage.content.toolExamples) {
        textsToCheck.push(example.example);
      }
    }

    // resources files
    if (skillPackage.resources?.files) {
      for (const file of skillPackage.resources.files) {
        textsToCheck.push(file.content);
      }
    }

    // 위험한 패턴 검사
    for (const text of textsToCheck) {
      for (const pattern of this.dangerousPatterns) {
        const match = text.match(pattern);
        if (match) {
          result.securityIssues.push(`Dangerous pattern detected: ${match[0]}`);
        }
      }
    }

    // 외부 URL 검사 (허용된 도메인만)
    const urlPattern = /https?:\/\/[^\s]+/g;
    const allowedDomains = [
      'github.com',
      'githubusercontent.com',
      'npmjs.com',
      'pypi.org',
      'docs.python.org',
      'developer.mozilla.org',
    ];

    for (const text of textsToCheck) {
      const urls = text.match(urlPattern);
      if (urls) {
        for (const url of urls) {
          const isAllowed = allowedDomains.some((domain) => url.includes(domain));
          if (!isAllowed) {
            result.warnings.push(`External URL detected: ${url}`);
          }
        }
      }
    }

    return result;
  }

  /**
   * 전체 크기 검증
   */
  private validateTotalSize(skillPackage: SkillPackage): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
    };

    try {
      // 전체 패키지 크기 추정 (JSON 문자열 길이)
      const totalSize = JSON.stringify(skillPackage).length;
      const maxTotalSize = 5 * 1024 * 1024; // 5MB

      if (totalSize > maxTotalSize) {
        result.errors.push(`Skill package too large: ${totalSize} bytes (max: ${maxTotalSize})`);
      }

      if (totalSize > 2 * 1024 * 1024) {
        // 2MB 이상이면 경고
        result.warnings.push(
          `Skill package large: ${totalSize} bytes (may impact loading performance)`
        );
      }
    } catch (error) {
      result.warnings.push(`Failed to estimate package size: ${error}`);
    }

    return result;
  }

  /**
   * ValidationResult 병합
   */
  private mergeResults(target: ValidationResult, source: ValidationResult): void {
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    target.securityIssues.push(...source.securityIssues);
  }
}

// Singleton instance export
export const skillValidator = new SkillValidator();
