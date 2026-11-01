// Información fija del complejo. Es la "fuente de verdad" que usa la IA para responder
// y que el backend usa para validar canchas, horarios y precios.

export const complejo = {
  nombre: 'Complejo La Redonda',
  direccion: 'Av. Pellegrini 2450, Rosario, Santa Fe',
  referencia: 'A dos cuadras del Parque Independencia',
  telefono: '+54 9 341 555-0123',
  zonaHoraria: 'America/Argentina/Buenos_Aires',
  horario: {
    apertura: 16,
    cierre: 24,
    duracionTurnoMinutos: 60,
    dias: 'Todos los días, incluidos feriados',
  },
  canchas: [
    {
      id: 1,
      nombre: 'Cancha 1',
      tipo: 'Fútbol 5',
      jugadores: 10,
      techada: true,
      superficie: 'Césped sintético',
      precio: 36000,
      descripcion: 'Fútbol 5 techada e iluminada. Se juega llueva o no.',
    },
    {
      id: 2,
      nombre: 'Cancha 2',
      tipo: 'Fútbol 5',
      jugadores: 10,
      techada: false,
      superficie: 'Césped sintético',
      precio: 30000,
      descripcion: 'Fútbol 5 descubierta con iluminación LED.',
    },
    {
      id: 3,
      nombre: 'Cancha 3',
      tipo: 'Fútbol 7',
      jugadores: 14,
      techada: false,
      superficie: 'Césped sintético',
      precio: 45000,
      descripcion: 'Fútbol 7 descubierta, la más grande del complejo.',
    },
  ],
  sena: {
    porcentaje: 30,
    metodo: 'Transferencia bancaria o Mercado Pago',
    alias: 'LAREDONDA.FUTBOL',
    titular: 'La Redonda SRL',
    plazoHoras: 2,
    detalle:
      'Para confirmar el turno se abona una seña del 30% por transferencia dentro de las 2 horas de hecha la reserva. El resto se paga en el complejo (efectivo, transferencia o débito).',
  },
  servicios: {
    vestuarios: 'Vestuarios para hombres y mujeres con duchas de agua caliente. Sin cargo.',
    estacionamiento: 'Estacionamiento propio y gratuito para 30 autos, con vigilancia. También hay lugar para motos y bicis.',
    pecheras: { precio: 3000, detalle: 'Alquiler de juego de pecheras (2 colores) por $3.000 el turno.' },
    pelota: 'La pelota está incluida en el turno, sin cargo.',
    cantina: {
      horario: 'Abierta todos los días de 16 a 24 hs, igual que las canchas.',
      detalle:
        'Cantina con bebidas frías (agua, gaseosas, aguas saborizadas, isotónicas y cerveza), sándwiches, empanadas y snacks. Los viernes, sábados y domingos hay parrilla (choripán y hamburguesas).',
      espacio: 'Tiene mesas bajo techo con vista a las canchas, para el tercer tiempo.',
      pagos: 'Se paga en efectivo, transferencia o débito.',
    },
  },
  accesibilidad: {
    rampa: 'Hay rampa de acceso desde la vereda y desde el estacionamiento hasta las canchas, sin escalones.',
    bano: 'Hay un baño adaptado para personas en silla de ruedas, junto a los vestuarios.',
    canchas: 'Las tres canchas están a nivel del piso, sin escalones para entrar, y los pasillos entre canchas son anchos.',
    estacionamiento: 'Hay 2 lugares de estacionamiento reservados para personas con discapacidad, al lado de la entrada.',
  },
  politicas: {
    cancelacion:
      'Cancelando con más de 24 hs de anticipación se devuelve la seña completa o se pasa a otra fecha. Con menos de 24 hs la seña no se devuelve, pero se puede usar como crédito para otro turno dentro de los 7 días. Para cancelar hay que avisar por WhatsApp.',
    lluvia:
      'La Cancha 1 es techada y se juega igual. Si llueve y la reserva es en una cancha descubierta (Cancha 2 o 3), se puede pasar a la techada si está libre, o reprogramar sin cargo y la seña queda para la nueva fecha. La decisión de suspender por lluvia la toma el encargado hasta 1 hora antes del turno y se avisa por WhatsApp.',
    tolerancia: 'Hay 10 minutos de tolerancia. El turno termina a la hora pactada.',
  },
};

// Horarios de inicio de los turnos: 16:00, 17:00, ..., 23:00 (el último termina a las 24).
export const HORAS = Array.from(
  { length: complejo.horario.cierre - complejo.horario.apertura },
  (_, i) => `${String(complejo.horario.apertura + i).padStart(2, '0')}:00`
);
