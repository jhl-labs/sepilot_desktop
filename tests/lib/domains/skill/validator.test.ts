import { SkillValidator } from '@/lib/domains/skill/validator';
import type { SkillPackage } from '@/types/skill';

function createBaseSkillPackage(): SkillPackage {
  return {
    manifest: {
      id: 'com.example.skill',
      name: 'Example Skill',
      version: '1.0.0',
      author: 'SEPilot',
      description: 'Example description',
      category: 'other',
      tags: ['example'],
    },
    content: {
      systemPrompt: 'You are a helpful assistant.',
    },
  };
}

describe('SkillValidator resource safety checks', () => {
  it('rejects resource file path traversal', async () => {
    const validator = new SkillValidator({ checkSecurity: false });
    const skillPackage: SkillPackage = {
      ...createBaseSkillPackage(),
      resources: {
        files: [
          {
            path: '../secrets.txt',
            content: 'sensitive',
            type: 'document',
          },
        ],
      },
    };

    const result = await validator.validate(skillPackage);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/invalid path/i);
  });

  it('rejects malformed base64 image payload', async () => {
    const validator = new SkillValidator({ checkSecurity: false });
    const skillPackage: SkillPackage = {
      ...createBaseSkillPackage(),
      resources: {
        images: [
          {
            name: 'icon.png',
            base64: '%%%not-base64%%%',
            mimeType: 'image/png',
          },
        ],
      },
    };

    const result = await validator.validate(skillPackage);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/invalid base64/i);
  });

  it('checks file size using UTF-8 bytes', async () => {
    const validator = new SkillValidator({
      checkSecurity: false,
      maxResourceSize: 2,
    });

    const skillPackage: SkillPackage = {
      ...createBaseSkillPackage(),
      resources: {
        files: [
          {
            path: 'docs/utf8.txt',
            content: '가', // UTF-8 3 bytes
            type: 'document',
          },
        ],
      },
    };

    const result = await validator.validate(skillPackage);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/too large/i);
  });
});
