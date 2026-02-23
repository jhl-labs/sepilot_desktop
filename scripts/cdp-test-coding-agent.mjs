/**
 * SEPilot Desktop - Coding Agent PPTX Generation Test
 *
 * Tests the coding agent's ability to generate PPTX files by:
 * 1. Checking current LLM model configuration
 * 2. Listing available skills (especially pptx/docx/xlsx related)
 * 3. Listing available graph types
 */

import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function logSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function logResult(label, data) {
  console.log(`  ${label}: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`);
}

async function main() {
  log('SEPilot Coding Agent PPTX Test - Starting...\n');

  // Connect via CDP
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  const page = pages.find(p => {
    const url = p.url();
    return url.includes('localhost:3000') && !url.includes('/notification');
  }) || pages[0];

  log(`Main page: ${page.url()}\n`);

  // ============================================================
  // STEP 1: Check current store state / LLM model configuration
  // ============================================================
  logSection('STEP 1: LLM Model Configuration');

  const state = await page.evaluate(() => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return { error: 'No store found' };
    const s = store.getState();
    return {
      selectedModel: s.selectedModel,
      selectedModelProvider: s.selectedModelProvider,
      selectedGraphType: s.selectedGraphType,
      graphConfig: s.graphConfig,
      appMode: s.appMode,
      currentConversationId: s.currentConversationId,
      isStreaming: s.isStreaming,
      workingDirectory: s.workingDirectory,
    };
  });

  if (state.error) {
    log(`ERROR: ${state.error}`);
  } else {
    logResult('Selected Model', state.selectedModel);
    logResult('Model Provider', state.selectedModelProvider);
    logResult('Selected Graph Type', state.selectedGraphType);
    logResult('Graph Config', state.graphConfig);
    logResult('App Mode', state.appMode);
    logResult('Current Conversation ID', state.currentConversationId);
    logResult('Is Streaming', state.isStreaming);
    logResult('Working Directory', state.workingDirectory);

    const modelConfigured = !!(state.selectedModel && state.selectedModelProvider);
    log(`\n  Model configured: ${modelConfigured ? 'YES' : 'NO'}`);

    if (!modelConfigured) {
      log('  WARNING: No LLM model is configured. Chat messages will not work.');
    }
  }

  // ============================================================
  // STEP 2: Check available skills
  // ============================================================
  logSection('STEP 2: Available Skills');

  const skills = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI found' };
    try {
      const result = await api.invoke('skills:get-enabled');
      const data = Array.isArray(result) ? result : (result?.data || []);
      return data.map(s => ({
        id: s.id,
        name: s.manifest?.name || s.name,
        description: s.manifest?.description || s.description,
        tags: s.manifest?.tags || s.tags,
        graphType: s.manifest?.graphType || s.graphType,
      }));
    } catch (e) {
      return { error: e.message };
    }
  });

  if (skills.error) {
    log(`  ERROR: ${skills.error}`);
  } else if (Array.isArray(skills)) {
    log(`  Total enabled skills: ${skills.length}`);

    // List all skills
    skills.forEach((s, i) => {
      log(`  [${i}] id="${s.id}" name="${s.name}" tags=${JSON.stringify(s.tags)} graphType="${s.graphType || ''}"`);
      if (s.description) log(`       desc="${s.description.substring(0, 100)}"`);
    });

    // Filter for document-related skills
    const docSkills = skills.filter(s => {
      const searchStr = JSON.stringify(s).toLowerCase();
      return searchStr.includes('pptx') || searchStr.includes('docx') || searchStr.includes('xlsx') ||
             searchStr.includes('powerpoint') || searchStr.includes('presentation') ||
             searchStr.includes('document') || searchStr.includes('spreadsheet') ||
             searchStr.includes('word') || searchStr.includes('excel');
    });

    log(`\n  Document-related skills (pptx/docx/xlsx): ${docSkills.length}`);
    docSkills.forEach((s, i) => {
      log(`    [${i}] id="${s.id}" name="${s.name}" tags=${JSON.stringify(s.tags)}`);
    });

    if (docSkills.length === 0) {
      log('  NOTE: No pptx/docx/xlsx specific skills found among enabled skills.');
    }
  } else {
    log(`  Unexpected result: ${JSON.stringify(skills)}`);
  }

  // Also check all skills (not just enabled)
  const allSkills = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI found' };
    try {
      // Try different IPC channels for listing all skills
      const channels = ['skills:list', 'skills:get-all', 'skills:list-all'];
      for (const ch of channels) {
        try {
          const result = await api.invoke(ch);
          if (result) {
            const data = Array.isArray(result) ? result : (result?.data || []);
            return { channel: ch, data: data.map(s => ({
              id: s.id,
              name: s.manifest?.name || s.name,
              enabled: s.enabled,
              tags: s.manifest?.tags || s.tags,
            })) };
          }
        } catch (_) { /* try next */ }
      }
      return { error: 'No valid skills channel found' };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (allSkills.error) {
    log(`\n  All skills query error: ${allSkills.error}`);
  } else if (allSkills.data) {
    log(`\n  All skills (via ${allSkills.channel}): ${allSkills.data.length}`);
    allSkills.data.forEach((s, i) => {
      log(`    [${i}] id="${s.id}" name="${s.name}" enabled=${s.enabled} tags=${JSON.stringify(s.tags)}`);
    });
  }

  // ============================================================
  // STEP 3: Check available graph types
  // ============================================================
  logSection('STEP 3: Available Graph Types');

  const graphs = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI found' };
    try {
      const result = await api.invoke('langgraph:list-graphs');
      return result;
    } catch (e) {
      return { error: e.message };
    }
  });

  if (graphs.error) {
    log(`  ERROR: ${graphs.error}`);
  } else if (Array.isArray(graphs)) {
    log(`  Total graph types: ${graphs.length}`);
    graphs.forEach((g, i) => {
      if (typeof g === 'string') {
        log(`  [${i}] ${g}`);
      } else {
        log(`  [${i}] ${JSON.stringify(g)}`);
      }
    });
  } else {
    log(`  Graph types result: ${JSON.stringify(graphs, null, 2)}`);
  }

  // Also try to get graph types from the factory/registry
  const graphRegistry = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI' };
    try {
      // Try additional channels
      const channels = ['langgraph:get-available-graphs', 'agent:list-graphs', 'langgraph:list'];
      for (const ch of channels) {
        try {
          const result = await api.invoke(ch);
          if (result) return { channel: ch, data: result };
        } catch (_) { /* try next */ }
      }
      return { noAdditionalChannels: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (graphRegistry.data) {
    log(`\n  Additional graph info (via ${graphRegistry.channel}):`);
    log(`  ${JSON.stringify(graphRegistry.data, null, 2)}`);
  }

  // ============================================================
  // STEP 4: Check LLM provider configuration details
  // ============================================================
  logSection('STEP 4: LLM Provider Details');

  const llmConfig = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI' };
    try {
      // Try to get LLM config
      const channels = ['llm:get-config', 'llm:get-models', 'config:get-llm'];
      const results = {};
      for (const ch of channels) {
        try {
          const result = await api.invoke(ch);
          if (result) results[ch] = result;
        } catch (e) {
          results[ch] = { error: e.message };
        }
      }
      return results;
    } catch (e) {
      return { error: e.message };
    }
  });

  log(`  LLM config details:`);
  for (const [channel, result] of Object.entries(llmConfig)) {
    if (result?.error) {
      log(`    ${channel}: ERROR - ${result.error}`);
    } else {
      const str = JSON.stringify(result, null, 2);
      // Truncate long outputs and mask API keys
      const masked = str.replace(/("(?:api[_-]?key|token|secret|password)":\s*")[^"]+"/gi, '$1***"');
      const truncated = masked.length > 500 ? masked.substring(0, 500) + '...' : masked;
      log(`    ${channel}: ${truncated}`);
    }
  }

  // ============================================================
  // STEP 5: Check coding-agent specific capabilities
  // ============================================================
  logSection('STEP 5: Coding Agent Capabilities');

  const codingAgentInfo = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI' };

    const store = window.__SEPILOT_SDK_STORE__;
    const storeState = store?.getState();

    return {
      // Graph config from store
      graphConfig: storeState?.graphConfig,
      selectedGraphType: storeState?.selectedGraphType,

      // Available extensions
      extensions: Object.keys(window.__SEPILOT_EXTENSIONS__ || {}),

      // Check if coding-agent graph is accessible
      hasCodingAgent: !!(storeState?.graphConfig?.graphType === 'coding-agent' ||
                        storeState?.selectedGraphType === 'coding-agent'),
    };
  });

  log(`  Graph Config: ${JSON.stringify(codingAgentInfo.graphConfig, null, 2)}`);
  log(`  Selected Graph Type: ${codingAgentInfo.selectedGraphType}`);
  log(`  Extensions loaded: [${codingAgentInfo.extensions?.join(', ')}]`);
  log(`  Coding Agent active: ${codingAgentInfo.hasCodingAgent}`);

  // ============================================================
  // SUMMARY
  // ============================================================
  logSection('SUMMARY');

  const modelConfigured = !!(state.selectedModel && state.selectedModelProvider);

  log(`  LLM Model Configured: ${modelConfigured ? 'YES' : 'NO'}`);
  if (modelConfigured) {
    log(`    Model: ${state.selectedModel}`);
    log(`    Provider: ${state.selectedModelProvider}`);
  }

  log(`  Current Graph Type: ${state.selectedGraphType || state.graphConfig?.graphType || 'N/A'}`);
  log(`  App Mode: ${state.appMode}`);

  if (Array.isArray(skills)) {
    const docSkills = skills.filter(s => {
      const searchStr = JSON.stringify(s).toLowerCase();
      return searchStr.includes('pptx') || searchStr.includes('docx') || searchStr.includes('xlsx') ||
             searchStr.includes('powerpoint') || searchStr.includes('presentation');
    });
    log(`  PPTX/DOCX/XLSX Skills: ${docSkills.length > 0 ? docSkills.map(s => s.name).join(', ') : 'NONE FOUND'}`);
  }

  if (Array.isArray(graphs)) {
    const hasCodingAgent = graphs.some(g =>
      (typeof g === 'string' ? g : JSON.stringify(g)).toLowerCase().includes('coding')
    );
    log(`  Coding Agent Graph Available: ${hasCodingAgent ? 'YES' : 'check output above'}`);
  }

  log(`\n  Working Directory: ${state.workingDirectory || 'Not set'}`);

  console.log('\n' + '='.repeat(60));
  log('Test complete.');
  console.log('='.repeat(60));

  await browser.close();
  log('CDP connection closed.');
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
