
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, inject, computed } from '@angular/core';

import * as echarts from 'echarts';

import { MetricsService } from '../../../../application/services/metrics.service';
import { HistorySource } from '../../../../domain/models/historical-record.model';

@Component({
  selector: 'app-history-chart',
  standalone: true,
  imports: [],
  templateUrl: './history-chart.component.html',
  styleUrl: './history-chart.component.scss',
})
export class HistoryChartComponent implements AfterViewInit, OnDestroy {
  private readonly metrics = inject(MetricsService);

  @ViewChild('chartContainer')
  private chartContainer!: ElementRef<HTMLDivElement>;

  private chart?: echarts.ECharts;
  private resizeObserver?: ResizeObserver;

  readonly hasRecords = computed(
    () => this.metrics.records().length > 0,
  );

  constructor() {
    // Actualizar la gráfica cuando cambien los datos o la fuente.
    effect(() => {
      const hasRecords = this.hasRecords();

      const totals = this.metrics.yearlyTotals();
      const source = this.metrics.selectedSource();

      if (!hasRecords) {
        this.chart?.clear();
        return;
      }

      if (!this.chart && this.chartContainer) {
        this.initializeChart();
        return;
      }

      if (this.chart) {
        this.updateChart(totals, source);
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.hasRecords()) {
      return;
    }

    this.initializeChart();
  }

  private initializeChart(): void {
    const container = this.chartContainer?.nativeElement;

    if (!container) return;

    this.chart = echarts.init(container);

    this.updateChart(
      this.metrics.yearlyTotals(),
      this.metrics.selectedSource()
    );

    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });

    this.resizeObserver.observe(container);
  }

  private updateChart(
    totals: readonly { year: number; total: number }[],
    source: HistorySource,
  ): void {
    if (!this.chart) return;

    const sourceConfig: Record<
      HistorySource,
      { label: string; color: string }
    > = {
      HARMONIZED: { label: 'Índice armonizado', color: '#526b4c' },
      MODIS: { label: 'Conteo bruto MODIS', color: '#d18a45' },
      VIIRS: { label: 'Conteo bruto VIIRS', color: '#7188a6' },
    };

    const config = sourceConfig[source];

    const years = totals.map(item => String(item.year));
    const values = totals.map(item => item.total);

    const option: echarts.EChartsOption = {
      animation: true,

      grid: {
        top: 30,
        right: 25,
        bottom: 35,
        left: 55,
        containLabel: true,
      },

      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fffefa',
        borderColor: '#e9e5db',
        textStyle: {
          color: '#344c39',
        },
        formatter: (params: any) => {
          const point = Array.isArray(params) ? params[0] : params;

          return `
            <strong>${point.axisValue}</strong><br/>
            ${config.label}: <strong>${point.value}</strong>
          `;
        },
      },

      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: years,
        axisLine: {
          lineStyle: {
            color: '#deded2',
          },
        },
        axisLabel: {
          color: '#849080',
        },
      },

      yAxis: {
        type: 'value',
        min: 0,
        minInterval: 1,
        axisLabel: {
          color: '#849080',
        },
        splitLine: {
          lineStyle: {
            color: '#eeece6',
            type: 'dashed',
          },
        },
      },

      series: [
        {
          name: config.label,
          type: 'line',
          smooth: true,
          data: values,
          symbol: 'circle',
          symbolSize: 7,
          showSymbol: false,
          lineStyle: {
            width: 3,
            color: config.color,
          },
          itemStyle: {
            color: config.color,
          },
          areaStyle: {
            color: config.color,
            opacity: 0.09,
          },
        },
      ],
    };

    this.chart.setOption(option, true);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }
}
