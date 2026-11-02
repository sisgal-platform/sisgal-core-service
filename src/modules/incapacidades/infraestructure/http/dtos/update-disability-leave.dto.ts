import { OmitType, PartialType } from '@nestjs/swagger';
import { RegisterDisabilityLeaveDto } from './register-disability-leave.dto';

export class UpdateDisabilityLeaveDto extends PartialType(
  OmitType(RegisterDisabilityLeaveDto, ['employeeId'] as const),
) {}
