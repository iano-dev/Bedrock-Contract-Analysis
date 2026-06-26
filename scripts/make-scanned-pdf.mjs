// Generate an image-only (scanned-style) one-page PDF with no text layer,
// so we can verify the OCR extraction path. Draws contract text onto a canvas,
// encodes as JPEG, embeds as a /DCTDecode image XObject.
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const W = 1000, H = 1300;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#000000';
ctx.font = '28px sans-serif';
const lines = [
  'SUBCONTRACT AGREEMENT',
  '',
  'Contractor: Unfamiliar Builders LLC',
  'Subcontractor: Bedrock Concrete Cutting',
  '',
  'ARTICLE 7 PREMIUM TIME',
  'Subcontractor has included all costs including',
  'overtime and premium time required to perform',
  'the work and the project schedule.',
  '',
  'ARTICLE 12 PAYMENT',
  'Paid within 15 days after Contractor is paid',
  'by the Owner. Retainage of 10 percent.',
  '',
  'ARTICLE 17 INDEMNIFICATION',
  'Subcontractor shall indemnify and hold harmless',
  'the Contractor including attorney fees.',
];
lines.forEach((l, i) => ctx.fillText(l, 80, 120 + i * 50));

const jpeg = canvas.toBuffer('image/jpeg', 90);

// Hand-build a minimal PDF with byte-accurate xref offsets.
const objs = [];
objs[1] = '<</Type/Catalog/Pages 2 0 R>>';
objs[2] = '<</Type/Pages/Kids[3 0 R]/Count 1>>';
objs[3] = `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W} ${H}]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>`;
const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;

const chunks = [];
let pos = 0;
const push = (buf) => { const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'latin1'); chunks.push(b); pos += b.length; };
const offsets = {};

push('%PDF-1.4\n');
for (const n of [1, 2, 3]) {
  offsets[n] = pos;
  push(`${n} 0 obj\n${objs[n]}\nendobj\n`);
}
// Object 4: image
offsets[4] = pos;
push(`4 0 obj\n<</Type/XObject/Subtype/Image/Width ${W}/Height ${H}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>\nstream\n`);
push(jpeg);
push('\nendstream\nendobj\n');
// Object 5: content
offsets[5] = pos;
push(`5 0 obj\n<</Length ${content.length}>>\nstream\n${content}\nendstream\nendobj\n`);

const xrefPos = pos;
let xref = 'xref\n0 6\n0000000000 65535 f \n';
for (let n = 1; n <= 5; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
push(xref);
push(`trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefPos}\n%%EOF`);

const out = Buffer.concat(chunks);
const dest = process.argv[2];
writeFileSync(dest, out);
console.log('Wrote', dest, out.length, 'bytes');
