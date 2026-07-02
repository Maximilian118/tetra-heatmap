import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/* A4 dimensions in millimetres */
const A4_W = 210;
const A4_H = 297;

/* Sanitise a string into a safe filename */
const toFilename = (title: string): string => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "report";
};

/* Capture the report preview element as a PDF.
   The element contains only HTML + a static <img> (no WebGL), so
   html2canvas handles it cleanly. */
export const captureReportPdf = async (
  reportEl: HTMLElement,
  title: string,
): Promise<void> => {
  /* Swap <input> for <span> so html2canvas doesn't clip text descenders */
  const titleInput = reportEl.querySelector(".report-banner__title") as HTMLInputElement | null;
  let titleSpan: HTMLSpanElement | null = null;

  if (titleInput) {
    titleSpan = document.createElement("span");
    titleSpan.className = titleInput.className;
    titleSpan.textContent = titleInput.value || titleInput.placeholder;
    titleSpan.style.display = "block";
    titleInput.replaceWith(titleSpan);
  }

  /* Pre-crop the map image to match its container's aspect ratio.
     html2canvas does NOT support object-fit:cover — it stretches the full
     image to fill the element, ignoring the crop. We do the crop manually
     so html2canvas sees an image that already fits perfectly. */
  const mapImg = reportEl.querySelector(".report-preview__img") as HTMLImageElement | null;
  let savedSrc: string | null = null;
  let savedObjectFit: string | null = null;

  if (mapImg) {
    savedSrc = mapImg.src;
    savedObjectFit = mapImg.style.objectFit;

    const containerW = mapImg.clientWidth;
    const containerH = mapImg.clientHeight;
    const containerAspect = containerW / containerH;

    /* Load the original snapshot to get its natural dimensions */
    const natW = mapImg.naturalWidth;
    const natH = mapImg.naturalHeight;
    const imgAspect = natW / natH;

    /* Calculate the source crop rectangle (centre-crop to fill, like object-fit:cover) */
    let sx = 0, sy = 0, sw = natW, sh = natH;
    if (imgAspect > containerAspect) {
      /* Image is wider than container — crop sides */
      sw = natH * containerAspect;
      sx = (natW - sw) / 2;
    } else {
      /* Image is taller than container — crop top/bottom */
      sh = natW / containerAspect;
      sy = (natH - sh) / 2;
    }

    /* Draw the cropped region to an offscreen canvas at 2x for quality */
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = containerW * 2;
    cropCanvas.height = containerH * 2;
    const cropCtx = cropCanvas.getContext("2d")!;
    cropCtx.drawImage(mapImg, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

    /* Replace the img src with the pre-cropped version and disable object-fit */
    mapImg.src = cropCanvas.toDataURL("image/png");
    mapImg.style.objectFit = "fill";

    /* Wait for the new src to load */
    await new Promise<void>((resolve) => {
      if (mapImg.complete) resolve();
      else mapImg.onload = () => resolve();
    });
  }

  /* Capture the entire report element */
  const canvas = await html2canvas(reportEl, {
    useCORS: true,
    scale: 3,
    backgroundColor: null,
    logging: false,
  });

  /* Restore the <input> */
  if (titleSpan && titleInput) {
    titleSpan.replaceWith(titleInput);
  }

  /* Restore the original map image src and object-fit */
  if (mapImg && savedSrc !== null) {
    mapImg.src = savedSrc;
    mapImg.style.objectFit = savedObjectFit ?? "";
  }

  /* Write to PDF — scale to fit A4 while preserving the captured aspect ratio */
  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const imgAspect = canvas.width / canvas.height;
  const pageAspect = A4_W / A4_H;
  let drawW: number, drawH: number;

  if (imgAspect > pageAspect) {
    /* Captured image is wider than A4 — fit to width */
    drawW = A4_W;
    drawH = A4_W / imgAspect;
  } else {
    /* Captured image is taller than A4 — fit to height */
    drawH = A4_H;
    drawW = A4_H * imgAspect;
  }

  /* Centre on the page */
  const x = (A4_W - drawW) / 2;
  const y = (A4_H - drawH) / 2;
  pdf.addImage(imgData, "JPEG", x, y, drawW, drawH);
  pdf.save(`${toFilename(title)}.pdf`);
};
