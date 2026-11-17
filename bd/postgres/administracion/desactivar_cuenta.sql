-- =====================================================================
-- Matriz de permisos: el administrador desactiva cuentas (por ejemplo, la
-- de un representante que deja la asociacion). La cuenta no se borra:
-- queda inactiva, su historial se conserva y sus sesiones se cierran.
-- El efecto es inmediato: la API revisa el campo activo en cada peticion.
--
-- Uso, desde la carpeta del proyecto:
--   docker compose exec -it postgres sh -c 'psql -U "$POSTGRES_USER" -d colectivos -f /scripts/administracion/desactivar_cuenta.sql'
-- =====================================================================

\set ON_ERROR_STOP on
\prompt 'Correo de la cuenta a desactivar: ' correo

BEGIN;

UPDATE usuarios SET activo = false
WHERE correo_electronico = lower(btrim(:'correo')) AND activo
RETURNING id AS usuario_id, rol \gset

UPDATE tokens_refresco SET revocado_en = now()
WHERE usuario_id = :'usuario_id' AND revocado_en IS NULL;

COMMIT;

\echo 'Cuenta desactivada:' :usuario_id '(' :rol ')'
