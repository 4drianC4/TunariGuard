import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { PageHeaderComponent } from
  '../../../../shared/components/page-header/page-header.component';

type SeriesKey = 'harmonizadas' | 'modis' | 'viirs' | 'actividad';
type ModelKey = 'SARIMA' | 'Prophet' | 'XGBoost';
type ScenarioKey = 'base' | 'optimista' | 'critico';

interface ForecastConfig { series: SeriesKey; start: number; horizon: number; district: string; model: ModelKey; }
interface ModelStat { name: ModelKey; mae: number; rmse: number; mape: number; r2: number; growth: number; }
interface Sample { year: number; value: number; }

@Component({
  selector: 'app-projections-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './projections-page.component.html',
  styleUrl: './projections-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionsPageComponent {
  private readonly dates = inject(DetectionDatesService);
  readonly mobileFiltersOpen = signal(false);
  readonly seriesOptions: {value: SeriesKey; label: string}[] = [
    {value:'harmonizadas', label:'Anomalías térmicas (MODIS + VIIRS)'},
    {value:'modis', label:'Detecciones MODIS'},
    {value:'viirs', label:'Detecciones VIIRS'},
    {value:'actividad', label:'Índice de actividad (mensual)'},
  ];
  readonly districts = ['Todos los distritos', 'Tiquipaya', 'Sacaba', 'Vinto', 'Colcapirhua', 'Quillacollo'];
  readonly historicalStarts = computed(() => {
    const min = this.dates.min('year');
    const max = this.dates.max('year');
    return [2018, 2019, 2020, 2021, 2022].filter((year) => year >= Number(min) && year <= Number(max));
  });
  readonly horizons = [3, 5, 7];
  readonly models: ModelStat[] = [
    {name:'SARIMA', mae:12.8, rmse:16.9, mape:14.2, r2:.82, growth:.86},
    {name:'Prophet', mae:9.8, rmse:12.4, mape:11.9, r2:.87, growth:1},
    {name:'XGBoost', mae:10.6, rmse:13.7, mape:12.5, r2:.85, growth:1.08},
  ];
  readonly scenarios: {key: ScenarioKey; name: string; caption: string; symbol: string}[] = [
    {key:'base', name:'Escenario base', caption:'Tendencia actual (sin cambios).', symbol:'✓'},
    {key:'optimista', name:'Escenario optimista', caption:'−18 % de anomalías (mayor prevención).', symbol:'○'},
    {key:'critico', name:'Escenario crítico', caption:'+45 % de anomalías (condiciones más secas).', symbol:'○'},
  ];
  readonly originalHistory: Sample[] = [
    {year:2018,value:42}, {year:2019,value:50}, {year:2020,value:59},
    {year:2021,value:62}, {year:2022,value:61}, {year:2023,value:78},
    {year:2024,value:77}, {year:2025,value:96}, {year:2026,value:104},
  ];
  readonly mapeYears = [2019,2020,2021,2022,2023,2024,2025,2026];
  readonly mapeBase = [13.2,11.7,10.8,12.1,12.4,10.6,11.2,13.2];

  draftSeries: SeriesKey = 'harmonizadas';
  draftStart = 2018;
  draftHorizon = 5;
  draftDistrict = 'Todos los distritos';
  draftModel: ModelKey = 'Prophet';
  active: ForecastConfig = {series:'harmonizadas',start:2018,horizon:5,district:'Todos los distritos',model:'Prophet'};
  scenario: ScenarioKey = 'base';
  showModelDetails = false;
  message = '';

  constructor() {
    effect(() => {
      const starts = this.historicalStarts();
      const first = starts[0];
      if (first === undefined) return;
      if (!starts.includes(this.draftStart)) this.draftStart = first;
      if (!starts.includes(this.active.start)) this.active = { ...this.active, start: first };
    });
  }

  get stat(): ModelStat { return this.models.find(m => m.name === this.active.model)!; }
  get seriesLabel(): string { return this.seriesOptions.find(s=>s.value===this.active.series)!.label; }
  get factor(): number {
    const source = {harmonizadas:1,modis:.63,viirs:.79,actividad:.84}[this.active.series];
    const district = {'Todos los distritos':1,'Tiquipaya':.35,'Sacaba':.22,'Vinto':.16,'Colcapirhua':.14,'Quillacollo':.13}[this.active.district] ?? 1;
    return source * district;
  }
  get historic(): Sample[] {
    return this.originalHistory.filter(p=>p.year>=this.active.start).map(p=>({year:p.year,value:Math.round(p.value*this.factor)}));
  }
  get lastObserved(): number { return this.historic[this.historic.length-1].value; }
  get forecast(): Sample[] {
    const multiplier = {base:1,optimista:.82,critico:1.45}[this.scenario];
    return Array.from({length:this.active.horizon},(_,i)=>{
      const t=i+1;
      const base=104*this.factor*(1+.32*this.stat.growth*t/5);
      return {year:2026+t,value:Math.max(0,Math.round(base*multiplier))};
    });
  }
  get forecastWithAnchor(): Sample[] { return [...this.historic.slice(-1),...this.forecast]; }
  get finalValue(): number { return this.forecast[this.forecast.length-1]?.value ?? 0; }
  get projectedChange(): number { return this.lastObserved ? Math.round((this.finalValue/this.lastObserved-1)*100) : 0; }
  get annualAverage(): number { return Math.round(this.forecast.reduce((s,p)=>s+p.value,0)/this.forecast.length); }
  get growthIndex(): string { return this.lastObserved ? (this.finalValue/this.lastObserved).toFixed(2) : '0.00'; }
  get scenarioLabel(): string { return this.scenarios.find(s=>s.key===this.scenario)!.name; }
  get chartYears(): number[] { return Array.from({length:2026+this.active.horizon-this.active.start+1},(_,i)=>this.active.start+i); }
  get chartCeiling(): number {
    const upper=Math.max(...this.historic.map(p=>p.value),...this.forecast.map(p=>p.value*1.18),100);
    return Math.ceil(upper/50)*50;
  }
  x(year:number):number { return 55+((year-this.active.start)/(2026+this.active.horizon-this.active.start))*765; }
  y(value:number):number { return 235-(value/this.chartCeiling)*190; }
  points(items:Sample[]):string { return items.map(p=>`${this.x(p.year).toFixed(1)},${this.y(p.value).toFixed(1)}`).join(' '); }
  get historyPoints():string { return this.points(this.historic); }
  get futurePoints():string { return this.points(this.forecastWithAnchor); }
  get bandPoints():string {
    const upper=this.forecast.map((p,i)=>({year:p.year,value:p.value*(1.08+i*.022)}));
    const lower=[...this.forecast].reverse().map((p,i)=>({year:p.year,value:p.value*(1.0-.08-(this.forecast.length-1-i)*.022)}));
    return this.points([...upper,...lower]);
  }
  get errorBars():{year:number;value:number}[] {
    const change=this.stat.mape-11.9;
    return this.mapeYears.map((year,index)=>({year,value:+(this.mapeBase[index]+change).toFixed(1)}));
  }
  get visibleYearLabels():number[] { return this.chartYears.filter((year,i)=>i===0||i===this.chartYears.length-1||year===2026||i%2===0); }

  apply():void {
    if (!this.historicalStarts().includes(this.draftStart)) {
      this.message = 'No hay un año inicial disponible para la proyección DEMO.';
      return;
    }
    this.active={series:this.draftSeries,start:this.draftStart,horizon:this.draftHorizon,district:this.draftDistrict,model:this.draftModel};
    this.message='Proyección DEMO actualizada con la configuración seleccionada.';
  }
  setScenario(next:ScenarioKey):void { this.scenario=next;this.message='Escenario DEMO actualizado.'; }
  setModel(next:ModelKey):void { this.draftModel=next;this.apply(); }
  toggleModelDetails():void { this.showModelDetails=!this.showModelDetails; }

  private save(blob:Blob,name:string):void {
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  exportCsv():void {
    const safe=(v:unknown)=>`"${String(v).replace(/"/g,'""')}"`;
    const rows:(string|number)[][]=[
      ['TunariGuard','DEMO - datos sinteticos, no pronostico cientifico'],
      ['Serie',this.seriesLabel],['Distrito',this.active.district],['Modelo representado',this.active.model],
      ['Escenario',this.scenarioLabel],[],['Anio','Valor','Tipo','Serie','Distrito','Modelo','Escenario','Origen'],
      ...this.historic.map(p=>[p.year,p.value,'Historico DEMO',this.seriesLabel,this.active.district,this.active.model,this.scenarioLabel,'Sintetico']),
      ...this.forecast.map(p=>[p.year,p.value,'Proyeccion DEMO',this.seriesLabel,this.active.district,this.active.model,this.scenarioLabel,'Sintetico']),
    ];
    const csv='\ufeff'+rows.map(row=>row.map(safe).join(';')).join('\r\n');
    this.save(new Blob([csv],{type:'text/csv;charset=utf-8'}),'TunariGuard_Proyecciones_DEMO.csv');
    this.message='CSV DEMO descargado.';
  }
  private pdfLines():string[] {
    return [
      'TUNARIGUARD / PROYECCIONES DEMO','',
      'SIMULACION ILUSTRATIVA - NO ES UN PRONOSTICO VALIDADO',
      `Serie: ${this.seriesLabel}`,`Distrito: ${this.active.district}`,
      `Rango historico: ${this.active.start} - 2026`,
      `Horizonte: ${2027} - ${2026+this.active.horizon}`,
      `Perfil de modelo DEMO: ${this.active.model}`,
      `Escenario: ${this.scenarioLabel}`,
      `Cambio proyectado: ${this.projectedChange}%`,
      `Promedio anual proyectado: ${this.annualAverage}`,
      `Indice de crecimiento: ${this.growthIndex}`,
      `R2 ilustrativo: ${this.stat.r2.toFixed(2)}`,'',
      'ANIO  VALOR  TIPO',
      ...this.historic.map(p=>`${p.year}   ${p.value}   Historico sintetico`),
      ...this.forecast.map(p=>`${p.year}   ${p.value}   Proyeccion sintetica`),
      '', 'La banda del grafico es ilustrativa; no es un intervalo estadistico calibrado.',
      'Las metricas MAE, RMSE, MAPE y R2 son ejemplos de interfaz.',
      'Las series NO proceden de una consulta a NASA FIRMS en tiempo real.',
    ];
  }
  exportPdf():void {
    const plain=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?');
    const escaped=(v:string)=>plain(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const lines=this.pdfLines().slice(0,46);
    const stream=['BT','/F1 11 Tf','40 800 Td','14 TL',...lines.flatMap((v,i)=>i?['T*',`(${escaped(v)}) Tj`]:[`(${escaped(v)}) Tj`]),'ET'].join('\n');
    const objects=[
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let content='%PDF-1.4\n';const offsets=[0];
    objects.forEach((o,i)=>{offsets.push(content.length);content+=`${i+1} 0 obj\n${o}\nendobj\n`;});
    const xref=content.length;
    content+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset=>{content+=`${String(offset).padStart(10,'0')} 00000 n \n`;});
    content+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    this.save(new Blob([content],{type:'application/pdf'}),'TunariGuard_Proyecciones_DEMO.pdf');
    this.message='PDF DEMO descargado.';
  }
}
