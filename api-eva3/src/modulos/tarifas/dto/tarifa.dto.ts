import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { recortar } from '../../../comun/transformaciones';
import { MONTO_MAXIMO, MONTO_MINIMO } from '../reglas-tarifa';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Nueva tarifa, o nuevo precio para una tarifa existente (mismo nombre). */
export class TarifaDto {
  @Transform(recortar)
  @IsString()
  @Length(3, 40)
  nombre!: string;

  /** Rango acordado para el piloto (CU-12). */
  @IsInt()
  @Min(MONTO_MINIMO)
  @Max(MONTO_MAXIMO)
  monto!: number;

  /** Franja horaria HH:MM. Ambas o ninguna (ninguna = todo el dia). */
  @IsOptional()
  @Matches(HORA, { message: 'hora_inicio debe ser HH:MM' })
  hora_inicio?: string;

  @IsOptional()
  @Matches(HORA, { message: 'hora_fin debe ser HH:MM' })
  hora_fin?: string;
}
