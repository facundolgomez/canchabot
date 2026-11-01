// Fondo de estadio de noche: cielo, reflectores con haces de luz, tribunas difusas
// y el césped con las líneas en perspectiva. 100% CSS/SVG, sin imágenes externas.

// Bordes de la cancha (líneas) en perspectiva: arriba angosta, abajo ancha.
const ARRIBA = 45;
const ABAJO = 420;
const izq = (y) => 430 + ((y - ARRIBA) / (ABAJO - ARRIBA)) * -560;
const der = (y) => 770 + ((y - ARRIBA) / (ABAJO - ARRIBA)) * 560;

// Franjas de corte del césped (más finas a lo lejos)
const FRANJAS = [26, 44, 64, 88, 118, 154, 198, 252, 318, 420];

const MITAD = 150;

const TORRES = [
  { lado: 'left', pos: '4%', giro: -28, oculto: true },
  { lado: 'left', pos: '22%', giro: -14 },
  { lado: 'right', pos: '22%', giro: 14 },
  { lado: 'right', pos: '4%', giro: 28, oculto: true },
];

// Flashes de cámaras en la tribuna
const FLASHES = Array.from({ length: 14 }, (_, i) => ({
  x: 60 + ((i * 397) % 1080),
  y: 150 + ((i * 53) % 110),
  delay: (i * 0.73) % 9,
}));

function Reflector({ lado, pos, giro, oculto }) {
  return (
    <div className={`absolute top-[5vh] ${oculto ? 'hidden md:block' : ''}`} style={{ [lado]: pos }}>
      {/* Haz de luz */}
      <div
        className="animate-haz absolute left-1/2 top-3 h-[95vh] w-[34vw] min-w-[220px] max-w-[520px] mix-blend-screen blur-md"
        style={{
          transform: `translateX(-50%) rotate(${giro}deg)`,
          transformOrigin: 'top center',
          clipPath: 'polygon(46% 0, 54% 0, 100% 100%, 0 100%)',
          background: 'linear-gradient(180deg, rgb(255 248 220 / 0.5) 0%, rgb(220 235 255 / 0.18) 35%, transparent 75%)',
          animationDelay: `${Math.abs(giro) / 10}s`,
        }}
      />
      {/* Panel de lámparas */}
      <div className="relative grid grid-cols-4 gap-[3px] rounded-sm bg-noche-800 p-1 shadow-[0_0_40px_12px_rgb(255_250_225/0.35)]">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="size-1.5 rounded-full bg-white shadow-[0_0_6px_2px_rgb(255_250_230/0.9)] sm:size-2" />
        ))}
      </div>
      {/* Poste */}
      <div className="mx-auto h-[14vh] w-[3px] bg-gradient-to-b from-noche-700 to-transparent" />
    </div>
  );
}

export default function Estadio() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-noche-950">
      {/* Cielo */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#010309_0%,#050c1c_30%,#0a1a33_55%,#071225_68%,#04070d_100%)]" />
      {/* Estrellas */}
      <div className="absolute inset-x-0 top-0 h-1/2 opacity-40 [background-image:radial-gradient(1px_1px_at_10%_20%,#fff,transparent),radial-gradient(1px_1px_at_30%_8%,#fff,transparent),radial-gradient(1px_1px_at_55%_15%,#fff,transparent),radial-gradient(1px_1px_at_72%_6%,#fff,transparent),radial-gradient(1px_1px_at_88%_22%,#fff,transparent),radial-gradient(1px_1px_at_45%_30%,#fff,transparent)]" />
      {/* Bruma iluminada sobre el estadio */}
      <div className="absolute inset-x-0 top-[25vh] h-[45vh] bg-[radial-gradient(ellipse_70%_60%_at_50%_70%,rgb(150_190_255/0.28),transparent_70%)]" />

      {/* Reflectores */}
      {TORRES.map((t) => (
        <Reflector key={`${t.lado}-${t.pos}`} {...t} />
      ))}

      {/* Tribunas difusas */}
      <svg className="absolute inset-x-0 bottom-[36vh] h-[30vh] w-full blur-[1.5px]" viewBox="0 0 1200 300" preserveAspectRatio="none">
        <defs>
          <pattern id="publico" width="9" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.3" fill="#9fb3d9" opacity="0.35" />
            <circle cx="6.5" cy="5" r="1.2" fill="#e8d9b0" opacity="0.25" />
          </pattern>
          <linearGradient id="tribunaLuz" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#24395f" />
            <stop offset="1" stopColor="#070d18" />
          </linearGradient>
        </defs>
        {/* Techo */}
        <path d="M0 95 Q600 10 1200 95 L1200 112 Q600 30 0 112 Z" fill="#0d1628" />
        {/* Bandeja alta */}
        <path d="M0 112 Q600 30 1200 112 L1200 300 L0 300 Z" fill="url(#tribunaLuz)" />
        <path d="M0 112 Q600 30 1200 112 L1200 300 L0 300 Z" fill="url(#publico)" />
        {/* Bandeja baja */}
        <path d="M0 200 Q600 140 1200 200 L1200 300 L0 300 Z" fill="#081120" opacity="0.9" />
        <path d="M0 200 Q600 140 1200 200 L1200 300 L0 300 Z" fill="url(#publico)" opacity="0.8" />
        {/* Cartel publicitario genérico (franja LED) */}
        <rect x="0" y="282" width="1200" height="18" fill="#0b9a45" opacity="0.35" />
        {FLASHES.map((f, i) => (
          <circle key={i} className="flash" cx={f.x} cy={f.y} r="2.5" fill="#fff" style={{ animationDelay: `${f.delay}s` }} />
        ))}
      </svg>

      {/* Césped con líneas en perspectiva */}
      <svg className="absolute inset-x-0 bottom-0 h-[40vh] w-full" viewBox="0 0 1200 420" preserveAspectRatio="none">
        <defs>
          <radialGradient id="luzCampo" cx="0.5" cy="0.35" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bordesCampo" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#020409" stopOpacity="0.85" />
            <stop offset="0.25" stopColor="#020409" stopOpacity="0" />
            <stop offset="0.75" stopColor="#020409" stopOpacity="0" />
            <stop offset="1" stopColor="#020409" stopOpacity="0.85" />
          </linearGradient>
        </defs>

        {FRANJAS.slice(0, -1).map((y, i) => (
          <rect key={y} x="0" y={y} width="1200" height={FRANJAS[i + 1] - y} fill={i % 2 ? '#0a6b33' : '#0c7d3c'} />
        ))}

        <g fill="none" stroke="#f4fff7" strokeOpacity="0.75" strokeWidth="2.2">
          {/* Perímetro */}
          <polygon points={`${izq(ARRIBA)},${ARRIBA} ${der(ARRIBA)},${ARRIBA} ${der(ABAJO)},${ABAJO} ${izq(ABAJO)},${ABAJO}`} />
          {/* Mitad de cancha */}
          <line x1={izq(MITAD)} y1={MITAD} x2={der(MITAD)} y2={MITAD} />
          <ellipse cx="600" cy={MITAD} rx="125" ry="32" />
          {/* Área grande y chica del arco lejano */}
          <polygon points={`505,${ARRIBA} 695,${ARRIBA} 712,76 488,76`} />
          <polygon points={`560,${ARRIBA} 640,${ARRIBA} 645,56 555,56`} />
          {/* Arco */}
          <rect x="578" y="35" width="44" height="10" strokeOpacity="0.9" />
        </g>
        <ellipse cx="600" cy={MITAD} rx="4" ry="2" fill="#f4fff7" opacity="0.8" />

        <rect x="0" y="20" width="1200" height="400" fill="url(#luzCampo)" />
        <rect x="0" y="20" width="1200" height="400" fill="url(#bordesCampo)" />
      </svg>

      {/* Overlay oscuro para legibilidad */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(4_7_13/0.15)_0%,rgb(4_7_13/0.32)_45%,rgb(4_7_13/0.45)_75%,rgb(4_7_13/0.8)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/0.45)_100%)]" />
    </div>
  );
}
