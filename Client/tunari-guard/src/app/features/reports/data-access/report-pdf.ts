import type { ReportData, ReportValue } from './reports-api.service';

export interface ReportExportContext {
  title: string;
  date: string;
  fields: [label: string, value: string][];
  notices: string[];
}

interface PdfLogo {
  width: number;
  height: number;
  jpeg: Uint8Array;
}

const ink = '#303722';
const muted = '#595a4c';
const olive = '#40552c';
const line = '#ded6ca';
const paper = '#fffcf7';
const margin = 36;
const rowLimit = 20;
const bodySize = 8;
const lineHeight = 10;
const cellPadding = 4;
const numbers = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });

const winAnsi = '€\u0000‚ƒ„…†‡ˆ‰Š‹Œ\u0000Ž\u0000\u0000‘’“”•–—˜™š›œ\u0000žŸ';
function pdfText(text: string): string {
  return Array.from(text.replace(/[\u2010-\u2014\u2212]/g, '-'), (character) => {
    const code = character.charCodeAt(0);
    const special = winAnsi.indexOf(character);
    const byte = special >= 0 && code > 127 ? special + 128 : code;
    return byte >= 32 && byte <= 255 ? byte.toString(16).padStart(2, '0') : '3f';
  }).join('');
}

type Measure = (text: string, size: number, bold?: boolean) => number;

function wrap(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = current ? current + ' ' + word : word;
    if (measure(next) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = '';
    for (const character of word) {
      if (current && measure(current + character) > maxWidth) {
        const hyphen = current.lastIndexOf('-') + 1;
        const breakAt = hyphen > 1 ? hyphen : current.length;
        lines.push(current.slice(0, breakAt));
        current = current.slice(breakAt);
      }
      current += character;
    }
  }
  return [...lines, current];
}

function color(hex: string): string {
  return [1, 3, 5].map((index) => (Number.parseInt(hex.slice(index, index + 2), 16) / 255).toFixed(3)).join(' ');
}

const coord = (value: number): string => value.toFixed(2);
const printable = (value: ReportValue): string => String(value ?? 'Sin dato');

class ReportPage {
  readonly commands: string[] = [];

  constructor(readonly width: number, readonly height: number) {}

  rectangle(x: number, y: number, width: number, height: number, fill: string): void {
    this.commands.push(color(fill) + ' rg ' + [x, this.height - y - height, width, height].map(coord).join(' ') + ' re f');
  }

  text(value: string, x: number, y: number, size: number, fill: string, bold = false): void {
    this.commands.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + color(fill) + ' rg 1 0 0 1 '
      + coord(x) + ' ' + coord(this.height - y) + ' Tm <' + pdfText(value) + '> Tj ET');
  }

  image(x: number, y: number, width: number, height: number): void {
    this.commands.push('q ' + [width, 0, 0, height, x, this.height - y - height].map(coord).join(' ') + ' cm /Logo Do Q');
  }
}

function composeReportPdf(data: ReportData, context: ReportExportContext, logo: PdfLogo, measure: Measure): Blob {
  const [width, height] = data.columns.length > 4 ? [842, 595] : [595, 842];
  const contentWidth = width - margin * 2;
  const bodyEnd = height - 52;
  const writeHeader = (page: ReportPage): number => {
    page.rectangle(margin, 30, contentWidth, 3, olive);
    page.image(width - margin - 140, 45, 140, 140 * logo.height / logo.width);
    const title = wrap(context.title, contentWidth - 165, (value) => measure(value, 21, true));
    title.forEach((value, index) => page.text(value, margin, 67 + index * 24, 21, ink, true));
    return Math.max(90, 72 + title.length * 24);
  };

  let page = new ReportPage(width, height);
  const pages = [page];
  let y = writeHeader(page);
  const startPage = (): void => {
    page = new ReportPage(width, height);
    pages.push(page);
    y = writeHeader(page);
  };

  const paragraph = (value: string, x: number, maxWidth: number, size: number, fill: string): void => {
    for (const text of wrap(value, maxWidth, (entry) => measure(entry, size))) {
      if (y + size + 4 > bodyEnd) startPage();
      page.text(text, x, y + size, size, fill);
      y += size + 4;
    }
  };

  page.rectangle(margin, y, contentWidth, 57, '#edf0e3');
  page.rectangle(margin, y, 4, 57, '#526b24');
  page.text(data.headline.label, margin + 14, y + 18, 9, olive, true);
  const headline = data.headline.value === null ? 'Sin cobertura' : numbers.format(data.headline.value);
  page.text(headline, margin + 14, y + 43, 19, ink, true);
  if (data.headline.value !== null) {
    page.text(data.headline.unit, margin + 22 + measure(headline, 19, true), y + 43, 9, olive);
  }
  const rowCount = numbers.format(data.rows.length);
  const previewCount = data.rows.length > rowLimit ? `${rowLimit} de ${rowCount}` : rowCount;
  page.text(previewCount, width - margin - 14 - measure(previewCount, 19, true), y + 43, 19, ink, true);
  const rowLabel = 'Filas incluidas';
  page.text(rowLabel, width - margin - 14 - measure(rowLabel, 9, true), y + 18, 9, olive, true);
  y += 71;

  const fieldWidth = (contentWidth - 20) / 2;
  for (let index = 0; index < context.fields.length; index += 2) {
    const fields = context.fields.slice(index, index + 2).map(([label, value]) => ({
      label, lines: wrap(value, fieldWidth, (text) => measure(text, 9)),
    }));
    const fieldHeight = 15 + Math.max(...fields.map((field) => field.lines.length)) * 12;
    if (y + fieldHeight > bodyEnd) startPage();
    fields.forEach(({ label, lines }, column) => {
      const x = margin + column * (fieldWidth + 20);
      page.text(label, x, y + 8, 8, muted, true);
      lines.forEach((value, row) => page.text(value, x, y + 21 + row * 12, 9, ink));
    });
    y += fieldHeight + 1;
  }

  const notices = context.notices.filter(Boolean);
  if (notices.length) {
    y += 3;
    if (y + 36 > bodyEnd) startPage();
    page.rectangle(margin, y, contentWidth, 1, line);
    page.text('Notas de lectura', margin, y + 15, 10, ink, true);
    y += 19;
    for (const notice of notices) {
      paragraph(notice, margin, contentWidth, 8, muted);
    }
    y += 6;
  }

  if (data.rows.length > rowLimit) {
    paragraph('Se muestran las primeras 20 filas. El archivo CSV incluye el detalle completo.', margin, contentWidth, 8, muted);
    y += 5;
  }

  const rows = data.rows.slice(0, rowLimit);
  const dense = data.columns.length > 8;
  const columns = data.columns.map((label, column) => {
    const samples = rows.map((row) => printable(row[column] ?? null));
    const longestWord = Math.max(
      ...label.split(/\s+/).map((word) => measure(word, bodySize, true)),
      ...samples.flatMap((sample) => sample.split(/\s+/).map((word) => measure(word, bodySize))),
    );
    const preferred = Math.max(measure(label, bodySize, true), ...samples.map((sample) => measure(sample, bodySize)));
    return {
      minimum: Math.max(dense ? 28 : 44, Math.min(dense ? 62 : 82, longestWord + 2 * cellPadding + 2)),
      weight: Math.min(dense ? 100 : 280, preferred),
    };
  });
  const minimumTotal = columns.reduce((total, column) => total + column.minimum, 0);
  const totalWeight = columns.reduce((total, column) => total + column.weight, 0);
  const widths = columns.map(({ minimum, weight }) => minimumTotal > contentWidth
    ? minimum * contentWidth / minimumTotal
    : minimum + (contentWidth - minimumTotal) * weight / totalWeight);
  const cellLines = (values: ReportValue[], bold = false): string[][] => values.map((value, index) => {
    const text = printable(value).replace(/^(\d{4}-\d{2}-\d{2})(T(?=\d{2}:))/, '$1 $2');
    return wrap(text, widths[index] - cellPadding * 2 - 1, (word) => measure(word, bodySize, bold));
  });
  const headers = cellLines(data.columns, true);
  const headerLines = Math.max(...headers.map((entry) => entry.length));

  const band = (cells: string[][], offset: number, count: number, fill: string, textColor: string, row?: ReportValue[]): void => {
    const header = !row;
    const bandHeight = cellPadding * 2 + lineHeight * count;
    page.rectangle(margin, y, contentWidth, bandHeight, fill);
    if (!header) page.rectangle(margin, y + bandHeight - .5, contentWidth, .5, line);
    let x = margin;
    cells.forEach((cell, column) => {
      cell.slice(offset, offset + count).forEach((value, index) => {
        const textX = typeof row?.[column] === 'number'
          ? x + widths[column] - cellPadding - measure(value, bodySize)
          : x + cellPadding;
        page.text(value, textX, y + cellPadding + bodySize + index * lineHeight, bodySize, textColor, header);
      });
      x += widths[column];
    });
    y += bandHeight;
  };

  const tableHeading = (continued = false): void => {
    page.text(continued ? 'Detalle del reporte (continuación)' : 'Detalle del reporte', margin, y + 12, 12, ink, true);
    y += 21;
    band(headers, 0, headerLines, olive, '#ffffff');
  };

  const firstRow = rows[0];
  const firstRowLines = firstRow ? Math.max(...cellLines(firstRow).map((entry) => entry.length)) : 0;
  if (y + 21 + 4 * cellPadding + lineHeight * (headerLines + firstRowLines) > bodyEnd) startPage();
  tableHeading();
  rows.forEach((row, index) => {
    const cells = cellLines(row);
    const heightInLines = Math.max(...cells.map((entry) => entry.length));
    if (y + 2 * cellPadding + lineHeight * heightInLines > bodyEnd) {
      startPage();
      tableHeading(true);
    }
    for (let offset = 0; offset < heightInLines;) {
      const count = Math.min(heightInLines - offset, Math.floor((bodyEnd - y - 2 * cellPadding) / lineHeight));
      band(cells, offset, count, index % 2 ? '#f4efe6' : paper, ink, row);
      offset += count;
      if (offset < heightInLines) {
        startPage();
        tableHeading(true);
      }
    }
  });

  pages.forEach((sheet, index) => {
    const footer = 'Página ' + (index + 1) + ' de ' + pages.length;
    sheet.rectangle(margin, height - 42, contentWidth, 1, line);
    sheet.text('Generado ' + context.date + ' (hora de Bolivia)', margin, height - 26, 8, muted);
    sheet.text(footer, width - margin - measure(footer, 8), height - 26, 8, muted);
  });
  return serialize(pages, logo);
}

function serialize(pages: ReportPage[], logo: PdfLogo): Blob {
  const image = Array.from(logo.jpeg, (value) => value.toString(16).padStart(2, '0')).join('') + '>';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /XObject /Subtype /Image /Width ' + logo.width + ' /Height ' + logo.height
      + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length '
      + image.length + ' >>\nstream\n' + image + '\nendstream',
  ];
  const pageIds = pages.map((page) => {
    const id = objects.length + 1;
    const stream = page.commands.join('\n');
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + page.width + ' ' + page.height
        + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents '
        + (id + 1) + ' 0 R >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
    );
    return id + ' 0 R';
  });
  objects[1] = '<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.join(' ') + '] >>';
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return offset;
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
    + offsets.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
    + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Blob([pdf], { type: 'application/pdf' });
}

export async function createReportPdf(data: ReportData, context: ReportExportContext): Promise<Blob> {
  const image = new Image();
  image.src = new URL('assets/logos/PNG/LOGOHORIZONTAL.png', document.baseURI).href;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
  const graphics = canvas.getContext('2d');
  if (!graphics) throw new Error('El navegador no pudo preparar el PDF.');
  graphics.fillStyle = '#ffffff';
  graphics.fillRect(0, 0, canvas.width, canvas.height);
  graphics.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', .94).split(',')[1]), (byte) => byte.charCodeAt(0));
  const measure: Measure = (text, size, bold) => {
    graphics.font = (bold ? 'bold ' : '') + size + 'px Arial, sans-serif';
    return graphics.measureText(text).width;
  };
  return composeReportPdf(data, context, { width: canvas.width, height: canvas.height, jpeg }, measure);
}

