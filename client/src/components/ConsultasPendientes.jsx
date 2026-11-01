import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib.js';

const haceCuanto = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};

const linkWhatsApp = (tel, pregunta) => {
  const d = tel.replace(/\D/g, '');
  const numero = d.startsWith('54') ? d : `549${d}`;
  const texto = `¡Hola! Te escribo de La Redonda por tu consulta: "${pregunta}"`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
};

function Consulta({ c, onMarcar, ocupada, indice }) {
  const pendiente = c.estado === 'pendiente';
  return (
    <li
      className={`glass glow-hover animate-aparecer flex flex-col gap-3 rounded-2xl border-l-2 p-3 sm:flex-row sm:items-center ${
        pendiente ? '!border-l-oro-400/80' : 'opacity-55 !border-l-cesped-400/50'
      }`}
      style={{ animationDelay: `${indice * 50}ms` }}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg ${pendiente ? 'bg-oro-400/15' : 'bg-cesped-400/15'}`}>
        {pendiente ? '❓' : '✅'}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium text-white ${pendiente ? '' : 'line-through decoration-white/30'}`}>{c.pregunta}</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          {c.nombre ? `${c.nombre} · ` : ''}
          {c.telefono ? (
            <a href={linkWhatsApp(c.telefono, c.pregunta)} target="_blank" rel="noreferrer" className="text-cesped-300 hover:underline">
              💬 {c.telefono}
            </a>
          ) : (
            <span className="text-zinc-500">sin teléfono</span>
          )}{' '}
          · {haceCuanto(c.creadaEn)}
        </p>
      </div>
      <button
        onClick={() => onMarcar(c.id, pendiente ? 'respondida' : 'pendiente')}
        disabled={ocupada}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
          pendiente ? 'bg-cesped-400 text-noche-950 hover:bg-cesped-300' : 'bg-white/10 text-zinc-300 hover:bg-white/15'
        }`}
      >
        {pendiente ? '✓ Marcar respondida' : 'Reabrir'}
      </button>
    </li>
  );
}

export default function ConsultasPendientes({ activo }) {
  const [consultas, setConsultas] = useState([]);
  const [error, setError] = useState(null);
  const [verRespondidas, setVerRespondidas] = useState(false);
  const [ocupadaId, setOcupadaId] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setConsultas(await api.consultas());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Se actualiza cada 5 segundos, igual que las reservas
  useEffect(() => {
    if (!activo) return;
    cargar();
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [activo, cargar]);

  async function marcar(id, estado) {
    setOcupadaId(id);
    try {
      await api.marcarConsulta(id, estado);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupadaId(null);
    }
  }

  const pendientes = consultas.filter((c) => c.estado === 'pendiente');
  const respondidas = consultas.filter((c) => c.estado === 'respondida');
  const visibles = verRespondidas ? consultas : pendientes;

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide">
          Consultas pendientes
          {pendientes.length > 0 && (
            <span className="animate-latido grid min-w-6 place-items-center rounded-full bg-oro-400 px-1.5 font-score text-sm text-noche-950">
              {pendientes.length}
            </span>
          )}
        </h2>
        {respondidas.length > 0 && (
          <button onClick={() => setVerRespondidas((v) => !v)} className="text-xs font-semibold text-zinc-400 hover:text-white">
            {verRespondidas ? 'Ocultar respondidas' : `Ver respondidas (${respondidas.length})`}
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-zinc-500">Preguntas que el asistente no supo responder y te derivó.</p>

      {error && <div className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">⚠️ {error}</div>}

      {visibles.length === 0 ? (
        <div className="glass rounded-2xl border-dashed p-5 text-center text-sm text-zinc-400">
          🙌 No hay consultas pendientes. El asistente está respondiendo todo.
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((c, i) => (
            <Consulta key={c.id} c={c} indice={i} onMarcar={marcar} ocupada={ocupadaId === c.id} />
          ))}
        </ul>
      )}
    </section>
  );
}
