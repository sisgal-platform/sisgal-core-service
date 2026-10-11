import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Cada fila es una versión del valor de un parámetro: una misma clave tiene
 * varias versiones con períodos de vigencia que no se superponen.
 */
@Entity()
export class SystemConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  key!: string;

  @Column('decimal', { precision: 12, scale: 2, nullable: false })
  value!: number;

  @Column('date')
  valid_from!: Date;

  @Column('date', { nullable: true })
  valid_to!: Date | null;
}
