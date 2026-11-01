import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ahoraBA, sumarDias, fechaLarga, precio, horaFin, ESTADOS, ORIGENES } from '../lib.js';
import AsistenteDueno from './AsistenteDueno.jsx';
import ConsultasPendientes from './ConsultasPendientes.jsx';

const HORAS_DEFAULT = Array.from({ length: 8 }, (_, i) => `${16 + i}:00`);
const DIEZ_MIN = 10 * 60 * 1000;

function Metrica({ titulo, valor, detalle, acento = 'text-white' }) {
  return (
    <div className="glass glow-hover rounded-2xl p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{titulo}</p>
      <p className={`mt-1 font-score text-[1.6rem] font-semibold leading-none tabular-nums sm:text-4xl ${acento}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-zinc-500">{detalle}</p>}
    </div>
  );
}

function Grilla({ canchas, horas, reservas, fecha, hoy, horaActual }) {
  const mapa = useMemo(() => {
    const m = new Map();
    reservas.filter((r) => r.estado !== 'cancelada').forEach((r) => m.set(`${r.cancha}|${r.hora}`, r));
    return m;
  }, [reservas]);

  return (
    <div className="glass scroll-fino overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[540px] border-separate border-spacing-1.5 p-1.5 text-sm">
        <thead>
          <tr>
            <th className="w-20 px-2 py-1 text-left text-xs font-medium text-zinc-500">Horario</th>
            {canchas.map((c) => (
              <th key={c.id} className="px-2 py-1 text-left">
                <span className="font-display text-xl tracking-wide">{c.nombre}</span>
                <span className="block text-[11px] font-normal text-zinc-400">
                  {c.tipo} · {c.techada ? 'techada' : 'descubierta'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horas.map((hora) => {
            const h = Number(hora.slice(0, 2));
            const esHoy = fecha === hoy;
            const pasado = fecha < hoy || (esHoy && h < horaActual);
            const enJuego = esHoy && h === horaActual;
            return (
              <tr key={hora} className={pasado ? 'opacity-40' : ''}>
                <td className="whitespace-nowrap px-2 text-xs text-zinc-400">
                  <span className={`font-semibold ${enJuego ? 'text-cesped-400' : 'text-zinc-200'}`}>{hora}</span>
                  {enJuego && <span className="block text-[10px] text-cesped-400">● ahora</span>}
                </td>
                {canchas.map((c) => {
                  const r = mapa.get(`${c.id}|${hora}`);
                  if (!r) {
                    return (
                      <td key={c.id} className="h-12 rounded-lg border border-dashed border-white/10 px-2 text-xs text-zinc-500">
                        Libre
                      </td>
                    );
                  }
                  const est = ESTADOS[r.estado];
                  return (
                    <td key={c.id} className={`h-12 rounded-lg border px-2 py-1 ${est.celda}`} title={`${r.nombre} · ${r.telefono}`}>
                      <p className="max-w-[150px] truncate text-xs font-semibold">{r.nombre}</p>
                      <p className="flex items-center gap-1 text-[10px] opacity-80">
                        <span className={`size-1.5 rounded-full ${est.punto}`} /> {est.label}
                      </p>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilaReserva({ r, onCambiar, ocupada }) {
  const est = ESTADOS[r.estado];
  const nueva = r.origen === 'chat' && Date.now() - new Date(r.creadaEn).getTime() < DIEZ_MIN;
  const tel = r.telefono.replace(/\D/g, '');
  const boton = 'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40';

  return (
    <li className={`flex flex-col gap-3 glass glow-hover animate-aparecer rounded-2xl p-3 sm:flex-row sm:items-center ${r.estado === 'cancelada' ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3 sm:w-36">
        <div className="text-center">
          <p className="font-display text-3xl leading-none tracking-wide">{r.hora}</p>
          <p className="text-[10px] text-zinc-500">a {horaFin(r.hora)}</p>
        </div>
        <div className="text-xs text-zinc-400">
          <p className="font-semibold text-zinc-200">{r.canchaNombre}</p>
          <p>{r.tipo}</p>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`truncate font-semibold ${r.estado === 'cancelada' ? 'line-through' : ''}`}>{r.nombre}</span>
          {nueva && <span className="rounded-full bg-cesped-400 px-2 py-0.5 text-[10px] font-bold uppercase text-noche-950">Nueva</span>}
        </p>
        <p className="text-xs text-zinc-400">
          <a href={`https://wa.me/${tel.startsWith('54') ? tel : `549${tel}`}`} target="_blank" rel="noreferrer" className="hover:text-cesped-300">
            {r.telefono}
          </a>{' '}
          · {ORIGENES[r.origen] ?? r.origen} · <span className="font-mono">{r.codigo}</span>
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Total {precio(r.precio)} · Seña {precio(r.sena)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${est.badge}`}>{est.label}</span>
        {r.estado === 'pendiente_sena' && (
          <button disabled={ocupada} onClick={() => onCambiar(r.id, 'confirmada')} className={`${boton} bg-cesped-400 text-noche-950 hover:bg-cesped-300`}>
            ✓ Seña recibida
          </button>
        )}
        {r.estado === 'confirmada' && (
          <button disabled={ocupada} onClick={() => onCambiar(r.id, 'pendiente_sena')} className={`${boton} bg-white/10 hover:bg-white/15`}>
            Marcar pendiente
          </button>
        )}
        {r.estado !== 'cancelada' ? (
          <button disabled={ocupada} onClick={() => onCambiar(r.id, 'cancelada')} className={`${boton} bg-red-500/15 text-red-300 hover:bg-red-500/25`}>
            Cancelar
          </button>
        ) : (
          <button disabled={ocupada} onClick={() => onCambiar(r.id, 'pendiente_sena')} className={`${boton} bg-white/10 hover:bg-white/15`}>
            Reactivar
          </button>
        )}
      </div>
    </li>
  );
}

export default function Panel({ info, activo }) {
  const [fecha, setFecha] = useState(() => ahoraBA().fecha);
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const [ocupadaId, setOcupadaId] = useState(null);

  const { fecha: hoy, hora: horaActual } = ahoraBA();
  const canchas = info?.complejo?.canchas ?? [];
  const horas = info?.horas ?? HORAS_DEFAULT;

  const cargar = useCallback(async () => {
    try {
      setReservas(await api.reservas());
      setError(null);
      setActualizado(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  // Actualización automática cada 5 segundos mientras el panel está visible
  useEffect(() => {
    if (!activo) return;
    cargar();
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [activo, cargar]);

  async function cambiarEstado(id, estado) {
    setOcupadaId(id);
    try {
      await api.cambiarEstado(id, estado);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupadaId(null);
    }
  }

  const delDia = useMemo(() => reservas.filter((r) => r.fecha === fecha), [reservas, fecha]);
  const activas = delDia.filter((r) => r.estado !== 'cancelada');
  const pendientes = activas.filter((r) => r.estado === 'pendiente_sena');
  const totalTurnos = (canchas.length || 3) * horas.length;
  const ocupacion = Math.round((activas.length / totalTurnos) * 100);
  const ingresos = activas.reduce((s, r) => s + r.precio, 0);
  const proximasChat = reservas.filter((r) => r.origen === 'chat' && r.estado !== 'cancelada' && r.fecha >= hoy).length;

  return (
    <div className="space-y-4">
      {/* Encabezado + selector de fecha */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none tracking-wide texto-brillo sm:text-6xl">Panel del dueño</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {actualizado ? (
              <>
                <span className="mr-1 inline-block size-2 animate-pulse rounded-full bg-cesped-400" />
                Se actualiza cada 5 s · última {actualizado.toLocaleTimeString('es-AR')}
              </>
            ) : (
              'Cargando reservas...'
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setFecha(sumarDias(fecha, -1))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10" aria-label="Día anterior">
            ◀
          </button>
          <input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-cesped-400/60"
          />
          <button onClick={() => setFecha(sumarDias(fecha, 1))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10" aria-label="Día siguiente">
            ▶
          </button>
          <button
            onClick={() => setFecha(hoy)}
            disabled={fecha === hoy}
            className="rounded-xl bg-cesped-400 px-3 py-2 text-sm font-semibold text-noche-950 hover:bg-cesped-300 disabled:opacity-40"
          >
            Hoy
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">⚠️ {error}</div>
      )}

      <p className="text-sm font-semibold capitalize text-cesped-300">
        {fechaLarga(fecha)}
        {fecha === hoy && <span className="ml-2 rounded-full bg-cesped-400/15 px-2 py-0.5 text-xs normal-case">hoy</span>}
      </p>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica titulo={fecha === hoy ? 'Reservas de hoy' : 'Reservas del día'} valor={activas.length} detalle={`${delDia.length - activas.length} canceladas`} />
        <Metrica titulo="Ocupación" valor={`${ocupacion}%`} detalle={`${activas.length} de ${totalTurnos} turnos`} acento="texto-led-verde" />
        <Metrica titulo="Ingresos estimados" valor={precio(ingresos)} detalle="Turnos no cancelados" />
        <Metrica
          titulo="Señas pendientes"
          valor={pendientes.length}
          detalle={`${precio(pendientes.reduce((s, r) => s + r.sena, 0))} a cobrar · ${proximasChat} reservas por chat`}
          acento="texto-led-oro"
        />
      </div>

      {/* Preguntas que el asistente derivó al encargado */}
      <ConsultasPendientes activo={activo} />

      {/* Funciones con IA: promo para turnos vacíos y análisis del día */}
      <AsistenteDueno fecha={fecha} />

      {/* Grilla canchas x horarios */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl tracking-wide">Grilla del día</h2>
          <div className="flex gap-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-cesped-400" /> Confirmada</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-oro-400" /> Pendiente de seña</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full border border-dashed border-zinc-500" /> Libre</span>
          </div>
        </div>
        {canchas.length ? (
          <Grilla canchas={canchas} horas={horas} reservas={delDia} fecha={fecha} hoy={hoy} horaActual={horaActual} />
        ) : (
          <div className="h-64 glass animate-pulse rounded-2xl" />
        )}
      </section>

      {/* Lista de reservas */}
      <section>
        <h2 className="mb-2 font-display text-2xl tracking-wide">Reservas ({delDia.length})</h2>
        {cargando ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 glass animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : delDia.length === 0 ? (
          <div className="glass rounded-2xl border-dashed p-8 text-center text-sm text-zinc-400">
            No hay reservas para este día. ¡Todas las canchas libres! ⚽
          </div>
        ) : (
          <ul className="space-y-2">
            {delDia.map((r) => (
              <FilaReserva key={r.id} r={r} onCambiar={cambiarEstado} ocupada={ocupadaId === r.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
