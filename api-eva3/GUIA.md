# Guía de construcción: módulo de autenticación

Para Benjamín Muñoz. Meta: tener la API corriendo y las pruebas pasando el **13 de octubre**,
y poder explicar cada archivo ante la profesora.

## Estado de este código

Léelo antes de empezar, para saber qué esperar.

| Parte | Estado |
|---|---|
| Todo el SQL de los repositorios | **Ejecutado** contra PostgreSQL 16 con el esquema v1.1 |
| Lógica del servicio: registro, inicio de sesión, rotación, reuso, bloqueo, cierre | **Ejecutada** con 25 comprobaciones, todas correctas |
| Sintaxis y coherencia de tipos de todos los archivos | **Revisada** con TypeScript en modo estricto |
| Controlador, guards, cookies, validación de DTO, limitador de peticiones | **Sin ejecutar** |
| Pruebas de Jest y de Supertest | **Sin ejecutar** |

En el entorno donde se escribió no se pudo instalar NestJS. Por eso lo que depende del
framework nunca ha corrido. Es normal que la primera ejecución muestre algún error:
copia el mensaje completo y tráelo para corregirlo.

## Qué construye

| Método y ruta | Quién puede | Qué hace |
|---|---|---|
| `POST /api/autenticacion/registro` | Cualquiera | Crea un pasajero y guarda su consentimiento |
| `POST /api/autenticacion/inicio-sesion` | Cualquiera | Entrega el token de acceso y deja el de refresco en una cookie |
| `POST /api/autenticacion/renovar` | Quien tenga la cookie | Rota el token de refresco y entrega otro token de acceso |
| `POST /api/autenticacion/cierre-sesion` | Quien tenga la cookie | Revoca el token de refresco |
| `GET /api/usuarios/yo` | Cualquier rol con sesión | Devuelve el perfil propio |
| `GET /api/trazados/mios` | Solo representante | Lista sus trazados: ejemplo de rol más pertenencia |

## Decisiones tomadas y por qué

- **`pg` directo, sin ORM.** Ya saben SQL y el esquema existe. Un ORM agrega otra capa que
  aprender y otra definición de tablas que mantener. Los repositorios muestran el SQL tal cual.
- **Guard propio con `@nestjs/jwt`, sin Passport.** Son 60 líneas que se pueden explicar una por
  una. Passport hace lo mismo con más piezas ocultas.
- **Token de acceso en el cuerpo y de refresco en cookie.** La web guarda el primero en memoria;
  el segundo no lo puede leer JavaScript.
- **Bloqueo de intentos en memoria.** La API corre en una sola instancia. Al reiniciarla se
  pierden los bloqueos, lo que es aceptable para el piloto.
- **Nombres.** Los archivos propios van en español. `main.ts`, `app.module.ts` y la carpeta
  `test/` conservan el nombre que les da NestJS, para no pelear con su configuración.
- **Campos de la API en minúsculas con guion bajo** (`correo_electronico`), igual que en la base.

## Paso 0. Requisitos

1. Node.js 20 o superior: `node -v`.
2. Las bases arriba, desde la carpeta `colectivos/`: `docker compose up -d`.
3. Comprueba que cargaron los datos:
   `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d colectivos -c "select count(*) from usuarios"'`
   Debe responder 8.

## Paso 1. Crear el proyecto

Desde la carpeta `colectivos/`:

```bash
npx @nestjs/cli new api --package-manager npm --skip-git
cd api
npm install @nestjs/config @nestjs/jwt @nestjs/throttler class-validator class-transformer bcrypt cookie-parser helmet pg
npm install -D @types/bcrypt @types/cookie-parser @types/pg
```

El asistente de NestJS 12 hace dos preguntas:

- `@nestjs/observe`: escribe `n`. Ese servicio envía registros y métricas a un servidor externo,
  y la API maneja ubicaciones de pasajeros. Ojo: si solo presionas Enter, acepta.
- Sistema de módulos: elige **CJS (CommonJS) [with jest]**. Nuestro código y las pruebas usan Jest.

Luego:

1. Borra `src/app.controller.ts`, `src/app.controller.spec.ts`, `src/app.service.ts` y
   `test/app.e2e-spec.ts`.
2. Copia las carpetas `src/` y `test/` de `api-autenticacion/` sobre las de `api/`, aceptando
   reemplazar `main.ts` y `app.module.ts`.
3. Copia `api-autenticacion/.env.ejemplo` como `api/.env`. En `URL_POSTGRES` usa el mismo usuario
   y contraseña que pusiste en el `.env` de Docker. Genera un `SECRETO_JWT` con el comando que
   aparece en el archivo.
4. Abre `tsconfig.json` y verifica que exista `"esModuleInterop": true` dentro de
   `compilerOptions`. Si no está, agrégalo.
5. Verifica que `api/.gitignore` exista e incluya `.env`. Con `--skip-git`, NestJS no lo crea:
   usa el que viene en el proyecto.

Si `bcrypt` no instala en Windows, prueba en este orden:

1. Actualiza Node.js y vuelve a instalar: las versiones recientes de `bcrypt` traen el binario listo.
2. Corre la API dentro de WSL o de Docker, donde `bcrypt` compila sin problemas.
3. Como último recurso, y solo en tu computador, usa `bcryptjs` cambiando una línea en
   `contrasenas.servicio.ts`: `import * as bcrypt from 'bcryptjs';`.

`bcryptjs` no debe llegar al repositorio ni a producción. Está escrito en JavaScript puro: es
cerca de un 30 % más lento y calcula en el mismo hilo que atiende las peticiones y los
WebSocket. No lo congela, porque divide el trabajo en trozos, pero varios inicios de sesión
simultáneos retrasarían las posiciones GPS. El `bcrypt` nativo calcula en hilos aparte.

## Paso 2. Correr

```bash
npm run format        # deja el formato que exige el proyecto
npm run start:dev     # la API queda en http://localhost:3000
```

Prueba a mano, en otra terminal. En Windows usa Git Bash, porque PowerShell trata distinto las comillas:

```bash
# Inicio de sesión con una cuenta de los datos de prueba (guarda la cookie en un archivo)
curl -i -c cookies.txt -X POST http://localhost:3000/api/autenticacion/inicio-sesion \
  -H "Content-Type: application/json" \
  -d '{"correo_electronico":"representante@colectivos.ejemplo.cl","contrasena":"Clave.Prueba.2026"}'

# Copia el token_acceso de la respuesta y úsalo aquí
curl -H "Authorization: Bearer PEGA_AQUI_EL_TOKEN" http://localhost:3000/api/trazados/mios

# Sin token debe responder 401
curl -i http://localhost:3000/api/usuarios/yo

# Renovar con la cookie guardada
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/autenticacion/renovar
```

Después corre las pruebas:

```bash
npm test              # unitarias: no usan la base
npm run test:e2e      # integración: necesitan la base con los datos de prueba
npm run lint          # en NestJS 12 corre oxlint, el analizador que trae el proyecto
```

### Pruebas de carga

Se corren desde la carpeta `colectivos/`, con la API arriba. Necesitas instalar k6 (k6.io).

```bash
# P1: rendimiento de PostgreSQL, 20 clientes durante 30 segundos
docker compose exec -T postgres sh -c 'sh /scripts/rendimiento/ejecutar.sh'

# P2: lectura autenticada. Antes pon LIMITE_GENERAL_POR_MINUTO=5000 en api/.env y reinicia la API
k6 run pruebas-carga/lectura-autenticada.k6.js

# P3: ráfaga al inicio de sesión. Vuelve antes el límite a 100 y reinicia la API
k6 run pruebas-carga/limite-credenciales.k6.js
```

Después de P3 espera un minuto antes de volver a iniciar sesión: la ruta queda frenada.

## Paso 3. Entender cada pieza

No basta con que corra. Lee los archivos en este orden; cada uno depende solo de los anteriores.
La última columna es lo que debes poder explicar sin mirar el código.

| # | Archivos | Qué hace | Debes poder explicar |
|---|---|---|---|
| 1 | `comun/entorno.ts` | Valida las variables de entorno al arrancar | Por qué la API se niega a partir con un secreto corto |
| 2 | `comun/base-datos/` | Único acceso a PostgreSQL, con parámetros `$1, $2` | Cómo los parámetros evitan la inyección SQL |
| 3 | `usuarios/usuarios.repositorio.ts` | Busca y crea usuarios | Por qué el rol `'pasajero'` va escrito en el SQL y no llega como dato |
| 4 | `autenticacion/contrasenas.servicio.ts` | Política, hash y comparación | Qué es el costo de bcrypt y para qué sirve el hash de relleno |
| 5 | `autenticacion/intentos.servicio.ts` | Bloqueo tras 5 fallos | Qué pasa con los bloqueos si se reinicia la API |
| 6 | `autenticacion/tokens.repositorio.ts` | Guarda y revoca tokens de refresco | Por qué `revocar` pone la condición dentro del `UPDATE` |
| 7 | `autenticacion/autenticacion.servicio.ts` | Las reglas: registro, sesión, rotación | Qué ocurre, paso a paso, cuando alguien reusa un token robado |
| 8 | `autenticacion/dto/` y `configurar-aplicacion.ts` | Validan lo que entra | Qué hace `whitelist` y qué agrega `forbidNonWhitelisted` |
| 9 | `autenticacion/autenticacion.controlador.ts` | Traduce HTTP y maneja la cookie | Qué significa cada atributo de la cookie |
| 10 | `comun/decoradores/` y `comun/guards/` | Sesión y roles en todas las rutas | Por qué una ruta nueva queda protegida aunque olvides decorarla |
| 11 | `app.module.ts` | Une todo y registra los guards globales | En qué orden corren los tres guards y por qué |
| 12 | `trazados/` | Ejemplo de rol más pertenencia | La diferencia entre "tiene el rol" y "el recurso es suyo" |

### Tarea propia

Para comprobar que lo entendiste, agrega tú la ruta de cambio de contraseña, sin copiarla:

- `PATCH /api/usuarios/yo/contrasena`, para cualquier rol con sesión.
- Recibe la contraseña actual y la nueva, en un DTO propio.
- Verifica la actual, aplica la política según el rol, guarda el nuevo hash.
- Revoca todos los tokens de refresco de la cuenta.
- Escribe al menos dos pruebas: una que cambia la contraseña y otra que falla con la actual incorrecta.

Todas las piezas que necesitas ya existen en el módulo.

## Paso 4. Evidencia para la EVA 2

| Criterio | Qué capturar |
|---|---|
| 2.1.5.12 Código seguro | `npm run lint` sin errores. Un DTO con sus validaciones. `.env.ejemplo` junto a `.gitignore`. Salida de `npm audit` |
| 2.1.6.13 Pruebas | Salida de `npm test`, de `npm run test:e2e`, de `npm run test:cov` y de las tres pruebas de carga |
| 2.1.4.9 Bases | La respuesta de `/api/trazados/mios`, que lee PostgreSQL |
| 2.1.5.10 Políticas | La respuesta del inicio de sesión mostrando la cookie con `HttpOnly` y `SameSite=Strict` |

Cada prueba de integración indica en su nombre la amenaza del análisis STRIDE que verifica:

| Amenaza | Prueba |
|---|---|
| S1 Fuerza bruta | Al sexto intento fallido responde 429. Rechaza contraseña corta y común |
| S2 Robo del token de refresco | Renovar rota el token, y reusar el anterior cierra todas las sesiones |
| T1 Inyección | Rechaza un objeto donde se espera texto |
| T2 Campos de más | Rechaza el campo `rol` enviado por el cliente |
| E1 Rutas de otro rol | Sin token responde 401. Un pasajero recibe 403 en una ruta de representante |
| E2 Token alterado | Un token alterado responde 401 |
| I7 Mensajes de error | Mismo mensaje si el correo no existe o la contraseña es incorrecta |

## Paso 5. Preguntas que puede hacer la profesora

1. **¿Por qué dos tokens?** El de acceso viaja en cada petición y dura 15 minutos, así un robo
   sirve poco tiempo. El de refresco dura más, pero solo viaja a las rutas de autenticación.
2. **¿Por qué el de refresco va en una cookie HttpOnly?** Porque JavaScript no puede leerla. Un
   script inyectado en la página no se lo puede llevar.
3. **¿Qué pasa si igual lo roban?** Cada renovación revoca el token usado. Cuando el ladrón o la
   víctima usan el token antiguo, el sistema detecta el reuso y cierra todas las sesiones.
4. **¿Por qué bcrypt y qué es el costo?** Es un hash lento a propósito. Con costo 12, probar una
   contraseña toma cientos de milisegundos, lo que vuelve inviable probar millones.
   Se usa el módulo nativo, que calcula en hilos aparte y no frena las demás peticiones.
5. **¿Cómo evitan la inyección SQL?** Los valores nunca se pegan en el texto de la consulta. Van
   aparte, como parámetros, y la base los trata siempre como datos.
6. **¿Diferencia entre 401, 403 y 404?** 401: no sé quién eres. 403: sé quién eres y tu rol no
   alcanza. 404: el recurso no es tuyo, y no te confirmo que exista.
7. **Si el token ya trae el rol, ¿por qué consultan la base?** Para que desactivar una cuenta o
   cambiarle el rol tenga efecto de inmediato. Cuesta una consulta por clave primaria.
8. **¿Qué pasa si alguien manda `"rol": "administrador"` al registrarse?** Responde 400. El DTO no
   declara ese campo y la validación rechaza campos no declarados. Además el SQL fija el rol.
9. **¿Qué debilidad tiene este módulo?** El bloqueo vive en memoria y se pierde al reiniciar; no
   hay segundo factor; el registro revela si un correo ya existe, porque responde 409.

## Calendario sugerido

| Día | Trabajo |
|---|---|
| 8 y 9 de octubre | Pasos 0, 1 y 2: instalar, correr y hacer pasar las pruebas |
| 10 de octubre | Paso 3, filas 1 a 7 |
| 11 de octubre | Paso 3, filas 8 a 12, y la tarea propia |
| 12 de octubre | Paso 4: capturar la evidencia |
| 13 de octubre | Margen para errores y repaso de las preguntas |

## Qué falta después del 13

- Registrar los eventos de sesión en MongoDB (`registro_eventos`).
- Ruta para aceptar y revocar el consentimiento de geolocalización. Se pide en el primer uso, no
  en el registro, y el aviso de espera, el abordaje y el envío de posición lo exigen vigente.
- Que el representante cree conductores y el administrador cree representantes.
- Cortar los WebSocket cuando vence el token.
- Reemplazar `contrasenas-comunes.ts` por una lista pública de contraseñas filtradas.
- Imagen de Docker de la API, sin usuario root.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `cookieParser is not a function` o error al importar `supertest` | Falta `"esModuleInterop": true` en `tsconfig.json` |
| `ECONNREFUSED 127.0.0.1:5432` | Las bases no están arriba, o `URL_POSTGRES` tiene otra contraseña |
| `relation "usuarios" does not exist` | La base se creó sin los scripts: `docker compose down -v` y volver a levantar |
| `Configuracion invalida: SECRETO_JWT...` | El secreto tiene menos de 32 caracteres |
| Muchos errores de formato en `npm run lint` | Falta correr `npm run format` |
| Respuestas 429 en las pruebas de integración | Se superaron 20 inicios de sesión en un minuto; espera y repite |
| La cookie no llega al navegador en producción | `Secure` exige HTTPS; en desarrollo se desactiva sola |
