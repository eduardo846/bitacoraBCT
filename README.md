# Bitácora de actividades y horas

Aplicación web para registrar jornadas por consultor, fecha, cliente, proyecto o requerimiento, país, actividad, descripción y horas de inicio y fin. El tiempo trabajado se calcula automáticamente; si la hora final es anterior a la inicial, se toma como una jornada que cruza la medianoche. La interfaz incluye un recordatorio de periodicidad, correo de envío, jornada según el cliente y uso de una plantilla por periodo.

Los registros se guardan en la colección `registros` de Cloud Firestore. La tabla muestra por defecto los registros del día actual y permite consultar otros días o meses sin borrar registros anteriores, además de buscar, editar y eliminar actividades. Al elegir un mes con registros, se habilita **Exportar Excel** para descargar la consulta mensual como `.xlsx`, con encabezados azules, filas coloreadas por actividad y formatos de fecha y hora. La consulta mensual se ejecuta en Firestore usando el campo `fecha`.

## Requisitos

- Node.js 18 o posterior
- Un proyecto de Firebase con Cloud Firestore habilitado
- Una cuenta de servicio de Firebase o credenciales ADC proporcionadas por el entorno

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

No uses valores ficticios: copia los tres campos del JSON real. `.env` contiene una clave privada: no lo publiques ni lo subas a Git. Para producción, configura estas tres variables como secretos del servidor en vez de subir `.env`. La cuenta necesita permisos de lectura y escritura en Firestore.

Después, inicia la aplicación desde esta carpeta:

```powershell
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. También puedes cambiar el puerto con la variable de entorno `PORT`.

El backend usa Firebase Admin SDK, cuyas credenciales tienen acceso privilegiado y no están sujetas a las reglas de seguridad de Firestore. La API de esta aplicación no implementa autenticación de usuarios; ejecútala solo en un entorno confiable y protegido, y no la publiques directamente en Internet.

Los registros que existieran en `data/registros.json` no se importan automáticamente a Firestore. El archivo local no se modifica; migra sus datos antes de cambiar de entorno si los necesitas.

## API

- `GET /api/registros`: listar registros.
- `GET /api/registros/exportar?mes=AAAA-MM`: descargar la consulta mensual como un libro Excel `.xlsx`.
- `POST /api/registros`: crear un registro.
- `PUT /api/registros/:id`: actualizar un registro.
- `DELETE /api/registros/:id`: eliminar un registro.

Los campos de entrada son `consultor`, `fecha` (`YYYY-MM-DD`), `cliente`, `proyecto`, `pais`, `actividad`, `descripcion`, `horaInicio` y `horaFin` (`HH:mm`). El campo `tiempo` se calcula y se almacena en horas decimales.
