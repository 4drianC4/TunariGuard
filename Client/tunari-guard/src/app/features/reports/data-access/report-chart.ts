import type { ReportData, ReportKind } from './reports-api.service';

export function buildReportChart(data: ReportData, kind: ReportKind) {
  let entries: { label: string; values: (number | null)[] }[];
  if (data.detections) {
    const counts = new Map<string, number>();
    for (const detection of data.detections) {
      const month = detection.fecha_bo.slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    entries = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, values: [count] }));
  } else {
    const start = kind === 'alerts' ? 4 : 1;
    const end = kind === 'alerts' ? 6 : kind === 'comparison' ? 3 : 2;
    entries = data.rows.map((row) => ({
      label: String(row[0]),
      values: row.slice(start, end).map((value) => typeof value === 'number' ? value : null),
    }));
  }
  const displayed = kind === 'districts' ? entries : entries.slice(-12);
  if (!displayed.some((entry) => entry.values.some((value) => value !== null))) return null;
  const max = Math.max(1, ...displayed.flatMap((entry) => entry.values.map((value) => value ?? 0)));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const limit = Math.ceil(max / step) * step;
  return { entries: displayed, max: limit, ticks: [limit, limit / 2, 0], shortened: entries.length > displayed.length };
}
