import { FutureHireDateError } from '../errors/employee.errors';

/** Fecha de ingreso del empleado (YYYY-MM-DD); no puede ser posterior a hoy. */
export class HireDate {
  private constructor(private readonly value: string) {}

  /** `today` es la fecha actual en Colombia (YYYY-MM-DD). */
  static create(value: string, today: string): HireDate {
    if (value > today) {
      throw new FutureHireDateError();
    }
    return new HireDate(value);
  }

  getValue(): string {
    return this.value;
  }
}
