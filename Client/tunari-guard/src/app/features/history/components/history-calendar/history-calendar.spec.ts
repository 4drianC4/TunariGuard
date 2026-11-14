import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistoryCalendar } from './history-calendar';

describe('HistoryCalendar', () => {
  let component: HistoryCalendar;
  let fixture: ComponentFixture<HistoryCalendar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryCalendar],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryCalendar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
