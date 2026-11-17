import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { TIPOS_EVENTO, type TipoEvento } from '../auditoria.servicio';

/** Filtros de la consulta de auditoria. Todos opcionales y validados. */
export class ConsultaAuditoriaDto {
  @IsOptional()
  @IsIn(TIPOS_EVENTO)
  tipo?: TipoEvento;

  @IsOptional()
  @IsUUID('4')
  usuario_id?: string;

  /** Desde el inicio de ese dia (hora de Chile). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  desde?: string;

  /** Hasta el final de ese dia (hora de Chile). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe ser AAAA-MM-DD' })
  @IsISO8601({ strict: true })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pagina?: number;
}
