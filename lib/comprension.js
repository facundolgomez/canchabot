// Comprensión del lenguaje del cliente, antes de pasarle el mensaje a la IA (o al modo demo).
// - normalizarTexto: abreviaturas, jerga rosarina, números en letras y horas ambiguas ("tipo 9" → 21).
// - resolverRespuestaCorta: "dale", "la primera", "la de las 21", "nah, otra más tarde"
//   referidas a las opciones que el asistente acaba de mostrar.
// Es determinístico: lo que se puede entender con reglas no depende de que la IA lo lea bien.

export const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const NUMEROS = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
};

const REEMPLAZOS = [
  [/\b(mnn|mnana|manna|maniana)\b/g, 'manana'],
  [/\bpasado(?!\s+manana)\b/g, 'pasado manana'],
  [/\b(q|k|ke)\b/g, 'que'],
  [/\b(xq|pq|porq|xk)\b/g, 'porque'],
  [/\b(tmb|tb|tmbn|tambn)\b/g, 'tambien'],
  [/\b(porfa|porfis|xfa|xfavor)\b/g, 'por favor'],
  [/\b(dsp|dps|desp)\b/g, 'despues'],
  [/\bxa\b/g, 'para'],
  [/\bx\b/g, 'por'],
  [/\btoy\b/g, 'estoy'],
  [/\bhoi\b/g, 'hoy'],
  [/\bpa\b/g, 'para'],
  [/\bfinde\b/g, 'fin de semana'],
  [/\b(fulbo|fulbito|futbolito|picado|picadito|partido|partidito|futbol)\s+(de|del)\s+(5|7)\b/g, 'futbol $3'],
  [/\b(la|una|cancha)\s+de\s+(5|7)\b/g, '$1 de futbol $2'],
  [/\bf\s?(5|7)\b/g, 'futbol $1'],
  [/\b(cuanto esta|cuanto sale|cuanto cuesta)\b/g, 'cuanto sale'],
  // "después de laburar" ≈ desde las 19
  [/\b(despues de|cuando salgo de|al salir de|saliendo de)l? (laburar|laburo|trabajar|trabajo)\b/g, 'despues de las 19'],
];

// Horas sueltas: el complejo abre de 16 a 24, así que "a las 9" es 21, "tipo 8" es 20.
const PREFIJO_HORA = '(a las|las|tipo|tipo las|tipo a las|para las|de las|desde las|despues de las|a partir de las|la de las)';

export function normalizarTexto(texto) {
  let t = sinAcentos(texto);
  for (const [palabra, n] of Object.entries(NUMEROS)) t = t.replace(new RegExp(`\\b${palabra}\\b`, 'g'), String(n));
  for (const [re, rep] of REEMPLAZOS) t = t.replace(re, rep);
  t = t.replace(new RegExp(`\\b${PREFIJO_HORA}\\s+(\\d{1,2})(?![\\d/:])(\\s*(hs|h)\\b)?`, 'g'), (_, pre, h) => {
    const n = Number(h);
    return `${pre} ${n >= 1 && n <= 11 ? n + 12 : n}`;
  });
  t = t.replace(/\b(\d{1,2})\s*(hs|h)\b/g, (_, h) => `${Number(h) >= 1 && Number(h) <= 11 ? Number(h) + 12 : h} hs`);
  return t.replace(/\s+/g, ' ').trim();
}

// ---------- Respuestas cortas sobre las opciones mostradas ----------

export const AFIRMA =
  /(^|\s)(si+|si si|dale|ok|oka|okey|okis|listo|joya|de una|va|vamos|perfecto|barbaro|buenisimo|genial|esa|ese|esa misma|ese mismo|confirmo|obvio|claro|me sirve|me va|sale|👍|👌)(?=\s|$|[!.,])/;
export const NIEGA = /(^|\s)(nah|na|no+|no no|ni ahi|ninguna|ninguno|mejor otr[oa]|otr[oa])(?=\s|$|[!.,])/;

const ORDINALES = [
  [/\b(la |el )?(primera|primero|primer|1ra|1ro|1°)\b/, 0],
  [/\b(la |el )?(segunda|segundo|2da|2do|2°)\b/, 1],
  [/\b(la |el )?(tercera|tercero|3ra|3ro|3°)\b/, 2],
  [/\b(la |el )?(cuarta|cuarto|4ta|4to)\b/, 3],
  [/\b(la |el )?(quinta|quinto|5ta|5to)\b/, 4],
  [/\b(la |el )?(sexta|sexto|6ta|6to)\b/, 5],
];

// "[Opciones mostradas: Cancha 1 2026-11-02 21:00; Cancha 2 2026-11-02 21:00]"
export function opcionesMostradas(content) {
  const m = String(content).match(/\[Opciones mostradas: ([^\]]+)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/Cancha (\d) (\d{4}-\d{2}-\d{2}) (\d{2}:00)/g)].map((x) => ({ cancha: Number(x[1]), fecha: x[2], hora: x[3] }));
}

const mencionaOtraCosa = (t) =>
  /(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|fin de semana|semana|\d{1,2}\/\d{1,2}|\?)/.test(t);

/**
 * Interpreta una respuesta corta a las opciones mostradas en el mensaje anterior del asistente.
 * Devuelve:
 *  { tipo: 'eleccion', opcion }            → eligió una opción concreta
 *  { tipo: 'ambigua', candidatos }         → dijo que sí pero hay varias que encajan
 *  { tipo: 'rechazo', direccion, opciones } → no le sirve ninguna ('tarde' | 'temprano' | null)
 *  null                                    → no es una respuesta corta a las opciones
 */
export function resolverRespuestaCorta(textoUsuario, mensajeAnterior, canchas, pedidoAnterior = '') {
  const opciones = opcionesMostradas(mensajeAnterior);
  if (!opciones.length) return null;
  const t = normalizarTexto(textoUsuario);
  // Preguntas y mensajes largos los interpreta la IA
  if (t.split(' ').length > 12 || /[?¿]/.test(t)) return null;

  // 1) Rechazo: "nah", "otra más tarde", "ni ahí"
  if (NIEGA.test(t) && !/\b(no hay problema|no importa|no pasa nada)\b/.test(t)) {
    const direccion = /mas tarde|mas tardecito|despues|mas a la noche|mas de noche/.test(t)
      ? 'tarde'
      : /mas temprano|mas tempranito|antes|mas a la tarde/.test(t)
        ? 'temprano'
        : null;
    // Si además pide otra cosa concreta ("nah, el jueves"), que lo interprete la IA
    if (!direccion && (mencionaOtraCosa(t) || /\d/.test(t))) return null;
    return { tipo: 'rechazo', direccion, opciones };
  }

  // 2) Ordinal: "la primera", "la segunda", "la última"
  for (const [re, i] of ORDINALES) if (re.test(t) && opciones[i]) return { tipo: 'eleccion', opcion: opciones[i] };
  if (/\b(la |el )?ultim[oa]\b/.test(t)) return { tipo: 'eleccion', opcion: opciones.at(-1) };

  // 3) Filtros: "la de las 21", "la techada", "la de futbol 7", "la cancha 2", "la más barata"
  let candidatos = opciones;
  let filtro = false;
  const mh = t.match(/\b(?:las|tipo)\s+(\d{1,2})\b/) || t.match(/\b(\d{1,2})(?::00|\s*hs)\b/);
  if (mh) {
    filtro = true;
    candidatos = candidatos.filter((o) => Number(o.hora.slice(0, 2)) === Number(mh[1]));
  }
  const mc = t.match(/\bcancha\s*(\d)\b/) || t.match(/\bla ([123])\b(?!\s*(hs|:))/);
  if (mc) {
    filtro = true;
    candidatos = candidatos.filter((o) => o.cancha === Number(mc[1]));
  }
  if (/techad|bajo techo/.test(t)) {
    filtro = true;
    candidatos = candidatos.filter((o) => canchas.find((c) => c.id === o.cancha)?.techada);
  } else if (/descubiert|al aire libre|sin techo/.test(t)) {
    filtro = true;
    candidatos = candidatos.filter((o) => !canchas.find((c) => c.id === o.cancha)?.techada);
  }
  const mt = t.match(/futbol (5|7)/);
  if (mt) {
    filtro = true;
    candidatos = candidatos.filter((o) => canchas.find((c) => c.id === o.cancha)?.tipo.includes(mt[1]));
  }
  if (/mas barat|la barata|mas economic/.test(t)) {
    filtro = true;
    const precio = (o) => canchas.find((c) => c.id === o.cancha)?.precio ?? Infinity;
    const min = Math.min(...candidatos.map(precio));
    candidatos = candidatos.filter((o) => precio(o) === min);
  }

  const afirma = AFIRMA.test(t);
  if (!filtro && !afirma) return null;
  // Pidió algo que no está entre las opciones ("la de las 23" y no se mostró): que lo vea la IA
  if (filtro && !candidatos.length) return null;
  // Con filtros + otra cosa (ej. un día distinto), mejor que lo interprete la IA
  if (mencionaOtraCosa(t) && !afirma) return null;

  // "dale" a secas: si antes había pedido una hora puntual ("tipo 9"), se queda con las de esa hora
  if (afirma && !filtro && candidatos.length > 1) {
    const p = normalizarTexto(pedidoAnterior);
    const hp = p.match(/\b(?:a las|tipo|tipo las|para las)\s+(\d{1,2})\b/);
    if (hp) {
      const deEsaHora = candidatos.filter((o) => Number(o.hora.slice(0, 2)) === Number(hp[1]));
      if (deEsaHora.length) candidatos = deEsaHora;
    }
  }

  if (candidatos.length === 1) return { tipo: 'eleccion', opcion: candidatos[0] };
  return { tipo: 'ambigua', candidatos };
}
