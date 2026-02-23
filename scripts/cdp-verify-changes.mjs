import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];
console.log('Connected to:', page.url());

// 1. Check store state
const state = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'No store' };
  const s = store.getState();
  return {
    selectedGraphType: s.selectedGraphType,
    graphConfig: JSON.parse(JSON.stringify(s.graphConfig || {})),
    thinkingMode: s.thinkingMode,
    currentConversationId: s.currentConversationId,
    hasModel: !!s.selectedModel,
    modelProvider: s.selectedModelProvider,
    selectedModel: s.selectedModel,
  };
});
console.log('\n=== Store State ===');
console.log(JSON.stringify(state, null, 2));

// 2. Check document-related skills
const docSkills = await page.evaluate(async () => {
  const api = window.electronAPI;
  if (!api) return { error: 'No API' };
  try {
    const result = await api.invoke('skills:get-enabled');
    // Handle both array and object with data property
    const skills = Array.isArray(result) ? result : (result?.data || []);
    const docRelated = skills.filter(s =>
      s.id.includes('pptx') || s.id.includes('document') || s.id.includes('excel') || s.id.includes('doc')
    );
    return docRelated.map(s => ({ id: s.id, name: s.manifest?.name, tags: s.manifest?.tags }));
  } catch (e) { return { error: e.message, stack: e.stack }; }
});
console.log('\n=== Document Skills ===');
console.log(JSON.stringify(docSkills, null, 2));

// 3. Check all skills
const skillsTest = await page.evaluate(async () => {
  const api = window.electronAPI;
  if (!api) return { error: 'No API' };
  try {
    const result = await api.invoke('skills:get-enabled');
    const skills = Array.isArray(result) ? result : (result?.data || []);
    return {
      totalSkills: skills.length,
      enabledSkillIds: skills.map(s => s.id),
      rawType: typeof result,
      isArray: Array.isArray(result),
      keys: result ? Object.keys(result) : null,
    };
  } catch (e) { return { error: e.message }; }
});
console.log('\n=== All Enabled Skills ===');
console.log(JSON.stringify(skillsTest, null, 2));

// 4. Quick check of cowork-graph mapping via source
console.log('\n=== Verification Summary ===');
console.log('- Model configured:', state.hasModel);
console.log('- ThinkingMode:', state.thinkingMode);
console.log('- Graph config:', JSON.stringify(state.graphConfig));

await browser.close();
