// Preguntas que el asistente no pudo responder y derivó al encargado (en memoria).

const consultas = [];
let ultimoId = 0;

const normalizar = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

export function listarConsultas() {
  // Pendientes primero, después las más nuevas
  return consultas
    .slice()
    .sort((a, b) => (a.estado === b.estado ? b.creadaEn.localeCompare(a.creadaEn) : a.estado === 'pendiente' ? -1 : 1));
}

// Crea una consulta; si la misma pregunta ya está pendiente, devuelve esa (evita duplicados por reintentos).
export function crearConsulta({ pregunta, nombre, telefono, contexto }) {
  const p = normalizar(pregunta).slice(0, 300);
  if (p.length < 3) return null;
  const existente = consultas.find((c) => c.estado === 'pendiente' && c.pregunta.toLowerCase() === p.toLowerCase());
  if (existente) {
    // Si ahora sabemos quién preguntó, lo completamos
    existente.nombre ||= normalizar(nombre).slice(0, 60) || null;
    existente.telefono ||= normalizar(telefono).slice(0, 30) || null;
    return existente;
  }
  ultimoId += 1;
  const consulta = {
    id: ultimoId,
    pregunta: p,
    nombre: normalizar(nombre).slice(0, 60) || null,
    telefono: normalizar(telefono).slice(0, 30) || null,
    contexto: normalizar(contexto).slice(0, 300) || null,
    estado: 'pendiente',
    creadaEn: new Date().toISOString(),
    respondidaEn: null,
  };
  consultas.push(consulta);
  console.log(`[Consulta] #${consulta.id} ${consulta.pregunta}`);
  return consulta;
}

export function marcarConsulta(id, estado) {
  if (!['pendiente', 'respondida'].includes(estado))
    return { ok: false, status: 400, error: 'Estado inválido. Usá: pendiente, respondida' };
  const c = consultas.find((x) => x.id === id);
  if (!c) return { ok: false, status: 404, error: 'Consulta no encontrada' };
  c.estado = estado;
  c.respondidaEn = estado === 'respondida' ? new Date().toISOString() : null;
  return { ok: true, consulta: c };
}

// Ejemplo precargado para que el panel no arranque vacío en la demo
crearConsulta({
  pregunta: '¿Hacen descuento para cumpleaños infantiles los sábados a la tarde?',
  nombre: 'Laura',
  telefono: '341 555-0177',
  contexto: 'Preguntado por el chat web',
});
