/**
 * Tipos de hora con multiplicador configurable. Son los mismos tipos en los
 * que el cálculo de horas de nómina clasifica el tiempo trabajado
 * (`WorkHourType`), en el orden en que se presentan.
 */
export enum WorkRateType {
  ORDINARIA_DIURNA = 'ORDINARIA_DIURNA',
  ORDINARIA_NOCTURNA = 'ORDINARIA_NOCTURNA',
  EXTRA_DIURNA = 'EXTRA_DIURNA',
  EXTRA_NOCTURNA = 'EXTRA_NOCTURNA',
  DOMINICAL_DIURNA = 'DOMINICAL_DIURNA',
  DOMINICAL_NOCTURNA = 'DOMINICAL_NOCTURNA',
  EXTRA_DOMINICAL_DIURNA = 'EXTRA_DOMINICAL_DIURNA',
  EXTRA_DOMINICAL_NOCTURNA = 'EXTRA_DOMINICAL_NOCTURNA',
}

/** Nombre de cada tipo de hora para los mensajes que ve el administrador. */
export const NOMBRE_TIPO_HORA: Record<WorkRateType, string> = {
  [WorkRateType.ORDINARIA_DIURNA]: 'hora ordinaria diurna',
  [WorkRateType.ORDINARIA_NOCTURNA]: 'hora ordinaria nocturna',
  [WorkRateType.EXTRA_DIURNA]: 'hora extra diurna',
  [WorkRateType.EXTRA_NOCTURNA]: 'hora extra nocturna',
  [WorkRateType.DOMINICAL_DIURNA]: 'hora dominical o festiva diurna',
  [WorkRateType.DOMINICAL_NOCTURNA]: 'hora dominical o festiva nocturna',
  [WorkRateType.EXTRA_DOMINICAL_DIURNA]:
    'hora extra dominical o festiva diurna',
  [WorkRateType.EXTRA_DOMINICAL_NOCTURNA]:
    'hora extra dominical o festiva nocturna',
};
