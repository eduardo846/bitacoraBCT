# Bitácora de actividades y horas

Aplicación web para registrar jornadas por consultor, fecha, cliente, proyecto o requerimiento, país, actividad, descripción y horas de inicio y fin. El tiempo trabajado se calcula automáticamente; si la hora final es anterior a la inicial, se toma como una jornada que cruza la medianoche. La interfaz incluye un recordatorio de periodicidad, correo de envío, jornada según el cliente y uso de una plantilla por periodo.

Los registros se guardan en la colección `registros` de Cloud Firestore. La tabla muestra por defecto los registros del día actual y permite consultar otros días o meses sin borrar registros anteriores, además de buscar, editar y eliminar actividades. Al elegir un mes con registros, se habilita **Exportar Excel** para descargar la consulta mensual como `.xlsx`, con encabezados azules, filas coloreadas por actividad y formatos de fecha y hora.

La aplicación usa Firebase Authentication con correo y contraseña. El backend verifica los ID tokens con Firebase Admin y restringe el acceso a las direcciones incluidas en `FIREBASE_ALLOWED_EMAILS`.

## Requisitos

- Node.js 18 o posterior
- Un proyecto de Firebase con Cloud Firestore habilitado
- Firebase Authentication con el proveedor **Correo electrónico/contraseña**
- Una cuenta de servicio de Firebase

## Configurar e iniciar localmente

En la carpeta del proyecto, copia `.env.example` como `.env`.

### Credenciales de servidor

Desde el JSON de cuenta de servicio descargado de Firebase, copia estos campos:

| Campo del JSON | Variable |
| --- | --- |
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

Pega `private_key` entre comillas dobles y conserva los `\n`. No publiques `.env` ni la clave JSON: el Admin SDK tiene acceso privilegiado y no está sujeto a las reglas de Firestore.

### Configuración web y usuarios autorizados

En Firebase Console, registra una aplicación web y copia de su configuración:

| Campo de Firebase | Variable |
| --- | --- |
| `apiKey` | `FIREBASE_API_KEY` |
| `appId` | `FIREBASE_APP_ID` |
| `authDomain` | `FIREBASE_AUTH_DOMAIN` |

`FIREBASE_AUTH_DOMAIN` es opcional; si se omite, se usa `<project-id>.firebaseapp.com`. La API key de Firebase Web es pública por diseño; configura restricciones de API en Google Cloud cuando corresponda.

En Firebase Console, habilita **Authentication > Correo electrónico/contraseña** y crea las cuentas autorizadas. Agrega sus correos, separados por comas, en `FIREBASE_ALLOWED_EMAILS`. La aplicación no ofrece registro público y el backend rechaza cualquier cuenta fuera de esa lista.

Agrega `localhost` a los dominios autorizados de Firebase Authentication para probar localmente. Después inicia la aplicación:

```powershell
npm start
```

Abre [http://localhost:3000](http://localhost:3000). El inicio de sesión de Firebase y la verificación de tokens funcionan también en el entorno local.

## Desplegar en Netlify

El proyecto publica `public/` como contenido estático y ejecuta las rutas de la API mediante Netlify Functions, configuradas en `netlify.toml`.

1. Importa el repositorio en Netlify y selecciona la rama que quieras desplegar.
2. En la configuración del sitio, define las variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_AUTH_DOMAIN` (opcional) y `FIREBASE_ALLOWED_EMAILS`.
3. En Firebase Authentication, agrega el dominio de Netlify a los dominios autorizados. Crea las cuentas en Firebase Console y agrega sus correos a `FIREBASE_ALLOWED_EMAILS`.
4. Despliega el sitio y accede por HTTPS.

La configuración web que entrega `/api/auth-config` solo contiene valores públicos de Firebase; no incluye la clave privada de la cuenta de servicio. No subas `.env` ni credenciales de servidor al repositorio.

Los registros que existieran en `data/registros.json` no se importan automáticamente a Firestore. El archivo local no se modifica; migra sus datos antes de cambiar de entorno si los necesitas.

## API

- `GET /api/auth-config`: obtener la configuración pública de Firebase para iniciar el cliente.
- `GET /api/registros`: listar registros.
- `GET /api/registros/exportar?mes=AAAA-MM`: descargar la consulta mensual como un libro Excel `.xlsx`.
- `POST /api/registros`: crear un registro.
- `PUT /api/registros/:id`: actualizar un registro.
- `DELETE /api/registros/:id`: eliminar un registro.

Todas las rutas salvo `/api/auth-config` requieren un token de Firebase Authentication válido y el correo debe estar incluido en `FIREBASE_ALLOWED_EMAILS`.

Los campos de entrada son `consultor`, `fecha` (`YYYY-MM-DD`), `cliente`, `proyecto`, `pais`, `actividad`, `descripcion`, `horaInicio` y `horaFin` (`HH:mm`). El campo `tiempo` se calcula y se almacena en horas decimales.
