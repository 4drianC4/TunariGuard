#!/usr/bin/env node
/**
 * Escucha el canal de tiempo real (Socket.IO /realtime) e imprime cada evento, como lo
 * recibiría el frontend. Útil para probar sin Angular:
 *
 *   npm run realtime:watch                      todos los distritos
 *   npm run realtime:watch -- distrito-09 distrito-13   solo esos distritos
 *
 * Variables: API_URL (por defecto http://localhost:3000).
 */
import { io } from 'socket.io-client';

const base = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const districts = process.argv.slice(2);
const hora = () => new Date().toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz' });

const socket = io(`${base}/realtime`, { transports: ['websocket'] });

socket.on('connect', async () => {
  console.log(`[${hora()}] conectado a ${base}/realtime (id ${socket.id})`);
  const ack = await socket.emitWithAck('subscribe', districts.length ? { districts } : {});
  if (ack.error) console.log(`[${hora()}] suscripción rechazada: ${ack.error}`);
  else console.log(`[${hora()}] escuchando salas: ${ack.rooms.join(', ')}  (Ctrl+C para salir)\n`);
});

socket.on('connect_error', (error) => {
  console.log(`[${hora()}] no se pudo conectar (${error.message}). ¿Está corriendo npm run start:dev?`);
});
socket.on('disconnect', (reason) => console.log(`[${hora()}] desconectado: ${reason}`));

socket.on('hotspots:new', (msg) => {
  const features = msg.collection.features;
  const porDistrito = {};
  for (const f of features) {
    const code = f.properties.district?.code ?? 'sin distrito';
    porDistrito[code] = (porDistrito[code] ?? 0) + 1;
  }
  const etiqueta = msg.simulated ? 'SIMULADO' : 'REAL';
  const cuando = msg.simulatedTimeUtc ? ` · pasada ${msg.simulatedTimeUtc}` : '';
  console.log(`[${hora()}] 🔥 hotspots:new  ${features.length} focos · ${msg.mode} · ${etiqueta}${cuando}`);
  console.log(`           ${Object.entries(porDistrito).map(([d, n]) => `${d}: ${n}`).join(' · ')}`);
});

socket.on('hotspots:removed', (msg) => {
  const muestra = msg.removedIds.slice(0, 3).join(', ');
  console.log(
    `[${hora()}] 🧹 hotspots:removed  ${msg.removedIds.length} focos quitados del mapa · ${msg.reason} · ` +
      `${msg.dataset ? `"${msg.dataset}" ` : ''}(${muestra}${msg.removedIds.length > 3 ? ', …' : ''})`,
  );
});

socket.on('sync:status', ({ lastBatch }) => {
  if (!lastBatch) return console.log(`[${hora()}] sync:status  (todavía no hay importaciones)`);
  const masivo = lastBatch.announced === false ? ' · masiva: recargar GET /observations' : '';
  const nrt =
    lastBatch.upgradedToStandard || lastBatch.removedObsolete
      ? ` · NRT: ${lastBatch.upgradedToStandard ?? 0} a estándar, ${lastBatch.removedObsolete ?? 0} borradas`
      : '';
  console.log(
    `[${hora()}] 📥 sync:status  "${lastBatch.dataset}" · ${lastBatch.inserted} nuevas, ` +
      `${lastBatch.duplicates} duplicadas, ${lastBatch.rejected} rechazadas${nrt}${masivo}`,
  );
});

socket.on('alert:new', (msg) => {
  const iconos = { Crítica: '🔴', Alta: '🟠', Media: '🟡' };
  console.log(`[${hora()}] 🚨 alert:new  ${msg.count} alerta(s) nueva(s)${msg.truncated ? ` (se muestran ${msg.alerts.length})` : ''}`);
  for (const a of msg.alerts.slice(0, 5)) {
    console.log(`           ${iconos[a.severity] ?? '•'} ${a.id} ${a.severity} · ${a.district} · ${a.detectionCount} det. · ${a.detected}${a.simulated ? ' · SIMULADO' : ''}`);
  }
  if (msg.alerts.length > 5) console.log(`           … y ${msg.count - 5} más`);
});

socket.on('alert:notifications', ({ alerts }) => {
  const sample = alerts.slice(0, 5).map((a) => a.id).join(', ');
  console.log(`[${hora()}] 🔔 alert:notifications  ${alerts.length} alerta(s) para la campanita · ${sample}`);
});

socket.on('alert:removed', ({ alertIds }) => {
  console.log(`[${hora()}] 🗑  alert:removed  ${alertIds.length} alerta(s) quitada(s): ${alertIds.slice(0, 5).join(', ')}${alertIds.length > 5 ? ', …' : ''}`);
});

socket.on('alert:updated', ({ alert }) => {
  console.log(`[${hora()}] ✏️  alert:updated  ${alert.id} → ${alert.status}${alert.note ? ` ("${alert.note}")` : ''}`);
});

socket.on('replay:status', (s) => {
  const estado = s.running ? `paso ${s.step}/${s.totalSteps}` : 'detenida';
  console.log(`[${hora()}] ⏯  replay:status ${estado} · ${s.observationCount} observaciones · cada ${s.intervalMs} ms`);
});

socket.on('districts:updated', (e) => {
  console.log(`[${hora()}] 🗺  districts:updated  ${e.imported} distritos · ${e.reassigned} focos reasignados`);
});

process.on('SIGINT', () => {
  socket.close();
  process.exit(0);
});
