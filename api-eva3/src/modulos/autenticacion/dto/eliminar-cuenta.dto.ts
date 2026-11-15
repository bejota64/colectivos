import { IsString, Length } from 'class-validator';

/** Eliminar la cuenta pide la contrasena: un token robado no basta para borrarla. */
export class EliminarCuentaDto {
  @IsString()
  @Length(1, 64)
  contrasena!: string;
}
