// Orquesta una respuesta del chat: arma el contexto, llama a OpenAI (o al modo demo),
// y post-procesa el JSON validando opciones y reservas contra la disponibilidad real.

import OpenAI from 'openai';
import { complejo, HORAS } from '../data/complejo.js';
import { ahoraBA, proximosDias, TZ, esFechaValida } from './fechas.js';
import {
  libres,
  ocupados,
  validarTurno,
  turnoInfo,
  crearReserva,
  alternativas,
  getCancha,
  normalizarHora,
  mismoTelefono,
  reservasPorTelefono,
  cancelarPorCliente,
  cambiarTurnoPorCliente,
} from './reservas.js';
import { crearConsulta } from './consultas.js';
import { respuestaDemo, parsearSeleccion, indicePedidoCambio, parsearDatos } from './demo.js';
import { normalizarTexto, resolverRespuestaCorta, sinAcentos, opcionesMostradas } from './comprension.js';
import { fechaLarga } from './fechas.js';

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

// Teléfonos que el cliente escribió en la conversación (para identificar sus reservas)
export function telefonosDelChat(historial) {
  const tels = [];
  for (const m of historial) {
    if (m.role !== 'user') continue;
    for (const t of m.content.match(/\+?\d[\d\s-]{6,}\d/g) || []) {
      if (t.replace(/\D/g, '').length >= 8 && !tels.some((x) => mismoTelefono(x, t))) tels.push(t.trim());
    }
  }
  return tels;
}

export function construirContexto(historial = []) {
  const ahora = ahoraBA();
  const dias = proximosDias(7);
  const fechas = dias.map((d) => d.fecha);
  const telefonos = telefonosDelChat(historial);
  const reservasCliente = [];
  for (const t of telefonos) {
    for (const r of reservasPorTelefono(t)) if (!reservasCliente.some((x) => x.id === r.id)) reservasCliente.push(r);
  }
  return {
    ahora,
    hoy: ahora.fecha,
    dias,
    ocupados: ocupados(fechas),
    libres: libres({ fechas }),
    telefonos,
    reservasCliente,
  };
}

function reservasClienteTexto(ctx) {
  if (!ctx.telefonos.length) return 'La persona todavía no escribió ningún teléfono en este chat.';
  if (!ctx.reservasCliente.length) return `No hay reservas activas a futuro con ${ctx.telefonos.join(' / ')}.`;
  return ctx.reservasCliente
    .map((r) => `- ${r.codigo}: ${r.canchaNombre} (${r.tipo}) el ${r.dia} a las ${r.hora}, a nombre de ${r.nombre}, tel. ${r.telefono}, estado ${r.estado === 'confirmada' ? 'seña pagada' : 'seña pendiente'}`)
    .join('\n');
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
    .map((d, i) => {
      const extra = [d.relativo, i === 2 ? 'pasado mañana' : null, /^(sábado|domingo)/.test(d.etiqueta) ? 'fin de semana' : null].filter(Boolean);
      return `- ${d.fecha} = ${d.etiqueta}${extra.length ? ` (${extra.join(', ')})` : ''}`;
    })
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
- CANTIDAD DE JUGADORES → TIPO DE CANCHA: 10 o menos ("somos 8", "somos diez", "5 vs 5", "la de 5", "fulbo de 5") → fútbol 5 (Cancha 1 o Cancha 2). De 11 a 14 ("somos 12", "somos catorce", "7 vs 7", "la de 7") → fútbol 7 (Cancha 3). Más de 14 → no entran en una sola cancha: decilo y ofrecé fútbol 7 o dos canchas.
- Si pide turnos y NO dice cuántos son ni qué cancha/tipo quiere, preguntá solo eso ("¿Para cuántos son?"), con intencion "consulta" y opciones []. Si ya dijo el tipo ("la de 5", "la techada", "cancha 3"), no hace falta.
- "la techada", "bajo techo", "por si llueve" → Cancha 1.
- "después de las 20", "desde las 20" → turnos que empiezan a las 20:00 o más tarde, EMPEZANDO por el más temprano libre (20:00, después 21:00, etc.). No saltees horarios libres que cumplan.
- Horarios: el complejo abre de 16 a 24, así que las horas chicas son de la noche: "a las 9" = 21:00, "a las 10" = 22:00, "tipo 8" = 20:00, "a las 7" = 19:00. "Tipo 9" = alrededor de las 21 (ofrecé las 21 y lo más cercano).
- "a la tarde" → 16:00 a 19:00. "a la tardecita" → 18:00 a 19:00. "a la nochecita" → 20:00 a 21:00. "a la noche" → desde 20:00. "después de laburar" / "cuando salgo del trabajo" → desde 19:00.
- Días: "hoy", "mañana", "pasado (mañana)" y los días de la semana según el CALENDARIO. "el jueves" → el próximo jueves del CALENDARIO (si hoy es jueves y quedan turnos, puede ser hoy). "el finde" / "el fin de semana" → el próximo sábado y domingo del CALENDARIO que tengan turnos libres (si hoy es sábado o domingo, cuenta hoy): proponé turnos de esos días y dejá "busqueda" en null.

CÓMO HABLA LA GENTE (Rosario / Argentina) — entendelo sin pedir aclaraciones:
- Jerga: "fulbo", "picado", "picadito", "partido", "partidito" = jugar al fútbol. "la de 5 / la de 7" = cancha de fútbol 5 / 7. "chabón" = persona. "re" / "una banda" = mucho. "posta" = en serio. "al toque" = enseguida. "tipo 9" = alrededor de las 21. "qué onda" = hola / cómo es. "¿hay lugar?", "¿tenés algo?" = ¿hay turnos libres? "¿cuánto sale / cuánto está?" = ¿qué precio tiene?
- Abreviaturas y errores de tipeo: q/k = que, xq = porque, x = por, tmb = también, mñn/mñana = mañana, toy = estoy, porfa = por favor, pa = para, finde = fin de semana. Números en letras: "somos diez" = 10.
- A veces el sistema agrega al mensaje del cliente una línea "[Texto normalizado: ...]" con el mismo pedido ya traducido (abreviaturas resueltas, horas pasadas a formato 24 hs). Usala para entender, pero no la menciones.
- Tono: cercano y rosarino, con voseo ("¿Qué onda? Sí, tengo lugar", "de una", "joya", "dale"). Sin exagerar: nada de chistes forzados ni jerga en cada oración, y siempre claro con los datos.

RESPUESTAS CORTAS Y CONTEXTO DE LA CHARLA:
- Confirmaciones informales = SÍ: "dale", "ok", "oka", "listo", "joya", "de una", "va", "vamos", "sí sí", "perfecto", "bárbaro", "buenísimo", "esa", "ese mismo", "👍". Negativas = NO: "nah", "no no", "otra", "mejor otro", "ni ahí".
- Si en tu mensaje anterior mostraste opciones ([Opciones mostradas: ...]) y la persona responde corto ("dale", "la primera", "la segunda", "la de las 21", "la techada"), está ELIGIENDO una de esas opciones: tomala y seguí (pedí nombre y teléfono si faltan). No vuelvas a preguntar día, horario ni cantidad.
- Si dice que no ("nah", "otra más tarde"), no repitas las mismas opciones: proponé otras según lo que pidió (más tarde, más temprano, otro día).
- Si la persona ya escribió su nombre y teléfono en esta conversación, NO se los pidas de nuevo: usalos.
- Lo que ya dijo sigue valiendo para los pedidos siguientes: si dijo "somos 8" y después pregunta "¿y el jueves tipo 8?", siguen siendo 8 (fútbol 5: solo Cancha 1 y 2, nunca la 3).
- Si lo que pidió está ocupado y le ofrecés otro horario, decilo claro nombrando lo que pidió. Si sí hay lugar en lo que pidió, no digas que está ocupado ni que "no tenés nada".
- Si algo es ambiguo, repreguntá UNA sola cosa concreta (la que más falte), nunca varias juntas. Ej: "¿Para cuántos son?" o "¿La 1 techada o la 2?", no "¿Para cuántos son, qué día y a qué hora?".

REGLA DE ORO — PRIMERO RESPONDÉ LO QUE TE PREGUNTARON:
- Antes de hacer cualquier otra cosa, mirá si el ÚLTIMO mensaje de la persona tiene una pregunta concreta (accesibilidad, silla de ruedas, baño, cantina, comida, lluvia, cancelación, precios, seña, vestuarios, estacionamiento, pecheras, dirección, horarios, etc.).
- Si la tiene, "mensaje" EMPIEZA respondiendo esa pregunta, de forma directa y completa, con la información del complejo. Nunca la ignores ni la dejes para después, aunque la conversación venga de reservar turnos.
- Si el mensaje tiene una pregunta Y además pide turnos (ej: "¿tienen baño adaptado? somos 10 el jueves"), primero respondé la pregunta y DESPUÉS proponé turnos (intencion "proponer").
- Si el mensaje es SOLO una pregunta (no pide turnos ni disponibilidad), respondela con intencion "consulta", "opciones" vacío, y como mucho cerrá ofreciendo ayuda ("¿Querés que te muestre turnos libres?"). NO tires turnos que nadie pidió.
- Si la respuesta NO está en la INFORMACIÓN DEL COMPLEJO, no inventes ni supongas: decí claramente que ese dato no lo tenés y que lo consultás con el encargado ("Eso no lo tengo confirmado, lo consulto con el encargado y te aviso 🙌"). Podés agregar que también pueden escribir al ${complejo.telefono}. Cada vez que digas que lo consultás con el encargado, completá "consulta_encargado" con la pregunta (así le llega al encargado).

REGLAS:
1. Dudas frecuentes: respondé SOLO con la información del complejo (accesibilidad, cantina, políticas de lluvia y cancelación, servicios, precios, seña), con intencion "consulta". No inventes precios, promociones, servicios ni características del lugar.
2. Cuando la persona quiere jugar/reservar o pregunta disponibilidad, usá intencion "proponer" y poné en "opciones" entre 3 y 6 turnos (o todos los que haya, si son menos) que estén en TURNOS LIBRES y cumplan lo pedido (cantidad de jugadores, cancha, día, horario). Priorizá los más cercanos a lo pedido e incluí TODAS las canchas que encajen (ej: para fútbol 5, mezclá Cancha 1 y Cancha 2 en el mismo horario) para que la persona pueda elegir por precio o techada.
3. Si el horario o la cancha que pide está OCUPADO (mirá TURNOS OCUPADOS), decilo claramente ("Las 20 en la Cancha 1 ya está ocupada 😕") y ofrecé lo más cercano: el mismo horario en otra cancha del mismo tipo, una hora antes o después, o el mismo horario otro día. Usá intencion "proponer" con esas alternativas en "opciones", y en "busqueda" poné la franja cercana (ej: desde 19:00 hasta 23:00 ese día). Si falta un dato (por ej. el día), igual proponé opciones cercanas y preguntá.
4. NUNCA ofrezcas un turno que figure en OCUPADOS ni uno que no esté en LIBRES.
5. Las opciones se muestran como tarjetas clickeables: en "mensaje" NO menciones horarios ni canchas puntuales de las opciones, resumí (ej: "Para el jueves desde las 20 tengo estos turnos, tocá el que te sirva 👇").
6. Cuando la persona elige un turno concreto (cancha + fecha + hora) para una reserva NUEVA, confirmá que está libre y pedile nombre y teléfono si todavía no los dio. Mientras juntás los datos usá intencion "consulta", "opciones" vacío y "reserva" null.
7. Solo cuando tengas TODO: un turno elegido explícitamente por la persona que esté en LIBRES + nombre + teléfono, completá "reserva" y usá intencion "confirmar". Que la persona pase sus datos después de elegir el turno cuenta como confirmación. En "mensaje" confirmá cancha, día y hora y recordá la seña: ${complejo.sena.porcentaje}% por transferencia al alias ${complejo.sena.alias} dentro de las ${complejo.sena.plazoHoras} horas.
8. Nunca completes "reserva" con datos inventados, incompletos o de ejemplo. Si en la conversación ya figura "[Reserva registrada ...]" para ese turno, no la repitas: dejá "reserva" en null salvo que pida OTRA reserva nueva.
9. Mensajes cortos: 1 a 3 oraciones, siempre con voseo. Si respondés una pregunta y además proponés turnos, podés usar hasta 4 oraciones (la respuesta va primero).

CANCELAR O CAMBIAR UNA RESERVA EXISTENTE:
- La persona se identifica con el TELÉFONO con el que reservó. Si quiere cancelar o cambiar y todavía no lo escribió, pedíselo ("¿Me pasás el teléfono con el que reservaste?"). No pidas el código, pero si lo da, usalo.
- RESERVAS DEL CLIENTE (las únicas que puede cancelar o cambiar; buscadas por los teléfonos que escribió en este chat):
${reservasClienteTexto(ctx)}
- Si con ese teléfono no hay reservas, decilo y pedile que revise el número. Nunca canceles ni cambies una reserva que no esté en esa lista.
- Si tiene varias reservas, preguntá cuál (mostrá día, hora y cancha de cada una).
- CANCELAR: decile cuál es la reserva (cancha, día, hora, código) y pedí confirmación explícita ("¿Confirmás que la cancelo?"). Recién cuando responda que sí, completá "gestion" con tipo "cancelar". Contale la política: con 24 hs o más de anticipación se devuelve la seña; con menos, la seña queda como crédito por 7 días.
- CAMBIAR: preguntá a qué día u horario la quiere pasar y proponé turnos libres (intencion "proponer", con "busqueda"). Cuando elige uno (por ejemplo con "Elijo la Cancha 2 ... a las 21:00"), ese es el NUEVO horario: completá "gestion" con tipo "cambiar" y "nueva". En un cambio NUNCA uses "reserva" (eso crearía una reserva nueva en vez de mover la existente). No hace falta pedir nombre ni teléfono de nuevo.
- Cuando completás "gestion", usá intencion "confirmar" y en "mensaje" contá lo que hiciste.

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
  "busqueda": null,
  "gestion": null,
  "consulta_encargado": null
}
Cuando cancelás una reserva existente, "gestion" es: { "tipo": "cancelar", "codigo": "LR-0003" }
Cuando cambiás una reserva existente, "gestion" es: { "tipo": "cambiar", "codigo": "LR-0003", "nueva": { "cancha": 2, "fecha": "YYYY-MM-DD", "hora": "HH:00" } }
Cuando derivás una pregunta al encargado, "consulta_encargado" es: { "pregunta": "texto de la pregunta", "nombre": "si lo sabés, si no null", "telefono": "si lo sabés, si no null" }
Cuando confirmás, "reserva" es: { "cancha": 1, "fecha": "YYYY-MM-DD", "hora": "HH:00", "nombre": "Nombre Apellido", "telefono": "341 555 1234" }
Cuando proponés, "busqueda" es el criterio que entendiste del pedido: { "fecha": "YYYY-MM-DD", "canchas": [1, 2], "desde": "20:00", "hasta": "24:00" } ("canchas" = las que encajan con lo pedido; [] si cualquiera sirve. "hasta" es la hora de fin, 24:00 si no hay límite). El sistema la usa para completar los turnos libres que encajen.
- "cancha" es el número (1, 2 o 3). "opciones" es [] si no proponés turnos. "reserva" es null salvo al confirmar una reserva NUEVA. "busqueda" es null salvo al proponer. "gestion" es null salvo al cancelar o cambiar una reserva existente ya confirmada por la persona. "consulta_encargado" es null salvo que derives una pregunta.`;
}

// ---------- Llamada a OpenAI ----------

async function llamarOpenAI(historial, ctx) {
  const openai = getCliente();
  try {
    const completion = await openai.chat.completions.create({
      model: MODELO,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: promptSistema(ctx) }, ...historial.map(conTextoNormalizado)],
    });
    const contenido = completion.choices?.[0]?.message?.content || '{}';
    return JSON.parse(contenido);
  } catch (e) {
    throw traducirErrorOpenAI(e);
  }
}

// Le agrega a la IA el mensaje del cliente ya "traducido" (abreviaturas, jerga, horas a 24 hs)
function conTextoNormalizado(m) {
  if (m.role !== 'user' || m.original) return { role: m.role, content: m.content };
  const norm = normalizarTexto(m.content);
  const base = sinAcentos(m.content).replace(/\s+/g, ' ').trim();
  return { role: 'user', content: norm !== base ? `${m.content}\n[Texto normalizado: ${norm}]` : m.content };
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

// Cancelar o cambiar una reserva existente. La IA solo indica qué hacer;
// el backend verifica que la reserva sea de un teléfono que el cliente escribió en el chat.
function procesarGestion(g, ctx) {
  if (!g || typeof g !== 'object' || !g.codigo || !['cancelar', 'cambiar'].includes(g.tipo)) return null;

  if (g.tipo === 'cancelar') {
    const r = cancelarPorCliente(g.codigo, ctx.telefonos);
    if (!r.ok) return { error: `No pude cancelar la reserva: ${r.error}. ¿Me pasás el teléfono con el que reservaste?` };
    if (!r.existente) console.log(`[Cancelada por chat] ${r.reserva.codigo}`);
    return { gestion: { tipo: 'cancelar', reserva: r.reserva, conDevolucion: r.reserva.senaComoCredito !== true } };
  }

  if (!g.nueva || typeof g.nueva !== 'object') return null;
  const r = cambiarTurnoPorCliente(g.codigo, ctx.telefonos, g.nueva);
  if (r.ok) {
    if (r.anterior) console.log(`[Cambiada por chat] ${r.reserva.codigo} → ${r.reserva.canchaNombre} ${r.reserva.fecha} ${r.reserva.hora}`);
    return { gestion: { tipo: 'cambiar', reserva: r.reserva, anterior: r.anterior || r.reserva.anterior || null } };
  }
  if (r.tipo === 'turno') {
    const opciones = alternativas(g.nueva).map(turnoInfo);
    return {
      error: `Uy, no pude mover la reserva: ${r.error}. ${opciones.length ? 'Estos horarios cercanos están libres 👇' : '¿Probamos con otro día?'}`,
      opciones,
    };
  }
  return { error: `No pude modificar la reserva: ${r.error}.` };
}

// Texto de confirmación de cancelaciones y cambios: lo arma el backend con datos reales
// (si la seña estaba pagada, si avisó con 24 hs), porque involucra plata y no puede fallar.
function mensajeGestion(g) {
  const r = g.reserva;
  const pesos = (n) => `$${n.toLocaleString('es-AR')}`;
  if (g.tipo === 'cancelar') {
    const sena =
      r.estadoPrevio === 'pendiente_sena'
        ? 'Como la seña todavía no estaba pagada, no hay nada que devolver.'
        : r.senaComoCredito
          ? `Como faltan menos de 24 hs, la seña de ${pesos(r.sena)} queda como crédito para otro turno dentro de los 7 días.`
          : `Como avisaste con más de 24 hs, te devolvemos la seña de ${pesos(r.sena)} completa.`;
    return `Listo, cancelé tu reserva ${r.codigo}: ${r.canchaNombre} el ${r.dia} a las ${r.hora} ✅. ${sena} ¿Querés que te busque otro horario?`;
  }
  const a = g.anterior;
  const desde = a ? ` (antes: ${a.canchaNombre} el ${a.dia} a las ${a.hora})` : '';
  const sena =
    r.estado === 'confirmada'
      ? 'La seña que ya pagaste queda para el nuevo horario, no tenés que transferir nada.'
      : `Acordate de transferir la seña de ${pesos(r.sena)} al alias ${complejo.sena.alias} dentro de las ${complejo.sena.plazoHoras} horas.`;
  return `¡Listo! Pasé tu reserva ${r.codigo} a la ${r.canchaNombre} (${r.tipo}) el ${r.dia} a las ${r.hora}${desde} ✅. ${sena}`;
}

const DERIVA_ENCARGADO = /consult\w* con el encargado|le paso (la|tu) (consulta|pregunta)|lo consulto/i;

function postProcesar(crudo, modo, ctx, historial) {
  const raw = crudo && typeof crudo === 'object' ? crudo : {};
  let mensaje = typeof raw.mensaje === 'string' && raw.mensaje.trim() ? arreglarVoseo(arreglarMontos(raw.mensaje.trim())) : 'Perdón, no te entendí bien. ¿Me lo repetís?';
  let intencion = INTENCIONES.includes(raw.intencion) ? raw.intencion : 'consulta';
  let opciones = normalizarOpciones(raw.opciones);
  const opcionesDescartadas = Array.isArray(raw.opciones) && raw.opciones.length > opciones.length;
  let reserva = null;
  let gestion = null;
  let consulta = null;

  // 1) Cancelar / cambiar (tiene prioridad: un cambio nunca debe crear una reserva nueva)
  const g = procesarGestion(raw.gestion, ctx);
  if (g?.gestion) {
    gestion = g.gestion;
    mensaje = mensajeGestion(gestion);
    intencion = 'confirmar';
    opciones = [];
  } else if (g?.error) {
    mensaje = g.error;
    opciones = g.opciones || [];
    intencion = opciones.length ? 'proponer' : 'consulta';
  }

  // 2) Consulta para el encargado (también si la IA lo dijo en el texto pero se olvidó el campo)
  const ce = raw.consulta_encargado;
  const pregunta = typeof ce === 'string' ? ce : ce?.pregunta;
  if (pregunta || DERIVA_ENCARGADO.test(mensaje)) {
    const ultimoUsuario = [...historial].reverse().find((m) => m.role === 'user')?.content;
    const c = crearConsulta({
      pregunta: pregunta || ultimoUsuario,
      nombre: ce?.nombre,
      telefono: ce?.telefono || ctx.telefonos[0],
      contexto: 'Preguntado por el chat web',
    });
    if (c) consulta = { id: c.id, pregunta: c.pregunta };
  }

  // La IA quiso reservar un turno que la persona nunca eligió: no se reserva, se le pregunta cuál
  if (!gestion && !g?.error && tieneDatosCompletos(raw.reserva) && !elegidoPorCliente(raw.reserva, historial, ctx)) {
    const mostradas = ultimasOpciones(historial);
    raw.reserva = null;
    opciones = mostradas;
    mensaje = mostradas.length
      ? '¡Gracias, ya tengo tus datos! 🙌 Ahora decime cuál de estos turnos te reservo 👇'
      : '¡Gracias, ya tengo tus datos! 🙌 ¿Qué día y a qué hora te reservo?';
    intencion = mostradas.length ? 'proponer' : 'consulta';
  }

  if (!gestion && !g?.error && tieneDatosCompletos(raw.reserva)) {
    const r = crearReserva({ ...raw.reserva, origen: 'chat' });
    if (r.ok) {
      reserva = r.reserva;
      // Texto armado por el backend: montos y alias exactos, siempre con voseo
      mensaje = mensajeReserva(reserva);
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

  // Nunca decirle al cliente que un turno libre está ocupado (la IA a veces lee mal la grilla)
  // La cantidad de jugadores que ya dijo sigue valiendo ("somos 8" → solo canchas de fútbol 5)
  const porJugadores = !gestion && !g?.error ? canchasPorJugadores(historial) : null;
  if (porJugadores && intencion === 'proponer') {
    const antes = opciones;
    opciones = opciones.filter((o) => porJugadores.includes(o.cancha));
    if (raw.busqueda && typeof raw.busqueda === 'object') raw.busqueda.canchas = porJugadores;
    else if (!opciones.length && antes.length) {
      // Todas eran de la otra cancha: buscamos el mismo día y franja en las que corresponden
      raw.busqueda = { fecha: antes[0].fecha, canchas: porJugadores, desde: antes[0].hora, hasta: '24:00' };
    }
  }

  // "a las 10" / "tipo 9": la búsqueda arranca en esa hora (la IA a veces arranca desde las 16)
  const pedidoNorm = normalizarTexto(historial.at(-1).original ?? historial.at(-1).content);
  const hp = pedidoNorm.match(/\b(?:a las|tipo|tipo las|tipo a las|para las|despues de las|desde las|a partir de las)\s+(\d{1,2})\b/);
  if (hp && raw.busqueda && typeof raw.busqueda === 'object' && esFechaValida(raw.busqueda.fecha)) {
    const h = Number(hp[1]);
    if (h >= 16 && h <= 23) {
      raw.busqueda.desde = `${h}:00`;
      if (horaDe(raw.busqueda.hasta, 24) <= h) raw.busqueda.hasta = '24:00';
    }
  }

  const fechaRef = esFechaValida(raw.busqueda?.fecha) ? raw.busqueda.fecha : opciones[0]?.fecha;
  if (fechaRef) {
    const canchasPedido = Array.isArray(raw.busqueda?.canchas) && raw.busqueda.canchas.length
      ? raw.busqueda.canchas.map(Number).filter((c) => getCancha(c))
      : complejo.canchas.map((c) => c.id);
    const corregido = quitarOcupadosFalsos(mensaje, fechaRef, canchasPedido);
    if (corregido !== mensaje) {
      // El resto del mensaje probablemente se apoyaba en ese error ("te ofrezco otra cancha..."): lo reemplazamos.
      mensaje = opciones.length ? '¡Buenas noticias! Ese horario está libre 🙌. Tocá el turno para confirmarlo 👇' : corregido;
      if (opciones.length) intencion = 'proponer';
    }
  }

  if (!reserva && !gestion && !g?.error && intencion === 'proponer') {
    const hayBusqueda = raw.busqueda && typeof raw.busqueda === 'object';
    // Sin "busqueda" y con alternativas ya armadas (ej. modo demo ante un ocupado), no las tocamos
    if (hayBusqueda || !/ocupad/i.test(mensaje)) {
      ({ opciones, mensaje } = completarVentana(opciones, mensaje, raw.busqueda));
    }
  }

  // Las alternativas también respetan la cantidad de jugadores (10 → nunca la cancha de fútbol 7)
  if (porJugadores && opciones.some((o) => porJugadores.includes(o.cancha))) {
    opciones = opciones.filter((o) => porJugadores.includes(o.cancha));
  }

  // Hay lugar justo a la hora que pidió: se borra cualquier "no tengo nada / está ocupado"
  if (hp && opciones.some((o) => Number(o.hora.slice(0, 2)) === Number(hp[1]))) {
    const sinFalsos = mensaje
      .split(/(?<=[.!?…👇])\s+/)
      .filter((o) => !/(no (me )?(queda|tengo|hay) nada|ocupad)/i.test(o))
      .join(' ')
      .trim();
    if (sinFalsos) mensaje = sinFalsos;
  }

  // Pide turnos pero nunca dijo para cuántos son ni qué cancha: preguntamos solo eso
  if (intencion === 'proponer' && !reserva && !gestion && !g?.error && opciones.length && !sabeTipoDeCancha(historial)) {
    const resto = limpiarTexto(mensaje, opciones)
      .split(/(?<=[.!?…👇])\s+/)
      .filter((o) => !/(turnos? libres|tengo estos|tengo lugar|hay lugar|ocupad)/i.test(o))
      .join(' ')
      .trim();
    mensaje = `${resto ? resto + ' ' : ''}¡Sí, hay lugar! 🙌 ¿Para cuántos son? Así te muestro la cancha que va (fútbol 5 o fútbol 7).`;
    opciones = [];
    intencion = 'consulta';
  }

  if (intencion === 'confirmar' && !reserva && !gestion) intencion = 'consulta';
  if (intencion === 'proponer' && opciones.length === 0) intencion = 'consulta';

  return { mensaje, intencion, opciones, reserva, gestion, consulta, modo };
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

  // Pidió algo puntual que está ocupado (la IA lo avisa con "ocupado"): alternativas del backend,
  // que incluyen el mismo horario en otra cancha del mismo tipo y horarios vecinos.
  const idsPedidas = canchas?.length ? canchas : complejo.canchas.map((c) => c.id);
  const pedidoOcupado = idsPedidas.every((c) => !validarTurno({ cancha: c, fecha, hora: `${desde}:00` }).ok);
  if (/ocupad/i.test(mensaje) && pedidoOcupado) {
    const alt = alternativas({ fecha, hora: `${desde}:00`, cancha: canchas?.[0] }, 6).map(turnoInfo);
    if (alt.length) {
      // Las ofertas propias de la IA ("tengo la Cancha 2 a esa hora, ¿te sirve?") se reemplazan por las tarjetas
      const OFERTA = /(tengo|te puedo ofrecer|ofrecerte|te sirve|qu[eé] dec[ií]s|otros? horarios?|otra cancha|esa hora|cancha \d)/i;
      const resto = limpiarTexto(mensaje, opciones, alt)
        .split(/(?<=[.!?…👇])\s+/)
        .filter((o) => /ocupad/i.test(o) || !OFERTA.test(o))
        .join(' ')
        .trim();
      return { opciones: alt, mensaje: `${resto} Te dejo lo más cercano que tengo libre 👇`.trim() };
    }
  }

  if (!completas.length) {
    // Lo pedido está ocupado: el backend busca lo más cercano (mismo horario en otra cancha
    // del mismo tipo, una hora antes/después, o al día siguiente). La IA suele quedarse corta.
    const alt = alternativas({ fecha, hora: `${desde}:00`, cancha: canchas?.[0] }, 6).map(turnoInfo);
    if (!alt.length) return { opciones, mensaje };
    const resto = limpiarTexto(mensaje, opciones, alt);
    const aviso = /ocupad|no (me )?qued|no hay|no tengo/i.test(resto) ? '' : 'Ese horario ya está ocupado 😕. ';
    return { opciones: alt, mensaje: `${resto} ${aviso}Te dejo lo más cercano que tengo libre 👇`.trim() };
  }

  const clave = (o) => `${o.cancha}|${o.hora}`;
  const cambiaron = completas.length !== opciones.length || completas.some((o) => !opciones.some((p) => clave(p) === clave(o)));
  if (!cambiaron) return { opciones: completas, mensaje };

  // Las tarjetas cambiaron: sacamos del texto las oraciones que enumeraban horarios de tarjetas
  // (ya no coinciden) y agregamos un resumen. El resto (respuestas, avisos) se conserva.
  const resto = limpiarTexto(mensaje, opciones, completas);
  if (resto === mensaje) return { opciones: completas, mensaje };
  const resumen = `Para el ${completas[0].dia} desde las ${completas[0].hora} tengo estos turnos libres. Tocá el que te sirva 👇`;
  return { opciones: completas, mensaje: resto ? `${resto} ${resumen}` : resumen };
}

// Si una oración dice que "la Cancha N a las HH está ocupada" pero ese turno está libre, se borra.
// Si no nombra cancha ("las 22 ya está ocupada"), se compara con las canchas que encajan con el pedido.
function quitarOcupadosFalsos(mensaje, fecha, canchasPedido) {
  const libre = (c, h) => validarTurno({ cancha: c, fecha, hora: `${h}:00` }).ok;
  return mensaje
    .split(/(?<=[.!?…👇])\s+/)
    .filter((o) => {
      if (!/ocupad/i.test(o)) return true;
      const canchasMencionadas = [...o.matchAll(/cancha\s*(\d)/gi)].map((m) => Number(m[1]));
      const horas = horasNombradas(o).map((h) => (h < 12 ? h + 12 : h));
      if (!horas.length) return true;
      // Nombra canchas: se borra solo si TODOS los turnos que nombra están en realidad libres
      if (canchasMencionadas.length) return !canchasMencionadas.every((c) => horas.every((h) => libre(c, h)));
      // No nombra cancha: es falsa si alguna cancha de las pedidas está libre a esa hora
      return !horas.every((h) => canchasPedido.some((c) => libre(c, h)));
    })
    .join(' ')
    .trim();
}

// Horas que nombra una oración: "21:00", "a las 21", "21 hs"
function horasNombradas(s) {
  const horas = [];
  for (const m of s.matchAll(/\b(\d{1,2}):00\b|\blas (\d{1,2})\b|\b(\d{1,2})\s?hs\b/gi)) horas.push(Number(m[1] ?? m[2] ?? m[3]));
  return horas;
}

// Quita del mensaje solo las oraciones que hablan de los horarios de las tarjetas (viejas o nuevas)
// y las muletillas de cierre. Oraciones como "Las 20 en la Cancha 1 ya está ocupada" o
// "Encontré tu reserva... a las 20:00" se conservan porque esa hora no es de ninguna tarjeta.
function limpiarTexto(mensaje, ...listas) {
  const horasTarjetas = new Set(listas.flat().map((o) => Number(o.hora.slice(0, 2))));
  return mensaje
    .split(/(?<=[.!?…👇])\s+/)
    .filter((o) => {
      if (/👇|tocá el que|te sirve (ese|alguno|alguna)|cuál preferís/i.test(o)) return false;
      if (/ocupad/i.test(o)) return true;
      return !horasNombradas(o).some((h) => horasTarjetas.has(h));
    })
    .join(' ')
    .trim();
}

// La IA a veces se escapa al tuteo ("Recuerda que tienes..."): lo pasamos a voseo
const VOSEO = [
  ['recuerda', 'recordá'], ['recuerde', 'recordá'], ['tienes', 'tenés'], ['puedes', 'podés'], ['quieres', 'querés'],
  ['debes', 'tenés que'], ['necesitas', 'necesitás'], ['prefieres', 'preferís'], ['sabes', 'sabés'], ['eres', 'sos'],
  ['dime', 'decime'], ['pásame', 'pasame'], ['envíame', 'mandame'], ['avísame', 'avisame'], ['confírmame', 'confirmame'],
];
export function arreglarVoseo(texto) {
  let t = String(texto);
  for (const [tu, vos] of VOSEO) {
    t = t.replace(new RegExp(`(?<![\\p{L}])${tu}(?![\\p{L}])`, 'giu'), (m) => (m[0] === m[0].toUpperCase() ? vos[0].toUpperCase() + vos.slice(1) : vos));
  }
  return t;
}

// Confirmación de una reserva nueva: la arma el backend (montos y alias exactos)
function mensajeReserva(res) {
  return `¡Listo, ${res.nombre.split(' ')[0]}! Te reservé la ${res.canchaNombre} (${res.tipo}) el ${res.dia} a las ${res.hora} ✅, a nombre de ${res.nombre} (${res.telefono}). Para confirmarla transferí la seña de $${res.sena.toLocaleString('es-AR')} al alias ${complejo.sena.alias} dentro de las ${complejo.sena.plazoHoras} horas.`;
}

// ¿La persona eligió ese turno? (tocó la tarjeta / respondió "dale", o nombró esa hora)
function elegidoPorCliente(r, historial, ctx) {
  const hora = normalizarHora(r.hora);
  const usuarios = historial.filter((m) => m.role === 'user').slice(-6);
  return usuarios.some((m) => {
    const sel = parsearSeleccion(m.content, ctx);
    if (sel) return sel.cancha === Number(r.cancha) && sel.fecha === r.fecha && sel.hora === hora;
    const t = normalizarTexto(m.original ?? m.content);
    const h = Number(String(hora).slice(0, 2));
    if (!new RegExp(`\\b(las|tipo)\\s+${h}\\b|\\b${h}(:00|\\s*hs)\\b`).test(t)) return false;
    // Nombró la hora: alcanza si también nombró la cancha, o si a esa hora no había otra opción
    const c = getCancha(r.cancha);
    if (new RegExp(`cancha\\s*${c.id}\\b`).test(t) || (c.techada && /techad/.test(t))) return true;
    const aEsaHora = ultimasOpciones(historial).filter((o) => o.fecha === r.fecha && o.hora === hora);
    return aEsaHora.length === 1 && aEsaHora[0].cancha === c.id;
  });
}

// Tipo de cancha según la última cantidad de jugadores que dijo ("somos 8" → fútbol 5)
function canchasPorJugadores(historial) {
  const usuarios = historial.filter((m) => m.role === 'user').map((m) => normalizarTexto(m.original ?? m.content));
  // Si en el último mensaje pide un tipo o cancha puntual, manda eso
  if (/(futbol [57]|cancha \d|techad)/.test(usuarios.at(-1) ?? '')) return null;
  for (let i = usuarios.length - 1; i >= 0; i--) {
    const m = usuarios[i].match(/somos (\d+)|(\d+) (jugadores|personas|pibes|chicos|chicas|amigos|amigas)/);
    if (!m) continue;
    const n = Number(m[1] ?? m[2]);
    const tipo = n <= 10 ? '5' : n <= 14 ? '7' : null;
    return tipo ? complejo.canchas.filter((c) => c.tipo.includes(tipo)).map((c) => c.id) : null;
  }
  return null;
}

// Las opciones de la última tarjeta mostrada que siguen libres
function ultimasOpciones(historial) {
  const m = [...historial].reverse().find((x) => x.role === 'assistant' && opcionesMostradas(x.content).length);
  return m ? normalizarOpciones(opcionesMostradas(m.content)) : [];
}

// ¿En la charla ya dijo para cuántos son o qué cancha/tipo quiere?
function sabeTipoDeCancha(historial) {
  if (indicePedidoCambio(historial) >= 0) return true;
  const texto = historial.filter((m) => m.role === 'user').map((m) => normalizarTexto(m.original ? m.content : m.content)).join(' | ');
  return /(somos \d+|\d+ (jugadores|personas|pibes|chicos|chicas|amigos|amigas)|futbol [57]|techad|bajo techo|descubierta|cancha \d|\d+ (vs|contra) \d+|para \d+\b)/.test(texto);
}

// Corrige montos con formato inglés que a veces devuelve la IA: $19,800 → $19.800
export function arreglarMontos(texto) {
  return String(texto).replace(/\$\s?(\d{1,3}(?:,\d{3})+)(?![\d,])/g, (_, n) => '$' + n.replace(/,/g, '.'));
}

// ---------- Entrada principal ----------

// ---------- Respuestas cortas ("dale", "la primera", "nah, otra más tarde") ----------

const textoEleccion = (op) => {
  const c = getCancha(op.cancha);
  return `Elijo la ${c.nombre} (${c.tipo}) el ${fechaLarga(op.fecha)} a las ${op.hora}`;
};

// Reescribe cada respuesta corta que elige una opción mostrada como una elección explícita
// ("dale" → "Elijo la Cancha 2 (Fútbol 5) el lunes 02/11 a las 21:00"). Se hace con todo el
// historial en cada turno, así el resto del flujo (IA, demo, validaciones) ve siempre lo mismo.
function expandirRespuestasCortas(historial) {
  return historial.map((m, i) => {
    if (m.role !== 'user' || i === 0 || historial[i - 1].role !== 'assistant') return m;
    const pedido = historial.slice(0, i - 1).reverse().find((x) => x.role === 'user')?.content;
    const r = resolverRespuestaCorta(m.content, historial[i - 1].content, complejo.canchas, pedido);
    if (r?.tipo !== 'eleccion') return m;
    return { role: 'user', content: `${textoEleccion(r.opcion)} (respondió: "${m.content}")`, original: m.content };
  });
}

const descOpcion = (o) => {
  const c = getCancha(o.cancha);
  return `la ${c.nombre}${c.techada ? ' techada' : ''} a las ${o.hora} ($${c.precio.toLocaleString('es-AR')})`;
};

// Respuestas determinísticas para la última respuesta corta, cuando no alcanza para elegir
function responderCorta(r, ctx, modo) {
  const base = { reserva: null, gestion: null, consulta: null, modo };
  if (r.tipo === 'ambigua') {
    const cand = r.candidatos.slice(0, 6);
    const lista = cand.map(descOpcion);
    const pregunta =
      lista.length === 2 ? `¿Cuál te reservo: ${lista[0]} o ${lista[1]}?` : `¿Cuál te reservo? Tocá la que prefieras 👇`;
    return { ...base, mensaje: `¡Joya! ${pregunta}`, intencion: 'proponer', opciones: cand.map(turnoInfo) };
  }
  // Rechazo
  const vistas = new Set(r.opciones.map((o) => `${o.cancha}|${o.fecha}|${o.hora}`));
  const fecha = r.opciones[0].fecha;
  const canchas = [...new Set(r.opciones.map((o) => o.cancha))];
  const tipos = new Set(canchas.map((id) => getCancha(id).tipo));
  const mismoTipo = complejo.canchas.filter((c) => tipos.has(c.tipo)).map((c) => c.id);
  const horas = r.opciones.filter((o) => o.fecha === fecha).map((o) => Number(o.hora.slice(0, 2)));
  if (!r.direccion) {
    return { ...base, mensaje: 'Dale, sin drama 👌 ¿Qué te queda mejor: otro horario ese mismo día u otro día?', intencion: 'consulta', opciones: [] };
  }
  const ventana = r.direccion === 'tarde' ? { horaDesde: Math.max(...horas) + 1 } : { horaHasta: Math.min(...horas) };
  const nuevas = libres({ fechas: [fecha], canchas: mismoTipo, ...ventana })
    .filter((o) => !vistas.has(`${o.cancha}|${o.fecha}|${o.hora}`))
    .slice(0, 6)
    .map(turnoInfo);
  if (nuevas.length) {
    const cuando = r.direccion === 'tarde' ? 'más tarde' : 'más temprano';
    return { ...base, mensaje: `De una, ${cuando} el ${fechaLarga(fecha)} tengo estos 👇`, intencion: 'proponer', opciones: nuevas };
  }
  // Ese día no hay más: ofrecemos la misma franja al día siguiente
  const cuando = r.direccion === 'tarde' ? 'Más tarde' : 'Más temprano';
  const siguiente = ctx.dias[ctx.dias.findIndex((d) => d.fecha === fecha) + 1]?.fecha;
  const otroDia = siguiente
    ? libres({ fechas: [siguiente], canchas: mismoTipo, horaDesde: Math.min(...horas) }).slice(0, 6).map(turnoInfo)
    : [];
  if (otroDia.length) {
    return {
      ...base,
      mensaje: `${cuando} el ${fechaLarga(fecha)} no me queda nada 😕 (el último turno es a las ${HORAS.at(-1)}). El ${fechaLarga(siguiente)} tengo estos 👇`,
      intencion: 'proponer',
      opciones: otroDia,
    };
  }
  return { ...base, mensaje: `${cuando} el ${fechaLarga(fecha)} no me queda nada 😕. ¿Te sirve otro día?`, intencion: 'consulta', opciones: [] };
}

// "cancha 1 manana a las 20" (texto ya normalizado) → { cancha, fecha, hora } o null
function turnoPuntual(t, ctx) {
  const mc = t.match(/\bcancha\s*(\d)\b/);
  const mh = t.match(/\b(?:a las|para las|tipo|tipo a las)\s+(\d{1,2})\b/);
  if (!mc || !mh || !getCancha(mc[1])) return null;
  let fecha = null;
  const dd = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (/\bhoy\b/.test(t)) fecha = ctx.hoy;
  else if (/pasado manana/.test(t)) fecha = ctx.dias[2]?.fecha;
  else if (/\bmanana\b/.test(t)) fecha = ctx.dias[1]?.fecha;
  else if (dd) fecha = ctx.dias.find((d) => d.fecha.slice(5) === `${dd[2].padStart(2, '0')}-${dd[1].padStart(2, '0')}`)?.fecha;
  else {
    const dia = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'].find((d) => new RegExp(`\\b${d}\\b`).test(t));
    if (dia) fecha = ctx.dias.find((d) => sinAcentos(d.etiqueta).startsWith(dia) && d.fecha !== ctx.hoy)?.fecha;
  }
  const hora = normalizarHora(mh[1]);
  return fecha && hora ? { cancha: Number(mc[1]), fecha, hora } : null;
}

function confirmarReserva(sel, datos, modo) {
  const r = crearReserva({ ...sel, nombre: datos.nombre, telefono: datos.telefono, origen: 'chat' });
  if (!r.ok) return null;
  if (!r.existente) console.log(`[Reserva] ${r.reserva.codigo} ${r.reserva.canchaNombre} ${r.reserva.fecha} ${r.reserva.hora} - ${r.reserva.nombre}`);
  return { mensaje: mensajeReserva(r.reserva), intencion: 'confirmar', opciones: [], reserva: r.reserva, gestion: null, consulta: null, modo };
}

// Nombre y teléfono que la persona ya dio en la charla (para no pedírselos de nuevo)
function datosDelCliente(historial) {
  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i];
    if (m.role !== 'user') continue;
    const texto = m.original ?? m.content;
    const pidioDatos = i > 0 && /nombre/i.test(historial[i - 1].content);
    const explicito = /(me llamo|\bsoy\b|a nombre de|mi nombre)/i.test(texto);
    // Un mensaje que es solo "Nombre Apellido 341 555 1234" también vale
    const soloDatos = !/[?¿]/.test(texto) && texto.replace(/[\d\s+()-]{8,}/g, ' ').trim().split(/\s+/).length <= 4;
    if (!pidioDatos && !explicito && !soloDatos) continue;
    const d = parsearDatos(texto, false);
    if (d.nombre && d.telefono) return d;
  }
  return null;
}

export async function procesarChat(historialCrudo) {
  const limpio = limpiarHistorial(historialCrudo);
  if (!limpio.length || limpio.at(-1).role !== 'user') throw errorHttp(400, 'Falta el mensaje del cliente.');
  const historial = expandirRespuestasCortas(limpio);
  const ctx = construirContexto(historial);
  const modo = modoActual();

  // Respuesta corta que no alcanza para elegir ("dale" con varias opciones) o que rechaza las opciones
  const ultimo = historial.at(-1);
  if (!ultimo.original && historial.length > 1) {
    const pedido = historial.slice(0, -2).reverse().find((x) => x.role === 'user')?.content;
    const r = resolverRespuestaCorta(ultimo.content, historial.at(-2).content, complejo.canchas, pedido);
    if (r && r.tipo !== 'eleccion') return responderCorta(r, ctx, modo);
  }

  // Atajo determinístico: eligió una tarjeta ("Elijo la Cancha 1 ... a las 20:00") pero ese turno
  // se ocupó mientras tanto → ofrecemos alternativas sin depender de la IA.
  const sel = parsearSeleccion(historial.at(-1).content, ctx);
  if (sel) {
    const v = validarTurno(sel);

    // Hay un cambio de reserva en curso y eligió un turno libre: lo aplicamos directo.
    // El backend ya tiene todo (teléfono → reserva, turno libre); no depende de que la IA lea bien.
    const iCambio = v.ok ? indicePedidoCambio(historial) : -1;
    if (iCambio >= 0 && ctx.reservasCliente.length) {
      const textoCliente = historial.slice(iCambio).filter((m) => m.role === 'user').map((m) => m.content).join(' ');
      const mc = textoCliente.match(/LR-?\s?(\d{1,4})/i);
      const reserva = mc ? ctx.reservasCliente.find((x) => x.id === Number(mc[1])) : ctx.reservasCliente.length === 1 ? ctx.reservasCliente[0] : null;
      if (reserva) {
        const g = procesarGestion({ tipo: 'cambiar', codigo: reserva.codigo, nueva: sel }, ctx);
        if (g?.gestion) {
          return { mensaje: mensajeGestion(g.gestion), intencion: 'confirmar', opciones: [], reserva: null, gestion: g.gestion, consulta: null, modo };
        }
      }
    }

    // Reserva nueva y ya nos dio nombre y teléfono antes en la charla: no se los pedimos de nuevo
    const datos = v.ok && iCambio < 0 ? datosDelCliente(historial.slice(0, -1)) : null;
    if (datos) {
      const hecha = confirmarReserva(sel, datos, modo);
      if (hecha) return hecha;
    }

    // Reserva nueva, turno libre y todavía sin datos: se los pedimos (texto fijo, sin "ya reservamos")
    if (v.ok && iCambio < 0) {
      const c = getCancha(sel.cancha);
      return {
        mensaje: `¡Joya! La ${c.nombre} (${c.tipo}) el ${fechaLarga(sel.fecha)} a las ${sel.hora} está libre 🙌. Pasame tu nombre y un teléfono y te la reservo (ej: Juan Pérez, 341 555 1234).`,
        intencion: 'consulta',
        opciones: [],
        reserva: null,
        gestion: null,
        consulta: null,
        modo,
      };
    }

    if (!v.ok) {
      const opciones = alternativas(sel, 6).map(turnoInfo);
      return {
        mensaje: `Uy, ${v.error} 😕. ${opciones.length ? 'Te dejo lo más cercano que tengo libre 👇' : '¿Probamos con otro día?'}`,
        intencion: opciones.length ? 'proponer' : 'consulta',
        opciones,
        reserva: null,
        gestion: null,
        consulta: null,
        modo,
      };
    }
  }

  // Pidió una cancha, día y hora puntuales ("¿tenés la cancha 1 mañana a las 20?") y está ocupado:
  // alternativas del backend, sin depender de que la IA lea bien la grilla.
  const puntual = !ultimo.original ? turnoPuntual(normalizarTexto(ultimo.content), ctx) : null;
  if (puntual) {
    const v = validarTurno(puntual);
    if (!v.ok) {
      const opciones = alternativas(puntual, 6).map(turnoInfo);
      return {
        mensaje: `Uy, ${v.error} 😕. ${opciones.length ? 'Te dejo lo más cercano que tengo libre 👇' : '¿Probamos con otro día?'}`,
        intencion: opciones.length ? 'proponer' : 'consulta',
        opciones,
        reserva: null,
        gestion: null,
        consulta: null,
        modo,
      };
    }
  }

  // Le pedimos nombre y teléfono para un turno elegido y los mandó: reservamos directo
  const elegido = historial.length >= 3 ? parsearSeleccion(historial.at(-3).content, ctx) : null;
  if (elegido && historial.at(-3).role === 'user' && /nombre/i.test(historial.at(-2).content)) {
    const d = parsearDatos(ultimo.original ?? ultimo.content, true);
    if (d.nombre && d.telefono && !/[?¿]/.test(ultimo.content)) {
      const hecha = confirmarReserva(elegido, d, modo);
      if (hecha) return hecha;
    }
  }

  const crudo = modo === 'ia' ? await llamarOpenAI(historial, ctx) : respuestaDemo(historial, ctx);
  return postProcesar(crudo, modo, ctx, historial);
}
