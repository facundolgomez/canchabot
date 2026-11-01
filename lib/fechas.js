// Utilidades de fecha siempre en hora de Argentina, sin importar la zona del servidor.

export const TZ = 'America/Argentina/Buenos_Aires';

export const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Devuelve { fecha: 'YYYY-MM-DD', hora: 0-23, minuto, texto }
export function ahoraBA() {
  const partes = Object.fromEntries(
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
      .map((p) => [p.type, p.value])
  );
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  const hora = Number(partes.hour) % 24;
  const minuto = Number(partes.minute);
  const texto = `${fechaLarga(fecha)} de ${partes.year}, ${String(hora).padStart(2, '0')}:${partes.minute} hs`;
  return { fecha, hora, minuto, texto };
}

export function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diaSemana(fecha) {
  return DIAS_SEMANA[new Date(`${fecha}T12:00:00Z`).getUTCDay()];
}

// 'jueves 05/11'
export function fechaLarga(fecha) {
  const [, mm, dd] = fecha.split('-');
  return `${diaSemana(fecha)} ${dd}/${mm}`;
}

// Hoy + los próximos `cantidad` días.
export function proximosDias(cantidad = 7) {
  const { fecha: hoy } = ahoraBA();
  return Array.from({ length: cantidad + 1 }, (_, i) => {
    const fecha = sumarDias(hoy, i);
    return {
      fecha,
      dia: diaSemana(fecha),
      etiqueta: fechaLarga(fecha),
      relativo: i === 0 ? 'hoy' : i === 1 ? 'mañana' : null,
    };
  });
}
