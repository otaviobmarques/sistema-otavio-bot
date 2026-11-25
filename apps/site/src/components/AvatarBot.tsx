import type { BotDaEquipe } from '@/config/equipe';

const TINTA = '#0B1230';
const OLHO = '#00E8F8';

function Acessorio({ bot }: { bot: BotDaEquipe }) {
  const [, escura] = bot.cores;
  switch (bot.acessorio) {
    case 'fone':
      return (
        <g>
          <path d="M19 54 Q19 17 50 17 Q81 17 81 54" fill="none" stroke={TINTA} strokeWidth="5" strokeLinecap="round" />
          <rect x="12" y="44" width="12" height="20" rx="5" fill={TINTA} />
          <rect x="76" y="44" width="12" height="20" rx="5" fill={TINTA} />
          <path d="M18 63 Q20 74 36 72" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" />
          <circle cx="37" cy="72" r="3" fill={TINTA} />
        </g>
      );
    case 'oculos':
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.6">
          <circle cx="40" cy="53" r="7.5" />
          <circle cx="60" cy="53" r="7.5" />
          <path d="M47.5 53 H52.5" />
        </g>
      );
    case 'antena':
      return (
        <g>
          <path d="M50 31 V15" stroke={bot.rosto} strokeWidth="4" strokeLinecap="round" />
          <circle cx="50" cy="13" r="6" fill={OLHO} stroke={TINTA} strokeWidth="2" />
        </g>
      );
    case 'boina':
      return (
        <g>
          <ellipse cx="46" cy="30" rx="29" ry="10" fill={escura} />
          <circle cx="46" cy="19" r="3.5" fill={escura} />
        </g>
      );
    case 'gravata':
      return (
        <g>
          <path d="M42 84 L50 90 L58 84" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
          <path d="M50 89 L45 100 H55 Z" fill={escura} />
        </g>
      );
    case 'coque':
      return (
        <g>
          <circle cx="50" cy="22" r="10" fill={escura} />
          <path d="M23 42 Q24 27 50 27 Q76 27 77 42 Q64 33 50 33 Q36 33 23 42 Z" fill={escura} />
        </g>
      );
    case 'bone':
      return (
        <g>
          <path d="M22 41 Q22 22 50 22 Q78 22 78 41 Z" fill={escura} />
          <rect x="52" y="36" width="34" height="7" rx="3.5" fill={escura} />
          <circle cx="50" cy="23" r="2.5" fill="#fff" opacity="0.7" />
        </g>
      );
    case 'viseira':
      return (
        <g>
          <circle cx="20" cy="54" r="5" fill={escura} />
          <circle cx="80" cy="54" r="5" fill={escura} />
          <rect x="35" y="33" width="30" height="4" rx="2" fill={escura} opacity="0.6" />
        </g>
      );
  }
}

type Props = { bot: BotDaEquipe; tamanho?: number; className?: string; titulo?: boolean };

export function AvatarBot({ bot, tamanho, className, titulo = false }: Props) {
  const [clara, escura] = bot.cores;
  const grad = `avatar-${bot.id}`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={tamanho}
      height={tamanho}
      className={className}
      role={titulo ? 'img' : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo ? `${bot.nome}, ${bot.funcao}` : undefined}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={clara} />
          <stop offset="1" stopColor={escura} />
        </linearGradient>
        <clipPath id={`${grad}-forma`}>
          <rect width="100" height="100" rx="26" />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx="26" fill={`url(#${grad})`} />
      <circle cx="22" cy="18" r="26" fill="#fff" opacity="0.12" clipPath={`url(#${grad}-forma)`} />
      <path d="M18 100 Q18 80 50 80 Q82 80 82 100 Z" fill={bot.rosto} opacity="0.92" />
      <rect x="22" y="30" width="56" height="48" rx="18" fill={bot.rosto} />
      <rect x="28" y="44" width="44" height="18" rx="9" fill={TINTA} />
      <circle cx="40" cy="53" r="4.2" fill={OLHO} />
      <circle cx="60" cy="53" r="4.2" fill={OLHO} />
      <circle cx="41.4" cy="51.6" r="1.3" fill="#fff" />
      <circle cx="61.4" cy="51.6" r="1.3" fill="#fff" />
      <path d="M44 68 Q50 72.5 56 68" fill="none" stroke={TINTA} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="31" cy="68" r="3.2" fill={clara} opacity="0.45" />
      <circle cx="69" cy="68" r="3.2" fill={clara} opacity="0.45" />
      <Acessorio bot={bot} />
    </svg>
  );
}
