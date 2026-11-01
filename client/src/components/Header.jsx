const VISTAS = [
  { id: 'reservar', label: 'Reservar', icono: '⚽' },
  { id: 'panel', label: 'Panel del dueño', icono: '📋' },
];

export default function Header({ vista, onCambiar, modo }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-cancha-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-400 text-lg shadow-lg shadow-lime-400/20">
            ⚽
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-xl font-bold uppercase tracking-wide">
              La <span className="text-lime-400">Redonda</span>
            </p>
            {modo && (
              <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <span className={`size-1.5 rounded-full ${modo === 'ia' ? 'bg-lime-400' : 'bg-amber-400'}`} />
                {modo === 'ia' ? 'IA activa' : 'Modo demo'}
              </p>
            )}
          </div>
        </div>

        <nav className="flex shrink-0 rounded-xl border border-white/10 bg-white/5 p-1" aria-label="Cambiar vista">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              onClick={() => onCambiar(v.id)}
              aria-pressed={vista === v.id}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                vista === v.id ? 'bg-lime-400 text-cancha-950 shadow' : 'text-zinc-300 hover:bg-white/10'
              }`}
            >
              <span aria-hidden>{v.icono}</span>
              <span className={v.id === 'panel' ? 'hidden sm:inline' : ''}>{v.label}</span>
              {v.id === 'panel' && <span className="sm:hidden">Panel</span>}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
