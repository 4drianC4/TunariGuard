import { createReportPdf, type ReportExportContext } from './report-pdf';
import type { ReportData, ReportValue } from './reports-api.service';
import { translate } from '../../../core/i18n/language.service';

export type ExportFormat = 'PDF' | 'CSV' | 'Excel' | 'GeoJSON';

const textValue = (value: ReportValue): string => String(value ?? '');
const spreadsheetText = (value: ReportValue): string => {
  const text = textValue(value);
  return typeof value === 'string' && /^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
};

export async function exportReport(
  format: ExportFormat, data: ReportData, context: ReportExportContext,
): Promise<{ blob: Blob; extension: string }> {
  if (format === 'PDF') return { blob: await createReportPdf(data, context), extension: 'pdf' };
  const rows = [data.columns, ...data.rows];
  switch (format) {
    case 'CSV': {
      const csv = rows.map((row) =>
        row.map((value) => '"' + spreadsheetText(value).replaceAll('"', '""') + '"').join(';'),
      ).join('\r\n');
      return { blob: new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), extension: 'csv' };
    }
    case 'Excel': {
      const t = (key: string) => translate(context.language, key);
      const metadata = [
        'Tunari Guard · ' + context.title,
        t('Generado:') + ' ' + context.date,
        ...context.fields.map(([label, value]) => label + ': ' + value),
        data.headline.label + ': ' + (data.headline.value ?? t('Sin cobertura')) + ' ' + data.headline.unit,
        ...context.notices,
      ];
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
        + worksheet(t('Reporte'), rows) + worksheet(t('Contexto'), metadata.map((line) => [line])) + '</Workbook>';
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
  }
}
