// domain/errors/employee.errors.ts

export class InvalidSalaryError extends Error {
  constructor() {
    super('El salario debe ser mayor que cero');
    this.name = 'InvalidSalaryError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmptyDocumentNumberError extends Error {
  constructor() {
    super('El número de documento no puede estar vacío');
    this.name = 'EmptyDocumentNumberError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidDocumentFormatError extends Error {
  constructor() {
    super('El número de documento debe contener solo dígitos');
    this.name = 'InvalidDocumentFormatError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DuplicateDocumentError extends Error {
  constructor(documentNumber: string) {
    super(`Ya existe un empleado registrado con el documento ${documentNumber}`);
    this.name = 'DuplicateDocumentError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FutureHireDateError extends Error {
  constructor() {
    super('La fecha de ingreso no puede ser posterior a la fecha actual');
    this.name = 'FutureHireDateError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
