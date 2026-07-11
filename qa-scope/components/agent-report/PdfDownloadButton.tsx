'use client';

import { useState } from 'react';

export default function PdfDownloadButton({ targetId, fileName }: { targetId: string; fileName: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const el = document.getElementById(targetId);
      if (!el) return;
      const canvas = await html2canvas(el, { scale: 2 });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(fileName);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-control bg-ink px-4 py-1.5 text-sm font-medium text-ink-inverse hover:opacity-90 disabled:opacity-50"
    >
      {loading ? '생성 중...' : 'PDF 다운로드'}
    </button>
  );
}
