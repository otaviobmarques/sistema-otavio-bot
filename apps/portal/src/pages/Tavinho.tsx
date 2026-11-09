import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { companies } from "../data/mock";
import { Dot, useIsMobile } from "../components/ui";
import { useCounts, usePortal } from "../state/store";

type Mode = "ouvindo" | "executando" | "atencao";
const modeColor: Record<Mode, { core: string; ring: string; label: string }> = {
  ouvindo: { core: "#93c5fd", ring: "#3b82f6", label: "ouvindo" },
  executando: { core: "#86efac", ring: "#22c55e", label: "executando uma ação" },
  atencao: { core: "#fca5a5", ring: "#ef4444", label: "precisa de você" },
};

const commands = ["aprova os três primeiros", "abre o computador do Otávio", "manda a Lia escrever um post", "quanto gastamos hoje?", "modo silencioso"];

export function TavinhoPage() {
  const { state, decide, toast } = usePortal();
  const counts = useCounts();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [mode, setMode] = useState<Mode>("ouvindo");
  const [question, setQuestion] = useState("Tavinho, como estão os leads de franquia e o que o Otávio está fazendo?");
  const [answer, setAnswer] = useState(
    "Doze leads novos essa semana. O Téo preparou a proposta e está esperando você aprovar o envio. O Otávio travou no login do Canva — precisa do código de 2FA. Quer que eu abra a tela dele?",
  );
  useEffect(() => {
    if (mode === "ouvindo") return;
    const t = setTimeout(() => setMode("ouvindo"), 2600);
    return () => clearTimeout(t);
  }, [mode]);

  const run = (cmd: string) => {
    setQuestion(cmd);
    if (cmd.startsWith("aprova")) {
      const ap = state.approvals.find((a) => a.id === "ap-teo");
      if (ap) {
        decide(ap.id, 1);
        setAnswer("Feito. Aprovei o envio para os três primeiros leads. O Téo te avisa quando responderem.");
        setMode("executando");
      } else {
        setAnswer("Não há envio do Téo esperando você agora.");
        setMode("ouvindo");
      }
    } else if (cmd.startsWith("abre")) {
      setAnswer("Abrindo o computador do Otávio.");
      setMode("executando");
      setTimeout(() => navigate("/computador/otavio"), 700);
    } else if (cmd.startsWith("manda")) {
      setAnswer("Pedi à Lia um post sobre franquias para quinta. Como é publicação, ela vai preparar e esperar sua aprovação.");
      setMode("executando");
    } else if (cmd.startsWith("quanto")) {
      setAnswer("Hoje foram R$ 41 em tokens, somando as três empresas. No mês, R$ 733 de R$ 1.500.");
      setMode("ouvindo");
    } else {
      setAnswer("Modo silencioso ligado. Só aviso aprovações e bloqueios até as 8h.");
      setMode("ouvindo");
    }
  };

  const needs = [
    ...state.approvals.map((a) => {
      const bot = state.bots.find((b) => b.id === a.botId);
      const label = a.id === "ap-teo" ? "enviar proposta para 12 leads" : a.id === "ap-vini" ? "contratar Vini (TikTok)" : a.id === "ap-max" ? "subir orçamento da Auto Visão" : a.tag;
      return { id: a.id, color: "#f59e0b", text: `${bot?.name ?? "Bot"} · ${label}` };
    }),
    ...state.bots.filter((b) => b.hired && b.status === "bloqueado").map((b) => ({ id: b.id, color: "#ef4444", text: `${b.name} · 2FA do Canva` })),
  ];
  const c = modeColor[mode];

  const companyLine = (id: string) => {
    const bots = state.bots.filter((b) => b.companyId === id && b.hired);
    const blocked = bots.filter((b) => b.status === "bloqueado").length;
    const waiting = bots.filter((b) => b.status === "esperando").length;
    const tail = blocked ? `${blocked} bloqueado` : waiting ? `${waiting} aprovação` : `${bots.filter((b) => b.status === "trabalhando").length} ativos`;
    return `${bots.length} bots · ${tail}`;
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#0d1424_0%,#06080d_70%)] font-mono text-[12.5px] text-muted">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-5 sm:px-7">
        <span className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-tavinho-soft">Tavinho · assistente pessoal</span>
        <span className="flex items-center gap-2">
          <Dot color="#22c55e" /> {modeColor[mode].label} · microfone local · Whisper
        </span>
        <span className="ml-auto hidden sm:inline">
          dom 8 nov · 15:58 &nbsp; {companies.length} empresas · {counts.total} bots ativos
        </span>
        {!mobile && (
          <Link to="/" className="ml-3 rounded-md p-1 text-muted hover:text-white" title="Fechar o HUD">
            <X size={16} />
          </Link>
        )}
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center lg:block">
        <aside className="z-10 w-full space-y-3 px-5 pt-5 sm:px-7 lg:absolute lg:left-0 lg:top-12 lg:w-[328px]">
          <Panel title="Precisa de você">
            {needs.length === 0 && <p className="font-sans text-soft">Nada pendente.</p>}
            <ul className="space-y-1.5 font-sans text-[13.5px] text-white">
              {needs.map((n) => (
                <li key={n.id} className="flex items-center gap-2.5">
                  <Dot color={n.color} /> {n.text}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Comandos de voz">
            <ul className="space-y-1.5">
              {commands.map((cmd) => (
                <li key={cmd}>
                  <button className="text-left text-soft/80 hover:text-white" onClick={() => run(cmd)}>
                    “{cmd}”
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>

        <aside className="z-10 hidden w-[328px] space-y-3 px-7 lg:absolute lg:right-0 lg:top-12 lg:block">
          <Panel title="Prédio agora">
            <ul className="space-y-1.5 font-sans text-[13.5px]">
              {companies.map((co) => (
                <li key={co.id} className="flex justify-between gap-2">
                  <span className="text-white">{co.name}</span>
                  <span>{companyLine(co.id)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Hoje">
            <ul className="space-y-1.5 font-sans text-[13.5px]">
              <li className="flex justify-between text-white">
                Tarefas concluídas <strong>23</strong>
              </li>
              <li className="flex justify-between text-white">
                Gasto em tokens <strong>R$ 41</strong>
              </li>
              <li className="flex justify-between text-white">
                Mensagens no WhatsApp <strong>37</strong>
              </li>
            </ul>
          </Panel>
          <div className="rounded-xl border border-ok/40 bg-ink-900/70 px-4 py-3.5">
            <div className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-ok">Estado do Tavinho</div>
            <p className="font-sans text-[13px] leading-relaxed text-soft">
              Azul: ouvindo e falando.
              <br />
              Verde: executando uma ação.
              <br />
              Vermelho: precisa de aprovação ou algo travou.
            </p>
          </div>
        </aside>

        <div className="flex flex-1 items-center justify-center py-6 lg:absolute lg:inset-0 lg:pb-44">
          <button
            onClick={() => setMode(mode === "ouvindo" ? "executando" : mode === "executando" ? "atencao" : "ouvindo")}
            aria-label="Núcleo do Tavinho: clique para alternar o estado"
            className="relative flex h-[300px] w-[300px] items-center justify-center sm:h-[520px] sm:w-[520px]"
          >
            <span className="anim-spin-slow absolute inset-0 rounded-full border border-dashed" style={{ borderColor: `${c.ring}55` }} />
            <span className="absolute inset-[9%] rounded-full border" style={{ borderColor: `${c.ring}66` }}>
              <span className="absolute left-1/2 top-[-6px] h-3 w-px -translate-x-1/2" style={{ background: c.ring }} />
              <span className="absolute left-[-6px] top-1/2 h-px w-3 -translate-y-1/2" style={{ background: c.ring }} />
              <span className="absolute right-[-6px] top-1/2 h-px w-3 -translate-y-1/2" style={{ background: c.ring }} />
            </span>
            <span className="absolute inset-[19%] rounded-full border-[3px] transition-colors duration-500" style={{ borderColor: c.ring, boxShadow: `0 0 60px ${c.ring}55, inset 0 0 40px ${c.ring}33` }} />
            <span className="absolute inset-[29%] rounded-full border" style={{ borderColor: "#33415580" }} />
            <span
              className="anim-orb h-[24%] w-[24%] rounded-full transition-colors duration-500"
              style={{ background: `radial-gradient(circle, #ffffff 0%, ${c.core} 35%, ${c.ring} 75%, transparent 100%)`, boxShadow: `0 0 80px ${c.ring}` }}
            />
          </button>
        </div>

        <div className="z-10 px-6 pb-6 text-center lg:absolute lg:inset-x-0 lg:bottom-16">
          <div className="mb-2 flex h-10 items-end justify-center gap-[5px]" aria-hidden>
            {Array.from({ length: 11 }, (_, i) => (
              <span
                key={i}
                className="anim-wave w-[4px] rounded-full"
                style={{ height: 10 + ((i * 37) % 30), background: c.core, animationDelay: `${(i % 5) * 0.12}s` }}
              />
            ))}
          </div>
          <p className="font-sans text-[13.5px] italic text-muted">Você: “{question}”</p>
          <p className="mx-auto mt-2 max-w-[760px] font-sans text-[17px] leading-relaxed text-white sm:text-[20px]">{answer}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 font-sans">
            <Link to="/computador/otavio" className="btn">
              Abrir a tela do Otávio
            </Link>
            <Link to="/conselho" className="btn">
              Ir para o conselho
            </Link>
            <button className="btn" onClick={() => toast("Fale agora: o Tavinho está ouvindo (simulado).")}>
              Falar
            </button>
          </div>
        </div>
      </div>

      <footer className="hidden justify-between px-7 pb-5 sm:flex">
        <span>atalho: Ctrl+Espaço para falar</span>
        <span>voz: ElevenLabs · pt-BR</span>
      </footer>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-tavinho/25 bg-ink-900/70 px-4 py-3.5">
      <div className="mb-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-tavinho-soft/80">{title}</div>
      {children}
    </section>
  );
}
