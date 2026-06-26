// Pure page-offset helper, kept free of any native/OCR dependencies so the
// rules engine and the serverless functions can import it without pulling in
// pdfjs / canvas / tesseract.

// Resolve a character offset to a page number using the page map
// ([{ page, start, end }]).
export function offsetToPage(pages, offset) {
  for (const p of pages) {
    if (offset >= p.start && offset <= p.end) return p.page;
  }
  return pages.length ? pages[pages.length - 1].page : null;
}
