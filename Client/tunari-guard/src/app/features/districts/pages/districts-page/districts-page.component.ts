import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Risk = 'Alto' | 'Medio' | 'Bajo';
type SeverityFilter = 'Todas' | Risk;
interface District {
  name: string; count: number; delta: number; risk: Risk; color: string; className: string;
  x: number; y: number; shape: string; history: number[]; sources: string; last: string;
}
const DISTRICTS: District[] = [
  { name: 'Tiquipaya', count: 9, delta: 3, risk: 'Alto', color: '#e52d21', className: 'red', x: 277, y: 173,
    shape: '200,99 230,80 251,90 263,53 285,57 304,96 330,110 353,148 326,183 354,204 324,241 281,230 260,258 226,224 196,223 178,185 198,147',
    history: [4,5,4,6,5,8,8,8], sources: 'MODIS, VIIRS', last:'14 nov 2026, 10:24' },
  { name: 'Sacaba', count: 5, delta: 1, risk: 'Medio', color: '#ff891c', className: 'orange', x: 428, y: 245,
    shape: '354,148 393,160 417,144 460,154 485,182 525,180 538,222 520,258 529,289 495,325 459,321 430,300 400,311 367,278 324,241 354,204 326,183',
    history: [2,3,3,4,4,5,5,5], sources: 'VIIRS', last:'14 nov 2026, 09:57' },
  { name: 'Vinto', count: 4, delta: 1, risk: 'Medio', color: '#ffd43b', className: 'yellow', x: 277, y: 349,
    shape: '260,258 281,230 324,241 367,278 400,311 380,350 363,389 322,399 297,373 273,402 250,373 227,329',
    history: [0,1,1,2,2,3,4,4], sources: 'MODIS, VIIRS', last:'13 nov 2026, 16:40' },
  { name: 'Colcapirhua', count: 3, delta: 0, risk: 'Bajo', color: '#f9c92a', className: 'gold', x: 190, y: 275,
    shape: '171,238 196,223 226,224 260,258 227,329 199,333 169,315 146,297',
    history: [1,1,2,2,2,3,3,3], sources: 'VIIRS', last:'12 nov 2026, 14:30' },
  { name: 'Quillacollo', count: 3, delta: 1, risk: 'Bajo', color: '#ffb80d', className: 'gold', x: 104, y: 242,
    shape: '91,190 127,182 178,185 196,223 171,238 146,297 169,315 133,330 97,309 78,279 50,260 59,228',
    history: [0,1,0,1,1,1,2,3], sources: 'MODIS, VIIRS', last:'11 nov 2026, 11:05' },
  { name: 'Sipe Sipe', count: 1, delta: -1, risk: 'Bajo', color: '#91ce62', className: 'green', x: 456, y: 377,
    shape: '400,311 430,300 459,321 495,325 503,365 473,397 440,422 407,409 380,350',
    history: [2,2,1,2,1,1,1,1], sources: 'VIIRS', last:'10 nov 2026, 08:12' },
];

@Component({
  selector: 'app-districts-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './districts-page.component.html',
  styleUrl: './districts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistrictsPageComponent {
  readonly districts = DISTRICTS;
  readonly selectedName = signal('Tiquipaya');
  readonly fromActive = signal('2026-11-01');
  readonly toActive = signal('2026-11-14');
  readonly districtActive = signal('Todos los distritos');
  readonly severityActive = signal<SeverityFilter>('Todas');
  readonly period = signal('7');
  readonly mapZoom = signal(1);
  readonly mobileFiltersOpen = signal(false);
  dateFrom = '2026-11-01'; dateTo = '2026-11-14'; district = 'Todos los distritos'; severity: SeverityFilter = 'Todas';
  readonly visibleDistricts = computed(() => this.districts.filter(d =>
    (this.districtActive() === 'Todos los distritos' || d.name === this.districtActive()) &&
    (this.severityActive() === 'Todas' || d.risk === this.severityActive()) &&
    this.toActive() >= '2026-11-01' && this.fromActive() <= '2026-11-14'));
  readonly total = computed(() => this.visibleDistricts().reduce((sum, d) => sum + d.count, 0));
  readonly activeCount = computed(() => this.visibleDistricts().filter(d => d.count > 0).length);
  readonly highCount = computed(() => this.visibleDistricts().filter(d => d.risk === 'Alto').length);
  readonly mostActive = computed(() => [...this.visibleDistricts()].sort((a,b) => b.count - a.count)[0] ?? null);
  readonly current = computed(() => this.visibleDistricts().find(d => d.name === this.selectedName()) ?? this.visibleDistricts()[0] ?? null);
  readonly chartDays = computed(() => this.period() === '7' ? ['8 nov','9 nov','10 nov','11 nov','12 nov','13 nov','14 nov'] : ['7 nov','8 nov','9 nov','10 nov','11 nov','12 nov','13 nov','14 nov']);
  readonly chartSeries = computed(() => this.visibleDistricts().map(d => ({
    ...d, values: this.period() === '7' ? d.history.slice(1) : d.history,
    points: this.chartPoints(this.period() === '7' ? d.history.slice(1) : d.history),
  })));
  select(name: string): void { this.selectedName.set(name); }
  applyFilters(): void {
    if (this.dateFrom > this.dateTo) { [this.dateFrom,this.dateTo] = [this.dateTo,this.dateFrom]; }
    this.fromActive.set(this.dateFrom); this.toActive.set(this.dateTo);
    this.districtActive.set(this.district); this.severityActive.set(this.severity);
    this.mobileFiltersOpen.set(false);
    if (!this.visibleDistricts().some(d => d.name === this.selectedName())) this.selectedName.set(this.visibleDistricts()[0]?.name ?? '');
  }
  resetFilters(): void { this.dateFrom='2026-11-01'; this.dateTo='2026-11-14'; this.district='Todos los distritos'; this.severity='Todas'; this.applyFilters(); }
  toggleFilters(): void { this.mobileFiltersOpen.update(v => !v); }
  zoom(delta: number): void { this.mapZoom.update(v => Math.max(1, Math.min(1.6, +(v+delta).toFixed(1)))); }
  resetZoom(): void { this.mapZoom.set(1); }
  chartPoints(values: number[]): string { return values.map((v,i) => `${44 + (i*512/Math.max(1,values.length-1))},${206-v*18}`).join(' '); }
  xAt(i: number, length: number): number { return 44 + (i*512/Math.max(1,length-1)); }
  yAt(v: number): number { return 206-v*18; }
  viewOnMap(): void { document.getElementById('tg-districts-map')?.scrollIntoView({ behavior:'smooth', block:'center' }); }
}
