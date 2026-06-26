// Netlify serverless function: generate a deliverable (Word .docx, Markdown, or
// JSON) from an analysis object the client already holds. Stateless — the client
// POSTs the analysis back; nothing is stored server-side.

import { buildMarkdown, buildDocx } from '../../src/deliverables/index.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const { analysis, format = 'docx' } = body;
  if (!analysis) return new Response('Missing analysis', { status: 400 });

  const base = (analysis.metadata?.project || analysis.fileName || 'analysis')
    .replace(/[^a-z0-9]+/gi, '-')
    .slice(0, 50);

  if (format === 'docx') {
    const buf = await buildDocx(analysis);
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${base}.docx"`,
      },
    });
  }
  if (format === 'md') {
    return new Response(buildMarkdown(analysis), {
      headers: { 'content-type': 'text/markdown', 'content-disposition': `attachment; filename="${base}.md"` },
    });
  }
  if (format === 'json') {
    return new Response(JSON.stringify(analysis, null, 2), {
      headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${base}.json"` },
    });
  }
  return new Response('Unknown format', { status: 400 });
};

export const config = { path: '/api/deliverable' };
