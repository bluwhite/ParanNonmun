/*
 * PDF 메모 검색 모듈 v0.7.3
 *
 * 외부 의존성:
 *   window.pdfjsLib
 *
 * 공개 API:
 *   window.PdfNoteSearch.search(items, query, onProgress)
 */
(function (global) {
  "use strict";

  const NOTE_TYPES = new Set([1, 3]); // PDF.js: Text=1, FreeText=3

  function getAnnotationText(annotation) {
    if (annotation?.contentsObj?.str) return annotation.contentsObj.str;
    if (typeof annotation?.contents === "string") return annotation.contents;
    if (annotation?.contents?.str) return annotation.contents.str;
    return "";
  }

  async function readNotesFromPdf(item, query) {
    if (!global.pdfjsLib) {
      throw new Error("PDF.js가 로드되지 않았습니다.");
    }

    const file = await item.handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = global.pdfjsLib.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    const results = [];
    const q = (query || "").trim().toLocaleLowerCase();

    try {
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const annotations = await page.getAnnotations({ intent: "display" });

        for (const annotation of annotations) {
          if (!NOTE_TYPES.has(annotation.annotationType)) continue;

          const text = getAnnotationText(annotation).trim();
          if (!text) continue;
          if (q && !text.toLocaleLowerCase().includes(q)) continue;

          results.push({
            name: item.name,
            path: item.path,
            page: pageNo,
            text
          });
        }

        page.cleanup();
      }
    } finally {
      await pdf.destroy();
    }

    return results;
  }

  async function search(items, query = "", onProgress = () => {}) {
    if (!global.pdfjsLib) {
      throw new Error("PDF.js가 로드되지 않았습니다.");
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      onProgress({
        current: i + 1,
        total: items.length,
        found: results.length,
        item
      });

      try {
        results.push(...await readNotesFromPdf(item, query));
      } catch (error) {
        console.error("PDF 메모 검색 실패:", item.path, error);
        errors.push({ path: item.path, error });
      }

      // Let the browser repaint progress text during long scans.
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    results.sort((a, b) =>
      a.path.localeCompare(b.path, "ko") ||
      a.page - b.page ||
      a.text.localeCompare(b.text, "ko")
    );

    return { results, errors };
  }

  // Explicit global export so main.js can always find it.
  global.PdfNoteSearch = Object.freeze({ search });
})(window);
