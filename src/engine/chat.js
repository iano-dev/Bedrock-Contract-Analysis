// Conversational Q&A over a single loaded contract ("ask the contract" / find
// something specific). Claude answers grounded in the document text and returns
// verbatim quotes so the browser can highlight where each answer lives.
//
// The contract is sent as a prompt-cached system block, so multi-turn chat over
// the same document reuses the cached prefix and stays cheap.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const MODEL = 'claude-opus-4-8';
const MAX_DOC_CHARS = 600000; // ~150k tokens; well under the 1M context window
const MAX_TURNS = 16; // keep the most recent turns

export function chatAvailable() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const ChatSchema = z.object({
  answer: z.string().describe('A concise, direct answer to the question, grounded in the contract.'),
  quotes: z
    .array(z.string())
    .describe('Verbatim excerpts copied exactly from the contract that support the answer, for highlighting. Empty if none apply.'),
  notInContract: z.boolean().describe('True if the contract does not address the question.'),
});

const SYSTEM = `You are helping Bedrock Concrete Cutting / Bedrock Commercial Concrete — a commercial concrete SUBCONTRACTOR in Oregon and Washington — review a specific incoming subcontract. Answer the user's questions about THIS contract only, grounded in its text.

Rules:
- Quote exact text from the contract when citing, and copy those verbatim excerpts into "quotes" so they can be highlighted in the document. Keep each quote short (a sentence or clause).
- If the contract does not address the question, set notInContract = true and say so plainly. Do NOT speculate, generalize, or invent terms.
- Be concise and practical, from Bedrock's subcontractor perspective (scope, schedule/premium time, payment, indemnity, incorporated documents, means-and-methods).
- This is contract interpretation, not legal advice. For prevailing-wage premium, indemnity enforceability, or lien questions, note that attorney review is recommended.`;

export async function chatAboutContract({ documentText, messages, fileName }) {
  const client = new Anthropic();
  let doc = documentText || '';
  let truncated = false;
  if (doc.length > MAX_DOC_CHARS) {
    doc = doc.slice(0, MAX_DOC_CHARS);
    truncated = true;
  }
  const turns = (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: String(m.content) }));
  if (!turns.length || turns[0].role !== 'user') {
    throw new Error('Chat requires at least one user message.');
  }

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    system: [
      { type: 'text', text: SYSTEM },
      { type: 'text', text: `CONTRACT${fileName ? ` (${fileName})` : ''}:\n\n${doc}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: turns,
    output_config: { format: zodOutputFormat(ChatSchema, 'contract_answer') },
  });

  const out = res.parsed_output || { answer: '(No answer returned.)', quotes: [], notInContract: false };
  if (truncated) {
    out.answer += '\n\n(Note: this contract is long; the answer used the first part of the document. Ask about a specific section for full coverage.)';
  }
  return out;
}
