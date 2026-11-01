// "Base de datos" en memoria + toda la lógica de disponibilidad.
// El backend SIEMPRE valida acá antes de guardar: nunca se confía solo en la IA.

import { complejo, HORAS } from '../data/complejo.js';
import { ahoraBA, sumarDias, esFechaValida, fechaLarga } from './fechas.js';

export const ESTADOS = ['pendiente_sena', 'confirmada', 'cancelada'];
export const MAX_DIAS_ANTICIPACION = 14;

const reservas = [];
let ultimoId = 0;

// ---------- Normalizadores ----------

export function getCancha(valor) {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').match(/\d+/)?.[0]);
  return complejo.canchas.find((c) => c.id === n) || null;
}

// Acepta 21, "21", "21:00", "21hs" → "21:00". Devuelve null si no es un turno válido.
export function normalizarHora(valor) {
  const m = String(valor ?? '').trim().match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  if (m[2] && m[2] !== '00') return null;
  const hora = `${m[1].padStart(2, '0')}:00`;
  return HORAS.includes(hora) ? hora : null;
}

const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// ---------- Consultas ----------

export function listarReservas({ fecha } = {}) {
  return reservas
    .filter((r) => !fecha || r.fecha === fecha)
    .slice()
    .sort((a, b) => (a.fecha + a.hora + a.cancha).localeCompare(b.fecha + b.hora + b.cancha));
}

export function estaOcupado(cancha, fecha, hora, excluirId = null) {
  return reservas.some(
    (r) => r.estado !== 'cancelada' && r.cancha === cancha && r.fecha === fecha && r.hora === hora && r.id !== excluirId
  );
}

function yaPaso(fecha, hora) {
  const ahora = ahoraBA();
  return fecha < ahora.fecha || (fecha === ahora.fecha && Number(hora.slice(0, 2)) <= ahora.hora);
}

// Turnos ocupados (no cancelados) en las fechas indicadas.
export function ocupados(fechas) {
  const set = new Set(fechas);
  return listarReservas().filter((r) => r.estado !== 'cancelada' && set.has(r.fecha));
}

// Turnos libres (futuros) en las fechas indicadas, ordenados por fecha, hora y cancha.
export function libres({ fechas, canchas = null, horaDesde = 0, horaHasta = 24 } = {}) {
  const ids = canchas?.length ? canchas : complejo.canchas.map((c) => c.id);
  const res = [];
  for (const fecha of fechas) {
    for (const hora of HORAS) {
      const h = Number(hora.slice(0, 2));
      if (h < horaDesde || h >= horaHasta || yaPaso(fecha, hora)) continue;
      for (const cancha of ids) {
        if (!estaOcupado(cancha, fecha, hora)) res.push({ cancha, fecha, hora });
      }
    }
  }
  return res;
}

// Información completa de un turno, con el precio sacado de los datos (no de la IA).
export function turnoInfo({ cancha, fecha, hora }) {
  const c = getCancha(cancha);
  return {
    cancha: c.id,
    canchaNombre: c.nombre,
    tipo: c.tipo,
    techada: c.techada,
    fecha,
    hora,
    dia: fechaLarga(fecha),
    precio: c.precio,
  };
}

// Valida que un turno exista, sea futuro y esté libre.
export function validarTurno({ cancha, fecha, hora, excluirId = null }) {
  const c = getCancha(cancha);
  if (!c) return { ok: false, error: 'esa cancha no existe' };
  if (!esFechaValida(fecha)) return { ok: false, error: 'la fecha no es válida' };
  const h = normalizarHora(hora);
  if (!h) return { ok: false, error: 'los turnos son de 1 hora, empezando entre las 16:00 y las 23:00' };
  const { fecha: hoy } = ahoraBA();
  if (yaPaso(fecha, h)) return { ok: false, error: `el turno del ${fechaLarga(fecha)} a las ${h} ya pasó` };
  if (fecha > sumarDias(hoy, MAX_DIAS_ANTICIPACION))
    return { ok: false, error: `solo tomamos reservas con hasta ${MAX_DIAS_ANTICIPACION} días de anticipación` };
  if (estaOcupado(c.id, fecha, h, excluirId))
    return { ok: false, error: `la ${c.nombre} ya está ocupada el ${fechaLarga(fecha)} a las ${h}` };
  return { ok: true, turno: { cancha: c.id, fecha, hora: h } };
}

// Turnos libres más parecidos a uno pedido (mismo día y horario cercano primero).
export function alternativas(pedido, cantidad = 4) {
  const { fecha: hoy } = ahoraBA();
  const base = esFechaValida(pedido?.fecha) && pedido.fecha >= hoy ? pedido.fecha : hoy;
  const horaPedida = Number(normalizarHora(pedido?.hora)?.slice(0, 2) ?? 20);
  const cancha = getCancha(pedido?.cancha);
  const mismoTipo = cancha ? complejo.canchas.filter((c) => c.tipo === cancha.tipo).map((c) => c.id) : null;

  const puntaje = (t) =>
    (t.fecha === base ? 0 : 100) +
    Math.abs(Number(t.hora.slice(0, 2)) - horaPedida) * 10 +
    (mismoTipo && !mismoTipo.includes(t.cancha) ? 5 : 0) +
    (cancha && t.cancha !== cancha.id ? 1 : 0);

  return libres({ fechas: [base, sumarDias(base, 1)] })
    .sort((a, b) => puntaje(a) - puntaje(b))
    .slice(0, cantidad);
}

// ---------- Escrituras ----------

function insertar({ cancha, fecha, hora, nombre, telefono, estado = 'pendiente_sena', origen = 'chat', creadaEn }) {
  const c = getCancha(cancha);
  ultimoId += 1;
  const reserva = {
    id: ultimoId,
    codigo: `LR-${String(ultimoId).padStart(4, '0')}`,
    cancha: c.id,
    canchaNombre: c.nombre,
    tipo: c.tipo,
    fecha,
    hora,
    dia: fechaLarga(fecha),
    nombre,
    telefono,
    estado,
    precio: c.precio,
    sena: Math.round((c.precio * complejo.sena.porcentaje) / 100),
    origen,
    creadaEn: creadaEn || new Date().toISOString(),
    actualizadaEn: null,
  };
  reservas.push(reserva);
  return reserva;
}

// Crea una reserva validando datos y disponibilidad.
// Devuelve { ok, reserva, existente } o { ok: false, tipo: 'datos' | 'turno', error }.
export function crearReserva(datos) {
  const nombre = String(datos?.nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const telefono = String(datos?.telefono ?? '').trim().slice(0, 30);

  if (nombre.length < 2) return { ok: false, tipo: 'datos', error: 'falta el nombre de quien reserva' };
  if (soloDigitos(telefono).length < 8)
    return { ok: false, tipo: 'datos', error: 'el teléfono no parece válido (pasalo con código de área, ej: 341 555 1234)' };

  // Idempotencia: si la IA repite una reserva que ya guardamos, devolvemos la misma.
  const c = getCancha(datos?.cancha);
  const h = normalizarHora(datos?.hora);
  if (c && h) {
    const existente = reservas.find(
      (r) =>
        r.estado !== 'cancelada' &&
        r.cancha === c.id &&
        r.fecha === datos.fecha &&
        r.hora === h &&
        soloDigitos(r.telefono) === soloDigitos(telefono)
    );
    if (existente) return { ok: true, reserva: existente, existente: true };
  }

  const v = validarTurno({ cancha: datos?.cancha, fecha: datos?.fecha, hora: datos?.hora });
  if (!v.ok) return { ok: false, tipo: 'turno', error: v.error };

  const reserva = insertar({ ...v.turno, nombre, telefono, origen: datos?.origen || 'chat' });
  return { ok: true, reserva, existente: false };
}

export function cambiarEstado(id, estado) {
  if (!ESTADOS.includes(estado))
    return { ok: false, status: 400, error: `Estado inválido. Usá: ${ESTADOS.join(', ')}` };
  const reserva = reservas.find((r) => r.id === id);
  if (!reserva) return { ok: false, status: 404, error: 'Reserva no encontrada' };
  if (reserva.estado === 'cancelada' && estado !== 'cancelada' && estaOcupado(reserva.cancha, reserva.fecha, reserva.hora, reserva.id))
    return { ok: false, status: 409, error: 'No se puede reactivar: ese turno ya lo tomó otra reserva' };
  reserva.estado = estado;
  reserva.actualizadaEn = new Date().toISOString();
  return { ok: true, reserva };
}

// ---------- Datos de ejemplo (hoy y mañana) ----------

function precargar() {
  const { fecha: hoy } = ahoraBA();
  const manana = sumarDias(hoy, 1);
  const haceUnRato = (horas) => new Date(Date.now() - horas * 3600_000).toISOString();

  const ejemplos = [
    [2, hoy, '18:00', 'Martín Gómez', '341 555-0101', 'confirmada', 'whatsapp'],
    [1, hoy, '20:00', 'Los Pibes de Echesortu', '341 555-0102', 'confirmada', 'telefono'],
    [1, hoy, '21:00', 'Lucas Fernández', '341 555-0103', 'pendiente_sena', 'whatsapp'],
    [3, hoy, '21:00', 'Rosario Tech FC', '341 555-0104', 'confirmada', 'telefono'],
    [2, hoy, '22:00', 'Nico Paredes', '341 555-0105', 'pendiente_sena', 'whatsapp'],
    [1, hoy, '23:00', 'Fede Ríos', '341 555-0106', 'cancelada', 'telefono'],
    [1, manana, '19:00', 'Sofi Herrera', '341 555-0107', 'confirmada', 'whatsapp'],
    [1, manana, '20:00', 'Juan Cruz Medina', '341 555-0108', 'confirmada', 'telefono'],
    [1, manana, '21:00', 'Los de Siempre', '341 555-0109', 'pendiente_sena', 'whatsapp'],
    [2, manana, '20:00', 'Gonza Acosta', '341 555-0110', 'confirmada', 'whatsapp'],
    [3, manana, '20:00', 'Veteranos Fisherton', '341 555-0111', 'confirmada', 'telefono'],
    [3, manana, '22:00', 'Mati Sosa', '341 555-0112', 'pendiente_sena', 'whatsapp'],
    [2, manana, '23:00', 'Tomi Benítez', '341 555-0113', 'confirmada', 'telefono'],
  ];

  ejemplos.forEach(([cancha, fecha, hora, nombre, telefono, estado, origen], i) =>
    insertar({ cancha, fecha, hora, nombre, telefono, estado, origen, creadaEn: haceUnRato(30 - i) })
  );
}

precargar();
