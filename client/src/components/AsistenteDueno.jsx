import { useEffect, useState } from 'react';
import { api, precio, fechaLarga } from '../lib.js';

// ---------- Utilidades ----------

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Respaldo para http sin contexto seguro
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// Estado típico de una llamada a la IA
function useLlamada() {
  const [estado, setEstado] = useState({ cargando: false, error: null, datos: null });
  async function ejecutar(fn) {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const datos = await fn();
      setEstado({ cargando: false, error: null, datos });
    } catch (err) {
      setEstado((e) => ({ ...e, cargando: false, error: err.message }));
    }
  }
  const limpiar = () => setEstado({ cargando: false, error: null, datos: null });
  return [estado, ejecutar, limpiar];
}

// ---------- Piezas visuales ----------

function BotonIA({ icono, titulo, detalle, onClick, cargando, acento }) {
  const verde = acento === 'verde';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      className="glass glow-hover group relative flex items-center gap-3 overflow-hidden rounded-2xl p-4 text-left enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:cursor-wait"
    >
      <span className={`pointer-events-none absolute -right-8 -top-8 size-28 rounded-full blur-2xl ${verde ? 'bg-cesped-400/20' : 'bg-oro-400/20'}`} />
      <span
        className={`relative grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ring-1 ${
          verde ? 'bg-cesped-400/15 ring-cesped-400/40' : 'bg-oro-400/15 ring-oro-400/40'
        }`}
      >
        {cargando ? <span className={`size-5 animate-spin rounded-full border-2 border-t-transparent ${verde ? 'border-cesped-300' : 'border-oro-300'}`} /> : icono}
      </span>
      <span className="relative min-w-0">
        <span className="flex items-center gap-2 font-display text-2xl leading-none tracking-wide text-white">
          {titulo}
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-widest text-zinc-300">IA</span>
        </span>
        <span className="mt-1 block text-xs text-zinc-400">{cargando ? 'La IA está trabajando…' : detalle}</span>
      </span>
    </button>
  );
}

function ErrorIA({ mensaje, onReintentar }) {
  return (
    <div className="animate-aparecer flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur">
      <span>⚠️ {mensaje}</span>
      <button onClick={onReintentar} className="rounded-full bg-red-500/25 px-3 py-1 text-xs font-semibold hover:bg-red-500/40">
        Reintentar
      </button>
    </div>
  );
}

function Esqueleto({ alto = 'h-56' }) {
  return (
    <div className={`glass ${alto} relative overflow-hidden rounded-3xl`}>
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div className="space-y-3 p-5">
        <div className="h-6 w-1/2 rounded-lg bg-white/10" />
        <div className="h-4 w-5/6 rounded bg-white/5" />
        <div className="h-4 w-2/3 rounded bg-white/5" />
        <div className="h-4 w-3/4 rounded bg-white/5" />
      </div>
    </div>
  );
}

function BadgeModo({ modo }) {
  return modo === 'demo' ? (
    <span className="rounded-full bg-oro-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-oro-300">Demo</span>
  ) : (
    <span className="rounded-full bg-cesped-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cesped-300">IA</span>
  );
}

// ---------- Promo ----------

function TarjetaPromo({ promo, onRegenerar, cargando }) {
  const [copiado, setCopiado] = useState(false);
  const textoCompleto = `${promo.titulo}\n\n${promo.texto}\n\n${promo.hashtags.join(' ')}`;

  async function copiar() {
    if (await copiarTexto(textoCompleto)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  return (
    <article className="animate-aparecer overflow-hidden rounded-3xl border border-oro-400/30 bg-gradient-to-b from-noche-800/90 to-noche-950/95 shadow-[0_0_50px_-15px_rgb(245_197_66/0.45)] backdrop-blur-xl">
      {/* Cabecera */}
      <div className="relative flex items-start justify-between gap-3 overflow-hidden bg-gradient-to-r from-oro-300 via-oro-400 to-oro-500 px-4 py-3 text-noche-950 sm:px-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] opacity-75">
            Promo lista · {promo.dia}
          </p>
          <h3 className="font-display text-3xl leading-none tracking-wide sm:text-4xl">{promo.titulo}</h3>
        </div>
        <div className="shrink-0 rounded-2xl bg-noche-950 px-3 py-1.5 text-center shadow-lg">
          <p className="font-display text-3xl leading-none texto-led-oro">{promo.descuento_sugerido}%</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-oro-200">OFF</p>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Turnos en promo */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Turnos en promo <span className="text-zinc-500">({promo.turnos_en_promo.length} de {promo.turnosLibresTotal} libres)</span>
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {promo.turnos_en_promo.map((t, i) => (
              <li
                key={`${t.cancha}-${t.hora}`}
                className="animate-aparecer rounded-2xl border border-white/10 bg-white/[0.04] p-2.5"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="font-display text-3xl leading-none text-white">{t.hora}</p>
                <p className="text-[11px] text-zinc-400">
                  {t.canchaNombre} · {t.tipo}
                  {t.techada ? ' · 🏟️' : ''}
                </p>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-score text-base font-semibold text-oro-300">{precio(t.precioPromo)}</span>
                  <span className="text-[11px] text-zinc-500 line-through">{precio(t.precio)}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Vista previa del posteo */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Vista previa del posteo <BadgeModo modo={promo.modo} />
          </p>
          <div className="rounded-2xl border border-white/10 bg-black/40 p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cesped-400 to-cesped-700 font-display text-sm text-noche-950 ring-2 ring-oro-400/60">
                LR
              </span>
              <span className="text-sm font-semibold text-white">laredonda.futbol</span>
            </div>
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-zinc-200 scroll-fino">{promo.texto}</p>
            <p className="mt-2 text-sm font-medium text-cesped-300">{promo.hashtags.join(' ')}</p>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 border-t border-white/5 px-4 py-3 sm:px-5">
        <button
          onClick={copiar}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
            copiado ? 'bg-cesped-400 text-noche-950' : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
          }`}
        >
          {copiado ? '✓ ¡Copiado!' : '📋 Copiar'}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(textoCompleto)}`}
          target="_blank"
          rel="noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-cesped-400 to-cesped-600 px-4 py-2.5 text-sm font-semibold text-noche-950 shadow-[0_0_18px_-4px_rgb(34_227_107/0.8)] transition hover:brightness-110 sm:flex-none"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.3-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" />
          </svg>
          <span className="whitespace-nowrap sm:hidden">WhatsApp</span>
          <span className="hidden whitespace-nowrap sm:inline">Compartir por WhatsApp</span>
        </a>
        <button
          onClick={onRegenerar}
          disabled={cargando}
          className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
        >
          ↻ {cargando ? 'Generando…' : 'Otra versión'}
        </button>
      </div>
    </article>
  );
}

// ---------- Análisis ----------

function Anillo({ valor }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div
      className="relative grid size-24 shrink-0 place-items-center rounded-full sm:size-28"
      style={{ background: `conic-gradient(var(--color-cesped-400) ${v * 3.6}deg, rgb(255 255 255 / 0.08) 0deg)` }}
      role="img"
      aria-label={`Ocupación ${v}%`}
    >
      <div className="absolute inset-[7px] rounded-full bg-noche-950" />
      <div className="relative text-center leading-none">
        <p className="font-score text-2xl font-semibold texto-led-verde sm:text-3xl">{v}%</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Ocupación</p>
      </div>
    </div>
  );
}

function ItemAnalisis({ item, indice, tipo }) {
  const oro = tipo === 'recomendacion';
  return (
    <li
      className={`glass glow-hover animate-aparecer flex items-start gap-3 rounded-2xl p-3 ${oro ? 'border-l-2 !border-l-oro-400/70' : 'border-l-2 !border-l-cesped-400/70'}`}
      style={{ animationDelay: `${indice * 80}ms` }}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xl ${oro ? 'bg-oro-400/15' : 'bg-cesped-400/15'}`}>{item.icono}</span>
      <p className="pt-0.5 text-sm leading-snug text-zinc-200">{item.texto}</p>
    </li>
  );
}

function TarjetaAnalisis({ analisis, onRegenerar, cargando }) {
  const m = analisis.metricas;
  const stats = [
    ['Ingresos del día', precio(m.ingresosDia)],
    ['Señas pendientes', `${m.senasPendientes.cantidad} · ${precio(m.senasPendientes.monto)}`],
    ['Ocupación semana', `${m.ocupacionSemana}%`],
    ['Reservas semana', m.reservasSemana],
  ];

  return (
    <article className="glass-fuerte animate-aparecer overflow-hidden rounded-3xl">
      <div className="relative flex flex-col gap-4 border-b border-white/5 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cesped-400/40 to-transparent" />
        <Anillo valor={analisis.ocupacion_porcentaje} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-cesped-300">
            Análisis · <span className="capitalize">{analisis.dia}</span> <BadgeModo modo={analisis.modo} />
          </p>
          <p className="mt-1.5 text-base leading-snug text-white sm:text-lg">{analisis.resumen}</p>
        </div>
        <button
          onClick={onRegenerar}
          disabled={cargando}
          className="self-start rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-40 sm:self-center"
        >
          ↻ {cargando ? 'Analizando…' : 'Actualizar'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-noche-950/70 px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{k}</p>
            <p className="font-score text-lg font-semibold tabular-nums text-white">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-display text-2xl tracking-wide text-white">
            <span className="text-cesped-400">👁</span> Lo que pasa
          </h3>
          <ul className="space-y-2">
            {analisis.insights.map((it, i) => (
              <ItemAnalisis key={i} item={it} indice={i} tipo="insight" />
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-display text-2xl tracking-wide text-white">
            <span className="text-oro-400">⚡</span> Qué hacer
          </h3>
          <ul className="space-y-2">
            {analisis.recomendaciones.map((it, i) => (
              <ItemAnalisis key={i} item={it} indice={i + analisis.insights.length} tipo="recomendacion" />
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

// ---------- Componente principal ----------

export default function AsistenteDueno({ fecha }) {
  const [promo, pedirPromo, limpiarPromo] = useLlamada();
  const [analisis, pedirAnalisis, limpiarAnalisis] = useLlamada();

  // Al cambiar de día, los resultados anteriores ya no aplican
  useEffect(() => {
    limpiarPromo();
    limpiarAnalisis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  const generarPromo = () => pedirPromo(() => api.promo(fecha));
  const generarAnalisis = () => pedirAnalisis(() => api.analisis(fecha));

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h2 className="font-display text-2xl tracking-wide">
          Asistente del dueño <span className="text-oro-400">✦</span>
        </h2>
        <p className="hidden text-xs capitalize text-zinc-400 sm:block">{fechaLarga(fecha)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <BotonIA
          icono="📣"
          titulo="Llenar turnos vacíos"
          detalle="Promo lista para Instagram y WhatsApp con los turnos libres"
          onClick={generarPromo}
          cargando={promo.cargando}
          acento="oro"
        />
        <BotonIA
          icono="📊"
          titulo="Analizar mi día"
          detalle="Insights y recomendaciones con tus reservas del día y la semana"
          onClick={generarAnalisis}
          cargando={analisis.cargando}
          acento="verde"
        />
      </div>

      {promo.error && <ErrorIA mensaje={promo.error} onReintentar={generarPromo} />}
      {promo.cargando && !promo.datos && <Esqueleto alto="h-72" />}
      {promo.datos && <TarjetaPromo promo={promo.datos} onRegenerar={generarPromo} cargando={promo.cargando} />}

      {analisis.error && <ErrorIA mensaje={analisis.error} onReintentar={generarAnalisis} />}
      {analisis.cargando && !analisis.datos && <Esqueleto alto="h-80" />}
      {analisis.datos && <TarjetaAnalisis analisis={analisis.datos} onRegenerar={generarAnalisis} cargando={analisis.cargando} />}
    </section>
  );
}
