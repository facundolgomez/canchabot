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
  '¿Tenés la cancha 1 mañana a las 20?',
  '¿Es accesible para silla de ruedas?',
  'Quiero cancelar mi reserva',
  'Necesito cambiar mi reserva',
  '¿Cómo es lo de la seña?',
];

// Color del fondo del chat, para los "troqueles" del comprobante
const FONDO_CHAT = '#060b14';

// Texto que se manda cuando el cliente toca una tarjeta (neutro: sirve para reservar o para cambiar)
const textoEleccion = (op) => `Elijo la ${op.canchaNombre} (${op.tipo}) el ${op.dia} a las ${op.hora}`;

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
  if (m.gestion) {
    const r = m.gestion.reserva;
    content +=
      m.gestion.tipo === 'cancelar'
        ? `\n[Reserva cancelada ${r.codigo}]`
        : `\n[Reserva modificada ${r.codigo}: ahora ${r.canchaNombre} ${r.fecha} ${r.hora}]`;
  }
  if (m.consulta) content += `\n[Consulta derivada al encargado: ${m.consulta.pregunta}]`;
  return { role: m.role, content };
}

function TarjetaTurno({ op, onElegir, deshabilitada, indice }) {
  return (
    <button
      type="button"
      onClick={() => onElegir(op)}
      disabled={deshabilitada}
      style={{ animationDelay: `${indice * 70}ms` }}
      className="glass glow-hover animate-aparecer group relative flex flex-col overflow-hidden rounded-2xl p-3 text-left enabled:hover:-translate-y-0.5 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {/* Línea de luz superior */}
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-cesped-400/60 to-transparent opacity-0 transition-opacity group-enabled:group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {op.canchaNombre} · {op.tipo}
        </span>
        {op.techada && (
          <span className="rounded-full bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-300">Techada</span>
        )}
      </div>
      <p className="mt-1 font-display text-4xl leading-none tracking-wide text-white">
        {op.hora}
        <span className="ml-1.5 font-score text-sm font-medium text-zinc-500">a {horaFin(op.hora)}</span>
      </p>
      <p className="mt-0.5 text-sm capitalize text-zinc-300">{op.dia}</p>
      <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2">
        <span className="font-score text-base font-semibold text-oro-300">{precio(op.precio)}</span>
        <span className="text-xs font-semibold text-cesped-400 transition-transform group-enabled:group-hover:translate-x-0.5">Elegir →</span>
      </div>
    </button>
  );
}

const jugadoresDe = (r) => r.jugadores || (String(r.tipo).includes('7') ? 14 : 10);
const porJugador = (r) => Math.ceil(r.precio / jugadoresDe(r) / 10) * 10;

function textoParaGrupo(r, complejo) {
  return [
    '⚽ ¡Tenemos cancha!',
    `📅 ${r.dia.charAt(0).toUpperCase() + r.dia.slice(1)} · ${r.hora} a ${horaFin(r.hora)}`,
    `🏟️ ${r.canchaNombre} (${r.tipo}) — ${complejo?.nombre ?? 'Complejo La Redonda'}`,
    complejo?.direccion ? `📍 ${complejo.direccion}` : null,
    `💰 ${precio(r.precio)} en total → ${precio(porJugador(r))} por jugador (somos ${jugadoresDe(r)})`,
    `🔖 Reserva ${r.codigo}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function TarjetaCancelada({ gestion }) {
  const r = gestion.reserva;
  const sena =
    r.estadoPrevio === 'pendiente_sena'
      ? 'La seña no estaba pagada: no hay nada que devolver.'
      : r.senaComoCredito
        ? `La seña de ${precio(r.sena)} queda como crédito por 7 días.`
        : `Se devuelve la seña de ${precio(r.sena)}.`;
  return (
    <div className="animate-aparecer w-full max-w-sm overflow-hidden rounded-2xl border border-red-400/30 bg-gradient-to-b from-noche-800 to-noche-950">
      <div className="flex items-center justify-between bg-red-500/15 px-4 py-2">
        <p className="font-display text-2xl tracking-wide text-red-200">Reserva cancelada</p>
        <span className="font-score text-sm font-semibold tracking-widest text-red-300">{r.codigo}</span>
      </div>
      <div className="space-y-1 px-4 py-3 text-sm">
        <p className="capitalize text-zinc-300 line-through decoration-red-400/60">
          {r.canchaNombre} · {r.dia} · {r.hora} a {horaFin(r.hora)}
        </p>
        <p className="text-xs text-zinc-400">{sena}</p>
      </div>
    </div>
  );
}

function Comprobante({ reserva, complejo, anterior = null }) {
  const sena = complejo?.sena;
  const alias = sena?.alias ?? 'LAREDONDA.FUTBOL';
  const estado = ESTADOS[reserva.estado] ?? ESTADOS.pendiente_sena;
  const senaPagada = reserva.estado === 'confirmada';
  const [aliasCopiado, setAliasCopiado] = useState(false);

  async function copiarAlias() {
    try {
      await navigator.clipboard.writeText(alias);
      setAliasCopiado(true);
      setTimeout(() => setAliasCopiado(false), 1800);
    } catch {
      /* sin portapapeles: el alias queda visible igual */
    }
  }

  const filas = [
    ['Cancha', `${reserva.canchaNombre} · ${reserva.tipo}`],
    ['Fecha', reserva.dia],
    ['Horario', `${reserva.hora} a ${horaFin(reserva.hora)}`],
    ['A nombre de', reserva.nombre],
    ['Teléfono', reserva.telefono],
  ];
  return (
    <div className="animate-aparecer relative w-full max-w-sm overflow-hidden rounded-2xl border border-oro-400/35 bg-gradient-to-b from-noche-800 to-noche-950 shadow-[0_0_40px_-12px_rgb(245_197_66/0.45)]">
      {/* Cabecera tipo entrada */}
      <div className="flex items-center justify-between bg-gradient-to-r from-oro-300 via-oro-400 to-oro-500 px-4 py-2 text-noche-950">
        <div className="leading-none">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] opacity-70">Entrada · La Redonda</p>
          <p className="font-display text-2xl tracking-wide">{anterior ? 'Reserva modificada' : 'Reserva registrada'}</p>
        </div>
        <span className="grid size-8 place-items-center rounded-full bg-noche-950 text-sm text-oro-300">{anterior ? '↻' : '✓'}</span>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-end justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Código</p>
          <p className="font-score text-xl font-semibold tracking-widest texto-led-oro">{reserva.codigo}</p>
        </div>
        {anterior && (
          <p className="mt-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400">
            Antes:{' '}
            <span className="line-through">
              {anterior.canchaNombre} · {anterior.dia} · {anterior.hora}
            </span>
          </p>
        )}
        <dl className="mt-2 space-y-1.5 text-sm">
          {filas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="text-right font-semibold capitalize text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Troquel */}
      <div className="relative border-t border-dashed border-white/20">
        <span className="absolute -left-3 -top-3 size-6 rounded-full" style={{ background: FONDO_CHAT }} />
        <span className="absolute -right-3 -top-3 size-6 rounded-full" style={{ background: FONDO_CHAT }} />
      </div>

      <div className="space-y-1 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Total del turno</span>
          <span className="font-score font-semibold text-white">{precio(reserva.precio)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Por jugador ({jugadoresDe(reserva)})</span>
          <span className="font-score font-semibold text-cesped-300">{precio(porJugador(reserva))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Seña ({sena?.porcentaje ?? 30}%)</span>
          <span className="font-score text-lg font-semibold text-oro-300">{precio(reserva.sena)}</span>
        </div>

        {senaPagada ? (
          <p className="mt-2 rounded-xl border border-cesped-400/20 bg-cesped-400/10 px-3 py-2 text-xs text-cesped-200">
            ✓ Seña pagada. ¡Nos vemos en la cancha!
          </p>
        ) : (
          <div className="mt-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2 text-xs text-zinc-400">
            Transferí la seña dentro de las {sena?.plazoHoras ?? 2} hs al alias:
            <button
              type="button"
              onClick={copiarAlias}
              className="mt-1.5 flex w-full items-center justify-between rounded-lg border border-oro-400/30 bg-oro-400/10 px-2.5 py-1.5 font-mono text-sm font-bold text-oro-200 transition hover:bg-oro-400/20"
            >
              {alias}
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-oro-300">
                {aliasCopiado ? '✓ Copiado' : 'Copiar'}
              </span>
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${estado.badge}`}>{estado.label}</span>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(textoParaGrupo(reserva, complejo))}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-b from-cesped-400 to-cesped-600 px-3 py-1.5 text-xs font-semibold text-noche-950 shadow-[0_0_16px_-4px_rgb(34_227_107/0.8)] transition hover:brightness-110"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" />
            </svg>
            Compartir con el grupo
          </a>
        </div>
      </div>
    </div>
  );
}

function Burbuja({ m, activa, cargando, onElegir, complejo }) {
  const esUsuario = m.role === 'user';
  return (
    <div className={`animate-aparecer flex ${esUsuario ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[90%] flex-col gap-2 sm:max-w-[82%] ${esUsuario ? 'items-end' : 'items-start'}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
            esUsuario ? 'burbuja-usuario rounded-tr-md text-white' : 'burbuja-bot rounded-tl-md text-zinc-100'
          }`}
        >
          {m.content}
          <span className={`float-right ml-3 mt-1.5 text-[10px] leading-none ${esUsuario ? 'text-white/60' : 'text-zinc-500'}`}>
            {m.hora}
            {esUsuario && <span className="ml-1 text-cesped-300">✓✓</span>}
          </span>
        </div>

        {m.opciones?.length > 0 && (
          <div className="grid w-full grid-cols-2 gap-2">
            {m.opciones.map((op, i) => (
              <TarjetaTurno
                key={`${op.cancha}-${op.fecha}-${op.hora}`}
                op={op}
                indice={i}
                onElegir={onElegir}
                deshabilitada={!activa || cargando}
              />
            ))}
          </div>
        )}

        {m.reserva && <Comprobante reserva={m.reserva} complejo={complejo} />}
        {m.gestion?.tipo === 'cambiar' && (
          <Comprobante reserva={m.gestion.reserva} complejo={complejo} anterior={m.gestion.anterior || m.gestion.reserva.anterior} />
        )}
        {m.gestion?.tipo === 'cancelar' && <TarjetaCancelada gestion={m.gestion} />}
        {m.consulta && (
          <p className="animate-aparecer flex items-center gap-1.5 rounded-full border border-oro-400/25 bg-oro-400/10 px-3 py-1 text-[11px] font-medium text-oro-200">
            📨 Le pasé tu consulta al encargado
          </p>
        )}
      </div>
    </div>
  );
}

function Escribiendo() {
  return (
    <div className="animate-aparecer flex justify-start">
      <div className="burbuja-bot flex items-center gap-1 rounded-2xl rounded-tl-md px-4 py-3">
        {[0, 150, 300].map((d) => (
          <span key={d} className="size-2 animate-bounce rounded-full bg-cesped-400/80" style={{ animationDelay: `${d}ms` }} />
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
          gestion: r.gestion || null,
          consulta: r.consulta || null,
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
    <section className="glass-fuerte flex h-[calc(100dvh-5.5rem)] min-h-[520px] flex-col overflow-hidden rounded-3xl lg:h-[calc(100dvh-7.5rem)]">
      {/* Cabecera */}
      <div className="relative flex items-center gap-3 border-b border-white/5 bg-gradient-to-r from-noche-800/95 via-noche-900/95 to-noche-800/95 px-4 py-3">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cesped-400/40 to-transparent" />
        <div className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cesped-400 to-cesped-700 font-display text-xl tracking-wide text-noche-950 ring-2 ring-oro-400/60 shadow-[0_0_20px_-4px_rgb(34_227_107/0.7)]">
          LR
          <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-noche-900 bg-cesped-400" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold text-white">Asistente La Redonda</p>
          <p className={`text-xs transition-colors ${cargando ? 'text-cesped-400' : 'text-zinc-400'}`}>
            {cargando ? 'escribiendo...' : 'en línea · turnos en tiempo real'}
          </p>
        </div>
        <button
          onClick={reiniciar}
          disabled={cargando}
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/5 disabled:opacity-40"
          title="Empezar una conversación nueva"
        >
          ↺ <span className="hidden sm:inline">Nuevo chat</span>
        </button>
      </div>

      {/* Mensajes */}
      <div
        ref={scrollRef}
        className="chat-fondo scroll-fino flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5"
        style={{ backgroundColor: FONDO_CHAT }}
        aria-live="polite"
      >
        {mensajes.map((m, i) => (
          <Burbuja
            key={m.id}
            m={m}
            activa={i === ultimoAsistente}
            cargando={cargando}
            onElegir={(op) => enviar(textoEleccion(op))}
            complejo={info?.complejo}
          />
        ))}
        {cargando && <Escribiendo />}
        {error && (
          <div className="animate-aparecer mx-auto flex max-w-md flex-wrap items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-200 backdrop-blur">
            <span>⚠️ {error}</span>
            {ultimoEsUsuario && (
              <button
                onClick={() => pedirRespuesta(mensajes)}
                className="rounded-full bg-red-500/25 px-3 py-1 text-xs font-semibold hover:bg-red-500/40"
              >
                Reintentar
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ejemplos para la demo */}
      <div className="sin-scroll flex gap-2 overflow-x-auto border-t border-white/5 bg-noche-950/80 px-3 py-2">
        {EJEMPLOS.map((e) => (
          <button
            key={e}
            onClick={() => enviar(e)}
            disabled={cargando}
            className="glow-hover shrink-0 rounded-full border border-cesped-400/25 bg-cesped-400/[0.07] px-3 py-1.5 text-xs font-medium text-cesped-300 hover:bg-cesped-400/15 disabled:opacity-40"
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
        className="flex items-center gap-2 border-t border-white/5 bg-noche-900/95 px-3 py-2.5"
      >
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí tu mensaje…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2.5 text-base text-zinc-100 transition placeholder:text-zinc-500 focus:border-cesped-400/50 focus:outline-none focus:ring-2 focus:ring-cesped-400/30 sm:text-[15px]"
          aria-label="Mensaje"
        />
        <button
          type="submit"
          disabled={cargando || !texto.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-b from-cesped-400 to-cesped-600 text-noche-950 shadow-[0_0_18px_-4px_rgb(34_227_107/0.8)] transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-35 disabled:shadow-none"
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
