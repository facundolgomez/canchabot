// Orquesta una respuesta del chat: arma el contexto, llama a OpenAI (o al modo demo),
// y post-procesa el JSON validando opciones y reservas contra la disponibilidad real.

import OpenAI from 'openai';
import { complejo, HORAS } from '../data/complejo.js';
import { ahoraBA, proximosDias, TZ, esFechaValida } from './fechas.js';
import { libres, ocupados, validarTurno, turnoInfo, crearReserva, alternativas, getCancha } from './reservas.js';
import { respuestaDemo } from './demo.js';

const MODELO = 'gpt-4o-mini';
const INTENCIONES = ['consulta', 'proponer', 'confirmar'];
const MAX_MENSAJES = 20;

let cliente = null;
export function getCliente() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!cliente) cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cliente;
}

export function modoActual() {
  return process.env.OPENAI_API_KEY ? 'ia' : 'demo';
}

export function errorHttp(status, mensaje) {
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
VOSEO SIEMPRE: decí "tenés", "querés", "podés", "pasame", "acordate", "transferí", "tocá". NUNCA uses tuteo ("tienes", "quieres", "recuerda", "debes", "dame") ni "usted". Montos en formato argentino: $36.000 (punto para los miles).

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
- "después de las 20", "desde las 20" → turnos que empiezan a las 20:00 o más tarde, EMPEZANDO por el más temprano libre (20:00, después 21:00, etc.). No saltees horarios libres que cumplan.
- "a la noche" → desde 20:00. "a la tarde" → de 16:00 a 19:00. "tarde-noche" → desde 18:00.
- Horas chicas sin aclarar ("a las 9", "a las 10") se refieren a la noche (21:00, 22:00).
- "el jueves" → el próximo jueves del CALENDARIO (si hoy es jueves y quedan turnos, puede ser hoy).
- "hoy" y "mañana" → según el CALENDARIO.

REGLA DE ORO — PRIMERO RESPONDÉ LO QUE TE PREGUNTARON:
- Antes de hacer cualquier otra cosa, mirá si el ÚLTIMO mensaje de la persona tiene una pregunta concreta (accesibilidad, silla de ruedas, baño, cantina, comida, lluvia, cancelación, precios, seña, vestuarios, estacionamiento, pecheras, dirección, horarios, etc.).
- Si la tiene, "mensaje" EMPIEZA respondiendo esa pregunta, de forma directa y completa, con la información del complejo. Nunca la ignores ni la dejes para después, aunque la conversación venga de reservar turnos.
- Si el mensaje tiene una pregunta Y además pide turnos (ej: "¿tienen baño adaptado? somos 10 el jueves"), primero respondé la pregunta y DESPUÉS proponé turnos (intencion "proponer").
- Si el mensaje es SOLO una pregunta (no pide turnos ni disponibilidad), respondela con intencion "consulta", "opciones" vacío, y como mucho cerrá ofreciendo ayuda ("¿Querés que te muestre turnos libres?"). NO tires turnos que nadie pidió.
- Si la respuesta NO está en la INFORMACIÓN DEL COMPLEJO, no inventes ni supongas: decí claramente que ese dato no lo tenés y que lo consultás con el encargado ("Eso no lo tengo confirmado, lo consulto con el encargado y te aviso 🙌"). Podés agregar que también pueden escribir al ${complejo.telefono}.

REGLAS:
1. Dudas frecuentes: respondé SOLO con la información del complejo (accesibilidad, cantina, políticas de lluvia y cancelación, servicios, precios, seña), con intencion "consulta". No inventes precios, promociones, servicios ni características del lugar.
2. Cuando la persona quiere jugar/reservar o pregunta disponibilidad, usá intencion "proponer" y poné en "opciones" entre 3 y 6 turnos (o todos los que haya, si son menos) que estén en TURNOS LIBRES y cumplan lo pedido (cantidad de jugadores, cancha, día, horario). Priorizá los más cercanos a lo pedido e incluí TODAS las canchas que encajen (ej: para fútbol 5, mezclá Cancha 1 y Cancha 2 en el mismo horario) para que la persona pueda elegir por precio o techada.
3. Si no hay nada que cumpla exactamente, decilo y ofrecé lo más cercano (otro horario, otra cancha del mismo tipo u otro día). Si falta un dato (por ej. el día), igual proponé opciones cercanas y preguntá.
4. NUNCA ofrezcas un turno que figure en OCUPADOS ni uno que no esté en LIBRES.
5. Las opciones se muestran como tarjetas clickeables: en "mensaje" NO menciones horarios ni canchas puntuales de las opciones, resumí (ej: "Para el jueves desde las 20 tengo estos turnos, tocá el que te sirva 👇").
6. Cuando la persona elige un turno concreto (cancha + fecha + hora), confirmá que está libre y pedile nombre y teléfono si todavía no los dio. Mientras juntás los datos usá intencion "consulta", "opciones" vacío y "reserva" null.
7. Solo cuando tengas TODO: un turno elegido explícitamente por la persona que esté en LIBRES + nombre + teléfono, completá "reserva" y usá intencion "confirmar". Que la persona pase sus datos después de elegir el turno cuenta como confirmación. En "mensaje" confirmá cancha, día y hora y recordá la seña: ${complejo.sena.porcentaje}% por transferencia al alias ${complejo.sena.alias} dentro de las ${complejo.sena.plazoHoras} horas.
8. Nunca completes "reserva" con datos inventados, incompletos o de ejemplo. Si en la conversación ya figura "[Reserva registrada ...]" para ese turno, no la repitas: dejá "reserva" en null salvo que pida OTRA reserva nueva.
9. Mensajes cortos: 1 a 3 oraciones, siempre con voseo. Si respondés una pregunta y además proponés turnos, podés usar hasta 4 oraciones (la respuesta va primero).

EJEMPLOS:
- "¿El lugar es accesible para silla de ruedas?" → mensaje: "¡Sí! Hay rampa de acceso sin escalones desde la vereda y el estacionamiento, baño adaptado junto a los vestuarios y las tres canchas están a nivel del piso. ¿Querés que te muestre turnos libres?" · intencion "consulta" · opciones [].
- "Mi viejo va en silla de ruedas, ¿puede entrar? Somos 10 el jueves a la noche" → mensaje: "¡Sí, puede entrar sin problema! Hay rampa, baño adaptado y las canchas están a nivel. Para el jueves a la noche tengo estos turnos de fútbol 5, tocá el que te sirva 👇" · intencion "proponer" · opciones con los turnos.
- "¿Se puede llevar el perro?" (no está en la info) → mensaje: "Eso no lo tengo confirmado, lo consulto con el encargado y te aviso 🙌. Si querés, mientras tanto te muestro turnos libres." · intencion "consulta" · opciones [].

FORMATO DE RESPUESTA: respondé SIEMPRE y SOLO con un objeto JSON válido, sin texto extra, con esta forma exacta:
{
  "mensaje": "texto para el cliente",
  "intencion": "consulta" | "proponer" | "confirmar",
  "opciones": [ { "cancha": 1, "fecha": "YYYY-MM-DD", "hora": "HH:00", "precio": 36000 } ],
  "reserva": null,
  "busqueda": null
}
Cuando confirmás, "reserva" es: { "cancha": 1, "fecha": "YYYY-MM-DD", "hora": "HH:00", "nombre": "Nombre Apellido", "telefono": "341 555 1234" }
Cuando proponés, "busqueda" es el criterio que entendiste del pedido: { "fecha": "YYYY-MM-DD", "canchas": [1, 2], "desde": "20:00", "hasta": "24:00" } ("canchas" = las que encajan con lo pedido; [] si cualquiera sirve. "hasta" es la hora de fin, 24:00 si no hay límite). El sistema la usa para completar los turnos libres que encajen.
- "cancha" es el número (1, 2 o 3). "opciones" es [] si no proponés turnos. "reserva" es null salvo al confirmar. "busqueda" es null salvo al proponer.`;
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
    throw traducirErrorOpenAI(e);
  }
}

// Convierte errores de OpenAI en mensajes claros para la UI.
export function traducirErrorOpenAI(e) {
  console.error('[OpenAI]', e?.status || '', e?.message || e);
  if (e instanceof SyntaxError) return errorHttp(502, 'La IA respondió algo raro. Probá de nuevo.');
  if (e?.status === 401) return errorHttp(502, 'La API key de OpenAI no es válida. Revisá el .env.');
  if (e?.status === 429) return errorHttp(503, 'La IA está saturada o sin crédito. Probá en unos segundos.');
  return errorHttp(502, 'La IA no pudo responder. Probá de nuevo.');
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
  let mensaje = typeof raw.mensaje === 'string' && raw.mensaje.trim() ? arreglarMontos(raw.mensaje.trim()) : 'Perdón, no te entendí bien. ¿Me lo repetís?';
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

  if (!reserva && intencion === 'proponer') {
    ({ opciones, mensaje } = completarVentana(opciones, mensaje, raw.busqueda));
  }

  if (intencion === 'confirmar' && !reserva) intencion = 'consulta';
  if (intencion === 'proponer' && opciones.length === 0) intencion = 'consulta';

  return { mensaje, intencion, opciones, reserva, modo };
}

const horaDe = (valor, porDefecto) => {
  const m = String(valor ?? '').match(/(\d{1,2})/);
  return Math.min(Math.max(m ? Number(m[1]) : porDefecto, 16), 24);
};

// La IA interpreta el pedido (día, canchas, franja), pero a veces se saltea turnos libres.
// Acá el backend busca TODOS los libres que cumplen ese criterio, en orden cronológico (máx. 6).
// Criterio: el campo "busqueda" de la IA; si no vino, la ventana que cubren sus opciones.
function completarVentana(opciones, mensaje, busqueda) {
  let fecha, canchas, desde, hasta;
  if (busqueda && typeof busqueda === 'object' && esFechaValida(busqueda.fecha)) {
    fecha = busqueda.fecha;
    canchas = (Array.isArray(busqueda.canchas) ? busqueda.canchas : []).map((c) => getCancha(c)?.id).filter(Boolean);
    desde = horaDe(busqueda.desde, 16);
    hasta = horaDe(busqueda.hasta, 24);
    if (hasta <= desde) hasta = 24;
  } else {
    const fechas = new Set(opciones.map((o) => o.fecha));
    if (fechas.size !== 1) return { opciones, mensaje };
    [fecha] = fechas;
    canchas = [...new Set(opciones.map((o) => o.cancha))];
    const horas = opciones.map((o) => Number(o.hora.slice(0, 2)));
    desde = Math.min(...horas);
    hasta = Math.max(...horas) + 1;
  }

  const completas = libres({ fechas: [fecha], canchas, horaDesde: desde, horaHasta: hasta }).slice(0, 6).map(turnoInfo);
  // Si con ese criterio no queda nada, respetamos lo que propuso la IA (por ej. alternativas de otro día)
  if (!completas.length) return { opciones, mensaje };

  const clave = (o) => `${o.cancha}|${o.hora}`;
  const cambiaron = completas.length !== opciones.length || completas.some((o) => !opciones.some((p) => clave(p) === clave(o)));

  // Si las tarjetas cambiaron y el texto nombraba horarios, el texto ya no coincide: lo resumimos.
  // Conservamos las oraciones que no nombran horarios (por ej. la respuesta a una pregunta).
  const nombraHorario = (s) => /\b\d{1,2}(:\d{2}|\s?hs)\b/i.test(s);
  if (cambiaron && nombraHorario(mensaje)) {
    const oraciones = mensaje.split(/(?<=[.!?…👇])\s+/);
    const resto = oraciones.filter((o) => !nombraHorario(o) && !/👇|tocá el que/i.test(o)).join(' ').trim();
    const resumen = `Para el ${completas[0].dia} desde las ${String(desde).padStart(2, '0')}:00 tengo estos turnos libres. Tocá el que te sirva 👇`;
    mensaje = resto ? `${resto} ${resumen}` : resumen;
  }
  return { opciones: completas, mensaje };
}

// Corrige montos con formato inglés que a veces devuelve la IA: $19,800 → $19.800
export function arreglarMontos(texto) {
  return String(texto).replace(/\$\s?(\d{1,3}(?:,\d{3})+)(?![\d,])/g, (_, n) => '$' + n.replace(/,/g, '.'));
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
