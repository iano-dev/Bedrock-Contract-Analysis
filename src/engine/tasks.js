// Single source of truth for the heavy, LLM-backed jobs. Both the Netlify
// background function and the local Express server dispatch through runTask, so
// the result is identical regardless of where the work runs.

import { llmQuickEnrich, llmExtractScope, llmScopeCompare, llmParseBid, normalizeLlmFlags, llmAvailable } from './llm.js';
import { applyTierPosture } from './tiers.js';
import { chatAboutContract } from './chat.js';

// The async jobs the client can start. Each returns a plain JSON-able result.
export const ASYNC_TASKS = new Set(['enrich', 'scope', 'scope-compare', 'chat']);

export async function runTask(name, p = {}) {
  switch (name) {
    case 'enrich': {
      if (!llmAvailable()) return { flags: [], facts: null, skipped: 'no-api-key' };
      const existingFlags = p.existingFlags || [];
      const { facts, rawFlags, truncated } = await llmQuickEnrich(p.documentText, { existingFlags });
      let flags = normalizeLlmFlags(rawFlags, { text: p.documentText, pages: p.pages || [], existingFlags });
      flags = applyTierPosture(flags, Number(p.tier) === 1 ? 1 : 2);
      return { flags, facts, truncated };
    }
    case 'scope': {
      if (!llmAvailable()) return { scopeItems: [], skipped: 'no-api-key' };
      if (!p.documentText || !p.documentText.trim()) return { scopeItems: [] };
      return await llmExtractScope(p.documentText);
    }
    case 'scope-compare': {
      if (!llmAvailable()) return { summary: '', redlines: [], skipped: 'no-api-key' };
      if (!p.bidText || !p.bidText.trim()) return { summary: '', redlines: [] };
      return await llmScopeCompare({ contractText: p.contractText, bidText: p.bidText, scopeItems: p.scopeItems });
    }
    case 'parse-bid': {
      if (!llmAvailable()) return { assumptions: {}, skipped: 'no-api-key' };
      if (!p.bidText || !p.bidText.trim()) return { assumptions: {} };
      return { assumptions: await llmParseBid(p.bidText) };
    }
    case 'chat': {
      return await chatAboutContract(p);
    }
    default:
      throw new Error('Unknown task: ' + name);
  }
}
