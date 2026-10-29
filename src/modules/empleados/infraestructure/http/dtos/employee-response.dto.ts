import { ApiProperty } from '@nestjs/swagger';
import { Employee } from '../../../../../entities/employee.model';

export class EmployeeResponseDto {
  @ApiProperty({
    description: 'Identificador único del empleado',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'Nombres del empleado',
    example: 'Juan',
  })
  firstName!: string;

  @ApiProperty({
    description: 'Apellidos del empleado',
    example: 'Pérez',
  })
  lastName!: string;

  @ApiProperty({
    description: 'Tipo de documento de identidad',
    example: 'CC',
  })
  documentType!: string;

  @ApiProperty({
    description: 'Número de documento',
    example: '1020304050',
  })
  document!: string;

  @ApiProperty({
    description: 'Número de teléfono del empleado',
    example: '3001234567',
  })
  phone!: string;

  @ApiProperty({
    description: 'Salario base mensual',
    example: 1800000,
  })
  salaryBase!: number;

  @ApiProperty({
    description: 'Fecha de ingreso (YYYY-MM-DD); null si no se ha registrado',
    example: '2026-02-15',
    nullable: true,
  })
  hireDate!: string | null;

  @ApiProperty({
    description: 'Cargo del empleado',
    example: 'Auxiliar de cocina',
  })
  position!: string;

  @ApiProperty({
    description: 'Estado del empleado',
    example: 'ACTIVO',
  })
  status!: string;

  @ApiProperty({
    description: 'Identificador de la sucursal vigente del empleado',
    example: 1,
    nullable: true,
  })
  branchId!: number | null;

  @ApiProperty({
    description: 'Identificador del cargo asignado del catálogo de cargos',
    example: 1,
    nullable: true,
  })
  positionId!: number | null;

  @ApiProperty({
    description: 'Nombre de la sucursal vigente del empleado',
    example: 'Sucursal Centro',
    nullable: true,
  })
  branchName!: string | null;

  @ApiProperty({
    description: 'Nombre del cargo asignado del catálogo de cargos',
    example: 'Mesero',
    nullable: true,
  })
  positionName!: string | null;

  static fromEntity(employee: Employee): EmployeeResponseDto {
    const dto = new EmployeeResponseDto();
    dto.id = employee.id;
    dto.firstName = employee.firstName;
    dto.lastName = employee.lastName;
    dto.documentType = employee.document_type;
    dto.document = employee.document;
    dto.phone = employee.phone;
    dto.salaryBase = employee.salary_base;
    dto.hireDate = employee.hire_date ?? null;
    dto.position = employee.position;
    dto.status = employee.status;
    const current = employee.employee_branch_assig?.find((a) => a.is_current);
    dto.branchId = current ? current.branch.id : null;
    dto.branchName = current ? current.branch.name : null;
    dto.positionId = employee.jobPosition ? employee.jobPosition.id : null;
    dto.positionName = employee.jobPosition ? employee.jobPosition.name : null;
    return dto;
  }
}
