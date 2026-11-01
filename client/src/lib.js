// Llamadas al backend (rutas relativas) y utilidades compartidas.

async function pedir(url, opciones = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
  } catch {
    throw new Error('No hay conexión con el servidor. ¿Está corriendo el backend?');
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

export const api = {
  complejo: () => pedir('/api/complejo'),
  chat: (historial) => pedir('/api/chat', { method: 'POST', body: JSON.stringify({ historial }) }),
  reservas: () => pedir('/api/reservas'),
  cambiarEstado: (id, estado) => pedir(`/api/reservas/${id}`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
};

// ---------- Fechas (siempre hora de Argentina) ----------

const TZ = 'America/Argentina/Buenos_Aires';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function ahoraBA() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
}

export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fechaLarga(fecha) {
  const [, mm, dd] = fecha.split('-');
  return `${DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]} ${dd}/${mm}`;
}

export const horaFin = (hora) => `${String(Number(hora.slice(0, 2)) + 1).padStart(2, '0')}:00`;

export const horaActualTexto = () =>
  new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

// ---------- Formatos ----------

export const precio = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

export const ESTADOS = {
  pendiente_sena: {
    label: 'Pendiente de seña',
    badge: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
    celda: 'bg-amber-400/15 border-amber-400/40 text-amber-100',
    punto: 'bg-amber-400',
  },
  confirmada: {
    label: 'Confirmada',
    badge: 'bg-lime-400/15 text-lime-300 ring-lime-400/30',
    celda: 'bg-lime-400/15 border-lime-400/40 text-lime-50',
    punto: 'bg-lime-400',
  },
  cancelada: {
    label: 'Cancelada',
    badge: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30',
    celda: '',
    punto: 'bg-zinc-500',
  },
};

export const ORIGENES = { chat: '🤖 Chat IA', whatsapp: '💬 WhatsApp', telefono: '📞 Teléfono' };

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
