// Turn a plain-text contract fixture into a real text-layer PDF (Helvetica,
// standard-14 font — no embedding), so pdf.js can extract text for the viewer's
// click-to-highlight. Usage: node scripts/make-digital-pdf.mjs <in.txt> <out.pdf>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
const raw = readFileSync(inPath, 'utf8');

const LEFT = 54, TOP = 740, BOTTOM = 56, LEADING = 15, SIZE = 11, MAXCH = 92;
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

// Wrap source lines to MAXCH and paginate.
const wrapped = [];
for (const line of raw.split('\n')) {
  if (!line.trim()) { wrapped.push(''); continue; }
  let cur = '';
  for (const word of line.split(/\s+/)) {
    if ((cur + ' ' + word).trim().length > MAXCH) { wrapped.push(cur); cur = word; }
    else cur = (cur ? cur + ' ' : '') + word;
  }
  if (cur) wrapped.push(cur);
}

const pagesLines = [];
let y = TOP, cur = [];
for (const ln of wrapped) {
  if (y < BOTTOM) { pagesLines.push(cur); cur = []; y = TOP; }
  cur.push(ln); y -= LEADING;
}
if (cur.length) pagesLines.push(cur);

function contentStream(lines) {
  let s = `BT /F1 ${SIZE} Tf ${LEADING} TL ${LEFT} ${TOP} Td\n`;
  lines.forEach((ln, i) => { s += i === 0 ? `(${esc(ln)}) Tj\n` : `T* (${esc(ln)}) Tj\n`; });
  s += 'ET';
  return s;
}

// Object layout: 1 catalog, 2 pages, 3 font, then per page (pageObj, contentObj).
const n = pagesLines.length;
const pageObjIds = [];
const objs = {};
objs[1] = '<</Type/Catalog/Pages 2 0 R>>';
objs[3] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>';
let next = 4;
const kids = [];
for (let i = 0; i < n; i++) {
  const pageId = next++, contentId = next++;
  pageObjIds.push(pageId);
  kids.push(`${pageId} 0 R`);
  const cs = contentStream(pagesLines[i]);
  objs[pageId] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 3 0 R>>>>/Contents ${contentId} 0 R>>`;
  objs[contentId] = `<</Length ${cs.length}>>\nstream\n${cs}\nendstream`;
}
objs[2] = `<</Type/Pages/Kids[${kids.join(' ')}]/Count ${n}>>`;

const maxId = next - 1;
let pdf = '%PDF-1.4\n';
const offsets = {};
for (let id = 1; id <= maxId; id++) {
  offsets[id] = pdf.length;
  pdf += `${id} 0 obj\n${objs[id]}\nendobj\n`;
}
const xrefPos = pdf.length;
pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
for (let id = 1; id <= maxId; id++) pdf += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
pdf += `trailer\n<</Size ${maxId + 1}/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`;

writeFileSync(outPath, pdf, 'latin1');
console.log(`Wrote ${outPath} — ${n} page(s), ${wrapped.length} lines`);
