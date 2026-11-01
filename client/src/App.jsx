import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Reservar from './components/Reservar.jsx';
import Panel from './components/Panel.jsx';
import { api } from './lib.js';

export default function App() {
  const [vista, setVista] = useState('reservar');
  const [info, setInfo] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  async function cargarInfo() {
    setErrorInfo(null);
    try {
      setInfo(await api.complejo());
    } catch (e) {
      setErrorInfo(e.message);
    }
  }

  useEffect(() => {
    cargarInfo();
  }, []);

  return (
    <div className="min-h-dvh bg-cancha-950 text-zinc-100">
      <Header vista={vista} onCambiar={setVista} modo={info?.modo} />

      <main className="mx-auto max-w-7xl px-3 pb-10 pt-4 sm:px-6">
        {errorInfo && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <span>⚠️ {errorInfo}</span>
            <button onClick={cargarInfo} className="rounded-lg bg-red-500/20 px-3 py-1 font-semibold hover:bg-red-500/30">
              Reintentar
            </button>
          </div>
        )}

        {/* Las dos vistas quedan montadas para no perder el chat al cambiar */}
        <div className={vista === 'reservar' ? '' : 'hidden'}>
          <Reservar info={info} />
        </div>
        <div className={vista === 'panel' ? '' : 'hidden'}>
          <Panel info={info} activo={vista === 'panel'} />
        </div>
      </main>
    </div>
  );
}
