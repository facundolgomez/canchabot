// Funciones de IA para el dueño: promo para llenar turnos vacíos y análisis del día.
// Los números (turnos libres, ocupación, ingresos) los calcula SIEMPRE el backend;
// la IA solo redacta e interpreta. Sin OPENAI_API_KEY se arma todo con reglas (modo demo).

import { complejo, HORAS } from '../data/complejo.js';
import { listarReservas, libres, turnoInfo, getCancha, normalizarHora } from './reservas.js';
import { ahoraBA, esFechaValida, fechaLarga, sumarDias } from './fechas.js';
import { getCliente, errorHttp, modoActual, traducirErrorOpenAI, arreglarMontos } from './asistente.js';

const MODELO = 'gpt-4o-mini';
const pesos = (n) => `$${Math.round(n).toLocaleString('es-AR')}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const hNum = (hora) => Number(hora.slice(0, 2));
const TURNOS_POR_DIA = complejo.canchas.length * HORAS.length;

function fechaPedida(valor) {
  if (valor === undefined || valor === null || valor === '') return ahoraBA().fecha;
  if (!esFechaValida(valor)) throw errorHttp(400, 'La fecha no es válida (usá YYYY-MM-DD).');
  return valor;
}

async function pedirJSON(system, datos, temperature = 0.7) {
  try {
    const c = await getCliente().chat.completions.create({
      model: MODELO,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `DATOS (JSON):\n${JSON.stringify(datos)}` },
      ],
    });
    return JSON.parse(c.choices?.[0]?.message?.content || '{}');
  } catch (e) {
    throw traducirErrorOpenAI(e);
  }
}

const texto = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// =====================================================================
// 1) PROMO: "Llenar turnos vacíos"
// =====================================================================

function promptPromo() {
  return `Sos community manager del ${complejo.nombre}, un complejo de canchas de fútbol en Rosario. Tu tarea: escribir una promo lista para publicar en Instagram y WhatsApp para llenar los turnos libres del día indicado.

REGLAS:
- Usá SOLO turnos que estén en "turnos_libres". Elegí entre 2 y 6, priorizando los que más cuesta llenar (temprano, de 16 a 19 hs) y los que quedan sueltos.
- "descuento_sugerido": número entero entre 10 y 30 (porcentaje). Más descuento en horarios flojos o si es para hoy y queda poco tiempo.
- "texto": español rioplatense con voseo, entusiasta, 5 a 9 líneas cortas, con emojis. Voseo siempre ("reservá", "vení", "armá el equipo"), nunca tuteo. NO escribas vos la lista de turnos ni precios: poné una línea que diga exactamente {{TURNOS}} donde va la lista (el sistema la reemplaza por los turnos elegidos con sus precios con descuento ya calculados). Antes de {{TURNOS}} anunciá el descuento (ej: "🔥 20% OFF en estos turnos:"). Después incluí cómo reservar (WhatsApp ${complejo.telefono} o el chat de la web) y la dirección. No incluyas los hashtags dentro del texto.
- "titulo": corto y llamativo (máx. 8 palabras).
- Si "es_hoy" es false, NUNCA digas "hoy": nombrá el día (usá "dia", ej: "el lunes 02/11", o "mañana" si corresponde).
- "hashtags": entre 5 y 8, sin espacios, en español, sobre fútbol, Rosario y el complejo.
- No uses nombres de clubes reales, jugadores ni marcas. No inventes servicios ni precios.

Respondé SOLO con un objeto JSON con esta forma:
{
  "titulo": "string",
  "texto": "string",
  "turnos_en_promo": [ { "cancha": 1, "hora": "16:00" } ],
  "descuento_sugerido": 20,
  "hashtags": ["#FutbolRosario"]
}`;
}

function promoDemo(fecha, disponibles) {
  const { fecha: hoy } = ahoraBA();
  const esHoy = fecha === hoy;
  // Prioriza la franja floja (antes de las 20) y reparte entre canchas
  const ordenados = [...disponibles].sort((a, b) => (hNum(a.hora) >= 20) - (hNum(b.hora) >= 20) || hNum(a.hora) - hNum(b.hora) || a.cancha - b.cancha);
  const elegidos = ordenados.slice(0, 4);
  const soloValle = elegidos.every((t) => hNum(t.hora) < 20);
  const descuento = soloValle ? 20 : 15;
  const cuando = esHoy ? 'Hoy' : `El ${fechaLarga(fecha)}`;


  const tieneF7 = elegidos.some((t) => t.tipo === 'Fútbol 7');
  return {
    titulo: esHoy ? `¡Hoy se juega con ${descuento}% OFF! ⚽` : `Picadito ${fechaLarga(fecha)} con ${descuento}% OFF`,
    texto: [
      `⚽ ¡${cuando} quedan canchas libres en ${complejo.nombre}!`,
      `🔥 ${descuento}% OFF en estos turnos:`,
      '{{TURNOS}}',
      '',
      `🚿 Vestuarios con duchas · 🚗 Estacionamiento gratis`,
      `📍 ${complejo.direccion}`,
      `📲 Reservá por WhatsApp al ${complejo.telefono} o en el chat de nuestra web.`,
      `⏳ ¡Vuelan! El primero que reserva se lo lleva.`,
    ].join('\n'),
    turnos_en_promo: elegidos.map((t) => ({ cancha: t.cancha, hora: t.hora })),
    descuento_sugerido: descuento,
    hashtags: ['#FutbolRosario', '#Futbol5', ...(tieneF7 ? ['#Futbol7'] : []), '#LaRedonda', '#TurnosLibres', '#Rosario', '#Picadito'],
  };
}

const MARCA_TURNOS = /\{\{\s*TURNOS\s*\}\}/i;

const lineaTurno = (t) =>
  `• ${t.hora} · ${t.canchaNombre} (${t.tipo}${t.techada ? ', techada' : ''}) → ${pesos(t.precioPromo)} (antes ${pesos(t.precio)})`;

// Inserta la lista de turnos con precios calculados por el backend (la IA no hace cuentas)
function armarTexto(base, turnos) {
  const lista = turnos.map(lineaTurno).join('\n');
  if (MARCA_TURNOS.test(base)) return base.replace(MARCA_TURNOS, lista);
  // La IA no dejó el marcador: sacamos su propia lista (renglones con horarios) y ponemos la nuestra
  const renglones = base.split('\n').filter((l) => !/\b\d{1,2}[:.]\d{2}\b/.test(l));
  const despuesDe = renglones.findIndex((l) => l.trim()) + 1;
  renglones.splice(despuesDe, 0, lista);
  return renglones.join('\n');
}

// Si la promo NO es para hoy y la IA escribió "hoy", lo reemplazamos por el día real.
function corregirDia(str, fecha) {
  const { fecha: hoy } = ahoraBA();
  if (fecha === hoy) return str;
  const dia = fechaLarga(fecha); // "lunes 02/11"
  const esManana = fecha === sumarDias(hoy, 1);
  const nombre = esManana ? 'mañana' : `el ${dia}`;
  return str
    .replace(/\bHoy\b/g, nombre.charAt(0).toUpperCase() + nombre.slice(1))
    .replace(/\bhoy\b/g, nombre)
    .replace(/\bHOY\b/g, nombre.toUpperCase());
}

function normalizarPromo(raw, fecha, disponibles, modo) {
  const r = raw && typeof raw === 'object' ? raw : {};

  let descuento = Math.round(Number(String(r.descuento_sugerido ?? '').replace(/[^\d.]/g, '')));
  if (!Number.isFinite(descuento) || descuento <= 0) descuento = 15;
  descuento = Math.min(Math.max(descuento, 5), 50);

  // Solo turnos realmente libres (la IA no decide disponibilidad)
  const vistos = new Set();
  let turnos = (Array.isArray(r.turnos_en_promo) ? r.turnos_en_promo : [])
    .map((t) => {
      const c = getCancha(t?.cancha);
      const h = normalizarHora(t?.hora);
      return c && h ? disponibles.find((d) => d.cancha === c.id && d.hora === h) : null;
    })
    .filter((t) => t && !vistos.has(`${t.cancha}|${t.hora}`) && vistos.add(`${t.cancha}|${t.hora}`));
  if (!turnos.length) turnos = disponibles.slice(0, 3);

  const turnos_en_promo = turnos
    .sort((a, b) => hNum(a.hora) - hNum(b.hora) || a.cancha - b.cancha)
    .slice(0, 6)
    .map((t) => ({
      cancha: t.cancha,
      canchaNombre: t.canchaNombre,
      tipo: t.tipo,
      techada: t.techada,
      hora: t.hora,
      precio: t.precio,
      precioPromo: Math.round((t.precio * (1 - descuento / 100)) / 100) * 100,
    }));

  let hashtags = Array.isArray(r.hashtags) ? r.hashtags : String(r.hashtags ?? '').split(/[\s,]+/);
  hashtags = [...new Set(hashtags.map((h) => String(h).replace(/[\s#]/g, '')).filter(Boolean).map((h) => `#${h}`))].slice(0, 8);
  if (!hashtags.length) hashtags = ['#FutbolRosario', '#LaRedonda', '#TurnosLibres'];

  return {
    fecha,
    dia: fechaLarga(fecha),
    titulo: corregirDia(texto(r.titulo, 120) || `Turnos libres ${fechaLarga(fecha)} ⚽`, fecha),
    texto: corregirDia(armarTexto(arreglarMontos(texto(r.texto) || promoDemo(fecha, disponibles).texto), turnos_en_promo), fecha),
    turnos_en_promo,
    descuento_sugerido: descuento,
    hashtags,
    turnosLibresTotal: disponibles.length,
    modo,
  };
}

export async function generarPromo(fechaRaw) {
  const fecha = fechaPedida(fechaRaw);
  const ahora = ahoraBA();
  const disponibles = libres({ fechas: [fecha] }).map(turnoInfo);
  if (!disponibles.length) {
    throw errorHttp(
      409,
      fecha < ahora.fecha ? 'Ese día ya pasó: no hay turnos para promocionar.' : 'No quedan turnos libres ese día. ¡Está todo lleno! 🎉'
    );
  }

  const modo = modoActual();
  const raw =
    modo === 'ia'
      ? await pedirJSON(promptPromo(), {
          complejo: { nombre: complejo.nombre, direccion: complejo.direccion, telefono: complejo.telefono, servicios: complejo.servicios },
          fecha,
          dia: fechaLarga(fecha),
          es_hoy: fecha === ahora.fecha,
          hora_actual: `${String(ahora.hora).padStart(2, '0')}:${String(ahora.minuto).padStart(2, '0')}`,
          turnos_libres: disponibles.map(({ cancha, canchaNombre, tipo, techada, hora, precio }) => ({ cancha, canchaNombre, tipo, techada, hora, precio })),
        })
      : promoDemo(fecha, disponibles);

  return normalizarPromo(raw, fecha, disponibles, modo);
}

// =====================================================================
// 2) ANÁLISIS: "Analizar mi día"
// =====================================================================

function estadisticas(fecha) {
  const todas = listarReservas();
  // Semana móvil: los 3 días anteriores y los 3 siguientes al día elegido
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(fecha, i - 3));

  const delDia = todas.filter((r) => r.fecha === fecha);
  const activasDia = delDia.filter((r) => r.estado !== 'cancelada');
  const enSemana = todas.filter((r) => semana.includes(r.fecha));
  const activasSemana = enSemana.filter((r) => r.estado !== 'cancelada');
  const pendientes = activasDia.filter((r) => r.estado === 'pendiente_sena');

  const nC = complejo.canchas.length;

  return {
    fecha,
    dia: fechaLarga(fecha),
    semana: { desde: semana[0], hasta: semana[6] },
    dia_actual: ahoraBA().fecha,
    es_hoy: fecha === ahoraBA().fecha,
    nota: fecha === ahoraBA().fecha ? 'El día elegido es HOY (en curso).' : `El día elegido NO es hoy: es el ${fechaLarga(fecha)}. No digas "hoy".`,
    precios: Object.fromEntries(complejo.canchas.map((c) => [c.nombre, c.precio])),
    dia_resumen: {
      reservas: activasDia.length,
      canceladas: delDia.length - activasDia.length,
      turnos_totales: TURNOS_POR_DIA,
      ocupacion: pct(activasDia.length, TURNOS_POR_DIA),
      ingresos: activasDia.reduce((s, r) => s + r.precio, 0),
      senas_pendientes: { cantidad: pendientes.length, monto: pendientes.reduce((s, r) => s + r.sena, 0) },
    },
    dia_por_hora: HORAS.map((hora) => ({
      hora,
      ocupadas: activasDia.filter((r) => r.hora === hora).length,
      de: nC,
    })),
    dia_por_cancha: complejo.canchas.map((c) => {
      const rs = activasDia.filter((r) => r.cancha === c.id);
      return { cancha: c.id, nombre: c.nombre, tipo: c.tipo, techada: c.techada, ocupadas: rs.length, de: HORAS.length, ingresos: rs.reduce((s, r) => s + r.precio, 0) };
    }),
    semana_resumen: {
      reservas: activasSemana.length,
      canceladas: enSemana.length - activasSemana.length,
      ocupacion: pct(activasSemana.length, TURNOS_POR_DIA * 7),
      ingresos: activasSemana.reduce((s, r) => s + r.precio, 0),
      por_origen: ['chat', 'whatsapp', 'telefono'].reduce((o, k) => ({ ...o, [k]: activasSemana.filter((r) => r.origen === k).length }), {}),
    },
    semana_por_dia: semana.map((f) => {
      const n = activasSemana.filter((r) => r.fecha === f).length;
      return { fecha: f, dia: fechaLarga(f), reservas: n, ocupacion: pct(n, TURNOS_POR_DIA) };
    }),
    semana_por_hora: HORAS.map((hora) => {
      const n = activasSemana.filter((r) => r.hora === hora).length;
      return { hora, reservas: n, ocupacion: pct(n, nC * 7) };
    }),
    semana_por_cancha: complejo.canchas.map((c) => {
      const n = activasSemana.filter((r) => r.cancha === c.id).length;
      return { nombre: c.nombre, tipo: c.tipo, reservas: n, ocupacion: pct(n, HORAS.length * 7) };
    }),
  };
}

function promptAnalisis() {
  return `Sos un analista de negocio que asesora al dueño del ${complejo.nombre}, un complejo de canchas de fútbol en Rosario (turnos de 1 hora de 16 a 24 hs). Te paso las estadísticas reales del día elegido y de su semana (los 3 días anteriores y los 3 siguientes).

REGLAS:
- Sé concreto: citá horarios, canchas, cantidades, porcentajes y montos que estén en los datos. NO inventes números.
- Tené en cuenta que los días futuros de la semana pueden tener pocas reservas todavía (es normal, no es una mala señal).
- Los días ANTERIORES a "dia_actual" con 0 reservas significan que no hay datos cargados, no que hayan sido días malos: no los compares ni hables de "la semana pasada". Concentrate en el día elegido y en los días que sí tienen reservas.
- "resumen": 1 o 2 frases, en español rioplatense (voseo: "tenés", "podés"; nunca tuteo), directo al dueño. Si el día es hoy ("fecha" = "dia_actual"), hablá en presente (el día sigue en curso).
- Cada insight y cada recomendación debe incluir al menos un dato concreto de los datos: hora, cancha, cantidad, % o monto. Nada genérico como "casi vacía" sin número.
- Montos en formato argentino: $19.800 (punto para los miles, sin decimales).
- "insights": 3 o 4 observaciones concretas (ej: qué franja se llena, qué cancha está ociosa, señas pendientes, cancelaciones, canal por donde entran las reservas).
- "recomendaciones": 3 o 4 acciones concretas y accionables (ej: subir 10% el precio de 21 a 23 hs, promo 20% en la Cancha 2 de 16 a 19, recordar señas pendientes, pack mensual para equipos fijos).
- Cada item lleva un emoji representativo en "icono" y el texto en "texto" (máx. 25 palabras).

Respondé SOLO con un objeto JSON con esta forma:
{
  "resumen": "string",
  "ocupacion_porcentaje": 0,
  "insights": [ { "icono": "🔥", "texto": "string" } ],
  "recomendaciones": [ { "icono": "💰", "texto": "string" } ]
}`;
}

function franjaTexto(horas) {
  if (!horas.length) return '';
  const desde = horas[0];
  const hasta = `${String(hNum(horas.at(-1)) + 1).padStart(2, '0')}:00`;
  return horas.length === 1 ? `el turno de las ${desde}` : `la franja de ${desde} a ${hasta}`;
}

function analisisDemo(s) {
  const d = s.dia_resumen;
  const insights = [];
  const recomendaciones = [];

  // Pico del día
  const max = Math.max(...s.dia_por_hora.map((h) => h.ocupadas));
  const horasPico = s.dia_por_hora.filter((h) => h.ocupadas === max && max > 0).map((h) => h.hora);
  if (horasPico.length) {
    insights.push({ icono: '🔥', texto: `${franjaTexto(horasPico).replace(/^./, (c) => c.toUpperCase())} es lo más pedido: ${max} de ${s.dia_por_hora[0].de} canchas ocupadas.` });
    if (max >= 2) recomendaciones.push({ icono: '💰', texto: `Subí 10% el precio en ${franjaTexto(horasPico)}: se llena igual y sumás margen sin perder clientes.` });
  }

  // Valle de la tarde
  const valle = s.dia_por_hora.filter((h) => hNum(h.hora) < 20);
  const libresValle = valle.reduce((acc, h) => acc + (h.de - h.ocupadas), 0);
  if (libresValle > 0) {
    insights.push({ icono: '🌙', texto: `De 16 a 20 hs quedan ${libresValle} de ${valle.length * valle[0].de} turnos vacíos: la tarde es tu horario flojo.` });
    recomendaciones.push({ icono: '🎯', texto: `Lanzá una promo de 20% para la franja de 16 a 20 hs (usá "Llenar turnos vacíos" y compartila por WhatsApp).` });
  }

  // Cancha ociosa
  const porCancha = [...s.dia_por_cancha].sort((a, b) => a.ocupadas - b.ocupadas);
  const ociosa = porCancha[0];
  const top = porCancha.at(-1);
  if (ociosa && top && top.ocupadas > ociosa.ocupadas) {
    insights.push({ icono: '😴', texto: `La ${ociosa.nombre} (${ociosa.tipo}) es la más ociosa: ${ociosa.ocupadas} de ${ociosa.de} turnos. La ${top.nombre} lidera con ${top.ocupadas}.` });
    recomendaciones.push({
      icono: '📣',
      texto: ociosa.tipo === 'Fútbol 7'
        ? `Ofrecé un pack mensual para equipos fijos de fútbol 7 en la ${ociosa.nombre} con precio fijo.`
        : `Ofrecé la ${ociosa.nombre} como alternativa más barata cuando la ${top.nombre} esté ocupada.`,
    });
  }

  // Señas y cancelaciones
  if (d.senas_pendientes.cantidad > 0) {
    insights.push({ icono: '⏳', texto: `Hay ${d.senas_pendientes.cantidad} señas pendientes por ${pesos(d.senas_pendientes.monto)}: plata en riesgo si no confirman.` });
    recomendaciones.push({ icono: '📲', texto: `Mandá un recordatorio por WhatsApp a las ${d.senas_pendientes.cantidad} reservas con seña pendiente antes de liberar el turno.` });
  } else if (d.canceladas > 0) {
    insights.push({ icono: '❌', texto: `Hubo ${d.canceladas} cancelación${d.canceladas > 1 ? 'es' : ''} en el día: esos turnos se pueden volver a ofrecer.` });
  }

  // Canal de reservas en la semana
  const o = s.semana_resumen.por_origen;
  if (insights.length < 4 && s.semana_resumen.reservas > 0) {
    insights.push({ icono: '🤖', texto: `En la semana: ${o.chat} reservas por el chat IA, ${o.whatsapp} por WhatsApp y ${o.telefono} por teléfono.` });
  }
  if (recomendaciones.length < 3) {
    recomendaciones.push({ icono: '🤝', texto: 'Proponé a los equipos que juegan seguido dejar el turno fijo semanal con la seña adelantada.' });
  }

  const resumen = d.reservas
    ? `El ${s.dia} tenés ${d.reservas} reserva${d.reservas === 1 ? '' : 's'} (${d.ocupacion}% de ocupación) y ${pesos(d.ingresos)} de ingresos estimados.${d.senas_pendientes.cantidad ? ` Ojo: quedan ${pesos(d.senas_pendientes.monto)} en señas por cobrar.` : ' Todas las señas están cobradas.'}`
    : `El ${s.dia} todavía no tiene reservas: tenés las ${d.turnos_totales} canchas-hora libres para salir a promocionar.`;

  return { resumen, ocupacion_porcentaje: d.ocupacion, insights: insights.slice(0, 4), recomendaciones: recomendaciones.slice(0, 4) };
}

function normalizarItems(lista, iconoDefault) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((it) => (typeof it === 'string' ? { icono: iconoDefault, texto: it } : { icono: texto(it?.icono, 8) || iconoDefault, texto: arreglarMontos(texto(it?.texto, 300)) }))
    .filter((it) => it.texto)
    .slice(0, 4);
}

export async function analizarDia(fechaRaw) {
  const fecha = fechaPedida(fechaRaw);
  const s = estadisticas(fecha);
  const modo = modoActual();
  const raw = modo === 'ia' ? await pedirJSON(promptAnalisis(), s, 0.4) : analisisDemo(s);
  const demo = modo === 'ia' ? null : raw;

  const conDia = (items) => items.map((it) => ({ ...it, texto: corregirDia(it.texto, fecha) }));
  let insights = conDia(normalizarItems(raw?.insights, '📊'));
  let recomendaciones = conDia(normalizarItems(raw?.recomendaciones, '✅'));
  // Si la IA devolvió algo vacío, completamos con el análisis por reglas
  if (!insights.length || !recomendaciones.length) {
    const respaldo = demo || analisisDemo(s);
    if (!insights.length) insights = respaldo.insights;
    if (!recomendaciones.length) recomendaciones = respaldo.recomendaciones;
  }

  return {
    fecha,
    dia: s.dia,
    resumen: corregirDia(arreglarMontos(texto(raw?.resumen, 400) || analisisDemo(s).resumen), fecha),
    ocupacion_porcentaje: s.dia_resumen.ocupacion, // dato real, no el de la IA
    insights,
    recomendaciones,
    metricas: {
      reservasDia: s.dia_resumen.reservas,
      ingresosDia: s.dia_resumen.ingresos,
      senasPendientes: s.dia_resumen.senas_pendientes,
      ocupacionSemana: s.semana_resumen.ocupacion,
      reservasSemana: s.semana_resumen.reservas,
      ingresosSemana: s.semana_resumen.ingresos,
    },
    modo,
  };
}
