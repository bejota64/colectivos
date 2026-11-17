import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsuariosModulo } from '../usuarios/usuarios.modulo';
import { AutenticacionControlador } from './autenticacion.controlador';
import { AutenticacionServicio } from './autenticacion.servicio';
import { ContrasenasServicio } from './contrasenas.servicio';
import { CuentaControlador } from './cuenta.controlador';
import { CuentaServicio } from './cuenta.servicio';
import { IntentosServicio } from './intentos.servicio';
import { TokensRepositorio } from './tokens.repositorio';

@Module({
  imports: [
    UsuariosModulo,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configuracion: ConfigService) => ({
        secret: configuracion.getOrThrow<string>('SECRETO_JWT'),
        // Algoritmo fijo al firmar y al verificar: un token con otro algoritmo, o sin firma, se rechaza.
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AutenticacionControlador, CuentaControlador],
  providers: [
    AutenticacionServicio,
    ContrasenasServicio,
    IntentosServicio,
    TokensRepositorio,
    CuentaServicio,
  ],
  // SesionGuard, que es global, necesita JwtService. La politica de
  // contrasenas y la revocacion de sesiones las usan tambien flota (cuentas
  // de conductores) y la eliminacion de la cuenta propia.
  exports: [JwtModule, ContrasenasServicio, TokensRepositorio],
})
export class AutenticacionModulo {}
