'use strict';
require('dotenv').config({ override: false });
const Bull = require('bull');

// Bull(queueName, redisUrl)
// queueName : nombre lógico de la cola, los workers se suscriben por este nombre
// redisUrl  : conexión a Redis, en docker-compose el hostname es el nombre del servicio
const routeQueue = new Bull('route-calculation', process.env.REDIS_URL);

routeQueue.on('error', (err) => {
  console.error('[Queue] Error Redis:', err.message);
});

routeQueue.on('completed', (job) => {
  console.log(`[Queue] Job ${job.id} completado`);
});

routeQueue.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job.id} falló: ${err.message}`);
});

module.exports = { routeQueue };
