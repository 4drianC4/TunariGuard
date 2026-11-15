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
import { msg, t, language } from './messages.mjs';

const base = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const districts = process.argv.slice(2);
const hora = () => new Date().toLocaleTimeString(language() === 'en' ? 'en-US' : 'es-BO', { timeZone: 'America/La_Paz' });

const socket = io(`${base}/realtime`, { transports: ['websocket'] });

socket.on('connect', async () => {
  console.log(msg`[${hora()}] conectado a ${base}/realtime (id ${socket.id})`);
  const ack = await socket.emitWithAck('subscribe', districts.length ? { districts } : {});
  if (ack.error) console.log(msg`[${hora()}] suscripción rechazada: ${ack.error}`);
  else console.log(msg`[${hora()}] escuchando salas: ${ack.rooms.join(', ')}  (Ctrl+C para salir)\n`);
});

socket.on('connect_error', (error) => {
  console.log(msg`[${hora()}] no se pudo conectar (${error.message}). ¿Está corriendo npm run start:dev?`);
});
socket.on('disconnect', (reason) => console.log(msg`[${hora()}] desconectado: ${reason}`));

socket.on('hotspots:new', (msg) => {
  const features = msg.collection.features;
  const porDistrito = {};
  for (const f of features) {
    const code = f.properties.district?.code ?? 'sin distrito';
    porDistrito[code] = (porDistrito[code] ?? 0) + 1;
  }
  const etiqueta = msg.simulated ? t('SIMULADO') : 'REAL';
  const cuando = msg.simulatedTimeUtc ? msg` · pasada ${msg.simulatedTimeUtc}` : '';
  console.log(msg`[${hora()}] 🔥 hotspots:new  ${features.length} focos · ${msg.mode} · ${etiqueta}${cuando}`);
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
  if (!lastBatch) return console.log(msg`[${hora()}] sync:status  (todavía no hay importaciones)`);
  const masivo = lastBatch.announced === false ? t(' · masiva: recargar GET /observations') : '';
  const nrt =
    lastBatch.upgradedToStandard || lastBatch.removedObsolete
      ? msg` · NRT: ${lastBatch.upgradedToStandard ?? 0} a estándar, ${lastBatch.removedObsolete ?? 0} borradas`
      : '';
  console.log(
    `[${hora()}] 📥 sync:status  "${lastBatch.dataset}" · ${lastBatch.inserted} nuevas, ` +
      `${lastBatch.duplicates} duplicadas, ${lastBatch.rejected} rechazadas${nrt}${masivo}`,
  );
});

socket.on('alert:new', (msg) => {
  const iconos = { Crítica: '🔴', Alta: '🟠', Media: '🟡' };
  console.log(msg`[${hora()}] 🚨 alert:new  ${msg.count} alerta(s) nueva(s)${msg.truncated ? msg` (se muestran ${msg.alerts.length})` : ''}`);
  for (const a of msg.alerts.slice(0, 5)) {
    console.log(`           ${iconos[a.severity] ?? '•'} ${a.id} ${t(a.severity)} · ${a.districtByLanguage?.[language()] ?? a.district} · ${a.detectionCount} det. · ${a.detected}${a.simulated ? ' · ' + t('SIMULADO') : ''}`);
  }
  if (msg.alerts.length > 5) console.log(msg`           … y ${msg.count - 5} más`);
});

socket.on('alert:notifications', ({ alerts }) => {
  const sample = alerts.slice(0, 5).map((a) => a.id).join(', ');
  console.log(msg`[${hora()}] 🔔 alert:notifications  ${alerts.length} alerta(s) para la campanita · ${sample}`);
});

socket.on('alert:removed', ({ alertIds }) => {
  console.log(msg`[${hora()}] 🗑  alert:removed  ${alertIds.length} alerta(s) quitada(s): ${alertIds.slice(0, 5).join(', ')}${alertIds.length > 5 ? ', …' : ''}`);
});

socket.on('alert:updated', ({ alert }) => {
  console.log(`[${hora()}] ✏️  alert:updated  ${alert.id} → ${t(alert.status)}${alert.note ? ` ("${alert.note}")` : ''}`);
});

socket.on('replay:status', (s) => {
  const estado = s.running ? msg`paso ${s.step}/${s.totalSteps}` : t('detenida');
  console.log(msg`[${hora()}] ⏯  replay:status ${estado} · ${s.observationCount} observaciones · cada ${s.intervalMs} ms`);
});

socket.on('districts:updated', (e) => {
  console.log(msg`[${hora()}] 🗺  districts:updated  ${e.imported} distritos · ${e.reassigned} focos reasignados`);
});

process.on('SIGINT', () => {
  socket.close();
  process.exit(0);
});
