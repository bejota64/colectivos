import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../comun/decoradores/roles.decorador';
import { inicioDelDiaEnChile } from '../../comun/fechas';
import { AuditoriaServicio, EVENTOS_POR_PAGINA } from './auditoria.servicio';
import { ConsultaAuditoriaDto } from './dto/consulta-auditoria.dto';

/** Revision del registro de auditoria por el administrador (CU-14). Solo lectura. */
@Roles('administrador')
@Controller('auditoria')
export class AuditoriaControlador {
  constructor(private readonly auditoria: AuditoriaServicio) {}

  @Get()
  async listar(@Query() consulta: ConsultaAuditoriaDto) {
    const pagina = consulta.pagina ?? 1;
    const eventos = await this.auditoria.listar(
      {
        tipo: consulta.tipo,
        usuarioId: consulta.usuario_id,
        desde: consulta.desde ? inicioDelDiaEnChile(consulta.desde) : undefined,
        hasta: consulta.hasta ? inicioDelDiaEnChile(consulta.hasta, 1) : undefined,
      },
      pagina,
    );
    return { pagina, por_pagina: EVENTOS_POR_PAGINA, eventos };
  }
}
