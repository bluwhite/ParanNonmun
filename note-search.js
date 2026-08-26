pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const PdfNoteSearch = (() => {
  const NOTE_TYPES = new Set([1, 3]); // Text, FreeText

  function annotationText(annotation) {
    if (annotation?.contentsObj?.str) return annotation.contentsObj.str;
    if (typeof annotation?.contents === "string") return annotation.contents;
    if (annotation?.contents?.str) return annotation.contents.str;
    return "";
  }

  async function notesFromPdf(item, query) {
    const file = await item.handle.getFile();
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const notes = [];
    const q = (query || "").toLocaleLowerCase();

    try {
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const annotations = await page.getAnnotations({ intent: "display" });

        for (const annotation of annotations) {
          if (!NOTE_TYPES.has(annotation.annotationType)) continue;
          const text = annotationText(annotation).trim();
          if (!text) continue;
          if (q && !text.toLocaleLowerCase().includes(q)) continue;

          notes.push({
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

    return notes;
  }

  async function search(items, query = "", onProgress = () => {}) {
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
        results.push(...await notesFromPdf(item, query));
      } catch (error) {
        console.error("PDF 메모 검색 실패:", item.path, error);
        errors.push({ path: item.path, error });
      }

      await new Promise(resolve => setTimeout(resolve, 0));
    }

    results.sort((a, b) =>
      a.path.localeCompare(b.path, "ko") ||
      a.page - b.page ||
      a.text.localeCompare(b.text, "ko")
    );

    return { results, errors };
  }

  return { search };
})();
