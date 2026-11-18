# Bitácora de actividades y horas

Interfaz en React, compilada con Vite, y API protegida con Netlify Functions y Firebase Admin.

Aplicación web para registrar jornadas por consultor, fecha, cliente, proyecto o requerimiento, país, actividad, descripción y horas de inicio y fin. El tiempo trabajado se calcula automáticamente; si la hora final es anterior a la inicial, se toma como una jornada que cruza la medianoche. La interfaz incluye un recordatorio de periodicidad, correo de envío, jornada según el cliente y uso de una plantilla por periodo.

Los registros se guardan en la colección `registros` de Cloud Firestore. La tabla muestra por defecto los registros del día actual y permite consultar otros días o meses sin borrar registros anteriores, además de buscar, editar y eliminar actividades. Al elegir un mes con registros, se habilita **Exportar Excel** para descargar la consulta mensual como `.xlsx`, con encabezados azules, filas coloreadas por actividad y formatos de fecha y hora.

La aplicación usa Firebase Authentication con correo y contraseña. El backend verifica los ID tokens con Firebase Admin y restringe el acceso a las direcciones incluidas en `FIREBASE_ALLOWED_EMAILS`.

## Requisitos

- Node.js 22 o posterior
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

En Firebase Console, registra una aplicación web y copia su configuración en las variables `VITE_`:

| Campo de Firebase | Variable |
| --- | --- |
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `appId` | `VITE_FIREBASE_APP_ID` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` (opcional) | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` (opcional) | `VITE_FIREBASE_MESSAGING_SENDER_ID` |

`VITE_FIREBASE_AUTH_DOMAIN` es opcional; si se omite, se usa `<project-id>.firebaseapp.com`. Las variables `VITE_` se incorporan al JavaScript que recibe el navegador, así que solo deben contener configuración pública de Firebase Web, nunca la clave privada de Firebase Admin.

En Firebase Console, habilita **Authentication > Correo electrónico/contraseña** y crea las cuentas autorizadas. Agrega sus correos, separados por comas, en `FIREBASE_ALLOWED_EMAILS`. La aplicación no ofrece registro público y el backend rechaza cualquier cuenta fuera de esa lista.

Agrega `localhost` a los dominios autorizados de Firebase Authentication para probar localmente. Para compilar y servir la aplicación:

```powershell
npm start
```

Abre [http://localhost:3000](http://localhost:3000). Para desarrollo con recarga en caliente, ejecuta `npm run api` en una terminal y `npm run dev` en otra; Vite abrirá [http://localhost:5173](http://localhost:5173) y enviará las solicitudes `/api` al servidor local.

## Desplegar en Netlify

Netlify compila React/Vite y publica `dist/`; las rutas de la API se ejecutan mediante Netlify Functions, configuradas en `netlify.toml`.

1. Importa el repositorio en Netlify y selecciona la rama que quieras desplegar.
2. En Environment variables, define las variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` y `VITE_FIREBASE_AUTH_DOMAIN` (opcional) con alcance **Builds**. `VITE_FIREBASE_STORAGE_BUCKET` y `VITE_FIREBASE_MESSAGING_SENDER_ID` también son opcionales.
3. Define `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` y `FIREBASE_ALLOWED_EMAILS` con alcance **Functions**. El proyecto también puede tener `FIREBASE_PROJECT_ID` disponible para Builds si se requiere, pero el cliente usa `VITE_FIREBASE_PROJECT_ID`.
4. En Firebase Authentication, agrega el dominio de Netlify a los dominios autorizados. Crea las cuentas en Firebase Console y agrega sus correos a `FIREBASE_ALLOWED_EMAILS`.
5. Despliega el sitio y accede por HTTPS. Si cambias variables de entorno, vuelve a desplegar para que el sitio y las funciones reciban los valores actualizados.

No agregues `VITE_` a variables privadas. No subas `.env` ni credenciales de servidor al repositorio.

Los registros que existieran en `data/registros.json` no se importan automáticamente a Firestore. El archivo local no se modifica; migra sus datos antes de cambiar de entorno si los necesitas.

## API

- `GET /api/registros`: listar registros.
- `GET /api/registros/exportar?mes=AAAA-MM`: descargar la consulta mensual como un libro Excel `.xlsx`.
- `POST /api/registros`: crear un registro.
- `PUT /api/registros/:id`: actualizar un registro.
- `DELETE /api/registros/:id`: eliminar un registro.

Todas las rutas requieren un token de Firebase Authentication válido y el correo debe estar incluido en `FIREBASE_ALLOWED_EMAILS`.

Los campos de entrada son `consultor`, `fecha` (`YYYY-MM-DD`), `cliente`, `proyecto`, `pais`, `actividad`, `descripcion`, `horaInicio` y `horaFin` (`HH:mm`). El campo `tiempo` se calcula y se almacena en horas decimales.
