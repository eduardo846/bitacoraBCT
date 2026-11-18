# Bitácora de actividades y horas

Aplicación web para registrar jornadas por consultor, fecha, cliente, proyecto o requerimiento, país, actividad, descripción y horas de inicio y fin. El tiempo trabajado se calcula automáticamente; si la hora final es anterior a la inicial, se toma como una jornada que cruza la medianoche. La interfaz incluye un recordatorio de periodicidad, correo de envío, jornada según el cliente y uso de una plantilla por periodo.

Los registros se guardan en `data/registros.json`. La tabla permite buscar, filtrar por mes, editar y eliminar actividades. Al elegir un mes con registros, se habilita **Exportar Excel** para descargar la consulta mensual como `.xlsx`, con encabezados azules, filas coloreadas por actividad y formatos de fecha y hora.

## Requisitos

- Node.js 18 o posterior

## Iniciar

Desde esta carpeta, ejecuta:

```powershell
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. También puedes cambiar el puerto con la variable de entorno `PORT`.

## API

- `GET /api/registros`: listar registros.
- `GET /api/registros/exportar?mes=AAAA-MM`: descargar la consulta mensual como un libro Excel `.xlsx`.
- `POST /api/registros`: crear un registro.
- `PUT /api/registros/:id`: actualizar un registro.
- `DELETE /api/registros/:id`: eliminar un registro.

Los campos de entrada son `consultor`, `fecha` (`YYYY-MM-DD`), `cliente`, `proyecto`, `pais`, `actividad`, `descripcion`, `horaInicio` y `horaFin` (`HH:mm`). El campo `tiempo` se calcula y se almacena en horas decimales.
