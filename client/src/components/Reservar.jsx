import Chat from './Chat.jsx';
import { precio } from '../lib.js';

function Hero({ info }) {
  const c = info?.complejo;
  return (
    <section className="cesped relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-cancha-700 via-cancha-800 to-cancha-900 p-4 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-lime-300">Rosario · Fútbol 5 y 7</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold uppercase leading-[0.9] sm:text-5xl">
        Complejo <span className="text-lime-400">La Redonda</span>
      </h1>
      <p className="mt-2 text-sm text-zinc-300">
        📍 {c?.direccion ?? 'Rosario, Santa Fe'} <span className="text-zinc-500">·</span> 🕓 16 a 24 hs
      </p>
      <p className="mt-3 hidden text-sm text-zinc-300 sm:block">
        Reservá en segundos hablando con nuestro asistente: entiende lo que necesitás y te muestra los turnos libres en tiempo real.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-1">
        {(c?.canchas ?? [1, 2, 3].map((id) => ({ id }))).map((cancha) => (
          <div
            key={cancha.id}
            className="flex flex-col justify-between gap-1 rounded-2xl border border-white/10 bg-cancha-950/50 p-3 lg:flex-row lg:items-center"
          >
            <div className="min-w-0">
              <p className="font-display text-lg font-bold uppercase leading-none">{cancha.nombre ?? '···'}</p>
              <p className="mt-1 text-[11px] text-zinc-400 sm:text-xs">
                {cancha.tipo ?? '—'}
                <span className="hidden sm:inline"> · {cancha.techada ? '🏠 Techada' : '☀️ Descubierta'}</span>
                <span className="sm:hidden">{cancha.techada ? ' · 🏠' : ''}</span>
              </p>
            </div>
            <p className="font-display text-xl font-bold text-lime-300 lg:text-2xl">
              {cancha.precio ? precio(cancha.precio) : '—'}
              <span className="ml-0.5 font-sans text-[10px] font-medium text-zinc-400">/h</span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        {['🚿 Vestuarios con duchas', '🚗 Estacionamiento gratis', '🎽 Pecheras', `💸 Seña ${c?.sena?.porcentaje ?? 30}% por transferencia`].map((s) => (
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="lg:sticky lg:top-20">
        <Hero info={info} />
      </div>
      <Chat info={info} />
    </div>
  );
}
