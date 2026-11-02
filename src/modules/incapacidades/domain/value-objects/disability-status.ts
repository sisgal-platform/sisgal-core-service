import { aFechaCalendario } from 'src/modules/parametros-nomina/domain/vigencia';
import { getColombiaDate } from 'src/shared/common/utils/colombia-date.util';

export type DisabilityStatus = 'Activo' | 'Finalizado';

// Una incapacidad está Activa mientras la fecha actual no supere su fecha de
// finalización; después de esa fecha pasa a Finalizada. No existe un tercer
// estado (por ejemplo, "programada") según lo definido en SISGAL.
export function calcularEstadoIncapacidad(endDate: Date): DisabilityStatus {
  return aFechaCalendario(endDate) >= getColombiaDate(new Date())
    ? 'Activo'
    : 'Finalizado';
}
