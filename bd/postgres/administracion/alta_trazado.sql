-- =====================================================================
-- CU-13: el administrador da de alta un trazado y su representante.
--
-- Por diseno esto NO se hace desde la API: crear representantes y
-- trazados es poco frecuente y de alto impacto, asi que lo hace el
-- administrador con la cuenta duena de la base. La cuenta de la API ni
-- siquiera puede asignar el rol representante (03_cuenta_api.sql).
--
-- Uso, desde la carpeta del proyecto (pide los datos uno por uno):
--   docker compose exec -it postgres sh -c 'psql -U "$POSTGRES_USER" -d colectivos -f /scripts/administracion/alta_trazado.sql'
--
-- Los puntos del recorrido se cargan despues desde la planilla de la
-- asociacion (mismo formato que 02_datos_prueba.sql).
-- =====================================================================

\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\prompt 'Nombre completo del representante: ' nombre
\prompt 'Correo del representante: ' correo
\prompt 'Contrasena inicial (minimo 15 caracteres): ' clave
\prompt 'Codigo del trazado (por ejemplo 9002): ' codigo
\prompt 'Nombre del trazado: ' nombre_trazado
\prompt 'Comuna: ' comuna
\prompt 'Origen del sentido de ida (por ejemplo Plaza de Puente Alto): ' origen
\prompt 'Destino del sentido de ida (por ejemplo Hospital Sotero del Rio): ' destino

SELECT char_length(:'clave') >= 15 AS clave_valida \gset
\if :clave_valida
\else
    \echo 'La contrasena debe tener al menos 15 caracteres (politica para representantes)'
    \quit
\endif

BEGIN;

INSERT INTO usuarios (nombre_completo, correo_electronico, contrasena_hash, rol)
VALUES (btrim(:'nombre'), lower(btrim(:'correo')), crypt(:'clave', gen_salt('bf', 12)), 'representante')
RETURNING id AS representante_id \gset

INSERT INTO consentimientos (usuario_id, tipo, version_politica)
SELECT :'representante_id', t.tipo, '1.0'
FROM (VALUES ('terminos_de_uso'), ('politica_de_privacidad')) AS t (tipo);

INSERT INTO trazados (codigo, nombre, comuna, representante_id)
VALUES (btrim(:'codigo'), btrim(:'nombre_trazado'), btrim(:'comuna'), :'representante_id')
RETURNING id AS trazado_id \gset

INSERT INTO sentidos (trazado_id, sentido, origen, destino)
VALUES (:'trazado_id', 'ida', btrim(:'origen'), btrim(:'destino')),
       (:'trazado_id', 'vuelta', btrim(:'destino'), btrim(:'origen'));

COMMIT;

\echo 'Trazado creado:' :trazado_id
\echo 'Representante creado:' :representante_id
