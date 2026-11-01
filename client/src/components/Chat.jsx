import { useEffect, useRef, useState } from 'react';
import { api, precio, horaFin, horaActualTexto, uid, ESTADOS } from '../lib.js';

const SALUDO = {
  id: 'saludo',
  role: 'assistant',
  content:
    '¡Hola! 👋 Soy el asistente de La Redonda. Decime para cuántos son y qué día querés jugar, y te muestro los turnos libres. También te respondo sobre precios, seña, vestuarios y estacionamiento.',
  hora: horaActualTexto(),
};

const EJEMPLOS = [
  'Somos 10, ¿tenés algo el jueves después de las 20?',
  '¿Cuánto sale la techada?',
  'Somos 14, ¿qué hay para mañana a la noche?',
  '¿Hay vestuarios y estacionamiento?',
  '¿Cómo es lo de la seña?',
  '¿Tenés algo hoy?',
];

// Texto que se manda cuando el cliente toca una tarjeta
const textoEleccion = (op) => `Quiero reservar la ${op.canchaNombre} (${op.tipo}) el ${op.dia} a las ${op.hora}`;

// Lo que ve la IA de cada mensaje: el texto + un resumen de tarjetas/comprobantes mostrados
function paraHistorial(m) {
  let content = m.content;
  if (m.opciones?.length) {
    content += `\n[Opciones mostradas: ${m.opciones.map((o) => `${o.canchaNombre} ${o.fecha} ${o.hora}`).join('; ')}]`;
  }
  if (m.reserva) {
    const r = m.reserva;
    content += `\n[Reserva registrada ${r.codigo}: ${r.canchaNombre} ${r.fecha} ${r.hora} a nombre de ${r.nombre}]`;
  }
  return { role: m.role, content };
}

function TarjetaTurno({ op, onElegir, deshabilitada }) {
  return (
    <button
      type="button"
      onClick={() => onElegir(op)}
      disabled={deshabilitada}
      className="group flex flex-col rounded-2xl border border-lime-400/30 bg-cancha-800 p-3 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:border-lime-400 enabled:hover:bg-cancha-700 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-300">
          {op.canchaNombre} · {op.tipo}
        </span>
        {op.techada && <span className="rounded-full bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">Techada</span>}
      </div>
      <p className="mt-1 font-display text-3xl font-bold leading-none text-white">
        {op.hora}
        <span className="ml-1 text-base font-semibold text-zinc-400">a {horaFin(op.hora)}</span>
      </p>
      <p className="mt-0.5 text-sm capitalize text-zinc-300">{op.dia}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-semibold text-lime-300">{precio(op.precio)}</span>
        <span className="text-xs font-semibold text-lime-400 group-enabled:group-hover:translate-x-0.5">Elegir →</span>
      </div>
    </button>
  );
}

function Comprobante({ reserva, sena }) {
  const estado = ESTADOS[reserva.estado] ?? ESTADOS.pendiente_sena;
  const filas = [
    ['Cancha', `${reserva.canchaNombre} · ${reserva.tipo}`],
    ['Fecha', reserva.dia],
    ['Horario', `${reserva.hora} a ${horaFin(reserva.hora)}`],
    ['A nombre de', reserva.nombre],
    ['Teléfono', reserva.telefono],
  ];
  return (
    <div className="aparecer w-full max-w-sm overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-xl">
      <div className="flex items-center justify-between bg-lime-400 px-4 py-2.5">
        <span className="font-display text-xl font-extrabold uppercase tracking-wide">Reserva registrada</span>
        <span className="text-lg">✅</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-zinc-500">
          Código <span className="font-mono font-bold text-zinc-900">{reserva.codigo}</span>
        </p>
        <dl className="mt-2 space-y-1 text-sm">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative border-t-2 border-dashed border-zinc-300 px-4 py-3 text-sm">
        <span className="absolute -left-2.5 -top-2.5 size-5 rounded-full bg-[#0b141a]" />
        <span className="absolute -right-2.5 -top-2.5 size-5 rounded-full bg-[#0b141a]" />
        <div className="flex justify-between">
          <span className="text-zinc-500">Total</span>
          <span className="font-semibold">{precio(reserva.precio)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Seña ({sena?.porcentaje ?? 30}%)</span>
          <span className="font-bold text-cancha-700">{precio(reserva.sena)}</span>
        </div>
        <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
          Transferí la seña al alias <b className="font-mono text-zinc-900">{sena?.alias ?? 'LAREDONDA.FUTBOL'}</b> dentro de las{' '}
          {sena?.plazoHoras ?? 2} hs para confirmar el turno.
        </p>
        <span className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          {estado.label}
        </span>
      </div>
    </div>
  );
}

function Burbuja({ m, activa, cargando, onElegir, sena }) {
  const esUsuario = m.role === 'user';
  return (
    <div className={`aparecer flex ${esUsuario ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[88%] flex-col gap-2 sm:max-w-[80%] ${esUsuario ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow ${
            esUsuario ? 'rounded-tr-sm bg-[#005c4b] text-white' : 'rounded-tl-sm bg-[#202c33] text-zinc-100'
          }`}
        >
          {m.content}
          <span className="float-right ml-3 mt-1.5 text-[10px] leading-none text-white/45">{m.hora}</span>
        </div>

        {m.opciones?.length > 0 && (
          <div className="grid w-full grid-cols-2 gap-2">
            {m.opciones.map((op) => (
              <TarjetaTurno
                key={`${op.cancha}-${op.fecha}-${op.hora}`}
                op={op}
                onElegir={onElegir}
                deshabilitada={!activa || cargando}
              />
            ))}
          </div>
        )}

        {m.reserva && <Comprobante reserva={m.reserva} sena={sena} />}
      </div>
    </div>
  );
}

function Escribiendo() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-[#202c33] px-4 py-3 shadow">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

export default function Chat({ info }) {
  const [mensajes, setMensajes] = useState([SALUDO]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [mensajes, cargando, error]);

  async function pedirRespuesta(lista) {
    setCargando(true);
    setError(null);
    try {
      const r = await api.chat(lista.map(paraHistorial));
      setMensajes((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: r.mensaje,
          intencion: r.intencion,
          opciones: r.opciones || [],
          reserva: r.reserva || null,
          hora: horaActualTexto(),
        },
      ]);
    } catch (e) {
      setError(e.message || 'No pudimos hablar con el asistente.');
    } finally {
      setCargando(false);
    }
  }

  function enviar(contenido) {
    const limpio = contenido.trim();
    if (!limpio || cargando) return;
    const lista = [...mensajes, { id: uid(), role: 'user', content: limpio, hora: horaActualTexto() }];
    setMensajes(lista);
    setTexto('');
    pedirRespuesta(lista);
    inputRef.current?.focus();
  }

  function reiniciar() {
    setMensajes([{ ...SALUDO, hora: horaActualTexto() }]);
    setError(null);
  }

  const ultimoAsistente = mensajes.findLastIndex((m) => m.role === 'assistant');
  const ultimoEsUsuario = mensajes.at(-1)?.role === 'user';

  return (
    <section className="flex h-[calc(100dvh-5.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0b141a] shadow-2xl shadow-black/40 lg:h-[calc(100dvh-6.5rem)]">
      {/* Cabecera estilo WhatsApp */}
      <div className="flex items-center gap-3 bg-[#202c33] px-4 py-3">
        <div className="relative grid size-10 shrink-0 place-items-center rounded-full bg-lime-400 font-display text-lg font-extrabold text-cancha-950">
          LR
          <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#202c33] bg-lime-400" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">Asistente La Redonda</p>
          <p className={`text-xs ${cargando ? 'text-lime-400' : 'text-zinc-400'}`}>
            {cargando ? 'escribiendo...' : 'en línea · turnos en tiempo real'}
          </p>
        </div>
        <button
          onClick={reiniciar}
          disabled={cargando}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 disabled:opacity-40"
          title="Empezar una conversación nueva"
        >
          ↺ Nuevo chat
        </button>
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="chat-fondo scroll-fino flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
        {mensajes.map((m, i) => (
          <Burbuja
            key={m.id}
            m={m}
            activa={i === ultimoAsistente}
            cargando={cargando}
            onElegir={(op) => enviar(textoEleccion(op))}
            sena={info?.complejo?.sena}
          />
        ))}
        {cargando && <Escribiendo />}
        {error && (
          <div className="aparecer mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-center text-sm text-red-200">
            <span>⚠️ {error}</span>
            {ultimoEsUsuario && (
              <button
                onClick={() => pedirRespuesta(mensajes)}
                className="rounded-lg bg-red-500/25 px-2.5 py-1 text-xs font-semibold hover:bg-red-500/40"
              >
                Reintentar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ejemplos para la demo */}
      <div className="sin-scroll flex gap-2 overflow-x-auto border-t border-white/5 bg-[#111b21] px-3 py-2">
        {EJEMPLOS.map((e) => (
          <button
            key={e}
            onClick={() => enviar(e)}
            disabled={cargando}
            className="shrink-0 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-xs font-medium text-lime-200 transition hover:bg-lime-400/20 disabled:opacity-40"
          >
            {e}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex items-center gap-2 bg-[#202c33] px-3 py-2.5"
      >
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí tu mensaje…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full bg-[#2a3942] px-4 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
          aria-label="Mensaje"
        />
        <button
          type="submit"
          disabled={cargando || !texto.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-lime-400 text-cancha-950 transition hover:bg-lime-300 disabled:opacity-40"
          aria-label="Enviar"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
          </svg>
        </button>
      </form>
    </section>
  );
}
