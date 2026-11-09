import { Link } from "react-router";
import { figurinhaOrder, type Status } from "../data/mock";
import { Figurinha } from "../components/Figurinha";
import { StatusDot } from "../components/ui";
import { usePortal } from "../state/store";

const legend: { s: Status; l: string }[] = [
  { s: "trabalhando", l: "trabalhando" },
  { s: "esperando", l: "aprovação" },
  { s: "bloqueado", l: "bloqueado" },
  { s: "ocioso", l: "ocioso" },
];

export function FigurinhasPage() {
  const { state } = usePortal();
  const bots = figurinhaOrder.map((id) => state.bots.find((b) => b.id === id)).filter((b) => b !== undefined);
  const sample = bots[0];
  return (
    <main className="mx-auto max-w-[1180px] px-4 py-7 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[860px]">
          <h1 className="text-[24px] font-semibold text-white">Figurinhas dos bots</h1>
          <p className="mt-1 text-[14px] leading-snug text-muted">
            Personagens originais do Otávio Bot. Cor do fundo = departamento; formato da cabeça e olhos = personalidade; anel de status no canto. Cada bot tem nome e função.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] text-soft">
          {legend.map((x) => (
            <li key={x.s} className="flex items-center gap-1.5">
              <StatusDot status={x.s} size={9} /> {x.l}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {bots.map((b) => (
          <Link
            key={b.id}
            to={`/chat/${b.id}`}
            className={`flex flex-col items-center rounded-2xl border bg-ink-800 px-3 pb-24 pt-5 transition hover:border-tavinho/70 ${b.id === "tavinho" ? "border-tavinho/70" : "border-line"}`}
          >
            <Figurinha f={b.figurinha} size={96} status={b.status} title={`${b.name} · ${b.role}`} />
            <div className="mt-3 text-[15px] font-semibold text-white">{b.name}</div>
            <div className="text-[12.5px] text-muted">{b.role}</div>
            <span className="chip mt-3 text-[11.5px]">{b.provider === "Claude" && b.id === "tavinho" ? "Claude Opus" : b.provider}</span>
          </Link>
        ))}
      </div>

      {sample && (
        <section className="card mt-6 flex flex-wrap items-center gap-5 px-5 py-4">
          <span className="eyebrow">Tamanhos</span>
          <span className="flex items-center gap-3">
            <Figurinha f={sample.figurinha} size={24} />
            <Figurinha f={sample.figurinha} size={36} />
            <Figurinha f={sample.figurinha} size={48} />
          </span>
          <span className="text-[12.5px] text-muted">24 · 36 · 48 px — lista, prédio, cabeçalho do chat</span>
          <span className="flex-1 text-[12.5px] text-muted sm:ml-6">
            Ao contratar um bot você escolhe cabeça, olhos, cor e acessório, ou deixa a IA gerar um a partir da função.{" "}
            <Link to="/contratar" className="text-tavinho-soft hover:underline">
              Contratar bot
            </Link>
          </span>
        </section>
      )}
    </main>
  );
}
