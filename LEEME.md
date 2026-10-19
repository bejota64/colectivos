# Sistema Integral para Colectivos — Bases de datos (MVP v1.1)

## Contenido

| Archivo | Qué es |
|---|---|
| `docker-compose.yml` | Levanta PostgreSQL 16 y MongoDB 7 con los scripts de inicio |
| `bd/postgres/inicio/01_esquema.sql` | 15 tablas, claves primarias y foráneas, reglas e índices |
| `bd/postgres/inicio/02_datos_prueba.sql` | Trazado ficticio 9001 con usuarios, flota, jornadas y demanda |
| `bd/postgres/consultas_ejemplo.sql` | 7 consultas, una por pantalla del MVP |
| `bd/postgres/pruebas_integridad.sql` | 29 pruebas: la base debe rechazar cada dato inválido |
| `bd/postgres/rendimiento/` | Prueba de rendimiento de PostgreSQL con `pgbench`: 4 consultas y el script que las ejecuta |
| `bd/mongo/inicio/01_colecciones.js` | 3 colecciones con validador, índices geoespaciales y de caducidad |
| `bd/mongo/consultas_ejemplo.js` | 6 consultas, incluida una geoespacial y una de rechazo |
| `bd/mongo/pruebas_validador.js` | 10 comprobaciones: el validador y el índice único rechazan cada aviso inválido |
| `docs/diagrama_er.png` / `.svg` / `.dot` | Diagrama entidad-relación generado desde la base real |
| `pruebas-carga/` | 2 pruebas de carga de la API con k6 |
| `api-autenticacion/` | Módulo de autenticación en NestJS, sus pruebas y la guía para construirlo (`GUIA.md`) |

## Cómo ejecutarlo

```bash
cp .env.ejemplo .env          # y cambiar las contraseñas
docker compose up -d
# PostgreSQL
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d colectivos -f /scripts/consultas_ejemplo.sql'
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d colectivos -f /scripts/pruebas_integridad.sql'
# MongoDB
docker compose exec mongo sh -c 'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --file /scripts/consultas_ejemplo.js'
docker compose exec mongo sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --file /scripts/pruebas_validador.js'
```

Para empezar de cero: `docker compose down -v` y volver a levantar.

## Reglas que NO valida la base y debe validar el backend

1. El `representante_id` de un trazado debe ser un usuario con rol `representante`.
2. Conductor y vehículo de una jornada deben pertenecer al mismo trazado.
3. `asientos_disponibles` no puede superar la `capacidad` del vehículo.
4. Solo se puede abordar una jornada abierta, y solo califica o reporta quien abordó.
   El abordaje se acepta si el pasajero está a 200 m o menos de la última posición
   del colectivo, y esa posición tiene menos de 60 segundos.
5. Los identificadores guardados en MongoDB deben existir en PostgreSQL.
6. No debe haber dos tarifas vigentes con el mismo nombre en un trazado.
7. La demanda se suma en `demanda_por_tramo` al crear el aviso de espera, en la misma
   petición. Cancelar o abordar marca `terminado_en`; reactivar un aviso no vuelve a sumar.
8. Si el conductor reconecta y su jornada fue cerrada por falta de señal, la API responde
   "jornada cerrada" y la web vuelve a la pantalla de abrir jornada.
9. Máximo 6 abordajes por pasajero al día.

Cada regla necesita una prueba unitaria en el servicio correspondiente.

## Cambios de la versión 1.1

- Tope de capacidad y de asientos disponibles en 4, el límite legal vigente.
- `abordajes.distancia_al_vehiculo_m`: evidencia de cercanía al marcar "me subí".
- `avisos_espera.terminado_en`: evita contar dos veces la demanda de un mismo pasajero.


## Datos de prueba

Todas las cuentas usan la contraseña `Clave.Prueba.2026`. Las personas, patentes
y el trazado 9001 son ficticios. Las coordenadas son aproximadas y se reemplazan
por el recorrido real de la planilla Excel de la asociación.
