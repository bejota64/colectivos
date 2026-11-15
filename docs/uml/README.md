# Diagramas UML (Evaluación 4)

Diagramas actualizados para que calcen con el prototipo de este repositorio. Están escritos como
código, así se revisan en los pull request igual que el resto: Mermaid (`.mmd`, GitHub los dibuja
aquí mismo), Graphviz (`.dot`) y SVG.

| Vista | Diagrama | Archivo |
|---|---|---|
| Escenarios | Casos de uso | `01-casos-de-uso.svg` |
| Desarrollo | Componentes (las dependencias son los `imports` reales de cada módulo) | `02-componentes.dot` / `.svg` |
| Lógica | Clases: cuentas y auditoría, trazado y flota, operación, control de acceso | `03` a `06-clases-*.mmd` |
| Comportamiento | Estados: jornada, reporte, aviso de espera, colectivo en el mapa | `07` a `10-estado-*.mmd` |
| Interacción | Secuencia: «me subí», gestión de un reporte, control de acceso | `11` a `13-secuencia-*.mmd` |

Para regenerar las imágenes: `npx @mermaid-js/mermaid-cli -i archivo.mmd -o archivo.png -c tema-mermaid.json`
y `dot -Tsvg 02-componentes.dot -o 02-componentes.svg`.

## Casos de uso

![Casos de uso](01-casos-de-uso.svg)

## Componentes

![Componentes](02-componentes.svg)

## Clases: cuentas, acceso y auditoría

```mermaid
classDiagram
  direction LR
  class Rol {
    <<enumeration>>
    pasajero
    conductor
    representante
    administrador
  }
  class Usuario {
    -id: UUID
    -nombreCompleto: Texto
    -correoElectronico: Texto
    -contrasenaHash: Texto
    -rol: Rol
    -telefono: Texto [0..1]
    -activo: Booleano
    -eliminadoEn: FechaHora [0..1]
    +iniciarSesion(correo, contrasena) Sesion
    +renovarSesion(cookie) Sesion
    +cerrarSesion()
    +actualizarPerfil(nombre, telefono)
    +eliminarCuenta(contrasena)
  }
  class Consentimiento {
    -tipo: terminos | privacidad | geolocalizacion
    -versionPolitica: Texto
    -aceptadoEn: FechaHora
    -revocadoEn: FechaHora [0..1]
  }
  class TokenRefresco {
    -tokenHash: Texto
    -expiraEn: FechaHora
    -revocadoEn: FechaHora [0..1]
    +rotar() TokenRefresco
    +revocar()
  }
  class Conductor {
    -habilitado: Booleano
    +abrirJornada(vehiculo, sentido)
    +enviarPosicion(punto)
    +ajustarAsientos(n)
  }
  class EventoAuditoria {
    <<documento MongoDB>>
    -tipo: TipoEvento
    -usuarioId: UUID [0..1]
    -direccionIp: Texto
    -detalle: Objeto
    -ocurridoEn: FechaHora
  }
  Usuario ..> Rol : usa
  Usuario "1" *-- "1..*" Consentimiento : acepta
  Usuario "1" *-- "*" TokenRefresco : sesiones
  Usuario "1" -- "0..1" Conductor : es
  Usuario "0..1" <.. "*" EventoAuditoria : registra
  note for EventoAuditoria "Solo se lee e inserta: la cuenta de la API
no puede modificarlo ni borrarlo (V-02).
Caduca a los 90 días."
  note for Usuario "El rol nunca viene del formulario.
Eliminar la cuenta la anonimiza
(Ley 21.719)."
```

## Clases: trazado, tarifas y flota

```mermaid
classDiagram
  direction TB
  class Trazado {
    -id: UUID
    -codigo: Texto
    -nombre: Texto
    -comuna: Texto
    -activo: Booleano
  }
  class Sentido {
    -sentido: ida | vuelta
    -origen: Texto
    -destino: Texto
  }
  class PuntoRuta {
    -orden: Entero
    -latitud: Decimal
    -longitud: Decimal
    -distanciaAcumuladaM: Entero
  }
  class PuntoReferencia {
    -nombre: Texto
    -tipo: terminal | combinacion | otro
  }
  class Tarifa {
    -nombre: Texto
    -monto: Entero 1000..3000
    -horaInicio: Hora [0..1]
    -horaFin: Hora [0..1]
    -vigenteDesde: FechaHora
    -vigenteHasta: FechaHora [0..1]
    +reemplazar(monto) Tarifa
    +cerrar()
  }
  class Vehiculo {
    -patente: AA1234 | BBBB12
    -marca: Texto
    -modelo: Texto
    -anio: Entero
    -capacidad: Entero 1..4
    -activo: Booleano
  }
  class Conductor {
    -habilitado: Booleano
  }
  class Representante {
    <<rol de Usuario>>
    +fijarTarifa(nombre, monto)
    +crearVehiculo(datos)
    +crearConductor(datos)
    +restablecerContrasena(conductor)
    +deshabilitarConductor(conductor)
  }
  Representante "1" -- "*" Trazado : representa
  Trazado "1" *-- "2" Sentido
  Sentido "1" *-- "2..*" PuntoRuta
  Trazado "1" *-- "*" PuntoReferencia
  Trazado "1" *-- "*" Tarifa : historial
  Trazado "1" o-- "*" Vehiculo
  Trazado "1" -- "*" Conductor : habilita
  note for Tarifa "Cambiar el precio cierra la vigente y crea otra:
nunca hay dos vigentes con el mismo nombre."
```

## Clases: operación diaria

```mermaid
classDiagram
  direction TB
  class Jornada {
    -iniciadaEn: FechaHora
    -finalizadaEn: FechaHora [0..1]
    -asientosDisponibles: Entero 0..4
    +ajustarAsientos(n)
    +cambiarSentido(sentido)
    +cerrar(motivo)
  }
  class UbicacionVehiculo {
    <<documento MongoDB>>
    -ubicacion: Punto GeoJSON
    -distanciaRutaM: Entero
    -velocidadKmh: Decimal
    -registradaEn: FechaHora
  }
  class AvisoEspera {
    <<documento MongoDB>>
    -ubicacion: Punto GeoJSON
    -distanciaRutaM: Entero
    -personas: Entero 1..4
    -expiraEn: FechaHora
    -terminadoEn: FechaHora [0..1]
  }
  class Abordaje {
    -distanciaAlVehiculoM: Entero 0..500
    -abordadoEn: FechaHora
  }
  class Calificacion {
    -estrellas: Entero 1..5
    -creadaEn: FechaHora
  }
  class Reporte {
    -tipo: queja | felicitacion
    -categoria: Categoria
    -descripcion: Texto 10..1000
    -estado: EstadoReporte
    -respuesta: Texto [0..1]
    -cerradoEn: FechaHora [0..1]
    +gestionar(estado, respuesta)
  }
  class DemandaPorTramo {
    -numeroTramo: Entero
    -fecha: Fecha
    -hora: Entero 0..23
    -avisos: Entero
    -personas: Entero
  }
  class Conductor
  class Vehiculo
  class Pasajero
  class Sentido
  Conductor "1" -- "*" Jornada : maneja
  Vehiculo "1" -- "*" Jornada : se hace en
  Sentido "0..1" -- "*" Jornada : sentido actual
  Jornada "1" *-- "*" UbicacionVehiculo : cada 5 s
  Jornada "1" -- "*" Abordaje : transporta
  Pasajero "1" -- "*" Abordaje : realiza
  Pasajero "1" -- "0..1" AvisoEspera : avisa
  Abordaje "1" *-- "0..1" Calificacion
  Abordaje "1" *-- "0..1" Reporte
  Sentido "1" -- "*" DemandaPorTramo
  AvisoEspera ..> DemandaPorTramo : suma una vez
  note for Abordaje "Solo a 200 m o menos de una posición de menos de 60 s,
máximo 6 al día (con candado por pasajero, V-04).
Habilita calificar y reportar dentro de 24 h (V-05)."
```

## Clases: diseño del control de acceso

```mermaid
classDiagram
  direction TB
  namespace guards {
    class ThrottlerGuard {
      <<guard global 1>>
      +canActivate(ctx) Booleano
    }
    class SesionGuard {
      <<guard global 2>>
      +canActivate(ctx) Booleano
      -extraerToken(peticion) Texto
    }
    class RolesGuard {
      <<guard global 3>>
      +canActivate(ctx) Booleano
    }
    class ErroresFiltro {
      <<filtro global>>
      +catch(error, host)
    }
  }
  namespace decoradores {
    class Publico {
      <<decorador>>
    }
    class Autenticado {
      <<decorador>>
    }
    class Roles {
      <<decorador>>
      +roles: Rol[]
    }
  }
  namespace representante {
    class TarifasServicio {
      +fijar(trazadoId, representanteId, datos)
      +cerrar(trazadoId, tarifaId, representanteId)
    }
    class FlotaGestionServicio {
      +crearConductor(trazadoId, datos, sesion)
      +cambiarHabilitado(trazadoId, conductorId, valor, sesion)
    }
    class ReportesGestionServicio {
      +listar(trazadoId, representanteId, estado)
      +gestionar(trazadoId, reporteId, representanteId, cambio)
    }
  }
  class PertenenciaServicio {
    +exigirTrazadoPropio(trazadoId, representanteId, accion, ip)
  }
  class AuditoriaServicio {
    +registrar(evento)
    +listar(filtro, pagina) EventoDoc[]
  }
  class UsuariosRepositorio {
    +buscarPorId(id) UsuarioFila
  }
  ThrottlerGuard ..> SesionGuard : luego
  SesionGuard ..> RolesGuard : luego
  SesionGuard ..> UsuariosRepositorio : rol y activo desde la base
  RolesGuard ..> Publico : lee
  RolesGuard ..> Roles : lee
  RolesGuard ..> Autenticado : lee
  ErroresFiltro ..> AuditoriaServicio : cada 403
  TarifasServicio --> PertenenciaServicio
  FlotaGestionServicio --> PertenenciaServicio
  ReportesGestionServicio --> PertenenciaServicio
  PertenenciaServicio ..> AuditoriaServicio : trazado ajeno
  note for RolesGuard "Deniega por defecto (V-06): una ruta
sin Publico, Autenticado ni Roles
responde 403. Si hay Roles, manda Roles."
  note for PertenenciaServicio "Rol + pertenencia: un trazado ajeno
responde 404 y queda en la auditoría."
```

## Estados de la jornada

```mermaid
stateDiagram-v2
  [*] --> Abierta : abrir (conductor habilitado y vehículo libre de su trazado)
  Abierta --> Abierta : posición cada 5 s / asientos solo detenido
  Abierta --> Cerrada : cerrar
  Cerrada --> [*]
  note right of Cerrada
    Se cierra por cuatro causas:
    1. La termina el conductor.
    2. 30 min sin señal (cierre automático, CU-08).
    3. La cierra el representante del trazado.
    4. El conductor fue deshabilitado.
    Después la API responde "Jornada cerrada".
  end note
```

## Estados del reporte

```mermaid
stateDiagram-v2
  state "En revisión" as EnRevision
  [*] --> Pendiente : el pasajero reporta (hasta 24 h)
  Pendiente --> EnRevision : revisar
  Pendiente --> Cerrado : responder y cerrar
  EnRevision --> Cerrado : responder y cerrar
  Cerrado --> [*]
  note right of Cerrado
    Cerrar exige respuesta y guarda
    quién y cuándo. Es un estado final.
  end note
```

## Estados del aviso de espera

```mermaid
stateDiagram-v2
  [*] --> Activo : Estoy esperando (suma la demanda)
  Activo --> Terminado : Ya no espero / Me subí
  Terminado --> Activo : reactivar (no suma otra vez)
  Activo --> Caducado : 20 minutos
  Terminado --> [*]
  Caducado --> [*]
```

## Estados del colectivo en el mapa

```mermaid
stateDiagram-v2
  [*] --> Visible : señal de 30 s o menos
  Visible --> Atenuado : sin señal 30 s
  Atenuado --> Oculto : sin señal 2 min
  Atenuado --> Visible : nueva posición
  Oculto --> Visible : nueva posición
```

## Secuencia: «me subí» (CU-05)

```mermaid
sequenceDiagram
  autonumber
  actor P as Pasajero (web)
  participant G as Guards (límite, sesión, rol)
  participant C as AbordajesControlador
  participant S as AbordajesServicio
  participant K as ConsentimientosServicio
  participant M as MongoDB (ubicaciones)
  participant R as AbordajesRepositorio
  participant PG as PostgreSQL (cuenta de la API)

  P->>G: POST /api/abordajes {jornada_id, latitud, longitud} + token
  G->>G: token válido, cuenta activa, rol pasajero
  G->>C: AbordajeDto validado (whitelist)
  C->>S: registrar(pasajeroId, datos)
  S->>K: exigirGeolocalizacion(pasajeroId)
  K-->>S: consentimiento vigente (Ley 21.719)
  S->>PG: buscar jornada abierta
  S->>M: última posición del colectivo
  M-->>S: posición y su antigüedad
  S->>S: reglas: 200 m o menos, posición de menos de 60 s, menos de 6 viajes hoy
  alt alguna regla no se cumple
    S-->>P: 422 con el motivo (no se guarda nada)
  else se cumplen
    S->>R: registrar(pasajeroId, jornadaId, distancia, máximo 6)
    R->>PG: BEGIN
    R->>PG: pg_advisory_xact_lock(pasajero)
    Note over R,PG: Los "me subí" simultáneos del mismo pasajero<br/>esperan aquí y se procesan de a uno (V-04)
    R->>PG: INSERT ... SELECT si la jornada sigue abierta y hay menos de 6 hoy
    R->>PG: COMMIT
    alt se insertó
      R-->>S: abordaje (solo la distancia, no la ubicación)
      S-->>P: 201 Creado: habilita calificar y reportar por 24 h
    else otro "me subí" llenó el tope o la jornada se cerró
      R-->>S: null
      S-->>P: 409 Intenta de nuevo
    end
  end
```

## Secuencia: gestión de un reporte (CU-11)

```mermaid
sequenceDiagram
  autonumber
  actor RP as Representante
  participant G as Guards
  participant S as ReportesGestionServicio
  participant PE as PertenenciaServicio
  participant V as ValoracionesRepositorio
  participant A as AuditoriaServicio
  participant PG as PostgreSQL
  participant MG as MongoDB (registro_eventos)

  RP->>G: PATCH /api/trazados/{t}/reportes/{r} {estado: cerrado, respuesta}
  G->>G: sesión válida y rol representante
  G->>S: gestionar(t, r, representanteId, cambio)
  S->>PE: exigirTrazadoPropio(t, representanteId)
  alt el trazado no es suyo
    PE->>A: registrar(acceso_denegado)
    A->>MG: insert
    PE-->>RP: 404 (no confirma que el trazado exista)
  else es suyo
    S->>V: buscarReporteDeTrazado(r, t)
    V->>PG: SELECT con joins hasta el trazado (sin datos del pasajero)
    S->>S: transición válida y respuesta presente
    alt transición inválida o falta la respuesta
      S-->>RP: 422 con el motivo
    else válida
      S->>V: cambiarEstado(r, estadoAnterior, nuevo, respuesta)
      V->>PG: UPDATE ... WHERE id = r AND estado = estadoAnterior
      alt otra persona lo cambió entre medio
        S-->>RP: 409 Vuelve a cargarlo
      else actualizado
        S->>A: registrar(cambio_estado_reporte)
        A->>MG: insert (la API no puede editar ni borrar eventos)
        S-->>RP: 200 reporte actualizado
      end
    end
  end
```

## Secuencia: control de acceso en cada petición

```mermaid
sequenceDiagram
  autonumber
  actor U as Cliente
  participant B as Lector del cuerpo (16 KB)
  participant T as ThrottlerGuard
  participant SG as SesionGuard
  participant RG as RolesGuard
  participant H as Controlador y servicio
  participant F as ErroresFiltro
  participant A as AuditoriaServicio

  U->>B: petición HTTP
  alt cuerpo de más de 16 KB
    B->>F: error 413 del lector
    F-->>U: 413 sin detalles internos (V-08)
  else
    B->>T: cuerpo leído
    alt supera el límite de peticiones por minuto
      T-->>U: 429
    else
      T->>SG: continúa
      alt ruta @Publico()
        SG->>RG: continúa sin usuario
      else sin token, token vencido, alterado o cuenta inactiva
        SG-->>U: 401
      else token válido
        SG->>SG: rol y estado leídos desde la base, no desde el token
        SG->>RG: continúa con el usuario
      end
      alt la ruta no declara Publico, Roles ni Autenticado
        RG->>F: 403 (deniega por defecto, V-06)
        F->>A: acceso_denegado
        F-->>U: 403
      else rol no permitido
        RG->>F: 403
        F->>A: acceso_denegado
        F-->>U: 403
      else permitido
        RG->>H: ejecuta (DTO validado, pertenencia en el servicio)
        H-->>U: 2xx con Cache-Control no-store (V-07)
      end
    end
  end
```
