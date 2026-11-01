// "Modo demo": respuestas simuladas con reglas simples, para probar la UI y el deploy sin API key.
// Devuelve el mismo formato JSON que la IA.

import { complejo } from '../data/complejo.js';
import { libres, getCancha, normalizarHora, validarTurno, alternativas } from './reservas.js';
import { fechaLarga } from './fechas.js';
import { normalizarTexto, AFIRMA as AFIRMA_INFORMAL, NIEGA } from './comprension.js';

const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pesos = (n) => `$${n.toLocaleString('es-AR')}`;
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MARCA_CONFIRMADA = 'Reserva registrada';

// "Elijo la Cancha 1 (Fútbol 5) el jueves 05/11 a las 21:00"
export function parsearSeleccion(texto, ctx) {
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

export function parsearDatos(texto, permitirSoloNombre) {
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
  } else if (/techad|techo/.test(t) && !/(llueve|lluvia)/.test(t)) {
    r.push(`Sí, la ${c1.nombre} es ${c1.tipo} techada, así que se juega llueva o no.`);
  }
  if (/(llueve|lluvia|llover|tormenta)/.test(t)) r.push(complejo.politicas.lluvia);
  const a = complejo.accesibilidad;
  if (/(silla de ruedas|accesib|discapacid|rampa|movilidad reducida|escalon|adaptad|muleta)/.test(t)) {
    r.push(`¡Sí! ${a.rampa} ${a.bano} ${a.canchas} ${a.estacionamiento}`);
  } else if (/\bbanos?\b/.test(t)) {
    r.push(`Sí, hay baños junto a los vestuarios. ${a.bano}`);
  }
  if (/(sena|transferencia|pago|pagar|abonar|alias)/.test(t) && !/cancel/.test(t))
    r.push(`${complejo.sena.detalle} Alias: ${complejo.sena.alias} (${complejo.sena.titular}).`);
  if (/(vestuario|ducha|cambiar)/.test(t)) r.push(complejo.servicios.vestuarios);
  if (/(estacion|auto|moto)/.test(t)) r.push(complejo.servicios.estacionamiento);
  if (/pechera/.test(t)) r.push(complejo.servicios.pecheras.detalle);
  if (/(direccion|donde|ubicacion|llegar|queda)/.test(t)) r.push(`Estamos en ${complejo.direccion}, ${complejo.referencia.toLowerCase()}.`);
  if (/cancel/.test(t) || (/suspend/.test(t) && !/(llueve|lluvia|llover|tormenta)/.test(t))) r.push(complejo.politicas.cancelacion);
  const cantina = complejo.servicios.cantina;
  if (/(cantina|buffet|comer|comida|bebida|parrilla|cerveza|tercer tiempo|chori|empanada|tomar algo)/.test(t))
    r.push(`${cantina.detalle} ${cantina.horario} ${cantina.espacio}`);
  if (/(abren|cierran|horario de atencion)/.test(t)) r.push(`Abrimos ${complejo.horario.dias.toLowerCase()}, de 16 a 24 hs, con turnos de 1 hora.`);
  return r;
}

// Señales claras de que quiere turnos (sin palabras ambiguas como "cancha")
const pideTurnosExplicito = (t) =>
  /(somos\s*\d|turno|reserv|libre|disponib|tenes algo|hay algo|hay lugar|(quiero|queremos|para) jugar|\d{1,2}\s*(hs|:00))/.test(t);

const pideDisponibilidad = (t) =>
  /(somos|turno|reserv|cancha|libre|disponib|tenes algo|hay algo|hay lugar|jugar|partido|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|a la noche|a la tarde|despues de|\d{1,2}\s*(hs|:00))/.test(t);

function proponer(t, ctx) {
  // Día
  let fecha = null;
  const dd = t.match(/(\d{1,2})\/(\d{1,2})/);
  if (/\bhoy\b/.test(t)) fecha = ctx.hoy;
  else if (/pasado manana/.test(t)) fecha = ctx.dias[2].fecha;
  else if (/\bmanana\b/.test(t) && !/por la manana/.test(t)) fecha = ctx.dias[1].fecha;
  else if (/fin de semana/.test(t)) {
    // El próximo sábado o domingo que todavía tenga turnos libres
    fecha = ctx.dias.find((x) => /^(sabado|domingo)/.test(sinAcentos(x.etiqueta)) && ctx.libres.some((l) => l.fecha === x.fecha))?.fecha ?? null;
  }
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
  } else if (/nochecita/.test(t)) { horaDesde = 20; horaHasta = 22; }
  else if (/(a la noche|de noche)/.test(t)) horaDesde = 20;
  else if (/tardecita/.test(t)) { horaDesde = 18; horaHasta = 20; }
  else if (/(laburar|trabajar|laburo|trabajo)/.test(t)) horaDesde = 19;
  else if (/a la tarde/.test(t)) horaHasta = 20;

  // Cancha según jugadores / preferencias
  let canchas = null;
  let tipoTxt = '';
  const mj = t.match(/somos\s*(\d{1,2})/) || t.match(/(\d{1,2})\s*(jugadores|personas|pibes|chicos|chicas)/);
  if (/techad|techo/.test(t)) { canchas = [1]; tipoTxt = ' en la techada'; }
  else if (/(futbol 7|f7)/.test(t) || (mj && Number(mj[1]) > 10)) { canchas = [3]; tipoTxt = ' de fútbol 7'; }
  else if (/(futbol 5|f5)/.test(t) || mj) { canchas = [1, 2]; tipoTxt = ' de fútbol 5'; }

  // Pidió una cancha y un horario puntual ("¿tenés la cancha 1 mañana a las 20?"): si está ocupado, alternativas
  const mc = t.match(/cancha\s*(\d)/);
  const horaPuntual = t.match(/\ba las (\d{1,2})\b/);
  if (mc && getCancha(mc[1]) && horaPuntual) {
    let h = Number(horaPuntual[1]);
    if (h < 12) h += 12;
    const pedido = { cancha: Number(mc[1]), fecha: fecha || ctx.hoy, hora: `${h}:00` };
    const v = validarTurno(pedido);
    if (v.ok) {
      return {
        mensaje: `¡Sí! La ${getCancha(pedido.cancha).nombre} el ${fechaLarga(pedido.fecha)} a las ${v.turno.hora} está libre 🙌. Tocala para reservarla 👇`,
        intencion: 'proponer',
        opciones: [v.turno],
        reserva: null,
      };
    }
    const alt = alternativas(pedido, 6);
    return {
      mensaje: `Uy, ${v.error} 😕. ${alt.length ? 'Te dejo lo más cercano que tengo libre 👇' : '¿Probamos otro día?'}`,
      intencion: alt.length ? 'proponer' : 'consulta',
      opciones: alt,
      reserva: null,
    };
  }

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

// ---------- Cancelar / cambiar una reserva existente ----------

const QUIERE_CANCELAR = /(cancel\w* (mi|la|el|esa) (reserva|turno)|(quiero|quisiera|necesito|tengo que|hay que) cancelar|cancelame|cancelala|anular (mi|la) reserva|dar de baja (mi|la) reserva)/;
const QUIERE_CAMBIAR = /((cambiar|mover|pasar|reprogramar|modificar) (mi|la|el|esa) (reserva|turno)|(quiero|quisiera|necesito|tengo que) (cambiar|mover|reprogramar)|cambiame|cambiarla|moverla|pasarla)/;
const MARCA_GESTION = /\[Reserva (cancelada|modificada)/;

// ¿Hay un pedido de CAMBIO sin resolver en la conversación? Devuelve el índice del mensaje o -1.
export function indicePedidoCambio(historial) {
  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i];
    if (m.role === 'assistant' && MARCA_GESTION.test(m.content)) return -1;
    if (m.role === 'user' && QUIERE_CAMBIAR.test(sinAcentos(m.content))) return i;
  }
  return -1;
}
// "sí" informal: dale, ok, joya, de una, va, 👍... (y que no sea un "no")
const AFIRMA = { test: (t) => AFIRMA_INFORMAL.test(t) && !NIEGA.test(t) };
const DIA_U_HORA = /(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|a la noche|a la tarde|\d{1,2}\s*(hs|:00)|las \d{1,2})/;

function gestionDemo(historial, ctx, t) {
  // Último pedido de cancelar/cambiar del cliente que todavía no se resolvió
  let idx = -1;
  let tipo = null;
  for (let i = historial.length - 1; i >= 0; i--) {
    const m = historial[i];
    if (m.role === 'assistant' && MARCA_GESTION.test(m.content)) break;
    if (m.role !== 'user') continue;
    const s = sinAcentos(m.content);
    if (QUIERE_CANCELAR.test(s)) { idx = i; tipo = 'cancelar'; break; }
    if (QUIERE_CAMBIAR.test(s)) { idx = i; tipo = 'cambiar'; break; }
  }
  if (!tipo || historial.length - 1 - idx > 8) return null;

  const base = { opciones: [], reserva: null };
  if (!ctx.telefonos.length) {
    return { ...base, intencion: 'consulta', mensaje: `Dale, te ayudo a ${tipo} tu reserva. ¿Me pasás el teléfono con el que reservaste?` };
  }
  if (!ctx.reservasCliente.length) {
    return { ...base, intencion: 'consulta', mensaje: `No encontré reservas activas con el teléfono ${ctx.telefonos.at(-1)} 🤔. ¿Lo revisás? Tiene que ser el mismo con el que reservaste.` };
  }

  // ¿Cuál? Por código si lo dijo; si tiene una sola, esa
  const textoCliente = historial.slice(idx).filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const mc = textoCliente.match(/LR-?\s?(\d{1,4})/i);
  let r = mc ? ctx.reservasCliente.find((x) => x.id === Number(mc[1])) : null;
  if (!r && ctx.reservasCliente.length === 1) r = ctx.reservasCliente[0];
  const desc = (x) => `${x.codigo}: ${x.canchaNombre} (${x.tipo}) el ${x.dia} a las ${x.hora}`;
  if (!r) {
    return {
      ...base,
      intencion: 'consulta',
      mensaje: `Tenés ${ctx.reservasCliente.length} reservas: ${ctx.reservasCliente.map(desc).join(' · ')}. ¿Cuál querés ${tipo}? Pasame el código (ej: ${ctx.reservasCliente[0].codigo}).`,
    };
  }

  if (tipo === 'cancelar') {
    const anterior = [...historial.slice(0, -1)].reverse().find((m) => m.role === 'assistant')?.content || '';
    if (AFIRMA.test(t) && /confirmas que la cancelo/.test(sinAcentos(anterior))) {
      return {
        ...base,
        intencion: 'confirmar',
        mensaje: `Listo, cancelé tu reserva ${desc(r)}. ${complejo.politicas.cancelacion.split('. ').slice(0, 2).join('. ')}.`,
        gestion: { tipo: 'cancelar', codigo: r.codigo },
      };
    }
    return {
      ...base,
      intencion: 'consulta',
      mensaje: `Encontré tu reserva ${desc(r)}. ¿Confirmás que la cancelo? Respondé "sí" 👍`,
    };
  }

  // Cambiar: si ya eligió el nuevo horario, lo aplicamos; si no, proponemos
  const sel = parsearSeleccion(historial.at(-1).content, ctx);
  if (sel) {
    const c = getCancha(sel.cancha);
    return {
      ...base,
      intencion: 'confirmar',
      mensaje: `¡Listo! Pasé tu reserva ${r.codigo} a la ${c.nombre} (${c.tipo}) el ${fechaLarga(sel.fecha)} a las ${sel.hora} ✅. La seña queda para el nuevo horario.`,
      gestion: { tipo: 'cambiar', codigo: r.codigo, nueva: sel },
    };
  }
  const mismoTipo = complejo.canchas.filter((x) => x.tipo === r.tipo).map((x) => x.id);
  // Si ya dijo a qué horario pasarla (en un mensaje posterior al pedido), buscamos eso;
  // si no nombra el día, se entiende que es el mismo día de la reserva.
  const ultimoEsPedido = idx === historial.length - 1;
  const nombraDia = /(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}\/\d{1,2})/.test(t);
  const consulta = nombraDia ? t : `${t} ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)}`;
  const p = !ultimoEsPedido && DIA_U_HORA.test(t) ? proponer(consulta, ctx) : null;
  // Para un cambio ofrecemos canchas del mismo tipo (fútbol 5 → fútbol 5)
  const propuestas = (p?.opciones || []).filter((o) => mismoTipo.includes(o.cancha));
  const opciones = propuestas.length ? propuestas : libres({ fechas: [r.fecha], canchas: mismoTipo }).slice(0, 6);
  return {
    ...base,
    intencion: opciones.length ? 'proponer' : 'consulta',
    opciones,
    mensaje: opciones.length
      ? propuestas.length
        ? `Dale, para pasar tu reserva ${r.codigo} tengo estos horarios libres. Tocá el que prefieras 👇`
        : `Encontré tu reserva ${desc(r)}. ¿A qué horario la querés pasar? Estos están libres 👇`
      : `Encontré tu reserva ${desc(r)}, pero ese día no quedan horarios libres. ¿Probamos otro día?`,
  };
}

export function respuestaDemo(historial, ctx) {
  const ultimo = historial.at(-1).content;
  const t = normalizarTexto(ultimo);

  // 0) Cancelar o cambiar una reserva existente
  const gestion = gestionDemo(historial, ctx, t);
  if (gestion) return gestion;

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

  // 2) Primero se responde la pregunta; turnos solo si los pidió explícitamente
  const faq = respuestasFrecuentes(t);
  // Si hay una pregunta frecuente, "cancha" o "partido" solos no alcanzan para tirar turnos
  const quiereTurno = faq.length ? pideTurnosExplicito(t) : pideDisponibilidad(t);
  if (faq.length && !quiereTurno) {
    return { mensaje: `${faq.join(' ')} ¿Querés que te muestre turnos libres?`, intencion: 'consulta', opciones: [], reserva: null };
  }
  if (quiereTurno) {
    const p = proponer(t, ctx);
    if (faq.length) p.mensaje = `${faq.join(' ')} ${p.mensaje}`;
    return p;
  }

  // Pregunta que no está en la info: no inventamos, se consulta con el encargado
  const esSaludo = /^\s*(hola|buenas|buen dia|buenos dias|que tal|como (andas|estas|va))\b/.test(t) && t.length < 40;
  if (ultimo.includes('?') && !esSaludo) {
    return {
      mensaje: `Eso no lo tengo confirmado, lo consulto con el encargado y te aviso 🙌. Si querés, también podés escribir al ${complejo.telefono}. ¿Te muestro turnos libres mientras tanto?`,
      intencion: 'consulta',
      opciones: [],
      reserva: null,
      consulta_encargado: { pregunta: ultimo },
    };
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
