// Mock @sepilot/extension-sdk/utils before importing
jest.mock(
  '@sepilot/extension-sdk/utils',
  () => ({
    isElectron: jest.fn(() => false),
  }),
  { virtual: true }
);

// Use require to bypass TypeScript path resolution issues
// The jest moduleNameMapper handles runtime resolution correctly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderHtml } = require('@/extensions/presentation/lib/index');

describe('presentation exporters', () => {
  it('renders slides into HTML with bullets and prompts', () => {
    const html = renderHtml([
      {
        id: '1',
        title: 'Intro',
        description: 'Welcome',
        bullets: ['Point A', 'Point B'],
        imagePrompt: 'A futuristic cityscape',
        accentColor: '#7c3aed',
      },
    ]);

    expect(html).toContain('Intro');
    expect(html).toContain('Point A');
    expect(html).toContain('A futuristic cityscape');
    expect(html).toContain('#7c3aed');
  });
});
