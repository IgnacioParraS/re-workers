'use strict';
require('dotenv').config();

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { routeQueue } = require('./queue');

// LambdaClient({ region }) — cliente AWS para invocar funciones Lambda
const lambda = new LambdaClient({ region: process.env.AWS_REGION });

// routeQueue.process(concurrency, handler)
routeQueue.process(2, async (job) => {
  console.log(`[Worker] Procesando job ${job.id}`, job.data);

  const payload = {
    matrix: job.data.matrix,
    originCity: job.data.originCity,
    criteria: job.data.criteria,
  };

  // InvokeCommand — invoca una función Lambda de forma síncrona (RequestResponse)
  const command = new InvokeCommand({
    FunctionName: process.env.LAMBDA_FUNCTION_NAME,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify(payload)),
  });

  const response = await lambda.send(command);

  // La Lambda retorna el resultado en response.Payload como Uint8Array
  const resultText = Buffer.from(response.Payload).toString('utf-8');
  const result = JSON.parse(resultText);

  if (result.errorMessage) {
    throw new Error(`Lambda error: ${result.errorMessage}`);
  }

  // Notificar al master para persistir el resultado (RNF07)
  // El master expone POST /internal/jobs/:id para actualizar el estado
  await fetch(`${process.env.MASTER_URL}/internal/jobs/${job.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed', result }),
  }).catch((err) => console.warn('[Worker] No se pudo notificar al master:', err.message));

  return result;
});

console.log('[Worker] Escuchando jobs en la cola route-calculation...');
