import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { companies, statusLabel, totalBudget, type Bot, type Status } from "../data/mock";
import { Logo } from "../components/Shell";
import { Bar, Dot, Rich, StatusDot, useIsMobile } from "../components/ui";
import { palette } from "../lib/colors";
import { useCounts, usePortal } from "../state/store";
import { BuildingView } from "../live/BuildingView";
import { PENTHOUSE, buildWorld, eventsBetween } from "../live/sim";

const InteriorView = lazy(() => import("../live/InteriorView"));

const ambientEvents = [
  "**Max** ajustou os lances da Academia Pulso",
  "**Kim** respondeu 3 clientes no WhatsApp",
  "**Gui** respondeu a revisão do PR 142",
  "**Caio** importou o cardápio do Sabor de Minas",
  "**Sol** fechou 2 chamados da Domma",
  "**Davi** exportou a versão vertical do corte",
  "**Nina** reenviou o boleto da Pizzaria Bella",
  "**Noa** confirmou o estúdio para amanhã",
];

const clockLabel = (t: number) => {
  const total = 16 * 3600 + 7 * 60 + Math.floor(t * 10);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function usePrefersReducedMotion() {
  const q = "(prefers-reduced-motion: reduce)";
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setR(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return r;
}

const levelTitle = (l: number) => {
  if (l === PENTHOUSE) return { tag: "Cobertura", name: "Presidência", sub: "Sala do conselho" };
  if (l === 0) return { tag: "Térreo", name: "Recepção", sub: "Entrada e visitantes" };
  const co = companies.find((c) => c.floor === l)!;
  return { tag: co.floorLabel, name: co.name, sub: co.tagline };
};

export function AoVivoPage() {
  const { companyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, decide, toast } = usePortal();
  const counts = useCounts();
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);

  const floor = location.pathname.startsWith("/ao-vivo/presidencia")
    ? PENTHOUSE
    : companyId
      ? (companies.find((c) => c.id === companyId)?.floor ?? null)
      : null;

  const compKey = state.bots.map((b) => `${b.id}:${b.hired}:${b.companyId}:${b.departmentId}`).join("|");
  const world = useMemo(() => buildWorld(state.bots), [compKey]);

  const clock = useRef({ t: Number(new URLSearchParams(location.search).get("t")) || 0, frozen: reduced });
  clock.current.frozen = reduced;
  const [t, setT] = useState(0);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;
  const fast = floor === null;
  const fastRef = useRef(fast);
  fastRef.current = fast;

  const [events, setEvents] = useState<{ id: number; time: string; text: string }[]>([
    { id: -3, time: "16:05", text: "**Téo** pediu aprovação para enviar 12 propostas" },
    { id: -2, time: "16:03", text: "**Gui** pediu aprovação para o deploy do PR 142" },
    { id: -1, time: "16:01", text: "**Otávio** travou no 2FA do Canva" },
  ]);

  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let lastUi = 0;
    let lastEventT = clock.current.t;
    let lastAmbient = 0;
    const tick = (now: number) => {
      if (last !== null && !pausedRef.current) {
        const dt = Math.min(0.1, (now - last) / 1000);
        clock.current.t += dt * speedRef.current;
      }
      last = now;
      const ct = clock.current.t;
      if (fastRef.current || now - lastUi > 250) {
        lastUi = now;
        setT(ct);
      }
      if (ct > lastEventT) {
        const add: string[] = [];
        if (!clock.current.frozen) for (const e of eventsBetween(world, lastEventT, ct)) add.push(e.text);
        const slot = Math.floor(ct / 9);
        if (slot !== lastAmbient && slot > 0) {
          lastAmbient = slot;
          add.push(ambientEvents[slot % ambientEvents.length]!);
        }
        lastEventT = ct;
        if (add.length) setEvents((ev) => [...add.reverse().map((text, i) => ({ id: now + i + Math.random(), time: clockLabel(ct), text })), ...ev].slice(0, 9));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  const openBot = (b: Bot) => navigate(b.status === "bloqueado" ? `/computador/${b.id}` : `/chat/${b.id}`);
  const openBotId = (id: string) => {
    const b = state.bots.find((x) => x.id === id);
    if (b && !b.hired) navigate("/conselho");
    else if (b) openBot(b);
  };
  const goLevel = (l: number) => {
    if (l === PENTHOUSE) navigate("/ao-vivo/presidencia");
    else if (l === 0) toast("Térreo: recepção. O Vini aguarda a decisão do conselho no sofá.");
    else {
      const co = companies.find((c) => c.floor === l);
      if (co) navigate(`/ao-vivo/andar/${co.id}`);
    }
  };

  const spent = totalBudget.spent + t * 0.02;
  const pendingFirst = state.approvals[0];
  const pendingBot = pendingFirst ? state.bots.find((b) => b.id === pendingFirst.botId) : undefined;

  const tableChip = (
    <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-wait/80 bg-[#120e04]/90 px-2.5 py-1 text-[11px] font-semibold text-wait shadow-[0_6px_20px_#0008]">
      <span className="h-1.5 w-1.5 rounded-full bg-wait" />
      {pendingFirst ? `Na mesa: ${pendingFirst.tag.replace("regra: ", "")}` : "Mesa livre"}
    </div>
  );
  const tableCard = pendingFirst ? (
    <div className="w-[300px] rounded-xl border border-wait/80 bg-[#120e04]/95 px-3.5 py-3 text-left shadow-[0_12px_40px_#0009] backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-wait">Na mesa · {state.approvals.length} pendentes</span>
        <span className="text-[11px] text-muted">{pendingFirst.context}</span>
      </div>
      <div className="mt-1 text-[12.5px] font-semibold text-white">
        {pendingBot?.name} · {pendingBot?.role}
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-soft">
        <Rich text={pendingFirst.text} />
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button className="btn btn-ok px-2.5 py-1 text-[12px]" onClick={() => decide(pendingFirst.id, 0)}>
          {pendingFirst.options[0]?.shortLabel ?? pendingFirst.options[0]?.label}
        </button>
        <Link to="/conselho" className="btn px-2.5 py-1 text-[12px]">
          Ver no conselho
        </Link>
      </div>
    </div>
  ) : (
    <div className="rounded-xl border border-ok/60 bg-ink-850/95 px-3.5 py-2.5 text-[12.5px] text-soft">Nada pendente na mesa.</div>
  );

  const title = floor === null ? null : levelTitle(floor);
  const accent = floor !== null && floor > 0 && floor < PENTHOUSE ? palette[companies.find((c) => c.floor === floor)!.color].accent : floor === PENTHOUSE ? "#f59e0b" : "#3b82f6";

  return (
    <div className="flex min-h-screen flex-col bg-ink-900 lg:h-screen">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <Logo compact />
        <span className="font-display text-[17px] font-semibold text-white">Prédio Otávio</span>
        <span className="hidden text-[13px] text-muted sm:inline">· ao vivo</span>
        <span className="chip hidden md:inline-flex">
          <Dot color="#22c55e" size={7} /> {counts.working} trabalhando · {counts.waiting} esperando você · {counts.blocked} bloqueado
        </span>
        <span className="chip font-mono text-[13px] text-white">{clockLabel(t)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Link to="/" className="btn hidden sm:inline-flex">
            <ArrowLeft size={15} /> Painel
          </Link>
          <button className="btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? "Continuar" : "Pausar"}
          </button>
          {[1, 2, 4].map((s) => (
            <button key={s} className={`btn w-11 px-0 ${speed === s ? "border-tavinho bg-tavinho/10" : ""}`} onClick={() => setSpeed(s)} aria-pressed={speed === s}>
              {s}x
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className={`live-stage relative flex-1 overflow-hidden lg:min-h-0 ${floor === null ? "min-h-0" : "min-h-[56vh]"}`}>
          {floor === null ? (
            mobile ? (
              <div className="flex flex-col">
                <div className="px-2 pt-2">
                  <BuildingView world={world} bots={state.bots} approvals={state.approvals} t={t} frozen={reduced} compact onFloor={goLevel} onBot={openBot} />
                </div>
                <div className="grid grid-cols-2 gap-1.5 px-3 pb-3 pt-2">
                  {[5, 4, 3, 2, 1].map((l) => {
                    const lt = levelTitle(l);
                    const col = l === PENTHOUSE ? "#f59e0b" : palette[companies.find((c) => c.floor === l)!.color].accent;
                    return (
                      <button key={l} className="hud-btn justify-start px-3 py-2 text-left" onClick={() => goLevel(l)}>
                        <span className="h-6 w-1 rounded-full" style={{ background: col }} />
                        <span>
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">{lt.tag}</span>
                          <span className="block text-[13px] text-white">{lt.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-3">
                <BuildingView world={world} bots={state.bots} approvals={state.approvals} t={t} frozen={reduced} onFloor={goLevel} onBot={openBot} />
              </div>
            )
          ) : (
            <div className="absolute inset-0">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-muted">Carregando o andar…</div>}>
                <InteriorView
                  key={floor}
                  floor={floor}
                  world={world}
                  bots={state.bots}
                  approvals={state.approvals.length}
                  clock={clock}
                  onBot={openBotId}
                  onTable={() => navigate("/conselho")}
                  tableCard={floor === PENTHOUSE ? tableChip : undefined}
                />
              </Suspense>
              {floor === PENTHOUSE && <div className="absolute bottom-3 left-3 max-w-[calc(100%-24px)]">{tableCard}</div>}
              <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-start gap-2">
                <Link to="/ao-vivo" className="hud-btn pointer-events-auto px-3 py-2">
                  <ArrowLeft size={15} /> Voltar ao prédio
                </Link>
                {title && (
                  <div className="hud-panel pointer-events-auto flex items-center gap-2.5 px-3 py-1.5">
                    <span className="h-7 w-1.5 rounded-full" style={{ background: accent }} />
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title.tag}</div>
                      <div className="text-[14px] font-semibold leading-tight text-white">
                        {title.name} <span className="font-normal text-muted">· {title.sub}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="pointer-events-auto ml-auto hidden gap-1 md:flex">
                  {[5, 4, 3, 2, 1].map((l) => (
                    <button key={l} className="hud-btn px-2.5 py-1.5" aria-pressed={floor === l} onClick={() => goLevel(l)} title={levelTitle(l).name}>
                      {l === PENTHOUSE ? "Cobertura" : `${l}º`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className="w-full shrink-0 space-y-3 border-line p-4 pb-28 lg:pb-4 lg:w-[300px] lg:overflow-y-auto lg:border-l">
          <section className="hud-panel px-4 py-3.5">
            <div className="eyebrow mb-2">Eventos</div>
            <ul className="space-y-1.5 text-[12.5px] leading-snug text-soft">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-[11px] text-muted">{e.time}</span>
                  <span>
                    <Rich text={e.text} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="hud-panel px-4 py-3.5">
            <div className="eyebrow mb-1.5">Gasto de API agora</div>
            <div className="font-display text-[20px] font-semibold text-white">R$ {spent.toFixed(2).replace(".", ",")}</div>
            <div className="text-[12px] text-muted">de R$ {totalBudget.cap.toLocaleString("pt-BR")} no mês</div>
            <div className="mt-2.5 space-y-2 text-[12px] text-soft">
              {companies.map((co, i) => {
                const v = co.budget.spent + t * (0.004 + i * 0.002);
                return (
                  <div key={co.id}>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-1.5">
                        <Dot color={palette[co.color].accent} size={7} /> {co.name}
                      </span>
                      <span className="text-muted">
                        R$ {v.toFixed(0)} / {co.budget.cap}
                      </span>
                    </div>
                    <Bar value={v} max={co.budget.cap} className="mt-1" color={palette[co.color].accent} />
                  </div>
                );
              })}
            </div>
          </section>
          <section className="hud-panel px-4 py-3">
            <div className="eyebrow mb-1.5">Legenda</div>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] text-soft">
              {(Object.keys(statusLabel) as Status[]).map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <StatusDot status={s} size={7} /> {s === "esperando" ? "aprovação" : s === "bloqueado" ? "bloqueado" : statusLabel[s]}
                </li>
              ))}
            </ul>
          </section>
          <p className="px-1 text-[12px] leading-relaxed text-muted">
            {floor === null
              ? "Clique num andar para entrar. Clique num bot para abrir o chat dele. A cobertura é a sala do conselho."
              : "Arraste para girar, use a roda do mouse para aproximar. Clique num bot para abrir o chat dele."}
          </p>
        </aside>
      </div>
    </div>
  );
}

export default AoVivoPage;
