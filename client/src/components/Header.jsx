const VISTAS = [
  { id: 'reservar', label: 'Reservar', corto: 'Reservar', icono: '⚽' },
  { id: 'panel', label: 'Panel del dueño', corto: 'Panel', icono: '📋' },
];

export default function Header({ vista, onCambiar, modo }) {
  return (
    <header className="glass-fuerte sticky top-0 z-30 !rounded-none !border-x-0 !border-t-0">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative grid size-10 shrink-0 place-items-center rounded-full bg-noche-900 ring-2 ring-cesped-400/70 shadow-[0_0_18px_-2px_rgb(34_227_107/0.6)]">
            <span className="size-3 rounded-full bg-oro-400 shadow-[0_0_10px_rgb(245_197_66/0.9)]" />
            <span className="absolute inset-1.5 rounded-full border border-white/15" />
          </div>
          <div className="min-w-0 leading-none">
            <p className="truncate font-display text-[1.65rem] tracking-wider text-white">
              LA <span className="text-cesped-400">REDONDA</span>
            </p>
            {modo && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                <span
                  className={`size-1.5 rounded-full ${
                    modo === 'ia' ? 'animate-latido bg-cesped-400 shadow-[0_0_6px_rgb(34_227_107)]' : 'bg-oro-400'
                  }`}
                />
                {modo === 'ia' ? 'IA en vivo' : 'Modo demo'}
              </p>
            )}
          </div>
        </div>

        <nav className="flex shrink-0 rounded-full border border-white/10 bg-black/30 p-1" aria-label="Cambiar vista">
          {VISTAS.map((v) => {
            const activa = vista === v.id;
            return (
              <button
                key={v.id}
                onClick={() => onCambiar(v.id)}
                aria-pressed={activa}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-300 ${
                  activa
                    ? 'bg-gradient-to-b from-cesped-400 to-cesped-600 text-noche-950 shadow-[0_0_20px_-4px_rgb(34_227_107/0.8)]'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span aria-hidden>{v.icono}</span>
                <span className="hidden sm:inline">{v.label}</span>
                <span className="sm:hidden">{v.corto}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
