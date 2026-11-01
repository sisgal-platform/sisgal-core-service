/**
 * Las columnas de fecha y hora son `timestamp` sin zona, y el driver de
 * PostgreSQL las escribe y las lee con la zona del proceso. Se fija la de
 * Colombia para que todas las instancias guarden y lean lo mismo, sin importar
 * la zona del servidor donde corran. Este archivo debe importarse antes que
 * cualquier otro.
 */
process.env.TZ = 'America/Bogota';
