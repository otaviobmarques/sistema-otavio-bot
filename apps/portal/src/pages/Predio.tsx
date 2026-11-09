import { Building, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { companies, feed, nowLabel, statusLabel, totalBudget, type Bot, type Status } from "../data/mock";
import { Figurinha } from "../components/Figurinha";
import { Bar, Dot, InitialsTile, Rich, StatusDot, useIsMobile } from "../components/ui";
import { Logo } from "../components/Shell";
import { toneColor } from "../lib/colors";
import { useCounts, usePortal } from "../state/store";

function useBotNavigation() {
  const navigate = useNavigate();
  const { state } = usePortal();
  return (bot: Bot) => {
    if (bot.status === "bloqueado") navigate(`/computador/${bot.id}`);
    else if (state.conversations.some((c) => c.botId === bot.id)) navigate(`/chat/${bot.id}`);
    else navigate(`/computador/${bot.id}`);
  };
}

const providersOf = (list: Bot[]) => [...new Set(list.map((b) => b.provider))].join(" · ");

export function PredioPage() {
  const mobile = useIsMobile();
  return mobile ? <PredioMobile /> : <PredioDesktop />;
}

function PredioDesktop() {
  const { state, toast } = usePortal();
  const counts = useCounts();
  const openBot = useBotNavigation();
  const hired = state.bots.filter((b) => b.hired);
  const pending = state.bots.filter((b) => !b.hired);
  const tavinho = hired.find((b) => b.id === "tavinho");
  const blocked = hired.filter((b) => b.status === "bloqueado");
  const decidedTeo = !state.approvals.some((a) => a.id === "ap-teo");
  const otavioBlocked = hired.some((b) => b.id === "otavio" && b.status === "bloqueado");
  const liveFeed = feed.filter((f) => !(f.id === "f-1" && decidedTeo) && !(f.id === "f-2" && !otavioBlocked));

  return (
    <div className="grid min-h-[calc(100vh-62px)] grid-cols-[minmax(0,1fr)_376px]">
      <main className="px-7 pb-8 pt-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[27px] font-semibold text-white">Prédio Otávio</h1>
            <p className="mt-1 text-[14.5px] text-muted">
              {companies.length} empresas · {counts.total} bots · {nowLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-3">
            <Link to="/ao-vivo" className="btn border-ok/70 text-white">
              <Dot color="#22c55e" /> Ver ao vivo
            </Link>
            <button className="btn" onClick={() => toast("Nova empresa: no protótipo, use um template como o da Master Laudo IA.")}>
              <Building size={15} /> Nova empresa
            </button>
            <Link to="/contratar" className="btn btn-primary">
              <Plus size={16} /> Contratar bot
            </Link>
          </div>
        </div>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <span className="eyebrow">Cobertura · Diretoria</span>
            {tavinho && <InitialsTile bot={{ ...tavinho, initials: "TV" }} onClick={() => openBot(tavinho)} />}
          </div>

          {companies.map((co) => {
            const coBots = hired.filter((b) => b.companyId === co.id);
            return (
              <div key={co.id} className="grid grid-cols-[224px_1fr] gap-6 border-b border-line px-6 py-5">
                <div className="pt-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{co.floorLabel}</div>
                  <Link to={`/empresas/${co.id}`} className="font-display text-[17px] font-semibold text-white hover:underline">
                    {co.name}
                  </Link>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {coBots.length} bots · R$ {co.budget.spent} / R$ {co.budget.cap} este mês
                  </div>
                  <Bar value={co.budget.spent} max={co.budget.cap} className="mt-3 max-w-[200px]" />
                </div>
                <div className="grid grid-cols-3 gap-3.5">
                  {co.departments.map((d) => {
                    const room = coBots.filter((b) => b.departmentId === d.id);
                    return (
                      <div key={d.id} className="rounded-xl border border-line bg-ink-850 px-4 py-4">
                        <div className="text-[13.5px] font-medium text-white">{d.name}</div>
                        <div className="mt-3 flex min-h-[46px] gap-2.5">
                          {room.map((b) => (
                            <InitialsTile key={b.id} bot={b} onClick={() => openBot(b)} />
                          ))}
                          {room.length === 0 && <span className="self-center text-xs text-muted">sala vazia</span>}
                        </div>
                        <div className="mt-3 text-[11.5px] text-muted">{providersOf(room)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-[224px_1fr] gap-6 px-6 py-5">
            <div className="pt-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Térreo</div>
              <div className="font-display text-[17px] font-semibold text-white">Recepção e conselho</div>
              <div className="mt-1 text-[12.5px] text-muted">Entradas e decisões suas</div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="rounded-xl border border-line bg-ink-850 px-4 py-4">
                <div className="text-[13.5px] font-medium text-white">Recepção · o Tavinho encaminha</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip">
                    <Dot color="#22c55e" size={7} /> WhatsApp · 7 conversas
                  </span>
                  <span className="chip">
                    <Dot color="#22c55e" size={7} /> Voz · ouvindo
                  </span>
                  <span className="chip">
                    <Dot color="#6b7280" size={7} /> E-mail · 0
                  </span>
                </div>
                {pending.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {pending.map((b) => (
                      <Link key={b.id} to="/conselho" className="flex items-center gap-2 rounded-lg border border-wait/60 px-2 py-1 text-xs text-soft hover:bg-wait/10">
                        <Figurinha f={b.figurinha} size={24} status="esperando" />
                        {b.name} · {b.role} · aguardando o conselho
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <Link to="/conselho" className="rounded-xl border border-wait bg-wait/[0.04] px-4 py-4 transition hover:bg-wait/[0.08]">
                <div className="text-[13.5px] font-medium text-wait">Sala do conselho · você</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chip border-wait text-soft">
                    <Dot color="#f59e0b" size={7} /> {state.approvals.length} {state.approvals.length === 1 ? "aprovação" : "aprovações"}
                  </span>
                  {blocked.length > 0 && (
                    <span className="chip">
                      <Dot color="#ef4444" size={7} /> {blocked.length} bot bloqueado (login)
                    </span>
                  )}
                </div>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <aside className="flex flex-col border-l border-line px-7 pb-7 pt-8">
        <h2 className="eyebrow mb-3 font-sans">Agora no prédio</h2>
        <div className="space-y-2.5">
          {liveFeed.map((f) => (
            <div key={f.id} className="rounded-xl border border-line bg-ink-850 px-4 py-3">
              <div className="flex gap-2.5">
                <Dot color={toneColor[f.tone]} className="mt-[7px]" />
                <div>
                  <div className="text-[14px] leading-snug text-soft">
                    <Rich text={f.title} />
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {f.meta}
                    {f.action && (
                      <>
                        {" · "}
                        <Link to={f.action.to} className="text-tavinho-soft hover:underline">
                          {f.action.label}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h2 className="eyebrow mb-3 mt-7 font-sans">Legenda</h2>
        <ul className="space-y-1.5 text-[14px] text-soft">
          {(Object.keys(statusLabel) as Status[]).map((s) => (
            <li key={s} className="flex items-center gap-2.5">
              <StatusDot status={s} size={7} /> {statusLabel[s]}
            </li>
          ))}
        </ul>

        <div className="mt-auto rounded-xl border border-line bg-ink-850 px-4 py-4">
          <div className="text-[12.5px] text-muted">Gasto do mês · todas as empresas</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-display text-[22px] font-semibold text-white">R$ {totalBudget.spent}</span>
            <span className="text-[12.5px] text-muted">de R$ 1.500</span>
          </div>
          <Bar value={totalBudget.spent} max={totalBudget.cap} className="mt-2" />
        </div>
      </aside>
    </div>
  );
}

function PredioMobile() {
  const { state } = usePortal();
  const counts = useCounts();
  const openBot = useBotNavigation();
  const hired = state.bots.filter((b) => b.hired);
  const tavinho = hired.find((b) => b.id === "tavinho");
  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-3 pt-12">
        <Logo compact />
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold leading-tight text-white">Prédio Otávio</h1>
          <p className="text-[12px] text-muted">
            {companies.length} empresas · {counts.total} bots ativos
          </p>
        </div>
        <Link to="/conselho" className="chip border-wait text-wait">
          <Dot color="#f59e0b" size={7} /> {counts.approvals}
        </Link>
      </header>
      <div className="flex items-center justify-between border-y border-line bg-ink-850 px-4 py-3">
        <span className="eyebrow">Cobertura</span>
        {tavinho && (
          <button onClick={() => openBot(tavinho)}>
            <Figurinha f={tavinho.figurinha} size={30} status={tavinho.status} />
          </button>
        )}
      </div>
      {companies.map((co) => (
        <section key={co.id} className="border-b border-line py-3.5">
          <div className="mb-2.5 flex items-baseline justify-between px-4">
            <Link to={`/empresas/${co.id}`} className="text-[15px] font-semibold text-white">
              {co.floor}º · {co.name}
            </Link>
            <span className="text-[12px] text-muted">
              R$ {co.budget.spent} / {co.budget.cap}
            </span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto px-4 pb-1">
            {co.departments.map((d) => {
              const room = hired.filter((b) => b.companyId === co.id && b.departmentId === d.id);
              return (
                <div key={d.id} className="w-[140px] shrink-0 rounded-xl border border-line bg-ink-800 px-3 py-3">
                  <div className="truncate text-[13px] text-white">{d.name.replace(" às lojas", "")}</div>
                  <div className="mt-2.5 flex gap-2">
                    {room.map((b) => (
                      <button key={b.id} onClick={() => openBot(b)} title={`${b.name} · ${b.role}`}>
                        <Figurinha f={b.figurinha} size={36} status={b.status} highlight />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <section className="px-4 py-3.5">
        <div className="mb-2.5 text-[15px] font-semibold text-white">Térreo</div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">
            <Dot color="#22c55e" size={7} /> WhatsApp · 7
          </span>
          <Link to="/tavinho" className="chip">
            <Dot color="#22c55e" size={7} /> Voz · ouvindo
          </Link>
          <Link to="/conselho" className="chip border-wait text-wait">
            <Dot color="#f59e0b" size={7} /> Conselho · {counts.approvals}
          </Link>
        </div>
      </section>
    </main>
  );
}
