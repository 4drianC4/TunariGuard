import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonthDetailComponent } from './month-detail.component';

describe('MonthDetail', () => {
  let component: MonthDetailComponent;
  let fixture: ComponentFixture<MonthDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MonthDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('source', 'HARMONIZED');
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('month', 10);
    fixture.componentRef.setInput('count', 42);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
