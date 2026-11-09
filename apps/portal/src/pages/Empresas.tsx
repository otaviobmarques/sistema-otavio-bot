import { Plus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { companies, type Bot } from "../data/mock";
import { Bar, Dot } from "../components/ui";
import { palette, statusColor } from "../lib/colors";
import { usePortal } from "../state/store";

export function EmpresasPage() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { state, toast } = usePortal();
  const company = companies.find((c) => c.id === (companyId ?? "redbox")) ?? companies[0]!;
  const coBots = state.bots.filter((b) => b.companyId === company.id && b.hired && b.departmentId !== "direcao");
  const director = state.bots.find((b) => b.companyId === company.id && b.departmentId === "direcao");
  const tavinho = state.bots.find((b) => b.id === "tavinho");
  const pendingHere = state.approvals.filter((a) => a.context === company.name).length;
  const active = coBots.filter((b) => b.status !== "ocioso").length;
  const ordered = companies;
  const budgetRows: { label: string; ia: string; spent: number; cap: number }[] = [
    ...(director ? [{ label: `${director.name} · ${director.role}`, ia: director.model, spent: director.budget.spent, cap: director.budget.cap }] : []),
    ...coBots.map((b) => ({ label: `${b.name} · ${b.role}`, ia: b.provider, spent: b.budget.spent, cap: b.budget.cap })),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-7 py-3.5">
        <span className="mr-2 text-[13px] text-muted">Empresa:</span>
        {ordered.map((c) => (
          <Link
            key={c.id}
            to={`/empresas/${c.id}`}
            className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium ${c.id === company.id ? "bg-ink-700 text-white" : "text-muted hover:text-white"}`}
          >
            {c.name}
          </Link>
        ))}
        <button
          onClick={() => toast("Nova empresa: importe um template em YAML ou comece do zero (simulado).")}
          className="ml-2 rounded-lg border border-dashed border-line-strong px-3.5 py-2 text-[13.5px] font-medium text-tavinho-soft hover:bg-ink-750"
        >
          + Nova empresa
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_408px]">
        <main className="px-7 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[620px]">
              <h1 className="flex items-center gap-2.5 text-[27px] font-semibold text-white">
                <span className="h-3 w-3 rounded-full" style={{ background: palette[company.color].accent }} />
                {company.name}
                <span className="font-sans text-[15px] font-normal text-muted">· {company.tagline}</span>
              </h1>
              <p className="mt-1 text-[14.5px] leading-relaxed text-muted">
                <strong className="font-semibold text-soft">Missão:</strong> {company.mission}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => toast(`Template de ${company.name} exportado (empresa.yaml, simulado).`)}>
                Exportar template
              </button>
              <Link to={`/contratar?empresa=${company.id}`} className="btn btn-primary">
                <Plus size={15} /> Contratar bot aqui
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Bots"
              value={String(coBots.length + (director ? 1 : 0))}
              sub={`${active + (director ? 1 : 0)} ativos · ${coBots.length - active} ocioso${coBots.length - active === 1 ? "" : "s"}`}
            />
            <div className="card px-4 py-3.5">
              <div className="text-[12.5px] text-muted">Orçamento do mês</div>
              <div className="mt-0.5 font-display text-[21px] font-semibold text-white">
                R$ {company.budget.spent} <span className="text-[12.5px] font-normal text-muted">/ {company.budget.cap}</span>
              </div>
              <Bar value={company.budget.spent} max={company.budget.cap} className="mt-2" />
            </div>
            <Kpi label="Tarefas na semana" value={String(company.tasks.week)} sub={`${company.tasks.done} concluídas · ${company.tasks.inProgress} em andamento`} />
            <div className="card px-4 py-3.5">
              <div className="text-[12.5px] text-muted">Aprovações pendentes</div>
              <div className="mt-0.5 font-display text-[21px] font-semibold text-wait">{pendingHere}</div>
              <Link to="/conselho" className="text-[12.5px] text-tavinho-soft hover:underline">
                ver no conselho
              </Link>
            </div>
          </div>

          <section className="card mt-5 px-5 py-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="eyebrow">Organograma</span>
              <span className="text-[12.5px] text-muted">arraste um bot para mudar a quem ele reporta</span>
            </div>
            <div className="flex flex-col items-center">
              <Link to="/conselho" className="w-[285px] rounded-xl border border-tavinho/60 bg-tavinho/10 px-4 py-2.5 text-center">
                <div className="text-[14px] font-semibold text-white">Conselho · você</div>
                <div className="text-[12.5px] text-muted">aprova contratações, estratégia e orçamento</div>
              </Link>
              <div className="h-5 w-px bg-line-strong" />
              {tavinho && (
                <OrgNode
                  className="w-[285px] text-center"
                  title="Tavinho · Diretor geral"
                  sub={`${tavinho.model} · coordena as 4 empresas`}
                  bot={tavinho}
                  onClick={() => navigate(`/chat/sala-diretoria`)}
                />
              )}
              <div className="h-5 w-px bg-line-strong" />
              {director && (
                <OrgNode
                  className="w-[285px] text-center"
                  title={`${director.name} · ${director.role} da ${company.name}`}
                  sub={`${director.model} · ${director.activity}`}
                  bot={director}
                  onClick={() => navigate(`/chat/${director.id}`)}
                />
              )}
              <div className="h-5 w-px bg-line-strong" />
            </div>
            <div className="mx-[16%] h-px bg-line-strong" />
            <div className="grid grid-cols-3 gap-6">
              {company.departments.map((d) => {
                const room = coBots.filter((b) => b.departmentId === d.id);
                return (
                  <div key={d.id} className="flex flex-col items-center">
                    <div className="h-5 w-px bg-line-strong" />
                    <div className="w-full rounded-xl border border-line bg-ink-900 px-4 py-2.5 text-center">
                      <div className="text-[14px] font-semibold text-white">{d.name}</div>
                      <div className="text-[12.5px] text-muted">dept. · R$ {d.budgetMonth} / mês</div>
                    </div>
                    {room.map((b) => (
                      <div key={b.id} className="flex w-full flex-col items-center">
                        <div className="h-5 w-px bg-line-strong" />
                        <OrgNode className="w-full" title={b.role} sub={`${b.provider} · ${b.activity}`} bot={b} onClick={() => navigate(`/chat/${b.id}`)} />
                      </div>
                    ))}
                    {room.length < 2 && (
                      <div className="flex w-full flex-col items-center">
                        <div className="h-5 w-px bg-line-strong" />
                        <Link
                          to={`/contratar?empresa=${company.id}&departamento=${d.id}`}
                          className="w-full rounded-xl border border-dashed border-line-strong px-4 py-2.5 text-center hover:bg-ink-750"
                        >
                          <div className="text-[14px] font-semibold text-tavinho-soft">+ Contratar</div>
                          <div className="text-[12.5px] text-muted">ex.: {company.id === "redbox" ? "um bot novo para este time" : "Tráfego pago (ou pedir à RedBox)"}</div>
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        <aside className="space-y-4 border-line px-6 py-6 lg:border-l">
          <section className="card px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Orçamento por bot</span>
              <button className="text-[12.5px] text-tavinho-soft hover:underline" onClick={() => toast("Edite o teto de cada bot na tela Contratar bot.")}>
                editar
              </button>
            </div>
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="py-2 pl-2 font-medium">Bot</th>
                  <th className="py-2 font-medium">IA</th>
                  <th className="py-2 pr-2 text-right font-medium">Gasto / teto</th>
                </tr>
              </thead>
              <tbody>
                {budgetRows.map((r) => (
                  <tr key={r.label} className="border-b border-line last:border-0">
                    <td className="py-2.5 pl-2 text-white">{r.label}</td>
                    <td className="py-2.5 text-[12.5px] text-muted">{r.ia}</td>
                    <td className="py-2.5 pr-2 text-right text-white">
                      R$ {r.spent} / {r.cap}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card px-4 py-4">
            <div className="eyebrow mb-2.5">Regras da empresa</div>
            <ul className="list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-soft">
              {company.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <Link to="/extensoes?aba=politicas" className="mt-2 inline-block text-[13.5px] text-tavinho-soft hover:underline">
              Editar políticas
            </Link>
          </section>
          <section className="card px-4 py-4">
            <div className="eyebrow mb-2.5">Heartbeats</div>
            <ul className="space-y-1.5 text-[13.5px]">
              {company.heartbeats.map((h) => (
                <li key={h.label} className="flex justify-between gap-3">
                  <span className="text-soft">{h.label}</span>
                  <span className="text-[12.5px] text-muted">{h.when}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="mt-0.5 font-display text-[21px] font-semibold text-white">{value}</div>
      <div className="text-[12.5px] text-muted">{sub}</div>
    </div>
  );
}

function OrgNode({ title, sub, bot, className = "", onClick }: { title: string; sub: string; bot: Bot; className?: string; onClick?: () => void }) {
  const alert = bot.status === "esperando" || bot.status === "bloqueado";
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border bg-ink-900 px-4 py-2.5 text-left transition hover:bg-ink-750 ${className}`}
      style={{ borderColor: alert ? statusColor[bot.status] : "var(--color-line)" }}
    >
      <Dot color={statusColor[bot.status]} className="absolute right-3 top-3" />
      <div className="text-[14px] font-semibold text-white">{title}</div>
      <div className="truncate text-[12.5px] text-muted">{sub}</div>
    </button>
  );
}
