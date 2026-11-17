import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { recortar } from '../../../comun/transformaciones';

/** "bb-bb-12" o "BBBB 12" se guardan como "BBBB12", el formato del esquema. */
const aPatente = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s.-]/g, '').toUpperCase() : value;

const ANIO_MAXIMO = new Date().getFullYear() + 1;

export class NuevoVehiculoDto {
  @Transform(aPatente)
  @IsString()
  @Matches(/^([A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2})$/, {
    message: 'patente debe tener el formato AA1234 o BBBB12',
  })
  patente!: string;

  @Transform(recortar)
  @IsString()
  @Length(2, 40)
  marca!: string;

  @Transform(recortar)
  @IsString()
  @Length(1, 40)
  modelo!: string;

  @IsInt()
  @Min(2000)
  @Max(ANIO_MAXIMO)
  anio!: number;

  /** Limite legal: conductor mas 4 pasajeros (D.S. 212/1992). */
  @IsInt()
  @Min(1)
  @Max(4)
  capacidad!: number;
}

/** La patente no se cambia: si estaba mal, se da de baja el vehiculo y se crea otro. */
export class CambioVehiculoDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(2, 40)
  marca?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(1, 40)
  modelo?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(ANIO_MAXIMO)
  anio?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  capacidad?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

/**
 * Cuenta de conductor. La crea el representante de su trazado (los
 * conductores no se registran solos: asi ningun auto ajeno a la asociacion
 * aparece en el mapa). El rol lo pone la API, nunca el formulario.
 */
export class NuevoConductorDto {
  @Transform(recortar)
  @IsString()
  @Length(3, 120)
  nombre_completo!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  correo_electronico!: string;

  /** Contrasena inicial; la politica (largo, lista de comunes) la revisa el servicio. */
  @IsString()
  @Length(12, 64)
  contrasena!: string;
}

/** Restablecer la contrasena de un conductor (politica de recuperacion del MVP). */
export class ContrasenaDto {
  @IsString()
  @Length(12, 64)
  contrasena!: string;
}

export class HabilitacionDto {
  @IsBoolean()
  habilitado!: boolean;
}
