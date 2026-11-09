import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { councilRules, weeklySummary } from "../data/mock";
import { Figurinha } from "../components/Figurinha";
import { Dot, Rich } from "../components/ui";
import { companyName } from "../lib/computer";
import { usePortal } from "../state/store";
import type { AuditTone } from "../data/mock";

const resultStyle: Record<AuditTone, string> = {
  ok: "border-line-strong text-soft",
  wait: "border-wait text-wait",
  block: "border-block/70 text-block",
  deny: "border-block/70 text-block",
};

export function ConselhoPage() {
  const { state, decide, takeControl, toast } = usePortal();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const blocked = state.bots.filter((b) => b.hired && b.status === "bloqueado");
  const audit = showAll ? state.audit : state.audit.slice(0, 6);

  return (
    <div className="mx-auto grid max-w-[1340px] gap-5 px-4 py-6 sm:px-14 sm:py-7 lg:grid-cols-[minmax(0,1fr)_566px]">
      <main>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[27px] font-semibold text-white">Sala do conselho</h1>
          <Link to="/ao-vivo/presidencia" className="btn">
            Ver a mesa
          </Link>
        </div>
        <p className="mt-1 text-[14.5px] text-muted">Tudo que precisa de você antes de acontecer. Aprovar, ajustar ou recusar — o bot continua de onde parou.</p>

        <div className="mt-4 space-y-4">
          {state.approvals.length === 0 && blocked.length === 0 && (
            <div className="card flex items-center gap-3 px-5 py-6 text-soft">
              <CircleCheck className="text-ok" size={20} /> Nada esperando você. Os bots seguem trabalhando.
            </div>
          )}
          {state.approvals.map((ap) => {
            const bot = state.bots.find((b) => b.id === ap.botId);
            if (!bot) return null;
            return (
              <article key={ap.id} className="rounded-xl border border-wait/80 bg-ink-850 px-5 py-4">
                <div className="flex gap-3.5">
                  <Figurinha f={bot.figurinha} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[14.5px]">
                        <span className="font-semibold text-white">
                          {bot.name} · {bot.role}
                        </span>
                        <span className="ml-2 text-[12.5px] text-muted">
                          {ap.context || companyName(bot)} · {ap.ago}
                        </span>
                      </div>
                      <span className="rounded-full border border-wait px-2.5 py-0.5 text-[11.5px] text-wait">{ap.tag}</span>
                    </div>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-soft">
                      <Rich text={ap.text} />
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {ap.chips.map((c) => (
                        <button
                          key={c}
                          className="chip px-2.5 py-0.5 text-[11.5px] hover:bg-ink-700"
                          onClick={() => (c.startsWith("ver conversa") ? navigate(`/chat/${bot.id}`) : toast(c))}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      {ap.options.map((o, i) => (
                        <button key={o.label} onClick={() => decide(ap.id, i)} className={`btn ${o.tone === "primary" ? "btn-ok" : ""} ${o.tone === "danger" ? "btn-danger" : ""}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {blocked.map((b) => (
            <article key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-block/70 bg-ink-850 px-5 py-4">
              <Dot color="#ef4444" />
              <p className="flex-1 text-[14.5px] text-soft">
                <strong className="text-white">
                  {b.name} · {b.role}
                </strong>{" "}
                ({companyName(b)}) está bloqueado {b.blocker ?? "num login (2FA)"} há 6 min. Pela política, bots não digitam códigos.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  takeControl(b.id);
                  navigate(`/computador/${b.id}`);
                }}
              >
                Assumir e digitar o código
              </button>
            </article>
          ))}
        </div>
      </main>

      <aside className="space-y-4 lg:pt-0">
        <section className="card px-5 py-5">
          <div className="eyebrow mb-3">Regras que exigem você</div>
          <ul className="list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-soft">
            {councilRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Link to="/extensoes?aba=politicas" className="mt-3 inline-block text-[13.5px] text-tavinho-soft hover:underline">
            Editar regras
          </Link>
        </section>

        <section className="card px-5 py-5">
          <div className="eyebrow mb-2">Auditoria · hoje</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-muted">
                  <th className="py-2 pl-2 font-medium">Hora</th>
                  <th className="py-2 font-medium">Bot</th>
                  <th className="py-2 font-medium">Ação</th>
                  <th className="py-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="py-3 pl-2 text-[12.5px] text-muted">{a.time}</td>
                    <td className="py-3 text-white">{a.bot}</td>
                    <td className="max-w-[220px] py-3 pr-3 text-soft">{a.action}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] ${resultStyle[a.tone]}`}>
                        {a.tone === "ok" && <Dot color="#22c55e" size={7} />}
                        {a.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-3 text-[13.5px] text-tavinho-soft hover:underline" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Mostrar só as últimas" : `Ver auditoria completa (${206 + state.audit.length} ações hoje)`}
          </button>
        </section>

        <section className="card px-5 py-5">
          <div className="eyebrow mb-2">Resumo da semana · Tavinho</div>
          <p className="text-[13.5px] leading-relaxed text-soft">{weeklySummary}</p>
          <Link to="/tavinho" className="mt-2 inline-block text-[13.5px] text-tavinho-soft hover:underline">
            Conversar com o Tavinho
          </Link>
        </section>
      </aside>
    </div>
  );
}
