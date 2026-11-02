// Las pruebas corren en la misma zona horaria que fija `src/config/timezone.ts`,
// para detectar fechas que cambian de día según la zona del proceso.
module.exports = async () => {
  process.env.TZ = 'America/Bogota';
};
