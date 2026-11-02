import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee, EmployeeLoan, LoanInstallment } from 'src/entities';
import { AuthModule } from 'src/infraestructure/auth/auth.module';
import { LoanService } from './application/services/loan.service';
import { LOAN_REPOSITORY_PORT } from './domain/ports/loan.repository.port';
import { LoanController } from './infrastructure/http/controllers/loan.controller';
import { LoanTypeOrmRepository } from './infrastructure/persistence/repositories/loan.typeorm.repository';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([EmployeeLoan, Employee, LoanInstallment]),
  ],
  controllers: [LoanController],
  providers: [
    LoanService,
    {
      provide: LOAN_REPOSITORY_PORT,
      useClass: LoanTypeOrmRepository,
    },
  ],
  exports: [LoanService, LOAN_REPOSITORY_PORT],
})
export class LoansModule {}
