import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Cada fila es una versión del multiplicador de un tipo de hora: un mismo tipo
 * tiene varias versiones con períodos de vigencia que no se superponen.
 */
@Entity()
export class WorkRateConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar', { length: 40 })
  type!: string;

  @Column('decimal', { precision: 12, scale: 2, nullable: false })
  multiplier!: number;

  @Column('date')
  valid_from!: Date;

  @Column('date', { nullable: true })
  valid_to!: Date | null;
}
