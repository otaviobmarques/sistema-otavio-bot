import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { botPorId, equipe, type BotDaEquipe } from '@/config/equipe';
import { AvatarBot } from '@/components/AvatarBot';
import { CORES, Cursor, FONTE, FONTE_TITULO, MarcaBot } from './comum';

export const CONVERSA = { fps: 30, duracao: 660 };
export const CONVERSA_DESKTOP = { ...CONVERSA, largura: 1280, altura: 800 };
export const CONVERSA_CELULAR = { ...CONVERSA, largura: 390, altura: 780 };

type Anexo =
  | { tipo: 'arquivo'; nome: string; info: string }
  | { tipo: 'imagens' }
  | { tipo: 'aprovacao' };

type Mensagem =
  | { de: 'voce'; em: number; texto: string }
  | { de: 'sistema'; em: number; texto: string }
  | { de: string; em: number; digita: number; texto: string; anexo?: Anexo };

const ROTEIRO: Mensagem[] = [
  { de: 'voce', em: 12, texto: 'Bom dia, equipe! Preciso da campanha de Black Friday da Loja Online pronta até amanhã.' },
  {
    de: 'leo',
    em: 72,
    digita: 34,
    texto: 'Bom dia! Já dividi o trabalho: @Nina pesquisa a concorrência, @Duda cria os posts e @Ana prepara o e-mail para os clientes.',
  },
  { de: 'sistema', em: 104, texto: 'Léo passou tarefas para Nina, Duda e Ana' },
  {
    de: 'nina',
    em: 165,
    digita: 40,
    texto: 'Comparei 12 lojas do mesmo nicho. Sugiro 30% de desconto nos mais vendidos.',
    anexo: { tipo: 'arquivo', nome: 'pesquisa-concorrentes.pdf', info: 'PDF · 8 páginas' },
  },
  { de: 'duda', em: 240, digita: 38, texto: 'Fiz 3 versões do post. Qual você prefere?', anexo: { tipo: 'imagens' } },
  { de: 'voce', em: 300, texto: 'A segunda ficou ótima!' },
  {
    de: 'ana',
    em: 350,
    digita: 30,
    texto: 'E-mail pronto para os 1.240 clientes da sua lista.',
    anexo: { tipo: 'aprovacao' },
  },
  { de: 'ana', em: 452, digita: 22, texto: 'Enviado! Vou acompanhar as respostas e passar os pedidos para o @Caio.' },
  {
    de: 'beto',
    em: 515,
    digita: 34,
    texto: 'Custo de IA desta campanha até agora: R$ 3,20, dentro da verba de novembro da Loja Online.',
  },
];

const APROVA_EM = 412;
const CAIO_DIGITA = 570;
const ESCOLHE_IMAGEM = 300;

function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(@[A-Za-zÀ-ú]+)/).map((parte, i) =>
        parte.startsWith('@') ? (
          <span key={i} style={{ color: CORES.ciano, fontWeight: 700 }}>
            {parte}
          </span>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </>
  );
}

function Pontos({ frame }: { frame: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 9,
            background: CORES.suave,
            opacity: 0.4 + 0.6 * Math.max(0, Math.sin((frame / 5 - i) * 1.2)),
            transform: `translateY(${-2 * Math.max(0, Math.sin((frame / 5 - i) * 1.2))}px)`,
          }}
        />
      ))}
    </span>
  );
}

function Arquivo({ nome, info, compacto }: { nome: string; info: string; compacto: boolean }) {
  return (
    <div
      style={{
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: compacto ? '9px 12px' : '11px 14px',
        borderRadius: 14,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${CORES.borda}`,
        width: compacto ? 250 : 320,
      }}
    >
      <div
        style={{
          width: 38,
          height: 44,
          borderRadius: 8,
          background: 'linear-gradient(160deg, #FF6B6B, #C92A2A)',
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        PDF
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: CORES.texto, fontWeight: 600, fontSize: compacto ? 13 : 15, whiteSpace: 'nowrap' }}>{nome}</div>
        <div style={{ color: CORES.suave, fontSize: compacto ? 12 : 13 }}>{info}</div>
      </div>
    </div>
  );
}

const POSTS = [
  { fundo: 'linear-gradient(140deg,#111827,#000)', destaque: '#FACC15', linha: 'BLACK', grande: '-30%' },
  { fundo: 'linear-gradient(140deg,#7C3AED,#DB2777)', destaque: '#fff', linha: 'SÓ HOJE', grande: '-30%' },
  { fundo: 'linear-gradient(140deg,#00E8F8,#1E5BFF)', destaque: '#050817', linha: 'CUPOM', grande: 'BF30' },
];

function Imagens({ frame, compacto }: { frame: number; compacto: boolean }) {
  const lado = compacto ? 78 : 112;
  const escolhida = frame >= ESCOLHE_IMAGEM;
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
      {POSTS.map((p, i) => {
        const ativa = escolhida && i === 1;
        return (
          <div
            key={i}
            style={{
              width: lado,
              height: lado,
              borderRadius: 12,
              background: p.fundo,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              fontFamily: FONTE_TITULO,
              color: p.destaque,
              boxShadow: ativa ? `0 0 0 3px ${CORES.ciano}, 0 0 24px rgba(0,232,248,0.5)` : '0 6px 18px rgba(0,0,0,0.4)',
              transform: ativa ? 'scale(1.04)' : 'none',
              opacity: escolhida && !ativa ? 0.55 : 1,
            }}
          >
            <span style={{ fontSize: lado * 0.14, fontWeight: 800, letterSpacing: 1 }}>{p.linha}</span>
            <span style={{ fontSize: lado * 0.27, fontWeight: 800, lineHeight: 1 }}>{p.grande}</span>
          </div>
        );
      })}
    </div>
  );
}

function Aprovacao({ frame, compacto }: { frame: number; compacto: boolean }) {
  const aprovado = frame >= APROVA_EM;
  const clique = interpolate(frame, [APROVA_EM - 4, APROVA_EM + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        marginTop: 8,
        width: compacto ? 270 : 380,
        borderRadius: 16,
        padding: compacto ? 12 : 16,
        background: aprovado ? 'rgba(34,197,94,0.08)' : 'rgba(245,165,36,0.08)',
        border: `1px solid ${aprovado ? 'rgba(34,197,94,0.5)' : 'rgba(245,165,36,0.55)'}`,
        position: 'relative',
      }}
    >
      <div style={{ color: aprovado ? CORES.verde : CORES.ambar, fontWeight: 700, fontSize: compacto ? 12 : 13, letterSpacing: 0.3 }}>
        {aprovado ? 'APROVADO' : 'PRECISA DA SUA APROVAÇÃO'}
      </div>
      <div style={{ marginTop: 4, color: '#fff', fontWeight: 700, fontSize: compacto ? 15 : 17 }}>Enviar em seu nome?</div>
      <div style={{ marginTop: 2, color: CORES.suave, fontSize: compacto ? 13 : 14 }}>Gmail · enviar e-mail para 1.240 contatos</div>
      {aprovado ? (
        <div style={{ marginTop: 12, color: CORES.verde, fontWeight: 600, fontSize: compacto ? 13 : 14 }}>
          ✓ Aprovado por você
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <span
            style={{
              padding: compacto ? '7px 16px' : '9px 20px',
              borderRadius: 999,
              background: CORES.ciano,
              color: CORES.noite,
              fontWeight: 700,
              fontSize: compacto ? 13 : 14,
              transform: `scale(${1 - clique * 0.06})`,
            }}
          >
            Aprovar
          </span>
          <span
            style={{
              padding: compacto ? '7px 16px' : '9px 20px',
              borderRadius: 999,
              border: `1px solid ${CORES.borda}`,
              color: CORES.texto,
              fontWeight: 600,
              fontSize: compacto ? 13 : 14,
            }}
          >
            Recusar
          </span>
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: CORES.suave,
          fontSize: compacto ? 11 : 12,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 9, background: '#25D366' }} />
        {aprovado ? 'Decidido no app. O WhatsApp também foi avisado.' : 'Também chegou no seu WhatsApp: responda 1 para aprovar.'}
      </div>
    </div>
  );
}

function Entrada({ frame, em, children }: { frame: number; em: number; children: React.ReactNode }) {
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - em, fps, config: { damping: 20, stiffness: 140 } });
  return (
    <div style={{ maxHeight: p * 420, opacity: p, transform: `translateY(${(1 - p) * 14}px)`, flexShrink: 0 }}>{children}</div>
  );
}

function LinhaBot({
  bot,
  compacto,
  children,
}: {
  bot: BotDaEquipe;
  compacto: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: compacto ? 9 : 12, alignItems: 'flex-start', paddingTop: compacto ? 10 : 14 }}>
      <AvatarBot bot={bot} tamanho={compacto ? 34 : 42} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: compacto ? 14 : 15 }}>{bot.nome}</span>
          <span style={{ color: bot.cores[0], fontSize: compacto ? 11 : 12, fontWeight: 600 }}>{bot.funcao}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Mensagens({ frame, compacto }: { frame: number; compacto: boolean }) {
  const tamanho = compacto ? 14.5 : 16.5;
  const itens: React.ReactNode[] = [];
  for (const [i, m] of ROTEIRO.entries()) {
    if (m.de !== 'voce' && m.de !== 'sistema' && 'digita' in m && frame >= m.em - m.digita && frame < m.em) {
      const bot = botPorId(m.de);
      itens.push(
        <Entrada key={`d${i}`} frame={frame} em={m.em - m.digita}>
          <LinhaBot bot={bot} compacto={compacto}>
            <div style={{ color: CORES.suave, fontSize: compacto ? 13 : 14, marginTop: 4 }}>
              digitando
              <Pontos frame={frame} />
            </div>
          </LinhaBot>
        </Entrada>,
      );
    }
    if (frame < m.em) continue;
    if (m.de === 'voce') {
      itens.push(
        <Entrada key={i} frame={frame} em={m.em}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: compacto ? 10 : 14 }}>
            <div
              style={{
                maxWidth: compacto ? '82%' : '62%',
                padding: compacto ? '9px 13px' : '11px 16px',
                borderRadius: 18,
                borderBottomRightRadius: 6,
                background: 'linear-gradient(135deg, #00C8DA, #1E5BFF)',
                color: '#fff',
                fontSize: tamanho,
                lineHeight: 1.45,
              }}
            >
              {m.texto}
            </div>
          </div>
        </Entrada>,
      );
    } else if (m.de === 'sistema') {
      itens.push(
        <Entrada key={i} frame={frame} em={m.em}>
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: compacto ? 10 : 12 }}>
            <span
              style={{
                padding: '5px 12px',
                borderRadius: 999,
                background: 'rgba(0,232,248,0.08)',
                border: '1px solid rgba(0,232,248,0.25)',
                color: CORES.ciano,
                fontSize: compacto ? 11.5 : 13,
                fontWeight: 600,
              }}
            >
              ↪ {m.texto}
            </span>
          </div>
        </Entrada>,
      );
    } else if ('digita' in m) {
      const bot = botPorId(m.de);
      itens.push(
        <Entrada key={i} frame={frame} em={m.em}>
          <LinhaBot bot={bot} compacto={compacto}>
            <div
              style={{
                marginTop: 4,
                display: 'inline-block',
                maxWidth: compacto ? '100%' : '78%',
                padding: compacto ? '9px 13px' : '11px 16px',
                borderRadius: 18,
                borderTopLeftRadius: 6,
                background: 'rgba(255,255,255,0.07)',
                color: CORES.texto,
                fontSize: tamanho,
                lineHeight: 1.45,
              }}
            >
              <Texto texto={m.texto} />
            </div>
            {m.anexo?.tipo === 'arquivo' && <Arquivo nome={m.anexo.nome} info={m.anexo.info} compacto={compacto} />}
            {m.anexo?.tipo === 'imagens' && <Imagens frame={frame} compacto={compacto} />}
            {m.anexo?.tipo === 'aprovacao' && <Aprovacao frame={frame} compacto={compacto} />}
          </LinhaBot>
        </Entrada>,
      );
    }
  }
  if (frame >= CAIO_DIGITA) {
    itens.push(
      <Entrada key="caio" frame={frame} em={CAIO_DIGITA}>
        <LinhaBot bot={botPorId('caio')} compacto={compacto}>
          <div style={{ color: CORES.suave, fontSize: compacto ? 13 : 14, marginTop: 4 }}>
            respondendo um cliente
            <Pontos frame={frame} />
          </div>
        </LinhaBot>
      </Entrada>,
    );
  }
  return <>{itens}</>;
}

const NA_SALA = ['leo', 'nina', 'duda', 'ana', 'beto', 'caio'].map(botPorId);

function Pilha({ tamanho }: { tamanho: number }) {
  return (
    <div style={{ display: 'flex' }}>
      {NA_SALA.map((b, i) => (
        <div key={b.id} style={{ marginLeft: i ? -tamanho * 0.3 : 0, borderRadius: tamanho * 0.3, boxShadow: `0 0 0 2px ${CORES.noite}` }}>
          <AvatarBot bot={b} tamanho={tamanho} />
        </div>
      ))}
    </div>
  );
}

function Compositor({ compacto }: { compacto: boolean }) {
  return (
    <div
      style={{
        margin: compacto ? '0 10px 12px' : '0 28px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: compacto ? '10px 12px' : '13px 16px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${CORES.borda}`,
        color: CORES.suave,
        fontSize: compacto ? 13.5 : 15,
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: 99, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
        +
      </span>
      <span style={{ flex: 1 }}>Mensagem para a sala Loja Online</span>
      <span style={{ width: 30, height: 30, borderRadius: 99, background: CORES.ciano, display: 'grid', placeItems: 'center', color: CORES.noite, fontWeight: 800 }}>
        ↑
      </span>
    </div>
  );
}

function fimDoCiclo(frame: number, duracao: number) {
  return interpolate(frame, [duracao - 16, duracao], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

type Estado = { texto: string; tom: 'ambar' | 'verde' | 'neutro'; hora: string };

function estadoDe(id: string, frame: number): Estado {
  const entre = (a: number, b: number) => frame >= a && frame < b;
  switch (id) {
    case 'leo':
      return frame < 72 ? { texto: 'Lendo o seu pedido…', tom: 'verde', hora: 'agora' } : { texto: 'Dividiu a campanha', tom: 'neutro', hora: '9:01' };
    case 'nina':
      if (entre(125, 165)) return { texto: 'Pesquisando concorrentes…', tom: 'verde', hora: 'agora' };
      return frame >= 165 ? { texto: 'Pesquisa entregue', tom: 'neutro', hora: '9:04' } : { texto: 'Dias úteis às 8h', tom: 'neutro', hora: '8:00' };
    case 'duda':
      if (entre(202, 240)) return { texto: 'Criando os posts…', tom: 'verde', hora: 'agora' };
      return frame >= 240 ? { texto: 'Posts prontos', tom: 'neutro', hora: '9:06' } : { texto: 'Todo dia às 10h', tom: 'neutro', hora: 'ontem' };
    case 'ana':
      if (entre(320, 350)) return { texto: 'Escrevendo o e-mail…', tom: 'verde', hora: 'agora' };
      if (entre(350, APROVA_EM)) return { texto: 'Esperando o seu sim', tom: 'ambar', hora: 'agora' };
      return frame >= APROVA_EM ? { texto: 'E-mail enviado', tom: 'neutro', hora: '9:09' } : { texto: 'Dias úteis às 9h', tom: 'neutro', hora: '9:00' };
    case 'beto':
      if (entre(481, 515)) return { texto: 'Somando o custo…', tom: 'verde', hora: 'agora' };
      return frame >= 515 ? { texto: 'Custo dentro da verba', tom: 'neutro', hora: '9:11' } : { texto: 'Segundas às 9h', tom: 'neutro', hora: 'seg.' };
    case 'caio':
      return frame >= CAIO_DIGITA ? { texto: 'Respondendo um cliente…', tom: 'verde', hora: 'agora' } : { texto: 'A cada 30 minutos', tom: 'neutro', hora: '8:30' };
    case 'rafa':
      return { texto: 'Dias úteis às 8h', tom: 'neutro', hora: '8:00' };
    default:
      return { texto: 'Segundas às 6h', tom: 'neutro', hora: 'seg.' };
  }
}

const COR_ESTADO = { ambar: CORES.ambar, verde: CORES.verde, neutro: CORES.suave };

function LinhaDaLista({ bot, frame }: { bot: BotDaEquipe; frame: number }) {
  const e = estadoDe(bot.id, frame);
  return (
    <div style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: e.tom === 'ambar' ? 'rgba(245,165,36,0.1)' : 'transparent' }}>
      <div style={{ position: 'relative' }}>
        <AvatarBot bot={bot} tamanho={38} />
        {e.tom !== 'neutro' && (
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 11, height: 11, borderRadius: 9, background: COR_ESTADO[e.tom], boxShadow: '0 0 0 2px #0A1028' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{bot.nome}</span>
          <span style={{ color: CORES.suave, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bot.funcao}</span>
          <span style={{ marginLeft: 'auto', color: CORES.suave, fontSize: 11 }}>{e.hora}</span>
        </div>
        <div style={{ color: e.tom === 'neutro' ? CORES.suave : COR_ESTADO[e.tom], fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: e.tom === 'ambar' ? 600 : 400 }}>
          {e.texto}
        </div>
      </div>
    </div>
  );
}

export function ConversaDesktop() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cursorX = interpolate(frame, [360, 404], [1180, 478], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cursorY = interpolate(frame, [360, 404], [760, 616], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const clique = interpolate(frame, [APROVA_EM - 4, APROVA_EM + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const mostraCursor = frame > 356 && frame < 440;

  return (
    <AbsoluteFill style={{ background: CORES.noite, fontFamily: FONTE, display: 'flex', flexDirection: 'row' }}>
      <div style={{ width: 300, background: '#0A1028', borderRight: `1px solid ${CORES.borda}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 12px' }}>
          <MarcaBot tamanho={26} />
          <span style={{ fontFamily: FONTE_TITULO, fontWeight: 800, fontSize: 19, color: '#fff' }}>
            arko<span style={{ color: CORES.ciano }}>bot</span>
          </span>
          <span style={{ marginLeft: 'auto', color: CORES.suave, fontSize: 20 }}>+</span>
        </div>
        <div style={{ margin: '0 4px 8px', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${CORES.borda}`, color: CORES.suave, fontSize: 13.5 }}>
          Buscar
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: 12, background: 'rgba(0,232,248,0.1)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(0,232,248,0.15)', display: 'grid', placeItems: 'center', color: CORES.ciano, fontWeight: 800, fontSize: 18 }}>#</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Loja Online</div>
            <div style={{ color: CORES.suave, fontSize: 12.5 }}>Sala · 6 bots e você</div>
          </div>
        </div>
        <div style={{ margin: '10px 10px 2px', color: CORES.suave, fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>BOTS</div>
        {equipe.map((b) => (
          <LinhaDaLista key={b.id} bot={b} frame={frame} />
        ))}
        <div style={{ marginTop: 'auto', display: 'flex', gap: 16, padding: '10px 10px 2px', color: CORES.suave, fontSize: 13 }}>
          <span>Automações</span>
          <span>Apps</span>
          <span>Prédio</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: fimDoCiclo(frame, durationInFrames) }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 14, padding: '0 26px', borderBottom: `1px solid ${CORES.borda}` }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}># Loja Online</div>
            <div style={{ color: CORES.suave, fontSize: 13 }}>Campanha de Black Friday</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Pilha tamanho={28} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 26px 14px' }}>
          <Mensagens frame={frame} compacto={false} />
        </div>
        <Compositor compacto={false} />
      </div>
      {mostraCursor && <Cursor x={cursorX} y={cursorY} clique={clique > 0 && clique < 1 ? clique : 0} />}
    </AbsoluteFill>
  );
}

export function ConversaCelular() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: CORES.noite, fontFamily: FONTE, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${CORES.borda}`, background: '#0A1028' }}>
        <span style={{ color: CORES.texto, fontSize: 22 }}>‹</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}># Loja Online</div>
          <div style={{ color: CORES.suave, fontSize: 12 }}>6 bots e você</div>
        </div>
        <Pilha tamanho={24} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 12px 10px', opacity: fimDoCiclo(frame, durationInFrames) }}>
        <Mensagens frame={frame} compacto />
      </div>
      <Compositor compacto />
    </AbsoluteFill>
  );
}
