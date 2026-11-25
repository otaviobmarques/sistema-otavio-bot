import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CORES, Cursor, FONTE, FONTE_TITULO, MarcaBot } from './comum';

export const EQUIPE = { largura: 1280, altura: 800, fps: 30, duracao: 360 };

const MARGEM = 32;
const VAO = 24;
const TOPO = 84;
const LARG_MONITOR = (EQUIPE.largura - MARGEM * 2 - VAO) / 2;
const ALT_MONITOR = (EQUIPE.altura - TOPO - MARGEM - VAO) / 2;

const APROVACAO = { entra: 150, pede: 168, responde: 222, confirma: 246, sai: 300 };

type Estado = 'trabalhando' | 'esperando';

function limitar(frame: number, entrada: number[], saida: number[]) {
  return interpolate(frame, entrada, saida, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

function caminho(frame: number, pontos: [number, number, number][]) {
  const quadros = pontos.map((p) => p[0]);
  return {
    x: limitar(frame, quadros, pontos.map((p) => p[1])),
    y: limitar(frame, quadros, pontos.map((p) => p[2])),
  };
}

function Monitor({
  x,
  y,
  bot,
  equipe,
  estado,
  aparece,
  children,
}: {
  x: number;
  y: number;
  bot: string;
  equipe: string;
  estado: Estado;
  aparece: number;
  children: React.ReactNode;
}) {
  const esperando = estado === 'esperando';
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: LARG_MONITOR,
        height: ALT_MONITOR,
        borderRadius: 18,
        background: `linear-gradient(180deg, ${CORES.noite3}, ${CORES.noite2})`,
        border: `1px solid ${esperando ? 'rgba(245,165,36,0.55)' : CORES.borda}`,
        boxShadow: esperando
          ? '0 0 0 4px rgba(245,165,36,0.12), 0 30px 60px -30px rgba(0,0,0,0.8)'
          : '0 30px 60px -30px rgba(0,0,0,0.8)',
        overflow: 'hidden',
        opacity: aparece,
        transform: `translateY(${(1 - aparece) * 24}px) scale(${0.97 + aparece * 0.03})`,
      }}
    >
      <div
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          borderBottom: `1px solid ${CORES.borda}`,
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: CORES.noite,
            display: 'grid',
            placeItems: 'center',
            border: `1px solid rgba(0,232,248,0.35)`,
          }}
        >
          <MarcaBot tamanho={22} />
        </div>
        <div style={{ fontFamily: FONTE, fontSize: 15, color: CORES.texto, fontWeight: 600 }}>
          Computador de {bot}
        </div>
        <div style={{ fontFamily: FONTE, fontSize: 13, color: CORES.suave }}>· {equipe}</div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: esperando ? 'rgba(245,165,36,0.14)' : 'rgba(34,197,94,0.12)',
            color: esperando ? CORES.ambar : CORES.verde,
            fontFamily: FONTE,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 9, background: esperando ? CORES.ambar : CORES.verde }} />
          {esperando ? 'esperando você' : 'trabalhando'}
        </div>
      </div>
      <div style={{ position: 'relative', height: ALT_MONITOR - 44 }}>{children}</div>
    </div>
  );
}

function Navegador({ frame }: { frame: number }) {
  const linhas = [
    ['Mercado Central', 'Proposta', '#22C55E'],
    ['Studio Lume', 'Retornar', '#F5A524'],
    ['Oficina Prado', 'Proposta', '#22C55E'],
    ['Café Aurora', 'Novo', '#3D7BFF'],
    ['Grupo Vale', 'Proposta', '#22C55E'],
  ];
  const cursor = caminho(frame, [
    [0, 420, 220],
    [40, 120, 92],
    [80, 120, 130],
    [120, 120, 168],
    [160, 470, 250],
    [360, 470, 250],
  ]);
  const clique = frame % 40 > 30 && frame < 160 ? (frame % 40 - 30) / 10 : 0;
  return (
    <div style={{ padding: 16, fontFamily: FONTE }}>
      <div
        style={{
          height: 30,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          color: CORES.suave,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 9, border: `2px solid ${CORES.suave}` }} />
        crm.exemplo.com.br/clientes
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
        {linhas.map(([nome, etapa, cor], i) => {
          const v = limitar(frame, [10 + i * 22, 26 + i * 22], [0, 1]);
          const ativo = frame > 30 + i * 30 && frame < 62 + i * 30;
          return (
            <div
              key={nome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                background: ativo ? 'rgba(0,232,248,0.12)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${ativo ? 'rgba(0,232,248,0.4)' : 'transparent'}`,
                opacity: v,
                transform: `translateX(${(1 - v) * -16}px)`,
                color: CORES.texto,
                fontSize: 14,
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 99, background: 'rgba(255,255,255,0.12)' }} />
              <span style={{ flex: 1 }}>{nome}</span>
              <span style={{ fontSize: 12, color: cor as string, fontWeight: 600 }}>{etapa}</span>
            </div>
          );
        })}
      </div>
      <Cursor x={cursor.x} y={cursor.y} clique={clique} />
    </div>
  );
}

function Planilha({ frame }: { frame: number }) {
  const valores = [
    ['Jan', '12.480', 48],
    ['Fev', '14.920', 58],
    ['Mar', '13.310', 52],
    ['Abr', '17.640', 70],
    ['Mai', '19.870', 80],
    ['Jun', '22.150', 92],
  ];
  return (
    <div style={{ padding: 16, display: 'flex', gap: 16, fontFamily: FONTE, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ flex: 1, display: 'grid', gap: 5, alignContent: 'start' }}>
        <div style={{ display: 'flex', color: CORES.suave, fontSize: 12, padding: '0 10px' }}>
          <span style={{ width: 52 }}>Mês</span>
          <span>Receita (R$)</span>
        </div>
        {valores.map(([mes, valor], i) => {
          const v = limitar(frame, [20 + i * 26, 34 + i * 26], [0, 1]);
          return (
            <div
              key={mes as string}
              style={{
                display: 'flex',
                height: 31,
                alignItems: 'center',
                padding: '0 10px',
                borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                color: CORES.texto,
                fontSize: 14,
              }}
            >
              <span style={{ width: 52, color: CORES.suave }}>{mes}</span>
              <span style={{ opacity: v, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
              {v > 0 && v < 1 && <span style={{ width: 2, height: 16, background: CORES.ciano, marginLeft: 4 }} />}
            </div>
          );
        })}
      </div>
      <div
        style={{
          width: 210,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.035)',
          padding: 14,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
        }}
      >
        {valores.map(([mes, , altura], i) => {
          const s = limitar(frame, [40 + i * 26, 70 + i * 26], [0, 1]);
          return (
            <div
              key={mes as string}
              style={{
                flex: 1,
                height: `${(altura as number) * s}%`,
                borderRadius: 6,
                background: `linear-gradient(180deg, ${CORES.ciano}, ${CORES.azul})`,
                boxShadow: '0 0 18px rgba(0,232,248,0.35)',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

const TEXTO_EMAIL =
  'Olá, Marina! Segue a proposta revisada com os prazos que combinamos. Fico à disposição para ajustar o que precisar.';

function Email({ frame }: { frame: number }) {
  const letras = Math.floor(limitar(frame, [20, 150], [0, TEXTO_EMAIL.length]));
  const piscando = Math.floor(frame / 12) % 2 === 0;
  const enviado = limitar(frame, [250, 270], [0, 1]);
  return (
    <div style={{ padding: 16, fontFamily: FONTE, color: CORES.texto, fontSize: 14 }}>
      {[
        ['Para', 'marina@cliente.com.br'],
        ['Assunto', 'Proposta revisada'],
      ].map(([rotulo, valor]) => (
        <div
          key={rotulo}
          style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${CORES.borda}` }}
        >
          <span style={{ color: CORES.suave, width: 64 }}>{rotulo}</span>
          <span>{valor}</span>
        </div>
      ))}
      <div style={{ marginTop: 12, lineHeight: 1.6, minHeight: 96 }}>
        {TEXTO_EMAIL.slice(0, letras)}
        {letras < TEXTO_EMAIL.length && piscando && (
          <span style={{ display: 'inline-block', width: 2, height: 16, background: CORES.ciano, verticalAlign: -3 }} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <div
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            background: enviado > 0.5 ? 'rgba(34,197,94,0.16)' : CORES.ciano,
            color: enviado > 0.5 ? CORES.verde : CORES.noite,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {enviado > 0.5 ? 'Enviado' : 'Enviar'}
        </div>
        <span style={{ color: CORES.suave, fontSize: 12 }}>
          {enviado > 0.5 ? 'aprovado por você no WhatsApp' : 'precisa da sua aprovação'}
        </span>
      </div>
    </div>
  );
}

const LINHAS_RELATORIO = [
  [0.55, CORES.ciano],
  [0.82, 'rgba(255,255,255,0.35)'],
  [0.7, 'rgba(255,255,255,0.35)'],
  [0.4, CORES.violeta],
  [0.9, 'rgba(255,255,255,0.35)'],
  [0.62, 'rgba(255,255,255,0.35)'],
  [0.75, CORES.azul],
] as const;

function Relatorio({ frame }: { frame: number }) {
  const progresso = limitar(frame, [10, 300], [0, 1]);
  return (
    <div style={{ padding: 16, fontFamily: FONTE, color: CORES.texto }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
        <span style={{ fontFamily: FONTE_TITULO, fontWeight: 700 }}>Relatório semanal</span>
        <span style={{ color: CORES.suave, fontSize: 12 }}>rotina de toda segunda, 8h</span>
      </div>
      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {LINHAS_RELATORIO.map(([largura, cor], i) => {
          const v = limitar(frame, [20 + i * 30, 48 + i * 30], [0, largura]);
          return <div key={i} style={{ height: 10, borderRadius: 6, width: `${v * 100}%`, background: cor }} />;
        })}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: CORES.suave }}>
          <span>{progresso < 1 ? 'Escrevendo…' : 'Pronto'}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progresso * 100)}%</span>
        </div>
        <div style={{ marginTop: 6, height: 6, borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
          <div
            style={{
              width: `${progresso * 100}%`,
              height: '100%',
              borderRadius: 6,
              background: `linear-gradient(90deg, ${CORES.violeta}, ${CORES.ciano})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Bolha({ lado, children, aparece }: { lado: 'bot' | 'voce'; children: React.ReactNode; aparece: number }) {
  const bot = lado === 'bot';
  return (
    <div
      style={{
        alignSelf: bot ? 'flex-start' : 'flex-end',
        maxWidth: '88%',
        padding: '9px 12px',
        borderRadius: 14,
        borderTopLeftRadius: bot ? 4 : 14,
        borderTopRightRadius: bot ? 14 : 4,
        background: bot ? '#1F2C34' : '#005C4B',
        color: '#E9EDEF',
        fontFamily: FONTE,
        fontSize: 14,
        lineHeight: 1.45,
        opacity: aparece,
        transform: `translateY(${(1 - aparece) * 10}px)`,
      }}
    >
      {children}
    </div>
  );
}

function AprovacaoWhatsApp({ frame, fps }: { frame: number; fps: number }) {
  const entra = spring({ frame: frame - APROVACAO.entra, fps, config: { damping: 16 } });
  const sai = limitar(frame, [APROVACAO.sai, APROVACAO.sai + 16], [0, 1]);
  const pos = (1 - entra) * 120 + sai * 120;
  const opacidade = Math.min(entra, 1 - sai);
  if (opacidade <= 0) return null;
  const pedido = limitar(frame, [APROVACAO.pede, APROVACAO.pede + 10], [0, 1]);
  const resposta = limitar(frame, [APROVACAO.responde, APROVACAO.responde + 8], [0, 1]);
  const confirma = limitar(frame, [APROVACAO.confirma, APROVACAO.confirma + 8], [0, 1]);
  return (
    <div
      style={{
        position: 'absolute',
        right: 56,
        bottom: 40,
        width: 340,
        borderRadius: 26,
        padding: 10,
        background: '#0B141A',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,232,248,0.15)',
        opacity: opacidade,
        transform: `translateY(${pos}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 10px' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 99,
            background: CORES.noite,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid rgba(0,232,248,0.4)',
          }}
        >
          <MarcaBot tamanho={24} />
        </div>
        <div style={{ fontFamily: FONTE, color: '#E9EDEF' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>ArkoBot</div>
          <div style={{ fontSize: 12, color: '#8696A0' }}>WhatsApp</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 6 }}>
        <Bolha lado="bot" aparece={pedido}>
          <div style={{ color: CORES.ciano, fontWeight: 700, fontSize: 13 }}>#A7 · Atendimento · Caio</div>
          <div style={{ fontWeight: 600 }}>Enviar em seu nome?</div>
          <div style={{ color: '#AEBAC1' }}>Gmail: enviar e-mail para 1 contato</div>
          <div style={{ marginTop: 4 }}>1 Aprovar · 2 Recusar</div>
        </Bolha>
        <Bolha lado="voce" aparece={resposta}>
          1
        </Bolha>
        <Bolha lado="bot" aparece={confirma}>
          ✔ #A7: Aprovar. Feito, igual a no app.
        </Bolha>
      </div>
    </div>
  );
}

export function EquipeTrabalhando() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fimDoCiclo = limitar(frame, [durationInFrames - 18, durationInFrames], [1, 0]);
  const aparecer = (i: number) => Math.min(spring({ frame: frame - i * 6, fps, config: { damping: 18 } }), fimDoCiclo);
  const caioEsperando = frame >= APROVACAO.pede && frame < APROVACAO.responde;
  const trabalhando = caioEsperando ? 3 : 4;
  const brilho = 0.5 + 0.5 * Math.sin((frame / durationInFrames) * Math.PI * 2);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 500px at 15% 0%, rgba(0,232,248,${0.1 + brilho * 0.06}), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(139,92,246,0.14), transparent 60%), ${CORES.noite}`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: MARGEM,
          right: MARGEM,
          top: 24,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: FONTE,
        }}
      >
        <MarcaBot tamanho={34} />
        <span style={{ fontFamily: FONTE_TITULO, fontWeight: 800, fontSize: 24, color: '#fff', letterSpacing: -0.5 }}>
          arko<span style={{ color: CORES.ciano }}>bot</span>
        </span>
        <span style={{ marginLeft: 12, color: CORES.suave, fontSize: 15 }}>Equipe de bots · agora</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 999,
              background: 'rgba(34,197,94,0.12)',
              color: CORES.verde,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 9, background: CORES.verde }} />
            {trabalhando} bots trabalhando
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              borderRadius: 999,
              background: caioEsperando ? 'rgba(245,165,36,0.16)' : 'rgba(255,255,255,0.06)',
              color: caioEsperando ? CORES.ambar : CORES.suave,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 9, background: caioEsperando ? CORES.ambar : CORES.suave }} />
            {caioEsperando ? '1 esperando você' : '0 esperando você'}
          </span>
        </div>
      </div>

      <Monitor x={MARGEM} y={TOPO} bot="Ana" equipe="Vendas" estado="trabalhando" aparece={aparecer(0)}>
        <Navegador frame={frame} />
      </Monitor>
      <Monitor x={MARGEM + LARG_MONITOR + VAO} y={TOPO} bot="Beto" equipe="Financeiro" estado="trabalhando" aparece={aparecer(1)}>
        <Planilha frame={frame} />
      </Monitor>
      <Monitor x={MARGEM} y={TOPO + ALT_MONITOR + VAO} bot="Caio" equipe="Atendimento" estado={caioEsperando ? 'esperando' : 'trabalhando'} aparece={aparecer(2)}>
        <Email frame={frame} />
      </Monitor>
      <Monitor
        x={MARGEM + LARG_MONITOR + VAO}
        y={TOPO + ALT_MONITOR + VAO}
        bot="Duda"
        equipe="Marketing"
        estado="trabalhando"
        aparece={aparecer(3)}
      >
        <Relatorio frame={frame} />
      </Monitor>

      <AprovacaoWhatsApp frame={frame} fps={fps} />
    </AbsoluteFill>
  );
}
