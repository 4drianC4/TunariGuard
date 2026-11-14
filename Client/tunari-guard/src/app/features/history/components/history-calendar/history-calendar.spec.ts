import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistoryCalendarComponent } from './history-calendar.component';

describe('HistoryCalendar', () => {
  let component: HistoryCalendarComponent;
  let fixture: ComponentFixture<HistoryCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryCalendarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryCalendarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
