import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { recortar } from '../../../comun/transformaciones';
import {
  CATEGORIAS,
  ESTADOS_REPORTE,
  type Categoria,
  type EstadoReporte,
  TIPOS_REPORTE,
  type TipoReporte,
} from '../reglas-valoracion';

/** Queja o felicitacion sobre un viaje propio (CU-06). */
export class ReporteDto {
  @IsIn(TIPOS_REPORTE)
  tipo!: TipoReporte;

  @IsIn(CATEGORIAS)
  categoria!: Categoria;

  /** Mismo largo que exige la base (reportes_descripcion_largo). */
  @Transform(recortar)
  @IsString()
  @Length(10, 1000)
  descripcion!: string;
}

/** Filtro del listado del representante. */
export class ReportesConsultaDto {
  @IsOptional()
  @IsIn(ESTADOS_REPORTE)
  estado?: EstadoReporte;
}

/** Cambio de estado del reporte por el representante (CU-11). */
export class GestionReporteDto {
  @IsIn(['en_revision', 'cerrado'])
  estado!: Exclude<EstadoReporte, 'pendiente'>;

  /** Obligatoria para cerrar: queda como respuesta del caso. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(10, 1000)
  respuesta?: string;
}
