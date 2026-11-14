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
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
