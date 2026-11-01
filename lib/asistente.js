// Orquesta una respuesta del chat: arma el contexto, llama a OpenAI (o al modo demo),
// y post-procesa el JSON validando opciones y reservas contra la disponibilidad real.

import OpenAI from 'openai';
import { complejo, HORAS } from '../data/complejo.js';
import { ahoraBA, proximosDias, TZ } from './fechas.js';
import { libres, ocupados, validarTurno, turnoInfo, crearReserva, alternativas } from './reservas.js';
import { respuestaDemo } from './demo.js';

const MODELO = 'gpt-4o-mini';
const INTENCIONES = ['consulta', 'proponer', 'confirmar'];
const MAX_MENSAJES = 20;

let cliente = null;
function getCliente() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!cliente) cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cliente;
}

export function modoActual() {
  return process.env.OPENAI_API_KEY ? 'ia' : 'demo';
}

function errorHttp(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  e.publicMessage = mensaje;
  return e;
}

// ---------- Contexto ----------

export function construirContexto() {
  const ahora = ahoraBA();
  const dias = proximosDias(7);
  const fechas = dias.map((d) => d.fecha);
  return {
    ahora,
    hoy: ahora.fecha,
    dias,
    ocupados: ocupados(fechas),
    libres: libres({ fechas }),
  };
}

function disponibilidadTexto(ctx) {
  const lineasOcupados = [];
  const lineasLibres = [];
  for (const d of ctx.dias) {
    const ocu = [];
    const lib = [];
    for (const c of complejo.canchas) {
      const o = ctx.ocupados.filter((r) => r.fecha === d.fecha && r.cancha === c.id).map((r) => r.hora);
      const l = ctx.libres.filter((t) => t.fecha === d.fecha && t.cancha === c.id).map((t) => t.hora);
      ocu.push(`${c.nombre}: ${o.length ? o.join(', ') : 'nada'}`);
      lib.push(`${c.nombre}: ${l.length ? l.join(', ') : 'sin turnos libres'}`);
    }
    lineasOcupados.push(`- ${d.fecha} (${d.etiqueta}) → ${ocu.join(' | ')}`);
    lineasLibres.push(`- ${d.fecha} (${d.etiqueta}) → ${lib.join(' | ')}`);
  }
  return { ocupadosTxt: lineasOcupados.join('\n'), libresTxt: lineasLibres.join('\n') };
}

function promptSistema(ctx) {
  const { ocupadosTxt, libresTxt } = disponibilidadTexto(ctx);
  const calendario = ctx.dias
    .map((d) => `- ${d.fecha} = ${d.etiqueta}${d.relativo ? ` (${d.relativo})` : ''}`)
    .join('\n');
  const precios = complejo.canchas
    .map((c) => `- ${c.nombre}: ${c.tipo} ${c.techada ? 'techada' : 'descubierta'} → $${c.precio.toLocaleString('es-AR')} por hora (seña $${Math.round((c.precio * complejo.sena.porcentaje) / 100).toLocaleString('es-AR')})`)
    .join('\n');

  return `Sos el asistente virtual de reservas del ${complejo.nombre} (${complejo.direccion}). Atendés por chat a personas que quieren alquilar una cancha de fútbol. Hablás en español rioplatense (voseo), con onda, cálido, breve y claro, como un buen encargado de complejo. Podés usar algún emoji (⚽ 🙌 ✅) con moderación.

FECHA Y HORA ACTUAL: ${ctx.ahora.texto} (zona horaria ${TZ}).

CALENDARIO (usá SIEMPRE estas equivalencias; no calcules días de la semana por tu cuenta):
${calendario}

INFORMACIÓN DEL COMPLEJO (única fuente válida, no inventes nada fuera de esto):
${JSON.stringify(complejo)}

PRECIOS POR TURNO DE 1 HORA:
${precios}

TURNOS: duran 1 hora. La "hora" es la de inicio: ${HORAS[0]} (de 16 a 17) hasta ${HORAS.at(-1)} (de 23 a 24). No existen turnos a otras horas ni de media hora.

TURNOS OCUPADOS (próximos 7 días):
${ocupadosTxt}

TURNOS LIBRES (los ÚNICOS que podés ofrecer; ya excluyen los horarios que pasaron):
${libresTxt}

CÓMO INTERPRETAR PEDIDOS:
- "somos 10", "somos 8", "para 5 vs 5" → fútbol 5 (Cancha 1 o Cancha 2).
- "somos 14", "somos 12", "7 vs 7" → fútbol 7 (Cancha 3).
- "techada", "bajo techo", "por si llueve" → Cancha 1.
- "después de las 20", "desde las 20" → turnos que empiezan a las 20:00 o más tarde.
- "a la noche" → desde 20:00. "a la tarde" → de 16:00 a 19:00. "tarde-noche" → desde 18:00.
- Horas chicas sin aclarar ("a las 9", "a las 10") se refieren a la noche (21:00, 22:00).
- "el jueves" → el próximo jueves del CALENDARIO (si hoy es jueves y quedan turnos, puede ser hoy).
- "hoy" y "mañana" → según el CALENDARIO.

REGLAS:
1. Dudas frecuentes (precios, seña, techada, vestuarios, estacionamiento, pecheras, dirección, lluvia, cancelación): respondé SOLO con la información del complejo, con intencion "consulta". Si no sabés algo, decí que lo consulten al ${complejo.telefono}. No inventes precios, promociones ni servicios.
2. Cuando la persona quiere jugar/reservar o pregunta disponibilidad, usá intencion "proponer" y poné en "opciones" entre 1 y 6 turnos que estén en TURNOS LIBRES y cumplan lo pedido (cantidad de jugadores, cancha, día, horario). Priorizá los más cercanos a lo pedido.
3. Si no hay nada que cumpla exactamente, decilo y ofrecé lo más cercano (otro horario, otra cancha del mismo tipo u otro día). Si falta un dato (por ej. el día), igual proponé opciones cercanas y preguntá.
4. NUNCA ofrezcas un turno que figure en OCUPADOS ni uno que no esté en LIBRES.
5. Las opciones se muestran como tarjetas clickeables: en "mensaje" no las enumeres una por una, resumí (ej: "Para el jueves desde las 20 tengo estos turnos, tocá el que te sirva 👇").
6. Cuando la persona elige un turno concreto (cancha + fecha + hora), confirmá que está libre y pedile nombre y teléfono si todavía no los dio. Mientras juntás los datos usá intencion "consulta", "opciones" vacío y "reserva" null.
7. Solo cuando tengas TODO: un turno elegido explícitamente por la persona que esté en LIBRES + nombre + teléfono, completá "reserva" y usá intencion "confirmar". Que la persona pase sus datos después de elegir el turno cuenta como confirmación. En "mensaje" confirmá cancha, día y hora y recordá la seña: ${complejo.sena.porcentaje}% por transferencia al alias ${complejo.sena.alias} dentro de las ${complejo.sena.plazoHoras} horas.
8. Nunca completes "reserva" con datos inventados, incompletos o de ejemplo. Si en la conversación ya figura "[Reserva registrada ...]" para ese turno, no la repitas: dejá "reserva" en null salvo que pida OTRA reserva nueva.
9. Mensajes cortos: 1 a 3 oraciones.

FORMATO DE RESPUESTA: respondé SIEMPRE y SOLO con un objeto JSON válido, sin texto extra, con esta forma exacta:
{
  "mensaje": "texto para el cliente",
  "intencion": "consulta" | "proponer" | "confirmar",
  "opciones": [ { "cancha": 1, "fecha": "YYYY-MM-DD", "hora": "HH:00", "precio": 36000 } ],
  "reserva": null
}
Cuando confirmás, "reserva" es: { "cancha": 1, "fecha": "YYYY-MM-DD", "hora": "HH:00", "nombre": "Nombre Apellido", "telefono": "341 555 1234" }
- "cancha" es el número (1, 2 o 3). "opciones" es [] si no proponés turnos. "reserva" es null salvo al confirmar.`;
}

// ---------- Llamada a OpenAI ----------

async function llamarOpenAI(historial, ctx) {
  const openai = getCliente();
  try {
    const completion = await openai.chat.completions.create({
      model: MODELO,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: promptSistema(ctx) }, ...historial],
    });
    const contenido = completion.choices?.[0]?.message?.content || '{}';
    return JSON.parse(contenido);
  } catch (e) {
    console.error('[OpenAI]', e?.status || '', e?.message || e);
    if (e instanceof SyntaxError) throw errorHttp(502, 'El asistente respondió algo raro. Probá de nuevo.');
    if (e?.status === 401) throw errorHttp(502, 'La API key de OpenAI no es válida. Revisá el .env.');
    if (e?.status === 429) throw errorHttp(503, 'El asistente está saturado o sin crédito. Probá en unos segundos.');
    throw errorHttp(502, 'El asistente no pudo responder. Probá de nuevo.');
  }
}

// ---------- Post-proceso ----------

function limpiarHistorial(historial) {
  if (!Array.isArray(historial)) return [];
  return historial
    .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1500) }))
    .slice(-MAX_MENSAJES);
}

function normalizarOpciones(opciones) {
  if (!Array.isArray(opciones)) return [];
  const vistas = new Set();
  const res = [];
  for (const op of opciones) {
    const v = validarTurno(op || {});
    if (!v.ok) continue;
    const clave = `${v.turno.cancha}|${v.turno.fecha}|${v.turno.hora}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    res.push(turnoInfo(v.turno));
  }
  return res.slice(0, 6);
}

const tieneDatosCompletos = (r) =>
  r && typeof r === 'object' && ['cancha', 'fecha', 'hora', 'nombre', 'telefono'].every((k) => String(r[k] ?? '').trim());

function postProcesar(crudo, modo) {
  const raw = crudo && typeof crudo === 'object' ? crudo : {};
  let mensaje = typeof raw.mensaje === 'string' && raw.mensaje.trim() ? raw.mensaje.trim() : 'Perdón, no te entendí bien. ¿Me lo repetís?';
  let intencion = INTENCIONES.includes(raw.intencion) ? raw.intencion : 'consulta';
  let opciones = normalizarOpciones(raw.opciones);
  const opcionesDescartadas = Array.isArray(raw.opciones) && raw.opciones.length > opciones.length;
  let reserva = null;

  if (tieneDatosCompletos(raw.reserva)) {
    const r = crearReserva({ ...raw.reserva, origen: 'chat' });
    if (r.ok) {
      reserva = r.reserva;
      intencion = 'confirmar';
      opciones = [];
      if (!r.existente) console.log(`[Reserva] ${reserva.codigo} ${reserva.canchaNombre} ${reserva.fecha} ${reserva.hora} - ${reserva.nombre}`);
    } else if (r.tipo === 'datos') {
      mensaje = `Para confirmar me falta algo: ${r.error}. ¿Me lo pasás?`;
      intencion = 'consulta';
      opciones = [];
    } else {
      opciones = alternativas(raw.reserva).map(turnoInfo);
      mensaje = `Uy, no pude registrar la reserva: ${r.error}. ${opciones.length ? 'Te dejo los turnos libres más cercanos 👇' : '¿Probamos con otro día?'}`;
      intencion = opciones.length ? 'proponer' : 'consulta';
    }
  }

  // La IA propuso turnos que ya no están libres: reemplazamos por alternativas reales.
  if (!reserva && intencion === 'proponer' && opciones.length === 0 && opcionesDescartadas) {
    opciones = alternativas(raw.opciones[0]).map(turnoInfo);
    mensaje = opciones.length
      ? 'Los turnos que tenía en mente se ocuparon, pero estos están libres 👇'
      : 'Uy, no me quedan turnos libres cerca de ese horario. ¿Probamos otro día?';
  }

  if (intencion === 'confirmar' && !reserva) intencion = 'consulta';
  if (intencion === 'proponer' && opciones.length === 0) intencion = 'consulta';

  return { mensaje, intencion, opciones, reserva, modo };
}

// ---------- Entrada principal ----------

export async function procesarChat(historialCrudo) {
  const historial = limpiarHistorial(historialCrudo);
  if (!historial.length || historial.at(-1).role !== 'user') throw errorHttp(400, 'Falta el mensaje del cliente.');
  const ctx = construirContexto();
  const modo = modoActual();
  const crudo = modo === 'ia' ? await llamarOpenAI(historial, ctx) : respuestaDemo(historial, ctx);
  return postProcesar(crudo, modo);
}
