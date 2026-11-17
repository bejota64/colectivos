import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { recortar } from '../../../comun/transformaciones';

/** Lo unico que se puede cambiar del perfil propio. Correo y rol no. */
export class PerfilDto {
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @Length(3, 120)
  nombre_completo?: string;

  /** Mismo formato que exige la base (usuarios_telefono_formato). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '') : value,
  )
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'telefono debe tener entre 8 y 15 digitos' })
  telefono?: string;
}
