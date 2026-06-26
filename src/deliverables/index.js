// Generate all deliverables simultaneously (Section 5) and write them to disk.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMarkdown } from './markdown.js';
import { buildDocx } from './docx.js';

export { buildMarkdown, buildDocx };

function slug(s) {
  return (s || 'analysis').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'analysis';
}

// Returns { markdown, json, docxBuffer } and, if outDir is given, writes files.
export async function generateDeliverables(analysis, { outDir = null, baseName = null } = {}) {
  const markdown = buildMarkdown(analysis);
  const json = JSON.stringify(analysis, null, 2);
  const docxBuffer = await buildDocx(analysis);

  let written = [];
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    const base = baseName || slug(analysis.metadata.project || analysis.fileName);
    const mdPath = join(outDir, `${base}.report.md`);
    const jsonPath = join(outDir, `${base}.analysis.json`);
    const docxPath = join(outDir, `${base}.report.docx`);
    await Promise.all([
      writeFile(mdPath, markdown, 'utf8'),
      writeFile(jsonPath, json, 'utf8'),
      writeFile(docxPath, docxBuffer),
    ]);
    written = [mdPath, jsonPath, docxPath];
  }

  return { markdown, json, docxBuffer, written };
}
