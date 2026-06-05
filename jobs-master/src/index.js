'use strict';
require('dotenv').config({ override: false });

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { routeQueue } = require('./queue');
require('./worker'); // registra el processor de la cola

const app = express();
app.use(express.json());

// GET /heartbeat
// Indica si el servicio está operativo — requerido por RNF04
// El frontend admin lo consulta para mostrar disponibilidad
app.get('/heartbeat', (req, res) => {
  res.json({ status: true });
});

// POST /job
// Recibe los datos necesarios para calcular rutas y encola el trabajo
// Body: { matrix, originCity, criteria }
// Retorna: { jobId }
app.post('/job', async (req, res) => {
  const { matrix, originCity, criteria } = req.body;

  if (!matrix || !originCity || !criteria) {
    return res.status(400).json({ error: 'Faltan campos: matrix, originCity, criteria' });
  }

  // Bull.Queue.add(data, opts) — agrega un job a la cola
  // data : objeto con los datos que recibirá el worker
  // opts.jobId : ID personalizado (usamos UUID para poder hacer GET /job/:id)
  const jobId = uuidv4();
  const job = await routeQueue.add({ matrix, originCity, criteria }, { jobId });

  console.log(`[API] Job creado: ${job.id}`);
  res.status(201).json({ jobId: job.id });
});

// GET /job/:id
// Consulta el estado y resultado de un job creado anteriormente
// Retorna: { id, status, result, createdAt, finishedAt }
app.get('/job/:id', async (req, res) => {
  // Bull.Queue.getJob(id) — busca un job por su ID en Redis
  // Retorna null si no existe
  const job = await routeQueue.getJob(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job no encontrado' });
  }

  // job.getState() — retorna el estado actual: waiting | active | completed | failed | delayed
  const state = await job.getState();

  res.json({
    id: job.id,
    status: state,
    result: job.returnvalue || null,
    failedReason: job.failedReason || null,
    createdAt: new Date(job.timestamp).toISOString(),
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[JobsMaster] Corriendo en puerto ${PORT}`);
});
