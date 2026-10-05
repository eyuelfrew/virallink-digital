'use client';

import { useState, useCallback } from 'react';
import { FileImage, FileText, Loader2 } from 'lucide-react';

/**
 * Export the report as a PNG image or a PDF.
 *
 * Both are produced in the browser rather than on the server, which matters for
 * this deployment. The API runs on shared cPanel hosting under Passenger, where
 * spawning a headless Chromium to rasterise a page is a reliable way to hit the
 * process memory ceiling and get the app killed. Rendering client-side costs the
 * visitor nothing and cannot take the site down.
 *
 * How it works: html2canvas paints the referenced node into a canvas, then the
 * canvas is either downloaded as a PNG or handed to jsPDF, which slices the tall
 * canvas across A4 pages so a multi-section report does not arrive as one
 * unreadably shrunk page.
 *
 * The libraries are imported dynamically. Both are large and only needed when
 * someone actually exports, so bundling them would make every report view pay for
 * a button most visitors never press.
 */

/** A4 at 96dpi, in pixels — the unit html2canvas produces. */
const A4 = { width: 794, height: 1123 };

/**
 * @param targetRef ref attached to the report container by the caller. Passing the
 *   ref rather than wrapping the report in here keeps the export buttons in the
 *   page header, outside the thing being exported — otherwise the report would
 *   photograph its own controls.
 */
export function ReportExportButtons({ targetRef, title = 'report' }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const capture = useCallback(async () => {
    const node = targetRef?.current;
    if (!node) throw new Error('Nothing to export yet');

    const { default: html2canvas } = await import('html2canvas');

    return html2canvas(node, {
      // 2x so 12px type stays crisp; at 1x it reads as visibly soft.
      scale: 2,
      // Without an explicit white background the PNG is transparent, and dark text
      // on transparency is unreadable in any viewer using a dark background.
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      // Recharts paints after layout. Waiting one frame avoids capturing a blank
      // box where the graph should be.
      onclone: (doc) => {
        doc.querySelectorAll('[data-export-ignore]').forEach((node) => {
          node.style.display = 'none';
        });
      },
    });
  }, [targetRef]);

  async function exportPng() {
    setBusy('png');
    setError(null);

    try {
      const canvas = await capture();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

      if (!blob) throw new Error('The browser produced an empty image.');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug(title)}.png`;
      link.click();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause?.message || 'The image could not be created.');
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    setBusy('pdf');
    setError(null);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await capture();
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4.width, A4.height] });

      const scaledHeight = (canvas.height * A4.width) / canvas.width;
      const image = canvas.toDataURL('image/png');

      pdf.addImage(image, 'PNG', 0, 0, A4.width, scaledHeight, undefined, 'FAST');

      // Walk down the tall canvas, drawing each page's slice at a negative Y offset.
      let offset = scaledHeight - A4.height;

      while (offset > 0) {
        pdf.addPage();
        pdf.addImage(image, 'PNG', 0, offset, A4.width, scaledHeight, undefined, 'FAST');
        offset -= A4.height;
      }

      pdf.save(`${slug(title)}.pdf`);
    } catch (cause) {
      setError(cause?.message || 'The PDF could not be created.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={exportPng}
          disabled={Boolean(busy)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-60"
        >
          {busy === 'png' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileImage className="size-4" aria-hidden="true" />
          )}
          PNG
        </button>

        <button
          type="button"
          onClick={exportPdf}
          disabled={Boolean(busy)}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {busy === 'pdf' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="size-4" aria-hidden="true" />
          )}
          PDF
        </button>
      </div>

      {error ? (
        <p role="alert" className="max-w-xs rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Filename-safe version of a title. */
function slug(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'report'
  );
}

export default ReportExportButtons;