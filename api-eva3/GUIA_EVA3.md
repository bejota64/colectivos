# Guía del prototipo – Evaluación N°3 (Ingeniería de Software)

Prototipo del **Sistema Integral para Colectivos**: es el corte vertical del flujo crítico construido sobre el módulo de autenticación del 12 de octubre. Este mismo código es el comienzo del sprint 1 del proyecto integrado, que parte el 19 de octubre, así que no se presenta como hecho antes de esa fecha.

> **Antes de entregar:** todo lo que dice "verificado" en la sección 2 se verificó así. Lo que dice "sin ejecutar" lo tienen que correr ustedes. Si algo falla, copien el error completo y tráiganlo.

---

## 1. Qué hace (alcance)

Son cuatro funciones de punta a punta, una por perfil:

| Perfil | Qué puede hacer en el prototipo |
|---|---|
| Todos | Registro, inicio de sesión, renovación y cierre de sesión (ya existía). Aceptar o revocar el uso de la ubicación |
| Conductor | Ver autos libres, abrir jornada, enviar posición GPS, ajustar asientos (solo detenido), cambiar sentido, ver cuánta gente espera más adelante y cerrar la jornada |
| Pasajero | Ver colectivos en el mapa con minutos estimados, avisar "estoy esperando" (1 a 4 personas), cancelar el aviso, marcar "me subí", ver sus viajes y calificarlos (1 a 5) |
| Representante | Demanda por tramo de 500 m y por hora; resumen por conductor (viajes, nota, quejas) sin identidad de pasajeros |

**Fuera de este prototipo:** Socket.IO (el mapa se pide por REST cada pocos segundos; las reglas son las mismas), reportes de queja o felicitación, gestión de tarifas y flota, exportar CSV, pantallas del administrador y la web en React.

---

## 2. Estado real del código

| Parte | Estado |
|---|---|
| Las 33 consultas SQL (las 8 del módulo original + 25 nuevas) | **Verificadas**: compilan contra PostgreSQL 16 con el esquema v1.1, y las nuevas se ejecutaron con los datos de prueba |
| Tipos de todo el proyecto (original + nuevo) | **Verificados** con TypeScript en modo estricto (`isolatedModules` y `emitDecoratorMetadata`, como NestJS) |
| Reglas de negocio y servicios: 66 pruebas unitarias en 10 archivos | **Ejecutadas** y pasan. Se comprobó que fallan si se rompe una regla a propósito |
| Script `demo/flujo-completo.sh` | **Probado** contra un servidor falso (que arma bien las peticiones) |
| Lo que depende de NestJS y MongoDB: arranque, guards, DTO, filtros, consultas a MongoDB | **Sin ejecutar**: en el entorno donde se escribió no se pudo instalar NestJS (igual que con el módulo original) |
| `test/operacion.e2e-spec.ts` (20 pruebas de integración) | **Sin ejecutar**: necesita la API y las dos bases arriba |

---

## 3. Cómo integrarlo en su proyecto `api/`

Su versión más nueva del módulo es la que corrieron el 12 de octubre con NestJS 12, y está en el computador. Este paquete parte de la copia del zip, así que **no reemplacen su carpeta a ciegas**: sigan estos pasos.

1. **Bases.** Desde `colectivos/`: `docker compose up -d`. Ahora la API usa también MongoDB (posiciones, avisos y auditoría).
2. **Dependencia nueva**, dentro de `api/`: `npm install mongodb`.
3. **Archivos nuevos.** Copien completas las carpetas de `api-eva3/src/` que no existían:
   `comun/geo.ts`, `comun/mongo/`, `comun/filtros/`, `comun/base-datos/errores-postgres.ts`, y los módulos `auditoria/`, `flota/`, `jornadas/`, `tiempo-real/`, `abordajes/`, `valoraciones/`, `estadisticas/`, además de `test/datos/`, `test/operacion.e2e-spec.ts` y `demo/`.
4. **Archivos modificados.** Reemplácenlos y después revisen con `git diff` que no se pierda nada de lo que cambiaron el 12/10:
   - `app.module.ts`: registra los módulos nuevos y el filtro global de errores.
   - `configurar-aplicacion.ts`: agrega CORS opcional para desarrollo.
   - `comun/entorno.ts`: valida `URL_MONGO` y `ORIGEN_WEB`.
   - `autenticacion/autenticacion.controlador.ts`: audita los inicios de sesión.
   - `usuarios/usuarios.controlador.ts`, `usuarios/usuarios.modulo.ts` y el nuevo `consentimientos.*`.
   - `trazados/trazados.controlador.ts`, `trazados.repositorio.ts`, `trazados.modulo.ts` y el nuevo `rutas.servicio.ts`.
   - `main.ts`, `guards/` y `decoradores/`: solo cambia `import type`.
5. **`.env` de `api/`.** Agreguen `URL_MONGO` (ver `.env.ejemplo`) con el usuario y la contraseña de MongoDB del `.env` de Docker. Si la contraseña tiene símbolos como `@`, `:` o `/`, hay que codificarlos en la URL (por ejemplo, `@` se escribe `%40`).
6. **Los cuatro ajustes del 12/10**, para que coincida con su versión:
   - **Sin `@nestjs/mau`.** No agreguen nada de Mau. Si el CLI pregunta, respondan `n`. Mau es la plataforma de despliegue de NestJS y nosotros desplegamos en nuestro propio servidor (IaaS).
   - **oxlint:** `npm run lint` debe pasar sin errores.
   - **`import type` en los controladores.** Ya viene aplicado para `UsuarioSesion`, `Request`, `Response` y `JornadaFila`.
     **Cuidado:** los DTO y las clases que se inyectan (servicios y repositorios) **NO** van con `import type`. Si el analizador o el editor los convierte, la validación o la inyección dejan de funcionar sin avisar.
   - **`.gitignore` propio:** usen el de `api-eva3/.gitignore` o comprueben que el suyo incluya `.env`.
7. `npm run format`, después `npm run lint` y por último `npm run start:dev`.

> El `autenticacion.e2e-spec.ts` original ahora también necesita MongoDB arriba, porque `AppModule` lo conecta al partir.

---

## 4. Rutas nuevas

Todas parten con `/api` y exigen sesión salvo que se indique lo contrario.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /usuarios/yo/consentimientos/geolocalizacion` | Cualquiera | Acepta el uso de la ubicación |
| `DELETE /usuarios/yo/consentimientos/geolocalizacion` | Cualquiera | Lo revoca |
| `GET /trazados` | Cualquiera | Trazados activos con sus sentidos |
| `GET /trazados/sentidos/:id/recorrido` | Cualquiera | Puntos de la línea, para el mapa |
| `GET /flota/vehiculos-disponibles` | Conductor | Autos de su trazado sin jornada abierta |
| `GET /jornadas/actual` | Conductor | Su jornada abierta (409 "Jornada cerrada" si no tiene) |
| `POST /jornadas` | Conductor | Abre la jornada `{vehiculo_id, sentido_id}` |
| `PATCH /jornadas/actual/asientos` | Conductor | `{asientos_disponibles}`, solo con el auto detenido |
| `PATCH /jornadas/actual/sentido` | Conductor | Cambia de ida a vuelta |
| `POST /jornadas/actual/cierre` | Conductor | Cierra la jornada |
| `POST /tiempo-real/posiciones` | Conductor | `{latitud, longitud, velocidad_kmh?}` |
| `GET /tiempo-real/colectivos?sentido_id=&latitud=&longitud=` | Pasajero | Colectivos con señal reciente y minutos estimados |
| `POST /avisos-espera` | Pasajero | `{sentido_id, latitud, longitud, personas}` |
| `DELETE /avisos-espera/actual` | Pasajero | Cancela su aviso |
| `GET /avisos-espera/adelante` | Conductor | Cuánta gente espera más adelante (sin identidad) |
| `POST /abordajes` | Pasajero | "Me subí" `{jornada_id, latitud, longitud}` |
| `GET /abordajes/mios` | Pasajero | Sus últimos 20 viajes |
| `POST /abordajes/:id/calificacion` | Pasajero | `{estrellas}` de 1 a 5, una vez por viaje |
| `GET /estadisticas/trazados/:id/demanda?fecha=AAAA-MM-DD` | Representante | Demanda por tramo y hora (solo su trazado) |
| `GET /estadisticas/trazados/:id/conductores` | Representante | Resumen por conductor (solo su trazado) |

---

## 5. Pruebas y capturas para el PDF

Con las bases y la API arriba:

```bash
npm test                     # unitarias: deben dar las 66 nuevas + las del módulo original
npm run test:cov             # cobertura
npm run test:e2e             # integración: autenticación + operación
npm run lint
npm audit --omit=dev
bash demo/flujo-completo.sh  # flujo normal y ataques bloqueados (Git Bash en Windows)
```

`demo/flujo-completo.sh` gasta 12 intentos de credenciales. El límite es de 20 por minuto, así que si lo corren dos veces seguidas esperen un minuto entre una y otra. Además, el paso A11 deja bloqueado por 15 minutos el correo `fuerza-bruta@ejemplo.cl`, que es justo lo que demuestra. Y cada corrida registra un viaje real de pasajero2: después de 6 corridas en el mismo día, el paso 6 responde 422 por el tope diario (es la regla 9 funcionando, no un error).

Las capturas van numeradas igual que en el informe (Anexo B). En el informe cada una tiene un recuadro **[CAPTURA N]**: reemplácenlo por la imagen.

| N° | Qué muestra | Cómo se obtiene | Indicador |
|---|---|---|---|
| 1 | Contenedores *healthy* y la API iniciada | `docker compose ps` y `npm run start:dev` | 2, 3, 10 |
| 2 | Pasos 1 a 3 del script (sesión, trazados, consentimiento) | `bash demo/flujo-completo.sh flujo` | 7, 9 |
| 3 | Pasos 4 a 7 (jornada del conductor 3) | mismo comando | 7 |
| 4 | Pasos 8 a 10 (posición y asientos con el auto detenido) | mismo comando | 7, 8 |
| 5 | Pasos 11 a 13 (mapa, aviso, demanda adelante) | mismo comando | 7, 9 |
| 6 | Pasos 14 a 16 ("me subí", viajes, calificación) | mismo comando | 7, 8 |
| 7 | Pasos 17 y 18 (panel del representante) | mismo comando | 7, 9 |
| 8 | A1 a A3 (401, 401, 403) | `bash demo/flujo-completo.sh ataques` | 9, 10 |
| 9 | A4 y A5 (400 por campo `rol`, 400 por inyección) | mismo comando | 9, 10 |
| 10 | A6 y A7 (404 por recursos ajenos) | mismo comando | 9, 10 |
| 11 | A8 a A10 (422: "me subí" lejos, fuera de ruta, asientos en movimiento) | mismo comando | 8, 9, 10 |
| 12 | A11 (fuerza bruta: el 6.º intento da 429) | mismo comando | 9, 10 |
| 13 | Últimos eventos de `registro_eventos` | comando de abajo | 9, 10 |
| 14 | `npm test` | | 11 |
| 15 | `npm run test:e2e` | | 8, 10, 11 |
| 16 | `npm run test:cov` | | 11 |
| 17 | `npm run lint`, `npm audit --omit=dev` y `git check-ignore -v .env` | | 9, 10, 11 |

Para ver la auditoría:

```bash
docker compose exec mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin colectivos --eval "db.registro_eventos.find({}, {_id:0}).sort({ocurrido_en:-1}).limit(5)"'
```

---

## 6. Ley 21.459 → control en el código

| Delito (Ley 21.459) | Control | Dónde está |
|---|---|---|
| Art. 1, ataque a la integridad de un sistema | Límite de peticiones por IP (100/min general, 20/min en credenciales); posiciones absurdas rechazadas | `app.module.ts`, `autenticacion.controlador.ts`, `tiempo-real.servicio.ts` |
| Art. 2, acceso ilícito | Denegar por defecto, rol + pertenencia, bloqueo tras 5 fallos, 404 ante recursos ajenos, intentos auditados | `sesion.guard.ts`, `roles.guard.ts`, `estadisticas.servicio.ts`, `jornadas.servicio.ts`, `errores.filtro.ts` |
| Art. 3, interceptación ilícita | HTTPS (Caddy en el servidor) y cookie `HttpOnly` + `Secure` + `SameSite=Strict`; token de acceso de 15 min | `autenticacion.controlador.ts`, despliegue |
| Art. 4, ataque a la integridad de los datos | DTO con `whitelist`, consultas parametrizadas, `CHECK` en la base, condiciones dentro del `UPDATE`/`INSERT` | `dto/`, `*.repositorio.ts`, `01_esquema.sql` |
| Art. 5, falsificación informática | El "me subí" se valida en el servidor (≤200 m, posición de <60 s, máximo 6 al día); la velocidad la calcula el servidor | `reglas-abordaje.ts`, `abordajes.repositorio.ts`, `tiempo-real.servicio.ts` |
| Art. 6, receptación de datos | Minimización: lo que no se guarda no se puede robar ni traficar. No se guarda dónde estaba el pasajero al subir, y el conductor y el representante no ven identidades | `abordajes.servicio.ts`, `avisos.repositorio.ts`, `estadisticas.repositorio.ts` |
| Art. 7, fraude informático | No aplica en el MVP: no hay pagos (pago en efectivo). Queda para la fase 2 | — |
| Art. 8, abuso de dispositivos (incluye traficar contraseñas o códigos de acceso) | Contraseñas con bcrypt y token de refresco guardado solo como hash: si se filtra la base, no hay claves que traficar. Los secretos no están en el código (`.env` fuera de Git, `gitleaks`) | `contrasenas.servicio.ts`, `tokens.repositorio.ts`, `.gitignore` |

---

## 7. OWASP Top 10:2025 → control

| Categoría | Control en el prototipo |
|---|---|
| A01 Control de acceso roto | Guards globales que deniegan por defecto; `@Roles`; pertenencia dentro del SQL; 404 en vez de 403 para recursos ajenos |
| A02 Configuración insegura | `helmet`; validación del entorno al partir; CORS cerrado salvo un origen en desarrollo |
| A03 Fallas en la cadena de suministro | `npm audit`; pocas dependencias (sin ORM ni Passport) |
| A04 Fallas criptográficas | bcrypt costo 12; JWT HS256 con algoritmo fijo; solo hash del token de refresco |
| A05 Inyección | Consultas parametrizadas; filtros MongoDB tipados; `ParseUUIDPipe`; DTO |
| A06 Diseño inseguro | Reglas de negocio en el servidor (asientos, "me subí", tope diario); validación de la velocidad |
| A07 Fallas de autenticación | Política de contraseñas, bloqueo por fallos, rotación con detección de reuso |
| A08 Fallas de integridad de datos | Condiciones en el mismo `INSERT`/`UPDATE`; compensación entre MongoDB y PostgreSQL |
| A09 Fallas de registro y monitoreo | `registro_eventos`: inicios de sesión, accesos denegados, inicio y fin de jornada |
| A10 Mal manejo de condiciones excepcionales | `ErroresFiltro`: 500 genérico, la traza solo en el log; la auditoría no bloquea la petición |

---

## 8. Sistemas críticos identificados

1. **Autenticación y sesión**: si se rompe, cualquiera opera como otro.
2. **"Me subí"**: habilita calificar. Un abordaje falso permite hundir a un conductor con notas inventadas.
3. **Asientos con el auto en movimiento**: es un riesgo de seguridad vial y un incumplimiento de la Ley 21.377.
4. **Datos de ubicación**: son datos personales; se tratan solo con consentimiento vigente (Ley 19.628 y Ley 21.719).

Cada uno se aísla en un módulo propio, su regla vive en un archivo de funciones puras (`reglas-*.ts`) con pruebas, y la base aplica una segunda defensa (índices únicos, `CHECK`, condiciones en el `INSERT`).

---

## 9. Decisiones y por qué

- **REST en vez de Socket.IO en este prototipo.** Con un plazo de un día y medio, asegurar bien los WebSocket (autenticar el handshake y cortarlos cuando vence el token) era el mayor riesgo. Las reglas no cambian; en el sprint 3 se cambia el transporte.
- **La velocidad la calcula el servidor.** La que manda el teléfono se podría fijar en 0 para saltarse la regla de los asientos. Se usa la del GPS solo si no hay una posición reciente con qué comparar.
- **404 y no 403 para recursos ajenos.** Un 403 confirmaría que el viaje o el trazado existe.
- **Compensación entre las dos bases.** No hay transacción entre MongoDB y PostgreSQL: si falla el contador de demanda, se borra el aviso recién creado.
- **Reglas en funciones puras (`reglas-*.ts`).** Se prueban sin bases, el servicio queda corto (responsabilidad única) y la regla está escrita en un solo lugar.
- **200 m al recorrido** (`MAXIMO_DISTANCIA_AL_RECORRIDO_M`) es un **valor que propusimos nosotros**: hay que confirmarlo con el recorrido real de Don Héctor (planilla E2).

---

## 10. Limitaciones conocidas (díganlas antes de que se las pregunten)

- El GPS se puede falsificar con una aplicación. Esto detiene los errores groseros, no una falsificación bien hecha; es un riesgo aceptado en el diseño.
- Dos "me subí" exactamente simultáneos podrían pasar el tope de 6, porque el conteo y el `INSERT` van en la misma sentencia pero sin bloqueo.
- El bloqueo de intentos vive en memoria (se pierde al reiniciar la API). Con más de una instancia habría que pasarlo a Redis.
- La API se conecta a MongoDB con el usuario administrador del contenedor. En el servidor real hay que crear un usuario solo con permisos `readWrite` sobre `colectivos`.
- No hay un proceso que cierre jornadas sin señal (regla 8). La API ya responde "Jornada cerrada" cuando no hay una abierta.
- El jitter del GPS (unos metros cada 5 s) puede hacer que un auto detenido marque 3 a 7 km/h y bloquee los asientos de vez en cuando. Hay que medirlo en las pruebas con usuarios.

---

## 11. Preguntas que puede hacer el profesor

1. **¿Por qué no basta con bloquear el botón de asientos en la web?** Porque alguien puede llamar a la API con Postman o curl. Toda regla de seguridad tiene que vivir en el servidor (captura A10).
2. **¿Cómo saben que el pasajero de verdad se subió?** Por la distancia a la última posición del colectivo (≤200 m), por la antigüedad de esa posición (<60 s) y por el tope de 6 viajes al día. Se guarda la distancia como evidencia, no la ubicación.
3. **¿Qué pasa si falla MongoDB al registrar la auditoría?** La petición sigue. El fallo queda en el log del servidor: la auditoría acompaña, no bloquea.
4. **¿Qué pasa si se cae PostgreSQL justo después de crear un aviso?** Se borra el aviso de MongoDB (compensación) y el pasajero recibe un 500 genérico, sin detalles internos.
5. **¿Qué tiene que ver esto con la Ley 21.459?** Cada control impide o deja evidencia de uno de los delitos de los artículos 1 a 8 (tabla de la sección 6). La auditoría sirve para denunciar un acceso ilícito.
6. **¿Por qué el conductor no ve quién lo espera?** Por minimización de datos (Ley 21.719): para recoger a la persona le basta saber dónde está en la ruta y cuántos son.
7. **¿Dónde está IaaS en esto?** En el servidor Linux con Docker Compose: nosotros administramos el sistema operativo, los contenedores y las bases. SaaS: GitHub y los mosaicos de OpenStreetMap.

---

## 12. Problemas frecuentes (nuevos)

| Síntoma | Causa probable |
|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB no está arriba: `docker compose up -d` |
| `MongoServerError: Authentication failed` | `URL_MONGO` tiene otro usuario o contraseña, o le falta `?authSource=admin` |
| `MongoServerError: Document failed validation` | Un dato no calza con el validador de `01_colecciones.js`. Traigan el error completo: dice qué campo falló |
| `Configuracion invalida: URL_MONGO...` | Falta `URL_MONGO` en `api/.env` |
| La validación de un DTO no hace nada (acepta cualquier cosa) | El DTO quedó importado con `import type`. Quítenle el `type` |
| `Nest can't resolve dependencies of ...` | Un servicio o repositorio quedó con `import type`, o un módulo no importa al que exporta lo que necesita |
| El mapa sale vacío | Las posiciones de los datos de prueba ya tienen más de 60 s: primero envíen una posición como conductor (paso 2 del script) |
| 409 "Jornada cerrada" | El conductor no tiene jornada abierta. Con los datos de prueba, conductor1 y conductor2 ya tienen una; conductor3 no |
