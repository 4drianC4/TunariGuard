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
const hora = () => new Date().toLocaleTimeString();

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

socket.on('sync:status', ({ lastBatch }) => {
  if (!lastBatch) return console.log(`[${hora()}] sync:status  (todavía no hay importaciones)`);
  const masivo = lastBatch.announced === false ? ' · masiva: recargar GET /observations' : '';
  console.log(
    `[${hora()}] 📥 sync:status  "${lastBatch.dataset}" · ${lastBatch.inserted} nuevas, ` +
      `${lastBatch.duplicates} duplicadas, ${lastBatch.rejected} rechazadas${masivo}`,
  );
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
