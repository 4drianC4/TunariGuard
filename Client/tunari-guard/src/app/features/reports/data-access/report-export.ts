import type { ReportData, ReportValue } from './reports-api.service';

export type ExportFormat = 'PDF' | 'CSV' | 'Excel' | 'GeoJSON';

const textValue = (value: ReportValue): string => String(value ?? '');
const spreadsheetText = (value: ReportValue): string => {
  const text = textValue(value);
  return typeof value === 'string' && /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
};

export function exportReport(
  format: ExportFormat, data: ReportData, metadata: string[],
): { blob: Blob; extension: string } {
  const rows = [data.columns, ...data.rows];
  switch (format) {
    case 'CSV': {
      const csv = rows.map((row) =>
        row.map((value) => '"' + spreadsheetText(value).replaceAll('"', '""') + '"').join(';'),
      ).join('\r\n');
      return { blob: new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), extension: 'csv' };
    }
    case 'Excel': {
      const xmlEscape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const worksheet = (name: string, values: ReportValue[][]): string => {
        const body = values.map((row) => '<Row>' + row.map((value) => {
          const type = typeof value === 'number' ? 'Number' : 'String';
          return `<Cell><Data ss:Type="${type}">${xmlEscape(textValue(value))}</Data></Cell>`;
        }).join('') + '</Row>').join('');
        return `<Worksheet ss:Name="${name}"><Table>${body}</Table></Worksheet>`;
      };
      const xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
        + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
        + worksheet('Reporte', rows) + worksheet('Contexto', metadata.map((line) => [line])) + '</Workbook>';
      return { blob: new Blob([xml], { type: 'application/xml' }), extension: 'xml' };
    }
    case 'GeoJSON': {
      const features = data.detections?.map(({ lat, lon, ...properties }) => ({
        type: 'Feature', id: properties.id_deteccion,
        geometry: { type: 'Point', coordinates: [lon, lat] }, properties,
      })) ?? [];
      const json = JSON.stringify({ type: 'FeatureCollection', features });
      return { blob: new Blob([json], { type: 'application/geo+json' }), extension: 'geojson' };
    }
    case 'PDF': {
      const detail = data.rows.slice(0, 20).map((row) => row.map(textValue).join(' | '));
      const lines = [
        ...metadata, '', data.columns.join(' | '), ...detail,
        ...(data.rows.length > 20 ? ['Detalle limitado a 20 filas. El CSV incluye todas las filas.'] : []),
      ];
      return { blob: summaryPdf(lines), extension: 'pdf' };
    }
  }
}

function summaryPdf(lines: string[]): Blob {
  const plain = (value: string): string => value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  const escaped = (value: string): string => value.replace(/[\\()]/g, '\\$&');
  const wrapped = lines.flatMap((line) => plain(line).match(/.{1,120}(?:\s|$)|.{1,120}/g) ?? ['']);
  const pageIds: number[] = [];
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'];
  for (let offset = 0; offset < wrapped.length; offset += 40) {
    const pageId = objects.length + 1;
    pageIds.push(pageId);
    const commands = wrapped.slice(offset, offset + 40).map((line) => `(${escaped(line)}) Tj T*`);
    const stream = ['BT', '/F1 10 Tf', '44 553 Td', '13 TL', ...commands, 'ET'].join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => id + ' 0 R').join(' ')}] >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}
