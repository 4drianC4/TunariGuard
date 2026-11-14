import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

type Level = 'Crítica' | 'Alta' | 'Media' | 'Baja';
type ExportFormat = 'PDF' | 'CSV' | 'Excel';
interface ReportRow { district: string; count: number; level: 'Alto' | 'Medio' | 'Bajo'; change: number; }
interface Detection { date: string; district: string; level: Level; source: 'MODIS' | 'VIIRS'; }
interface DownloadRecord { title: string; date: string; format: ExportFormat; fileName: string; content: Blob; }

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPageComponent {
  readonly districts = ['Todos los distritos', 'Tiquipaya', 'Sacaba', 'Vinto', 'Colcapirhua', 'Quillacollo'];
  readonly levels: Level[] = ['Crítica', 'Alta', 'Media', 'Baja'];
  readonly sourceOptions = ['Armonizada (MODIS + VIIRS)', 'MODIS', 'VIIRS'];
  readonly reportTypes = ['Resumen de anomalías', 'Reporte por distrito', 'Tendencia temporal', 'Comparación de sensores'];
  readonly demoRows: ReportRow[] = [
    { district: 'Tiquipaya', count: 27, level: 'Alto', change: 4 },
    { district: 'Sacaba', count: 17, level: 'Medio', change: 2 },
    { district: 'Vinto', count: 12, level: 'Medio', change: 1 },
    { district: 'Colcapirhua', count: 11, level: 'Bajo', change: 0 },
    { district: 'Quillacollo', count: 9, level: 'Bajo', change: -1 },
  ];
  // Datos artificiales para mostrar el flujo completo de reportes sin una API conectada.
  readonly records: Detection[] = Array.from({ length: 76 }, (_, index) => {
    const day = 8 + Math.floor(index * 7 / 76);
    const hour = 6 + index % 13;
    const district = this.demoRows[index % this.demoRows.length].district;
    return {
      date: `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:24:00`,
      district,
      level: (index < 12 ? 'Crítica' : index < 36 ? 'Alta' : index < 64 ? 'Media' : 'Baja') as Level,
      source: index % 2 ? 'VIIRS' : 'MODIS',
    };
  });
  startDate = '2026-11-01';
  endDate = '2026-11-14';
  selectedDistrict = 'Todos los distritos';
  selectedSeverity = 'Todas';
  selectedSource = 'Armonizada (MODIS + VIIRS)';
  reportType = 'Resumen de anomalías';
  format: ExportFormat = 'PDF';
  filtersExpanded = false;
  applied = { start: this.startDate, end: this.endDate, district: this.selectedDistrict, severity: this.selectedSeverity, source: this.selectedSource };
  errorMessage = '';
  successMessage = '';
  recent: DownloadRecord[] = [];
  readonly days = ['8 nov', '9 nov', '10 nov', '11 nov', '12 nov', '13 nov', '14 nov'];

  get filtered(): Detection[] {
    return this.records.filter(r => r.date.slice(0,10) >= this.applied.start && r.date.slice(0,10) <= this.applied.end &&
      (this.applied.district === 'Todos los distritos' || r.district === this.applied.district) &&
      (this.applied.severity === 'Todas' || r.level === this.applied.severity) &&
      (this.applied.source.startsWith('Armonizada') || r.source === this.applied.source));
  }
  get total(): number { return this.filtered.length; }
  get activeDistricts(): number { return new Set(this.filtered.map(r => r.district)).size; }
  get districtRows(): ReportRow[] {
    return this.demoRows.map(row => {
      const count = this.filtered.filter(r => r.district === row.district).length;
      const level: ReportRow['level'] = count >= 18 ? 'Alto' : count >= 10 ? 'Medio' : 'Bajo';
      return { ...row, count, level, change: count ? row.change : 0 };
    }).filter(row => row.count > 0);
  }
  get breakdown(): { label: Level; count: number; color: string }[] {
    return [
      { label: 'Crítica' as Level, count: this.filtered.filter(r => r.level === 'Crítica').length, color: '#e82c35' },
      { label: 'Alta' as Level, count: this.filtered.filter(r => r.level === 'Alta').length, color: '#fc8700' },
      { label: 'Media' as Level, count: this.filtered.filter(r => r.level === 'Media').length, color: '#f8d756' },
      { label: 'Baja' as Level, count: this.filtered.filter(r => r.level === 'Baja').length, color: '#80b51b' },
    ];
  }
  get donut(): string {
    if (!this.total) return '#e9e7df';
    let cursor = 0;
    const stops = this.breakdown.map(s => {
      const next = cursor + s.count / this.total * 100;
      const stop = `${s.color} ${cursor.toFixed(2)}% ${next.toFixed(2)}%`;
      cursor = next;
      return stop;
    });
    return `conic-gradient(${stops.join(',')})`;
  }
  get timeline(): number[] {
    return Array.from({length:7}, (_,i) => this.filtered.filter(r => Number(r.date.slice(8,10)) === 8+i).length);
  }
  get linePoints(): string {
    const values = this.timeline;
    const max = Math.max(20,...values);
    return values.map((v,i) => `${30+i*71},${174-v/max*145}`).join(' ');
  }
  get areaPoints(): string { return `30,174 ${this.linePoints} 456,174`; }
  get latestReportCount(): number { return this.recent.length; }
  apply(): void {
    this.errorMessage = '';
    if (this.startDate > this.endDate) { this.errorMessage = 'La fecha inicial debe ser anterior a la fecha final.'; return; }
    this.applied = { start: this.startDate, end: this.endDate, district: this.selectedDistrict, severity: this.selectedSeverity, source: this.selectedSource };
    this.successMessage = 'Filtros aplicados a las visualizaciones y exportaciones DEMO.';
  }
  reset(): void {
    this.startDate='2026-11-01'; this.endDate='2026-11-14'; this.selectedDistrict='Todos los distritos';
    this.selectedSeverity='Todas'; this.selectedSource='Armonizada (MODIS + VIIRS)'; this.apply();
  }
  percentage(value:number):number { return this.total ? Math.round(100*value/this.total) : 0; }
  districtPercent(value:number):number { return this.total ? Math.round(100*value/this.total) : 0; }
  trend(value:number):string { return value > 0 ? `↑ +${value}` : value < 0 ? `↓ ${value}` : '= 0'; }
  trackDistrict(_index:number,row:ReportRow):string { return row.district; }
  get reportTitle(): string { return `${this.reportType} · TunariGuard DEMO`; }
  private lines(): string[] {
    return [
      'TUNARIGUARD / REPORTE DEMOSTRATIVO',
      this.reportType,
      `Periodo: ${this.applied.start} al ${this.applied.end}`,
      `Distrito: ${this.applied.district}`,
      `Severidad: ${this.applied.severity}`,
      `Fuente: ${this.applied.source}`,
      `Anomalias DEMO: ${this.total}`,
      `Distritos con actividad DEMO: ${this.activeDistricts}`,
      '',
      'Distrito | Anomalias | Porcentaje | Actividad',
      ...this.districtRows.map(r => `${r.district} | ${r.count} | ${this.districtPercent(r.count)}% | ${r.level}`),
      '',
      'Severidad | Detecciones',
      ...this.breakdown.map(b => `${b.label} | ${b.count}`),
      '',
      'IMPORTANTE: datos sinteticos DEMO, no verificaciones satelitales reales.',
    ];
  }
  private csvEscape(value:unknown):string { return `"${String(value).replace(/"/g,'""')}"`; }
  private csvBlob(): Blob {
    const rows = [['Fecha UTC', 'Distrito', 'Severidad', 'Fuente', 'Modo'], ...this.filtered.map(r => [r.date,r.district,r.level,r.source,'DEMO'])];
    return new Blob(['\ufeff'+rows.map(r => r.map(v=>this.csvEscape(v)).join(';')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  }
  private excelBlob(): Blob {
    const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const rows=[['Fecha UTC','Distrito','Severidad','Fuente','Modo'],...this.filtered.map(r=>[r.date,r.district,r.level,r.source,'DEMO'])];
    const body=rows.map(r=>'<Row>'+r.map(c=>`<Cell><Data ss:Type="String">${escape(c)}</Data></Cell>`).join('')+'</Row>').join('');
    const xml=`<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="TunariGuard DEMO"><Table>${body}</Table></Worksheet></Workbook>`;
    return new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});
  }
  private pdfBlob(): Blob {
    // PDF de una pagina, A4 horizontal, Helvetica ASCII para compatibilidad sin librerias.
    const plain=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
    const escaped=(value:string)=>plain(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const content=['BT','/F1 10 Tf','44 565 Td','14 TL',...this.lines().slice(0,35).flatMap((line,i)=>i===0?[`(${escaped(line)}) Tj`]:['T*',`(${escaped(line)}) Tj`]),'ET'].join('\n');
    const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf='%PDF-1.4\n'; const offsets=[0];
    objects.forEach((o,i)=>{ offsets.push(pdf.length); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`; });
    const xref=pdf.length;
    pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset=>{pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;});
    pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf],{type:'application/pdf'});
  }
  private save(blob:Blob,fileName:string):void {
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a'); link.href=url; link.download=fileName;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  generate():void {
    this.errorMessage='';
    const blob=this.format==='CSV'?this.csvBlob():this.format==='Excel'?this.excelBlob():this.pdfBlob();
    const ext=this.format==='Excel'?'xls':this.format.toLowerCase();
    const fileName=`TunariGuard_DEMO_${new Date().toISOString().slice(0,10)}.${ext}`;
    this.save(blob,fileName);
    this.recent=[{title:this.reportTitle,date:new Date().toLocaleString('es-BO'),format:this.format,fileName,content:blob},...this.recent].slice(0,6);
    this.successMessage=`Se generó un archivo ${this.format} con datos DEMO (${this.total} registros).`;
  }
  downloadPrevious(record:DownloadRecord):void { this.save(record.content,record.fileName); }
}
