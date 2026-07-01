'use strict';

const MASTER_URL = process.env.MASTER_URL || 'http://localhost:3001';

// Lambda 1: verifica si la suscripción debe enviar otro paquete
exports.checkSubscription = async (event) => {
  const masterUrl = event.masterUrl || MASTER_URL;
  const { subscriptionId } = event;

  const res = await fetch(`${masterUrl}/internal/subscriptions/${subscriptionId}`);
  if (!res.ok) throw new Error(`No se pudo obtener suscripción ${subscriptionId}: ${res.status}`);
  const sub = await res.json();

  const budgetRestante = sub.budget_total - sub.budget_used;
  const shouldSend =
    sub.status === 'running' &&
    sub.packages_sent < sub.packages_total &&
    budgetRestante >= sub.cost_per_shipment;

  return { ...event, shouldSend };
};

// Lambda 2: pide al master que publique un paquete al broker
exports.sendSubscriptionPackage = async (event) => {
  const masterUrl = event.masterUrl || MASTER_URL;
  const { subscriptionId } = event;

  const res = await fetch(`${masterUrl}/internal/subscriptions/${subscriptionId}/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Error en tick de suscripción ${subscriptionId}: ${body}`);
  }
  return { ...event };
};

// Lambda 3: marca la suscripción como completada
exports.completeSubscription = async (event) => {
  const masterUrl = event.masterUrl || MASTER_URL;
  const { subscriptionId } = event;

  const res = await fetch(`${masterUrl}/internal/subscriptions/${subscriptionId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Error completando suscripción ${subscriptionId}: ${body}`);
  }
  return { ...event, done: true };
};
