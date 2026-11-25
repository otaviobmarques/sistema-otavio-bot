import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { CORES, FONTE, FONTE_TITULO, MarcaBot } from './comum';

export const CONEXOES = { largura: 1200, altura: 720, fps: 30, duracao: 240 };

const NOMES = [
  'Claude',
  'ChatGPT',
  'Gemini',
  'Grok',
  'DeepSeek',
  'Mistral',
  'Llama',
  'Qwen',
  'Kimi',
  'GitHub Copilot',
  'MiniMax',
  'Ollama',
];

const CENTRO = { x: CONEXOES.largura / 2, y: CONEXOES.altura / 2 };
const RAIO = { x: 470, y: 268 };

function posicao(i: number, frame: number, duracao: number) {
  const angulo = (i / NOMES.length) * Math.PI * 2 - Math.PI / 2;
  const fase = (frame / duracao) * Math.PI * 2 + i;
  return {
    x: CENTRO.x + Math.cos(angulo) * RAIO.x + Math.sin(fase) * 6,
    y: CENTRO.y + Math.sin(angulo) * RAIO.y + Math.cos(fase) * 6,
  };
}

export function IAsConectando() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ciclo = frame / durationInFrames;
  const respira = 0.5 + 0.5 * Math.sin(ciclo * Math.PI * 4);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(520px 360px at 50% 50%, rgba(0,232,248,${0.1 + respira * 0.06}), transparent 70%), ${CORES.noite}`,
      }}
    >
      <svg width={CONEXOES.largura} height={CONEXOES.altura} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="linha" x1="0" x2="1">
            <stop offset="0" stopColor={CORES.violeta} stopOpacity="0.5" />
            <stop offset="1" stopColor={CORES.ciano} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {[150, 230, 310].map((r, i) => (
          <ellipse
            key={r}
            cx={CENTRO.x}
            cy={CENTRO.y}
            rx={r * 1.7}
            ry={r}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeDasharray="4 10"
            strokeDashoffset={-frame * (i % 2 === 0 ? 0.5 : -0.5)}
          />
        ))}
        {NOMES.map((nome, i) => {
          const p = posicao(i, frame, durationInFrames);
          const onda = (ciclo * 2 + i / NOMES.length) % 1;
          const pulso = { x: interpolate(onda, [0, 1], [p.x, CENTRO.x]), y: interpolate(onda, [0, 1], [p.y, CENTRO.y]) };
          const brilhoPulso = Math.sin(onda * Math.PI);
          return (
            <g key={nome}>
              <line
                x1={p.x}
                y1={p.y}
                x2={CENTRO.x}
                y2={CENTRO.y}
                stroke="url(#linha)"
                strokeOpacity={0.35}
                strokeWidth={1.5}
                strokeDasharray="6 14"
                strokeDashoffset={-frame * 2}
              />
              <circle cx={pulso.x} cy={pulso.y} r={5} fill={CORES.ciano} opacity={brilhoPulso} />
              <circle cx={pulso.x} cy={pulso.y} r={14} fill={CORES.ciano} opacity={brilhoPulso * 0.18} />
            </g>
          );
        })}
      </svg>

      {NOMES.map((nome, i) => {
        const p = posicao(i, frame, durationInFrames);
        const onda = (ciclo * 2 + i / NOMES.length) % 1;
        const aceso = onda > 0.82 || onda < 0.06;
        return (
          <div
            key={nome}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: 'translate(-50%, -50%)',
              padding: '12px 22px',
              borderRadius: 999,
              background: aceso ? 'rgba(0,232,248,0.16)' : 'rgba(17,26,58,0.92)',
              border: `1px solid ${aceso ? 'rgba(0,232,248,0.7)' : 'rgba(255,255,255,0.12)'}`,
              boxShadow: aceso ? '0 0 30px rgba(0,232,248,0.35)' : '0 10px 30px -10px rgba(0,0,0,0.7)',
              color: aceso ? '#fff' : CORES.texto,
              fontFamily: FONTE,
              fontWeight: 600,
              fontSize: 22,
              whiteSpace: 'nowrap',
            }}
          >
            {nome}
          </div>
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: CENTRO.x,
          top: CENTRO.y,
          transform: 'translate(-50%, -50%)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {[0, 1, 2].map((anel) => {
          const t = (ciclo * 3 + anel / 3) % 1;
          return (
            <div
              key={anel}
              style={{
                position: 'absolute',
                width: 190,
                height: 190,
                borderRadius: 60,
                border: `2px solid ${CORES.ciano}`,
                opacity: (1 - t) * 0.45,
                transform: `scale(${1 + t * 0.9})`,
              }}
            />
          );
        })}
        <div
          style={{
            width: 190,
            height: 190,
            borderRadius: 52,
            background: CORES.noite,
            border: '1px solid rgba(0,232,248,0.5)',
            boxShadow: `0 0 ${50 + respira * 30}px rgba(0,232,248,0.45)`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <MarcaBot tamanho={140} />
        </div>
        <div
          style={{
            position: 'absolute',
            top: 118,
            fontFamily: FONTE_TITULO,
            fontWeight: 800,
            fontSize: 30,
            color: '#fff',
            letterSpacing: -0.5,
          }}
        >
          arko<span style={{ color: CORES.ciano }}>bot</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
