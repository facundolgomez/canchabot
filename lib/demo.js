// "Modo demo": respuestas simuladas con reglas simples, para probar la UI y el deploy sin API key.
// Devuelve el mismo formato JSON que la IA.

import { complejo } from '../data/complejo.js';
import { libres, getCancha, normalizarHora, validarTurno, alternativas } from './reservas.js';
import { fechaLarga } from './fechas.js';

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pesos = (n) => `$${n.toLocaleString('es-AR')}`;
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MARCA_CONFIRMADA = 'Reserva registrada';

// "Quiero reservar la Cancha 1 (Fútbol 5) el jueves 05/11 a las 21:00"
function parsearSeleccion(texto, ctx) {
  const t = sinAcentos(texto);
  const mc = t.match(/cancha\s*(\d)/);
  const mf = t.match(/(\d{1,2})\/(\d{1,2})/);
  const mh = t.match(/(\d{1,2}):00/) || t.match(/a las (\d{1,2})/);
  if (!mc || !mf || !mh) return null;
  const clave = `${mf[2].padStart(2, '0')}-${mf[1].padStart(2, '0')}`;
  const dia = ctx.dias.find((d) => d.fecha.slice(5) === clave);
  const hora = normalizarHora(mh[1]);
  if (!dia || !hora || !getCancha(mc[1])) return null;
  return { cancha: Number(mc[1]), fecha: dia.fecha, hora };
}

function parsearDatos(texto, permitirSoloNombre) {
  let telefono = null;
  const mt = texto.match(/\+?\d[\d\s-]{6,}\d/);
  if (mt && mt[0].replace(/\D/g, '').length >= 8) telefono = mt[0].trim();

  let nombre = null;
  const letras = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
  const mn = texto.match(new RegExp(`(?:me llamo|\\bsoy|mi nombre es|nombre:?|a nombre de)\\s+([${letras}]+(?:\\s+[${letras}]+)?)`, 'i'));
  if (mn) {
    const palabras = mn[1].split(/\s+/).filter((p) => !['y', 'mi', 'tel', 'cel', 'telefono', 'teléfono', 'numero', 'número', 'el'].includes(p.toLowerCase()));
    if (palabras.length) nombre = palabras.join(' ');
  } else if ((telefono || permitirSoloNombre) && !texto.includes('?')) {
    const resto = texto
      .replace(mt?.[0] ?? '', ' ')
      .replace(/(mi\s+)?(tel(efono|éfono)?|cel(ular)?|whatsapp|numero|número)(\s+es)?:?/gi, ' ')
      .replace(new RegExp(`[^${letras}\\s]`, 'g'), ' ')
      .trim()
      .split(/\s+/)
      .filter((p) => p.length >= 2 && !['dale', 'ok', 'si', 'sí', 'listo', 'genial', 'es', 'el', 'mi'].includes(p.toLowerCase()));
    if (resto.length >= 1 && resto.length <= 4) nombre = resto.join(' ');
  }
  return { nombre, telefono };
}

function respuestasFrecuentes(t) {
  const r = [];
  const c1 = complejo.canchas[0];
  if (/(precio|cuanto|sale|cuesta|valor|tarifa|cobran)/.test(t)) {
    if (/techad/.test(t)) {
      r.push(`La ${c1.nombre} (${c1.tipo} techada) sale ${pesos(c1.precio)} la hora. La seña es del ${complejo.sena.porcentaje}%: ${pesos(Math.round(c1.precio * 0.3))}.`);
    } else {
      r.push(`Los precios por hora son: ${complejo.canchas.map((c) => `${c.nombre} (${c.tipo}${c.techada ? ' techada' : ''}) ${pesos(c.precio)}`).join(', ')}.`);
    }
  } else if (/techad|llueve|lluvia|techo/.test(t)) {
    r.push(`Sí, la ${c1.nombre} es ${c1.tipo} techada, así que se juega llueva o no. ${complejo.politicas.lluvia}`);
  }
  if (/(sena|transferencia|pago|pagar|abonar|alias)/.test(t))
    r.push(`${complejo.sena.detalle} Alias: ${complejo.sena.alias} (${complejo.sena.titular}).`);
  if (/(vestuario|ducha|cambiar)/.test(t)) r.push(complejo.servicios.vestuarios);
  if (/(estacion|auto|moto)/.test(t)) r.push(complejo.servicios.estacionamiento);
  if (/pechera/.test(t)) r.push(complejo.servicios.pecheras.detalle);
  if (/(direccion|donde|ubicacion|llegar|queda)/.test(t)) r.push(`Estamos en ${complejo.direccion}, ${complejo.referencia.toLowerCase()}.`);
  if (/(cancel|suspend)/.test(t)) r.push(complejo.politicas.cancelacion);
  if (/(buffet|comer|bebida|parrilla)/.test(t)) r.push(complejo.servicios.buffet);
  if (/(abren|cierran|horario de atencion)/.test(t)) r.push(`Abrimos ${complejo.horario.dias.toLowerCase()}, de 16 a 24 hs, con turnos de 1 hora.`);
  return r;
}

const pideDisponibilidad = (t) =>
  /(somos|turno|reserv|cancha|libre|disponib|tenes algo|hay algo|hay lugar|jugar|partido|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|a la noche|a la tarde|despues de|\d{1,2}\s*(hs|:00))/.test(t);

function proponer(t, ctx) {
  // Día
  let fecha = null;
  const dd = t.match(/(\d{1,2})\/(\d{1,2})/);
  if (/\bhoy\b/.test(t)) fecha = ctx.hoy;
  else if (/\bmanana\b/.test(t) && !/por la manana/.test(t)) fecha = ctx.dias[1].fecha;
  else if (dd) fecha = ctx.dias.find((d) => d.fecha.slice(5) === `${dd[2].padStart(2, '0')}-${dd[1].padStart(2, '0')}`)?.fecha ?? null;
  else {
    const nombreDia = DIAS.find((d) => new RegExp(`\\b${d}\\b`).test(t));
    if (nombreDia) {
      const candidatos = ctx.dias.filter((d) => sinAcentos(d.dia) === nombreDia);
      fecha = (candidatos.find((d) => d.fecha !== ctx.hoy) || candidatos[0])?.fecha ?? null;
    }
  }

  // Horario
  let horaDesde = 16;
  let horaHasta = 24;
  const mh = t.match(/(?:despues de las|desde las|a partir de las|tipo|a las|de las|para las|tipo las)\s*(\d{1,2})/) || t.match(/(\d{1,2})\s*(?:hs|h)\b/);
  if (mh) {
    let h = Number(mh[1]);
    if (h < 12) h += 12;
    horaDesde = Math.min(Math.max(h, 16), 23);
  } else if (/(a la noche|de noche)/.test(t)) horaDesde = 20;
  else if (/a la tarde/.test(t)) horaHasta = 20;

  // Cancha según jugadores / preferencias
  let canchas = null;
  let tipoTxt = '';
  const mj = t.match(/somos\s*(\d{1,2})/) || t.match(/(\d{1,2})\s*(jugadores|personas|pibes|chicos|chicas)/);
  if (/techad|techo/.test(t)) { canchas = [1]; tipoTxt = ' en la techada'; }
  else if (/(futbol 7|f7)/.test(t) || (mj && Number(mj[1]) > 10)) { canchas = [3]; tipoTxt = ' de fútbol 7'; }
  else if (/(futbol 5|f5)/.test(t) || mj) { canchas = [1, 2]; tipoTxt = ' de fútbol 5'; }

  let opciones = libres({ fechas: fecha ? [fecha] : ctx.dias.map((d) => d.fecha), canchas, horaDesde, horaHasta });
  let mensaje;
  if (opciones.length) {
    const cuando = fecha ? `el ${fechaLarga(fecha)}` : 'los próximos días';
    const desde = horaDesde > 16 ? ` desde las ${horaDesde}:00` : '';
    mensaje = `¡De una! ⚽ Para ${cuando}${desde} tengo estos turnos libres${tipoTxt}. Tocá el que te sirva 👇`;
  } else {
    opciones = alternativas({ fecha: fecha || ctx.hoy, hora: `${horaDesde}:00`, cancha: canchas?.[0] });
    mensaje = opciones.length
      ? 'Uh, en ese horario está todo ocupado 😕. Te dejo lo más cercano que tengo libre 👇'
      : 'Uh, no me quedan turnos libres para esa fecha. ¿Probamos otro día?';
  }
  return { mensaje, intencion: opciones.length ? 'proponer' : 'consulta', opciones: opciones.slice(0, 4), reserva: null };
}

export function respuestaDemo(historial, ctx) {
  const ultimo = historial.at(-1).content;
  const t = sinAcentos(ultimo);

  // 1) ¿Hay un turno elegido pendiente de datos?
  let selIdx = -1;
  let sel = null;
  for (let i = historial.length - 1; i >= 0; i--) {
    if (historial[i].role !== 'user') continue;
    const s = parsearSeleccion(historial[i].content, ctx);
    if (s) { sel = s; selIdx = i; break; }
  }
  const yaConfirmada = sel && historial.slice(selIdx + 1).some((m) => m.role === 'assistant' && m.content.includes(MARCA_CONFIRMADA));
  const ultimoEsSeleccion = sel && selIdx === historial.length - 1;
  const pendiente = sel && !yaConfirmada && historial.length - 1 - selIdx <= 6;
  const datosUltimo = parsearDatos(ultimo, pendiente && !ultimoEsSeleccion);

  if (pendiente && (ultimoEsSeleccion || datosUltimo.nombre || datosUltimo.telefono)) {
    const v = validarTurno(sel);
    const c = getCancha(sel.cancha);
    if (!v.ok) {
      return {
        mensaje: `Uy, ${v.error}. Mirá estas alternativas 👇`,
        intencion: 'proponer',
        opciones: alternativas(sel),
        reserva: null,
      };
    }
    let nombre = null;
    let telefono = null;
    historial.slice(selIdx).forEach((m, k) => {
      if (m.role !== 'user') return;
      const d = parsearDatos(m.content, k > 0);
      nombre = d.nombre || nombre;
      telefono = d.telefono || telefono;
    });
    const turnoTxt = `la ${c.nombre} (${c.tipo}) el ${fechaLarga(sel.fecha)} a las ${sel.hora}`;
    if (nombre && telefono) {
      return {
        mensaje: `¡Listo, ${nombre.split(' ')[0]}! Te reservé ${turnoTxt} ✅. Para confirmarla transferí la seña de ${pesos(Math.round(c.precio * 0.3))} al alias ${complejo.sena.alias} dentro de las ${complejo.sena.plazoHoras} horas.`,
        intencion: 'confirmar',
        opciones: [],
        reserva: { ...sel, nombre, telefono },
      };
    }
    const falta = !nombre && !telefono ? 'tu nombre y un teléfono' : !nombre ? 'tu nombre' : 'un teléfono de contacto';
    return {
      mensaje: `¡Buenísimo! ${turnoTxt.charAt(0).toUpperCase() + turnoTxt.slice(1)} está libre 🙌. Para dejarla a tu nombre pasame ${falta} (ej: Juan Pérez, 341 555 1234).`,
      intencion: 'consulta',
      opciones: [],
      reserva: null,
    };
  }

  // 2) Preguntas frecuentes (+ disponibilidad si también la pide)
  const faq = respuestasFrecuentes(t);
  const quiereTurno = pideDisponibilidad(t);
  if (faq.length && !quiereTurno) {
    return { mensaje: faq.join(' '), intencion: 'consulta', opciones: [], reserva: null };
  }
  if (quiereTurno) {
    const p = proponer(t, ctx);
    if (faq.length) p.mensaje = `${faq.join(' ')} ${p.mensaje}`;
    return p;
  }

  // 3) Saludo / ayuda
  return {
    mensaje:
      '¡Hola! Soy el asistente de La Redonda ⚽ (modo demo). Te ayudo a reservar cancha y te respondo sobre precios, seña, vestuarios o estacionamiento. Decime para cuántos son y qué día querés jugar.',
    intencion: 'consulta',
    opciones: [],
    reserva: null,
  };
}
