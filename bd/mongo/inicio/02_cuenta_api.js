// =====================================================================
// Cuenta de la API en MongoDB con permisos minimos
// (Evaluacion 4, hallazgo V-02)
//
// Hasta la Eva 3 la API usaba la cuenta root de MongoDB: con esa
// contrasena se podia borrar o modificar el registro de auditoria, que es
// la evidencia ante un acceso ilicito (Ley 21.459). Ahora la API tiene su
// propio rol, limitado a lo que el codigo hace en cada coleccion
// (ISO/IEC 27002 8.2 y 8.15, proteccion de los registros):
//   - registro_eventos:      leer e insertar. Nunca modificar ni borrar.
//   - ubicaciones_vehiculos: leer e insertar.
//   - avisos_espera:         leer, insertar, actualizar y borrar (el
//                            pasajero puede cancelar su propio aviso).
// Los documentos viejos los borra MongoDB solo, con los indices TTL.
//
// Usuario y contrasena salen de MONGO_API_USUARIO y MONGO_API_CONTRASENA
// del .env de docker-compose: nunca del repositorio.
// =====================================================================

{
const usuarioApi = process.env.MONGO_API_USUARIO;
const contrasenaApi = process.env.MONGO_API_CONTRASENA;
if (!usuarioApi || !contrasenaApi) {
  throw new Error('Faltan MONGO_API_USUARIO o MONGO_API_CONTRASENA en el .env de docker-compose');
}

const bd = db.getSiblingDB('colectivos');
const en = (coleccion) => ({ db: 'colectivos', collection: coleccion });

bd.createRole({
  role: 'api_colectivos',
  privileges: [
    { resource: en('registro_eventos'), actions: ['find', 'insert'] },
    { resource: en('ubicaciones_vehiculos'), actions: ['find', 'insert'] },
    { resource: en('avisos_espera'), actions: ['find', 'insert', 'update', 'remove'] },
  ],
  roles: [],
});

bd.createUser({
  user: usuarioApi,
  pwd: contrasenaApi,
  roles: [{ role: 'api_colectivos', db: 'colectivos' }],
});

print('Cuenta de la API creada con el rol api_colectivos');
}
