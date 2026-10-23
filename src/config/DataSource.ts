import { DataSource, DataSourceOptions } from 'typeorm';
import 'dotenv/config'
import { Employee } from '../entities/employee.model';
import { AttendanceLog } from '../entities/attendance-log.model';
import { AttendanceRecord } from '../entities/attendance-record.model';
import { AttendanceRecordLog } from '../entities/attendance-record-log.model';
import { BiometricDevice } from '../entities/biometric-device.model';
import { BranchConfig } from '../entities/branch-config.model';
import { Branch } from '../entities/branch.model';
import { Company } from '../entities/company.model';
import { DisabilityLeave } from '../entities/disability_leave.model';
import { EmployeeBranchAssignment } from '../entities/employee-branch-assignment.model';
import { PayrollLine } from '../entities/payroll_line.model';
import { PayrollPeriod } from '../entities/payroll-period.model';
import { SystemConfig } from '../entities/system-config.model';
import { WorkRateConfig } from '../entities/work-rate-config.model';
import { WorkdayConfig } from '../entities/workday-config.model';
import { Position } from '../entities/position.model';
import { CreateCoreEntities1789782222297 } from '../migrations/1789782222297-CreateCoreEntities';
import { CreatePositionCatalog1790380800000 } from '../migrations/1790380800000-CreatePositionCatalog';
import { AddDisabilityLeaveType1791059891289 } from '../migrations/1791059891289-AddDisabilityLeaveType';
import { AddDisabilityLeaveOtherTypeDescription1791060844659 } from '../migrations/1791060844659-AddDisabilityLeaveOtherTypeDescription';
import { AllowIncompleteAttendanceRecord1791119213000 } from '../migrations/1791119213000-AllowIncompleteAttendanceRecord';
import { AddPayrollPeriodIndexes1791200000000 } from '../migrations/1791200000000-AddPayrollPeriodIndexes';
import { VersionWorkdayConfigValidity1791720000000 } from '../migrations/1791720000000-VersionWorkdayConfigValidity';
import { VersionWorkRateConfigValidity1791730000000 } from '../migrations/1791730000000-VersionWorkRateConfigValidity';
import { VersionSystemConfigValidity1791740000000 } from '../migrations/1791740000000-VersionSystemConfigValidity';
import { AddLoanInstallments1791810000000 } from '../migrations/1791810000000-AddLoanInstallments';
import { AddEmployeeHireDateAndServiceBonusDays1791820000000 } from '../migrations/1791820000000-AddEmployeeHireDateAndServiceBonusDays';
import { AddAttendanceLogMethodAndIdempotency1791830000000 } from '../migrations/1791830000000-AddAttendanceLogMethodAndIdempotency';
import { EmployeeLoan, Holiday, LoanInstallment } from 'src/entities';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.SUPABASE_DB_URL,
  synchronize: false,
  entities: [
    Employee,
    AttendanceLog,
    AttendanceRecord,
    AttendanceRecordLog,
    BiometricDevice,
    BranchConfig,
    Branch,
    Company,
    DisabilityLeave,
    EmployeeBranchAssignment,
    PayrollLine,
    PayrollPeriod,
    SystemConfig,
    WorkRateConfig,
    WorkdayConfig,
    Position,
    EmployeeLoan,
    Holiday,
    LoanInstallment,
  ],
  ssl: { rejectUnauthorized: false },
  migrations: [
    CreateCoreEntities1789782222297,
    CreatePositionCatalog1790380800000,
    AddDisabilityLeaveType1791059891289,
    AddDisabilityLeaveOtherTypeDescription1791060844659,
    AllowIncompleteAttendanceRecord1791119213000,
    AddPayrollPeriodIndexes1791200000000,
    VersionWorkdayConfigValidity1791720000000,
    VersionWorkRateConfigValidity1791730000000,
    VersionSystemConfigValidity1791740000000,
    AddLoanInstallments1791810000000,
    AddEmployeeHireDateAndServiceBonusDays1791820000000,
    AddAttendanceLogMethodAndIdempotency1791830000000,
  ],
};

export const AppDataSource = new DataSource(dataSourceOptions);

try {
  console.log('Data Source inicializado correctamente');
} catch (error) {
  console.error('Error durante la inicializacion', error);
}
