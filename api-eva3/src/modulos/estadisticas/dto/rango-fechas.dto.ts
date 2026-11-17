import { IsISO8601, IsOptional, Matches } from 'class-validator';

/** Rango para exportar (CU-10). Sin fechas: los ultimos 7 dias. */
export class RangoFechasDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe ser AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  hasta?: string;
}
