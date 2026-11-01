import { useEffect, useState } from 'react';
import Chat from './Chat.jsx';
import { precio, relojBA } from '../lib.js';

function Reloj() {
  const [hora, setHora] = useState(relojBA);
  useEffect(() => {
    const t = setInterval(() => setHora(relojBA()), 15000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-score text-lg font-semibold tabular-nums tracking-wider texto-led-verde sm:text-xl">{hora}</span>;
}

function Dato({ titulo, valor }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-[10px]">{titulo}</p>
      <p className="font-score text-base font-semibold tracking-wide text-white sm:text-lg">{valor}</p>
    </div>
  );
}

function Marcador({ info }) {
  const c = info?.complejo;
  const canchas = c?.canchas ?? [1, 2, 3].map((id) => ({ id }));

  return (
    <section className="marcador relative overflow-hidden rounded-3xl p-4 sm:p-6">
      {/* Brillo superior del tablero */}
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-oro-300/70 to-transparent" />

      {/* Barra superior */}
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-oro-300 sm:text-[11px]">
          <span className="animate-latido size-2 rounded-full bg-oro-400 shadow-[0_0_8px_rgb(245_197_66)]" />
          Noche de partido
        </p>
        <Reloj />
      </div>

      {/* Nombre */}
      <div className="mt-3 text-center sm:mt-4">
        <p className="font-score text-xs font-semibold uppercase tracking-[0.5em] text-zinc-400 sm:text-sm">Complejo</p>
        <h1 className="font-display text-[4.2rem] leading-[0.85] tracking-wide sm:text-[5.5rem] lg:text-[6rem]">
          <span className="texto-brillo">LA </span>
          <span className="texto-led-oro">REDONDA</span>
        </h1>
        <p className="mt-2 text-xs text-zinc-400 sm:text-sm">
          📍 {c?.direccion ?? 'Rosario, Santa Fe'}
        </p>
      </div>

      {/* Tablero de canchas, como equipos en el marcador */}
      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        {canchas.map((cancha, i) => (
          <div
            key={cancha.id}
            className="animate-aparecer rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center"
            style={{ animationDelay: `${120 + i * 90}ms` }}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-[10px]">Cancha</p>
            <p className="font-display text-5xl leading-none texto-led-verde sm:text-6xl">{cancha.id}</p>
            <p className="mt-1 text-[11px] font-semibold text-white sm:text-xs">{cancha.tipo ?? '—'}</p>
            <p className="text-[10px] text-zinc-400 sm:text-[11px]">{cancha.techada ? '🏟️ Techada' : '🌙 Descubierta'}</p>
            <p className="mt-2 font-score text-base font-semibold tabular-nums texto-led-oro sm:text-xl">
              {cancha.precio ? precio(cancha.precio) : '—'}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-zinc-500">por hora</p>
          </div>
        ))}
      </div>

      {/* Datos */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-black/40 py-2">
        <Dato titulo="Horario" valor="16 — 24 HS" />
        <Dato titulo="Turnos" valor="1 HORA" />
        <Dato titulo="Seña" valor={`${c?.sena?.porcentaje ?? 30}%`} />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px] sm:text-xs">
        {['🚿 Vestuarios con duchas', '🚗 Estacionamiento gratis', '🎽 Pecheras', '💸 Seña por transferencia'].map((s) => (
          <span key={s} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300">
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function Reservar({ info }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6">
      <div className="lg:sticky lg:top-24">
        <Marcador info={info} />
      </div>
      <Chat info={info} />
    </div>
  );
}
