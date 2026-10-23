import { getDocument, GlobalWorkerOptions } from "./vendor/pdfjs/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;

const materialStatus = document.querySelector("#materialsStatus");
const reader = document.querySelector(".material-reader");
const pdfViewport = document.querySelector("#pdfReader");
const pdfStatus = document.querySelector("#pdfStatus");
const pageInput = document.querySelector("#pdfPage");
const previousPage = document.querySelector("#pdfPrevious");
const nextPage = document.querySelector("#pdfNext");
let loadingTask, pdfDocument, renderTask;
let documentVersion = 0, renderVersion = 0, pageNumber = 1;

async function renderPage() {
  if (!pdfDocument) return;
  const version = ++renderVersion;
  renderTask?.cancel();
  const currentPage = pageNumber;
  pageInput.value = currentPage;
  previousPage.disabled = currentPage === 1;
  nextPage.disabled = currentPage === pdfDocument.numPages;
  pdfStatus.textContent = "ページを読み込んでいます。";
  document.querySelector("#pdfPageText").textContent = "";
  try {
    const page = await pdfDocument.getPage(currentPage);
    if (version !== renderVersion) return;
    const base = page.getViewport({ scale: 1 });
    const scale = (pdfViewport.clientWidth - 16) / base.width * Number(document.querySelector("#pdfZoom").value);
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width * outputScale);
    canvas.height = Math.ceil(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `PDF ${currentPage} ページ`);
    pdfViewport.replaceChildren(canvas);
    pdfViewport.scrollTop = 0;
    pdfViewport.scrollLeft = 0;
    renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport,
      transform: [outputScale, 0, 0, outputScale, 0, 0] });
    await renderTask.promise;
    const text = await page.getTextContent();
    if (version !== renderVersion) return;
    document.querySelector("#pdfPageText").textContent = text.items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("");
    pdfStatus.textContent = `${currentPage} / ${pdfDocument.numPages} ページ`;
  } catch (error) {
    if (version !== renderVersion || error.name === "RenderingCancelledException") return;
    pdfStatus.textContent = "表示できませんでした。「PDFを開く」または原本ダウンロードをご利用ください。";
  }
}

async function showMaterial(item) {
  const version = ++documentVersion;
  ++renderVersion;
  renderTask?.cancel();
  pdfDocument = null;
  document.querySelector("#readerTitle").textContent = item.title;
  document.querySelector("#openPdf").href = item.file;
  document.querySelector("#downloadPdf").href = item.file;
  pdfViewport.replaceChildren();
  pdfStatus.textContent = "PDF を読み込んでいます。";
  document.querySelector("#pdfPageText").textContent = "";
  document.querySelector("#pdfPageCount").textContent = `/ ${item.page_count}`;
  pageInput.disabled = previousPage.disabled = nextPage.disabled = true;
  pageInput.value = 1;
  reader.hidden = false;
  history.replaceState(null, "", `#${item.id}`);
  reader.scrollIntoView({ block: "start", behavior: "smooth" });
  try {
    await loadingTask?.destroy();
    if (version !== documentVersion) return;
    loadingTask = getDocument({ url: item.file, cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href, cMapPacked: true,
      standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).href,
      wasmUrl: new URL("./vendor/pdfjs/wasm/", import.meta.url).href,
      iccUrl: new URL("./vendor/pdfjs/iccs/", import.meta.url).href, isEvalSupported: false });
    const loaded = await loadingTask.promise;
    if (version !== documentVersion) return;
    pdfDocument = loaded;
    pageNumber = 1;
    pageInput.max = loaded.numPages;
    pageInput.disabled = false;
    await renderPage();
  } catch {
    if (version === documentVersion) pdfStatus.textContent = "PDF を読み込めませんでした。接続を確認するか、原本をダウンロードしてください。";
  }
}

previousPage.addEventListener("click", () => { pageNumber -= 1; renderPage(); });
nextPage.addEventListener("click", () => { pageNumber += 1; renderPage(); });
pageInput.addEventListener("change", () => {
  if (!pdfDocument) return;
  pageNumber = Math.max(1, Math.min(pdfDocument.numPages, Number.parseInt(pageInput.value, 10) || 1));
  renderPage();
});
document.querySelector("#pdfZoom").addEventListener("change", renderPage);
let readerWidth = 0;
new ResizeObserver(() => {
  if (!reader.hidden && pdfViewport.clientWidth !== readerWidth) {
    readerWidth = pdfViewport.clientWidth;
    renderPage();
  }
}).observe(pdfViewport);

async function loadMaterials() {
  try {
    const response = await fetch("./data/whr-2026-materials.json");
    if (!response.ok) throw new Error("manifest unavailable");
    const manifest = await response.json();
    const ready = manifest.items.filter(item => item.status === "ready" && item.file);
    materialStatus.textContent = ready.length === manifest.items.length
      ? `${ready.length} 件の原本 PDF を収録しています。`
      : `原本 PDF：${ready.length} / ${manifest.items.length} 件。未取得の教材は原本の追加待ちです。`;
    for (const item of [...manifest.items].sort((a, b) => a.order - b.order)) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.title;
      button.disabled = item.status !== "ready" || !item.file;
      button.addEventListener("click", () => showMaterial(item));
      const detail = document.createElement("small");
      detail.textContent = button.disabled ? "原本の追加待ち" : `${item.page_count} ページ · PDF`;
      li.append(button, detail);
      document.querySelector(item.kind === "textbook" ? "#textbookList" : "#mockPdfList").append(li);
    }
    const selected = ready.find(item => `#${item.id}` === location.hash);
    if (selected) showMaterial(selected);
  } catch {
    materialStatus.textContent = "教材一覧を読み込めませんでした。接続を確認して再読み込みしてください。";
  }
}

loadMaterials();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
