type MarcaProps = { className?: string; fundo?: boolean; titulo?: string };

export function Marca({ className, fundo = false, titulo }: MarcaProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
    >
      {fundo && <rect width="1024" height="1024" rx="224" fill="#050817" />}
      <path
        d="M512 150 L812 770 L512 640 L212 770 Z"
        fill="none"
        stroke="#00E8F8"
        strokeWidth="44"
        strokeLinejoin="round"
      />
      <rect x="398" y="400" width="228" height="148" rx="56" fill="#00E8F8" />
      <circle cx="465" cy="474" r="26" fill="#050817" />
      <circle cx="559" cy="474" r="26" fill="#050817" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`} aria-label="ArkoBot" role="img">
      <Marca className="h-full w-auto drop-shadow-[0_0_10px_rgba(0,232,248,0.45)]" />
      <span aria-hidden className="font-display text-[1.45em] font-extrabold leading-none tracking-tight">
        <span className="text-white">arko</span>
        <span className="text-ciano">bot</span>
      </span>
    </span>
  );
}
