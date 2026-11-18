# Bitácora de actividades y horas

Aplicación web para registrar jornadas por consultor, fecha, cliente, proyecto o requerimiento, país, actividad, descripción y horas de inicio y fin. El tiempo trabajado se calcula automáticamente; si la hora final es anterior a la inicial, se toma como una jornada que cruza la medianoche. La interfaz incluye un recordatorio de periodicidad, correo de envío, jornada según el cliente y uso de una plantilla por periodo.

Los registros se guardan en la colección `registros` de Cloud Firestore. La tabla muestra por defecto los registros del día actual y permite consultar otros días o meses sin borrar registros anteriores, además de buscar, editar y eliminar actividades. Al elegir un mes con registros, se habilita **Exportar Excel** para descargar la consulta mensual como `.xlsx`, con encabezados azules, filas coloreadas por actividad y formatos de fecha y hora. La consulta mensual se ejecuta en Firestore usando el campo `fecha`.

## Requisitos

- Node.js 18 o posterior
- Un proyecto de Firebase con Cloud Firestore habilitado
- Una cuenta de servicio de Firebase o credenciales ADC proporcionadas por el entorno
- Para desplegar: una cuenta de Netlify con Functions e Identity habilitados

## Configurar e iniciar

En la carpeta del proyecto, copia `.env.example` como `.env`. Desde el JSON de cuenta de servicio descargado de Firebase, copia estos tres campos a las variables correspondientes:

| Campo del JSON | Variable en `.env` |
| --- | --- |
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` |

Pega el valor de `private_key` entre comillas dobles y conserva los `\n` que aparecen en el JSON:

```env
FIREBASE_PROJECT_ID=bitacorabct
FIREBASE_CLIENT_EMAIL=cuenta-de-servicio@bitacorabct.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="pega aquí el valor de private_key y conserva los \n"
```

No uses valores ficticios: copia los tres campos del JSON real. `.env` contiene una clave privada: no lo publiques ni lo subas a Git. La cuenta necesita permisos de lectura y escritura en Firestore.

Después, inicia la aplicación local desde esta carpeta:

```powershell
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. También puedes cambiar el puerto con la variable de entorno `PORT`. El servidor local no requiere Netlify Identity; úsalo solo en un entorno confiable y protegido.

## Desplegar en Netlify

El sitio está preparado para publicar `public/` como contenido estático y ejecutar las rutas `/api/registros` mediante Netlify Functions. La lógica de Firestore, validación y exportación se comparte con el servidor local.

1. Importa el repositorio en Netlify y selecciona la rama que quieras desplegar. La configuración de publicación y de funciones ya está en `netlify.toml`.
2. En la configuración del sitio, define estas variables de entorno para las funciones:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

   Usa los valores de la cuenta de servicio descritos arriba. En `FIREBASE_PRIVATE_KEY`, conserva los saltos como `\n`. No cargues el archivo `.env` ni una clave JSON al repositorio.
3. En el panel del sitio, habilita **Netlify Identity** y cambia el registro de usuarios a **Invite only**. Invita a cada persona que deba usar la bitácora; no habilites el registro abierto.
4. Espera a que termine el despliegue y abre el sitio por HTTPS. El inicio de sesión protege la interfaz y cada función valida la sesión antes de acceder a Firestore.

La cuenta de servicio de Firebase tiene acceso privilegiado y no está sujeta a las reglas de seguridad de Firestore. Las variables de Firebase deben configurarse como secretos del entorno de Netlify. Las operaciones de todos los usuarios invitados comparten la misma colección `registros`.

El `.env` local solo se usa con `npm start`; no forma parte del despliegue. Netlify publica las funciones definidas en `netlify/functions/` y las monta en las rutas de la API configuradas en cada función.

Los registros que existieran en `data/registros.json` no se importan automáticamente a Firestore. El archivo local no se modifica; migra sus datos antes de cambiar de entorno si los necesitas.

## API

- `GET /api/registros`: listar registros.
- `GET /api/registros/exportar?mes=AAAA-MM`: descargar la consulta mensual como un libro Excel `.xlsx`.
- `POST /api/registros`: crear un registro.
- `PUT /api/registros/:id`: actualizar un registro.
- `DELETE /api/registros/:id`: eliminar un registro.

En Netlify, todas estas rutas requieren una sesión válida de Netlify Identity. El servidor local sigue usando el mismo contrato de API, pero está destinado únicamente al desarrollo.

Los campos de entrada son `consultor`, `fecha` (`YYYY-MM-DD`), `cliente`, `proyecto`, `pais`, `actividad`, `descripcion`, `horaInicio` y `horaFin` (`HH:mm`). El campo `tiempo` se calcula y se almacena en horas decimales.
