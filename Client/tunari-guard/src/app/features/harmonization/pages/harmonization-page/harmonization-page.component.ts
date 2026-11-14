import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Sensor = 'MODIS' | 'VIIRS';
type Severity = 'Alta' | 'Media' | 'Baja';
interface EventRow { date: string; district: string; sensors: Sensor[]; confidence: number; severity: Severity; lat: number; lon: number; }

@Component({
  selector: 'app-harmonization-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './harmonization-page.component.html',
  styleUrl: './harmonization-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HarmonizationPageComponent {
  readonly districts = ['Todos los distritos', 'Tiquipaya', 'Sacaba', 'Cochabamba', 'Quillacollo', 'Colcapirhua'];
  readonly years = Array.from({length: 27}, (_, i) => 2000 + i);
  readonly modisSeries = [170,190,205,210,185,220,200,245,260,225,300,260,325,280,340,245,310,260,365,320,460,390,510,360,430,320,395];
  readonly viirsSeries = [280,350,420,390,340,410,360,510,450,580,440,560,510,680,520,610,470,570,730,680,950,1210,860,980,760,840,790];
  readonly harmonizedSeries = [540,760,680,820,600,720,580,940,760,1100,820,1030,940,1210,980,1150,870,1040,1290,1350,1700,2110,1510,1730,1370,1480,1500];
  readonly events: EventRow[] = [
    {date:'2026-09-25',district:'Tiquipaya',sensors:['MODIS','VIIRS'],confidence:.97,severity:'Alta',lat:30,lon:34},
    {date:'2026-09-24',district:'Sacaba',sensors:['MODIS','VIIRS'],confidence:.95,severity:'Media',lat:67,lon:42},
    {date:'2026-09-23',district:'Cochabamba',sensors:['MODIS','VIIRS'],confidence:.93,severity:'Baja',lat:49,lon:66},
    {date:'2026-09-22',district:'Quillacollo',sensors:['VIIRS'],confidence:.90,severity:'Media',lat:23,lon:68},
    {date:'2026-09-21',district:'Colcapirhua',sensors:['MODIS','VIIRS'],confidence:.94,severity:'Alta',lat:58,lon:55},
    {date:'2026-09-18',district:'Sacaba',sensors:['VIIRS'],confidence:.88,severity:'Alta',lat:76,lon:62},
    {date:'2026-09-16',district:'Tiquipaya',sensors:['MODIS'],confidence:.86,severity:'Baja',lat:37,lon:25}
  ];
  startDate = '2000-01-01';
  endDate = '2026-12-31';
  district = 'Todos los distritos';
  severity = 'Todas';
  modis = true;
  viirs = true;
  applied = {start:'2000-01-01',end:'2026-12-31',district:'Todos los distritos',severity:'Todas',modis:true,viirs:true};
  zoom = 1;
  get filteredEvents(): EventRow[] {
    return this.events.filter(e => e.date >= this.applied.start && e.date <= this.applied.end
      && (this.applied.district === 'Todos los distritos' || e.district === this.applied.district)
      && (this.applied.severity === 'Todas' || e.severity === this.applied.severity)
      && e.sensors.some(s => s === 'MODIS' ? this.applied.modis : this.applied.viirs));
  }
  get matchedCount(): number { return this.filteredEvents.filter(e => e.sensors.length === 2).length; }
  apply(): void {
    if (this.startDate > this.endDate) return;
    this.applied = {start:this.startDate,end:this.endDate,district:this.district,severity:this.severity,modis:this.modis,viirs:this.viirs};
  }
  reset(): void {
    this.startDate='2000-01-01'; this.endDate='2026-12-31'; this.district='Todos los distritos'; this.severity='Todas'; this.modis=true; this.viirs=true; this.apply();
  }
  seriesPoints(series: number[]): string {
    return series.map((v,i) => `${(i*560/26).toFixed(1)},${(140-v*140/2500).toFixed(1)}`).join(' ');
  }
  formatDate(date: string): string { const [y,m,d]=date.split('-'); return `${d}/${m}/${y}`; }
  changeZoom(delta:number): void { this.zoom=Math.max(1,Math.min(2,this.zoom+delta)); }
  trackEvent(_index:number, event:EventRow):string { return event.date+'-'+event.district; }
}
