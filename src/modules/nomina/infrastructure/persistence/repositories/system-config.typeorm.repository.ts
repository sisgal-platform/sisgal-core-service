import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SystemConfig } from 'src/entities';
import { SystemConfigRepositoryPort } from 'src/modules/nomina/domain/ports/system-config-repository.port';
import {
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';



@Injectable()
export class SystemConfigTypeOrmRepository
  implements SystemConfigRepositoryPort
{
  constructor(
    @InjectRepository(SystemConfig)
    private readonly repository: Repository<SystemConfig>,
  ) {}

  async getValue(
    key: string,
    payrollDate: Date,
  ): Promise<number | null> {
    const config = await this.repository.findOne({
      where: [
        {
          key,
          valid_from: LessThanOrEqual(payrollDate),
          valid_to: MoreThanOrEqual(payrollDate),
        },
        // Una versión sin fecha de fin rige hasta que se registre la siguiente.
        {
          key,
          valid_from: LessThanOrEqual(payrollDate),
          valid_to: IsNull(),
        },
      ],
      order: {
        valid_from: 'DESC',
      },
    });

    if (!config) {
      return null;
    }

    const value = Number(config.value);

    if (!Number.isFinite(value)) {
      throw new Error(
        `El valor de la configuración ${key} no es válido.`,
      );
    }

    return value;
  }
}