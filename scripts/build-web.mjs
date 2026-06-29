// Stage the browser vendor assets into web/public/vendor so the front-end can
// render PDFs and run OCR client-side, fully offline (no CDN). Run by `npm run
// web` locally and by Netlify's build command before publishing web/public.

import { mkdirSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const nm = join(root, 'node_modules');
const vendor = join(root, 'web', 'public', 'vendor');

function copyInto(srcFiles, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const [src, name] of srcFiles) {
    if (!existsSync(src)) throw new Error(`Missing vendor asset: ${src}`);
    copyFileSync(src, join(destDir, name || src.split('/').pop()));
  }
}

// Clean previous vendor output.
if (existsSync(vendor)) rmSync(vendor, { recursive: true, force: true });

// pdf.js legacy build (works on older corporate browsers).
const pdfjs = join(nm, 'pdfjs-dist', 'legacy', 'build');
copyInto(
  [
    [join(pdfjs, 'pdf.min.mjs')],
    [join(pdfjs, 'pdf.worker.min.mjs')],
  ],
  join(vendor, 'pdfjs')
);

// tesseract.js browser worker + ESM entry.
const tess = join(nm, 'tesseract.js', 'dist');
copyInto(
  [
    [join(tess, 'tesseract.esm.min.js')],
    [join(tess, 'worker.min.js')],
  ],
  join(vendor, 'tesseract')
);

// tesseract core WASM variants (createWorker picks the right one at runtime).
const core = join(nm, 'tesseract.js-core');
const coreFiles = readdirSync(core).filter((f) => /^tesseract-core.*\.(wasm|js)$/.test(f));
copyInto(coreFiles.map((f) => [join(core, f)]), join(vendor, 'tesseract'));

// Bundled English language data (offline OCR).
copyInto(
  [[join(root, 'src', 'data', 'tessdata', 'eng.traineddata.gz')]],
  join(vendor, 'tessdata')
);

console.log('Staged browser vendor assets into web/public/vendor/');
