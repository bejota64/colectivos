-- =====================================================================
-- Cuenta de la API con permisos minimos (Evaluacion 4, hallazgo V-01)
--
-- Hasta la Eva 3 la API se conectaba con la cuenta duena de la base, que
-- en la imagen oficial de PostgreSQL es superusuario: con esa contrasena
-- se podia borrar cualquier tabla, alterar calificaciones o crear cuentas.
-- Ahora la API usa su propia cuenta, que solo puede hacer lo que el codigo
-- necesita (ISO/IEC 27002 8.2, derechos de acceso privilegiado):
--   - leer las tablas;
--   - insertar solo donde la aplicacion inserta;
--   - actualizar solo las columnas que la aplicacion cambia;
--   - nunca DELETE, TRUNCATE ni cambios de estructura.
-- La cuenta duena (POSTGRES_USUARIO) queda para los scripts de la base y
-- para limpiar datos en las pruebas; la API nunca la usa.
--
-- Nombre y contrasena salen de POSTGRES_API_USUARIO y
-- POSTGRES_API_CONTRASENA del .env de docker-compose: nunca del repositorio.
-- Si se agrega una consulta que escribe en otra tabla o columna, hay que
-- agregar aqui el permiso; si no, PostgreSQL la rechaza con el codigo 42501.
-- =====================================================================

\getenv api_usuario POSTGRES_API_USUARIO
\getenv api_contrasena POSTGRES_API_CONTRASENA

\if :{?api_contrasena}
\else
DO $$ BEGIN
    RAISE EXCEPTION 'Faltan POSTGRES_API_USUARIO o POSTGRES_API_CONTRASENA en el .env de docker-compose';
END $$;
\endif

CREATE ROLE :"api_usuario" LOGIN PASSWORD :'api_contrasena'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 30;

-- Nadie mas que las cuentas declaradas entra a la base ni crea objetos.
REVOKE ALL ON DATABASE colectivos FROM PUBLIC;
GRANT CONNECT ON DATABASE colectivos TO :"api_usuario";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"api_usuario";

-- Lectura de todas las tablas.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"api_usuario";

-- Insercion: solo donde la aplicacion inserta.
GRANT INSERT ON usuarios, consentimientos, tokens_refresco, jornadas,
                abordajes, calificaciones, demanda_por_tramo
    TO :"api_usuario";

-- Actualizacion: solo las columnas que la aplicacion cambia.
GRANT UPDATE (aceptado_en, revocado_en) ON consentimientos TO :"api_usuario";
GRANT UPDATE (revocado_en) ON tokens_refresco TO :"api_usuario";
GRANT UPDATE (asientos_disponibles, sentido_actual_id, finalizada_en) ON jornadas TO :"api_usuario";
GRANT UPDATE (avisos, personas) ON demanda_por_tramo TO :"api_usuario";
