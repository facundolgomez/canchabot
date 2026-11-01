import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { complejo, HORAS } from './data/complejo.js';
import { listarReservas, cambiarEstado } from './lib/reservas.js';
import { procesarChat, modoActual } from './lib/asistente.js';
import { ahoraBA } from './lib/fechas.js';
import { generarPromo, analizarDia } from './lib/dueno.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '200kb' }));

// ---------- API ----------

app.get('/api/salud', (req, res) => {
  res.json({ ok: true, modo: modoActual(), ahora: ahoraBA() });
});

app.get('/api/complejo', (req, res) => {
  res.json({ complejo, horas: HORAS, hoy: ahoraBA().fecha, modo: modoActual() });
});

app.post('/api/chat', async (req, res) => {
  try {
    const respuesta = await procesarChat(req.body?.historial);
    res.json(respuesta);
  } catch (e) {
    if (!e.publicMessage) console.error('[chat]', e);
    res.status(e.status || 500).json({ error: e.publicMessage || 'Error inesperado en el servidor.' });
  }
});

app.get('/api/reservas', (req, res) => {
  res.json(listarReservas({ fecha: req.query.fecha }));
});

app.patch('/api/reservas/:id', (req, res) => {
  const resultado = cambiarEstado(Number(req.params.id), req.body?.estado);
  if (!resultado.ok) return res.status(resultado.status).json({ error: resultado.error });
  res.json(resultado.reserva);
});

// IA para el dueño
async function responderIA(res, fn) {
  try {
    res.json(await fn());
  } catch (e) {
    if (!e.publicMessage) console.error('[dueño]', e);
    res.status(e.status || 500).json({ error: e.publicMessage || 'Error inesperado en el servidor.' });
  }
}

app.post('/api/promo', (req, res) => responderIA(res, () => generarPromo(req.body?.fecha)));
app.post('/api/analisis', (req, res) => responderIA(res, () => analizarDia(req.body?.fecha)));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ---------- Frontend (build de Vite) ----------

const dist = path.join(__dirname, 'client', 'dist');
app.use(express.static(dist));

// Fallback SPA (Express 5: usamos app.use en vez de app.get('*'))
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) {
    return res
      .status(404)
      .send('Frontend sin compilar. Corré "npm run build" en la raíz, o "npm run dev" dentro de client/ para desarrollo.');
  }
  res.sendFile(index);
});

// Errores (por ej. JSON mal formado)
app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error inesperado en el servidor.' });
});

app.listen(PORT, () => {
  console.log(`⚽ ${complejo.nombre} escuchando en http://localhost:${PORT}`);
  console.log(modoActual() === 'ia' ? '🤖 IA activa (gpt-4o-mini)' : '🧪 Modo demo: no hay OPENAI_API_KEY, uso respuestas simuladas');
});
