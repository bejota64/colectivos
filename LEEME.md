# Sistema Integral para Colectivos

Prototipo funcional del proyecto de Ingeniería de Software (TI3043), INACAP sede Puente Alto.
Equipo: Benjamín Cuevas, Martín García y Benjamín Muñoz.

El sistema ayuda a una asociación de taxis colectivos de ruta fija: el pasajero ve en el mapa los
colectivos en servicio, sus asientos libres y en cuántos minutos llegan; el conductor abre su jornada
y transmite su posición; el representante del trazado ve la demanda por hora y por tramo, gestiona
tarifas, flota y reportes; el administrador revisa la auditoría.

Este repositorio contiene la **API** (NestJS 11, TypeScript estricto) y sus dos bases de datos
(**PostgreSQL 16** y **MongoDB 7**). La aplicación web (PWA) es un componente externo que consume esta API.

## Documentación

| Documento | Dónde |
|---|---|
| Informe de la Evaluación Sumativa N°4 (pruebas, matriz de vulnerabilidades y correcciones) | [`docs/informe-eva4.pdf`](docs/informe-eva4.pdf) |
| Diagramas UML como código: casos de uso, componentes, clases, estados y secuencia | [`docs/uml/`](docs/uml/README.md) |

## Estructura

| Carpeta o archivo | Qué contiene |
|---|---|
| `api-eva3/src/` | Código de la API, un módulo por área: autenticación, usuarios, trazados, tarifas, flota, jornadas, tiempo real, abordajes, valoraciones, estadísticas y auditoría |
| `api-eva3/test/` | Pruebas de integración contra las bases reales: autenticación, operación, requisitos y seguridad |
| `api-eva3/demo/flujo-completo.sh` | Recorre el flujo crítico y los ataques bloqueados con la API corriendo |
| `bd/postgres/inicio/` | Esquema (15 tablas), datos de prueba ficticios y cuenta de la API con permisos mínimos |
| `bd/postgres/administracion/` | CU-13: alta de un trazado con su representante, y desactivación de cuentas |
| `bd/postgres/pruebas_integridad.sql` | 29 comprobaciones: la base rechaza cada dato inválido |
| `bd/postgres/rendimiento/` | Prueba de rendimiento con `pgbench` |
| `bd/mongo/inicio/` | Colecciones con validador e índices, y rol de la API (auditoría solo lectura e inserción) |
| `bd/mongo/pruebas_validador.js` | 10 comprobaciones del validador y del índice único |
| `.github/workflows/pruebas.yml` | Integración continua: lint, compilación, pruebas, integridad de las bases y `npm audit` |

## Cómo ejecutarlo

Requisitos: Docker y Node.js 24.

```bash
cp .env.ejemplo .env                   # y cambiar las cuatro contraseñas
docker compose up -d                   # PostgreSQL y MongoDB con los datos de prueba
cd api-eva3
cp .env.ejemplo .env                   # mismas contraseñas de las cuentas *_API y un SECRETO_JWT propio
npm ci
npm run start:dev                      # API en http://localhost:3000/api
```

Para empezar de cero: `docker compose down -v` y volver a levantar.

## Pruebas

```bash
cd api-eva3
npm run lint          # análisis estático (oxlint)
npm test              # pruebas unitarias
npm run test:cov      # unitarias con cobertura
npm run test:e2e      # integración: necesita las bases levantadas
```

Las mismas pruebas, más las de integridad de ambas bases y `npm audit`, corren en GitHub Actions
en cada push a `main` y en cada pull request.

## Cuentas de las bases

Cada base tiene dos cuentas:

- **Dueña** (`POSTGRES_USUARIO`, `MONGO_USUARIO`): solo para los scripts de `bd/` y para limpiar datos en las pruebas.
- **API** (`POSTGRES_API_USUARIO`, `MONGO_API_USUARIO`): permisos mínimos. En PostgreSQL no puede borrar
  filas, cambiar la estructura ni asignar roles; en MongoDB la auditoría solo se puede leer e insertar.

Las cuentas de la API se crean la primera vez que se levantan las bases. Si ya existían, hay que hacer
`docker compose down -v`. El archivo `.env` nunca se sube al repositorio.

## Datos de prueba

Todas las personas, correos, patentes y el trazado 9001 son ficticios. Las cuentas de prueba usan la
contraseña `Clave.Prueba.2026` (por ejemplo `pasajero1@colectivos.ejemplo.cl`,
`conductor1@colectivos.ejemplo.cl`, `representante@colectivos.ejemplo.cl` y `admin@colectivos.ejemplo.cl`).

## Reglas que valida la API y no la base

1. El `representante_id` de un trazado debe ser un usuario con rol `representante`.
2. Conductor y vehículo de una jornada deben pertenecer al mismo trazado.
3. `asientos_disponibles` no puede superar la `capacidad` del vehículo (máximo legal: 4).
4. Solo se aborda una jornada abierta, a 200 m o menos de una posición de menos de 60 segundos.
5. Solo califica o reporta quien abordó, dentro de las 24 horas siguientes al viaje.
6. No hay dos tarifas vigentes con el mismo nombre en un trazado.
7. Una jornada con 30 minutos sin señal se cierra sola; la API responde "Jornada cerrada".
8. Máximo 6 abordajes por pasajero al día, también con peticiones simultáneas.
