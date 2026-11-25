export const CORES = {
  noite: '#050817',
  noite2: '#0a1029',
  noite3: '#111a3a',
  ciano: '#00E8F8',
  azul: '#3D7BFF',
  violeta: '#8B5CF6',
  verde: '#22C55E',
  ambar: '#F5A524',
  texto: '#E8EEFC',
  suave: '#8C9BC0',
  borda: 'rgba(255,255,255,0.09)',
};

export const FONTE = 'var(--fonte-inter), Inter, system-ui, sans-serif';
export const FONTE_TITULO = 'var(--fonte-poppins), Poppins, Inter, system-ui, sans-serif';

export function MarcaBot({ tamanho, cor = CORES.ciano, olhos = CORES.noite }: { tamanho: number; cor?: string; olhos?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 1024 1024" aria-hidden>
      <path d="M512 150 L812 770 L512 640 L212 770 Z" fill="none" stroke={cor} strokeWidth="56" strokeLinejoin="round" />
      <rect x="398" y="400" width="228" height="148" rx="56" fill={cor} />
      <circle cx="465" cy="474" r="26" fill={olhos} />
      <circle cx="559" cy="474" r="26" fill={olhos} />
    </svg>
  );
}

export function Cursor({ x, y, clique }: { x: number; y: number; clique: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 22, height: 22, pointerEvents: 'none' }}>
      {clique > 0 && (
        <div
          style={{
            position: 'absolute',
            left: -14 + 2,
            top: -14 + 2,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: `2px solid ${CORES.ciano}`,
            opacity: 1 - clique,
            transform: `scale(${0.4 + clique})`,
          }}
        />
      )}
      <svg width="22" height="22" viewBox="0 0 24 24">
        <path d="M3 2 L20 11 L12 13 L9 21 Z" fill="#fff" stroke={CORES.noite} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
