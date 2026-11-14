import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistorySummaryComponent } from './history-summary.component';

describe('HistorySummary', () => {
  let component: HistorySummaryComponent;
  let fixture: ComponentFixture<HistorySummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistorySummaryComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HistorySummaryComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
