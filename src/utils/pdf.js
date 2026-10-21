import { jsPDF } from 'jspdf';
import * as AutoTable from 'jspdf-autotable';
import { formatValue } from '../data/reports.js';

const autoTable = AutoTable.autoTable || AutoTable.default;

const C = {
  brand: [14, 107, 92],
  dark: [18, 26, 24],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  soft: [248, 250, 252],
  in: [21, 128, 61],
  out: [220, 38, 38],
};

const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\u2212/g, '-');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function exportPdf(report, profil = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const nama = profil.namaUsaha || 'Usaha Saya';
  const dicetak = new Date().toLocaleString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // ===== Header =====
  doc.setFillColor(...C.brand);
  doc.rect(0, 0, W, 3, 'F');

  doc.roundedRect(M, 11, 15, 15, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(nama[0].toUpperCase(), M + 7.5, 21, { align: 'center' });

  doc.setTextColor(...C.dark);
  doc.setFontSize(13);
  doc.text(clean(nama), M + 19, 16.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  const kontak = [profil.alamat, profil.telepon && `+${profil.telepon}`].filter(Boolean).join('  |  ');
  doc.text(clean(kontak || 'Laporan Keuangan Usaha'), M + 19, 22, { maxWidth: 90 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...C.dark);
  doc.text(clean(report.title).toUpperCase(), W - M, 16.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.muted);
  doc.text(clean(report.period), W - M, 22, { align: 'right' });

  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.3);
  doc.line(M, 31, W - M, 31);

  let y = 37;
  if (report.subtitle) {
    doc.setFontSize(9);
    doc.text(clean(report.subtitle), M, y);
    y += 5;
  }

  // ===== Kotak ringkasan =====
  const n = report.summary.length;
  const gap = 4;
  const bw = (W - 2 * M - gap * (n - 1)) / n;

  report.summary.forEach((s, i) => {
    const x = M + i * (bw + gap);
    const strong = s.tone === 'strong';

    doc.setFillColor(...(strong ? C.dark : C.soft));
    doc.roundedRect(x, y, bw, 18, 2, 2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...(strong ? [148, 163, 184] : C.muted));
    doc.text(clean(s.label).toUpperCase(), x + 4, y + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...(strong ? [255, 255, 255] : s.tone === 'in' ? C.in : s.tone === 'out' ? C.out : C.dark));
    doc.text(clean(formatValue(s.value, s.type || 'money')), x + 4, y + 13.5, { maxWidth: bw - 6 });
  });
  y += 25;

  // ===== Tabel =====
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 16, bottom: 20 },
    head: [report.columns.map((c) => c.header)],
    body: report.rows.map((r) => report.columns.map((c) => clean(formatValue(r[c.key], c.type)))),
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: C.dark,
      cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 },
      lineColor: C.line,
      lineWidth: { bottom: 0.2 },
    },
    headStyles: { fillColor: C.dark, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.soft },
    columnStyles: Object.fromEntries(
      report.columns.map((c, i) => [i, { halign: c.align || 'left', ...(c.width ? { cellWidth: c.width } : {}) }])
    ),
    didParseCell: (d) => {
      const col = report.columns[d.column.index];
      if (d.section === 'head') {
        d.cell.styles.halign = col.align || 'left';
        return;
      }
      const row = report.rows[d.row.index];
      if (!row) return;
      if (row._style === 'bold') d.cell.styles.fontStyle = 'bold';
      if (row._style === 'sub' && d.column.index === 0) {
        d.cell.styles.cellPadding = { top: 2.6, bottom: 2.6, left: 9, right: 3 };
      }
      if (row._style === 'total') {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [226, 240, 236];
        d.cell.styles.textColor = [10, 82, 71];
      }
    },
  });

  let endY = (doc.lastAutoTable?.finalY ?? y) + 8;

  if (!report.rows.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text('Tidak ada data pada periode ini', W / 2, endY, { align: 'center' });
    endY += 8;
  }

  if (report.note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(clean(`Catatan: ${report.note}`), M, endY, { maxWidth: W - 2 * M });
    endY += 10;
  }

  // ===== Tanda tangan =====
  if (endY > H - 55) {
    doc.addPage();
    endY = 24;
  }
  const sx = W - M - 55;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text(clean(`Dibuat, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`), sx, endY + 4);
  doc.text('Mengetahui,', sx, endY + 10);
  doc.setDrawColor(...C.dark);
  doc.line(sx, endY + 32, W - M, endY + 32);
  doc.setFont('helvetica', 'bold');
  doc.text(clean(profil.pemilik || 'Pemilik Usaha'), sx, endY + 37);

  // ===== Footer tiap halaman =====
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.line);
    doc.line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(clean(`Dicetak ${dicetak} - ${nama}`), M, H - 9);
    doc.text(`Halaman ${i} dari ${pages}`, W - M, H - 9, { align: 'right' });
  }

  doc.save(`${slug(report.title)}_${report.from}_${report.to}.pdf`);
}