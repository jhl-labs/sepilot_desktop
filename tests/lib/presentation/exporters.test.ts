import { renderHtml } from '@/lib/presentation/exporters';

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
