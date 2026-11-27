import { Monitor } from "lucide-react";
import type { ComputerStatus, ComputerView } from "../../customer/computers.ts";
import { useApi } from "../../web/api.ts";
import { Badge, Button, Card } from "../../web/ui.tsx";
import type { Tone } from "../../web/format.ts";

const STATUS: Record<ComputerStatus, [string, Tone]> = {
  preparing: ["Preparando", "cyan"], ready: ["Pronto", "green"], problem: ["Com problema", "red"], ending: ["Encerrando", "slate"],
};

const dayMonthYear = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "Meus computadores": the plan's and the add-on's computers, and the button that changes how many extras the customer pays for. */
export function MeusComputadoresCard({ included, extras, priceCents, onChange }: {
  included: number; extras: number; priceCents: number | null; onChange: (() => void) | null;
}) {
  const { data } = useApi<{ computers: ComputerView[] }>("/api/conta/computadores");
  const computers = data?.computers ?? [];
  return (
    <Card title={<span className="flex items-center gap-2"><Monitor className="h-4 w-4 text-cyan-ink" /> Meus computadores</span>}
      actions={onChange ? <Button size="sm" variant="secondary" onClick={onChange}>Alterar</Button> : null}>
      <div className="font-display text-4xl font-bold tabular">{included + extras}</div>
      <div className="mt-1 text-sm text-slate-500">
        {included ? `${included} incluído${included > 1 ? "s" : ""} no plano` : "Nenhum incluído no plano"}
        {extras ? ` + ${extras} adicional${extras > 1 ? "is" : ""}` : ""}
      </div>
      {computers.length ? (
        <ul className="mt-4 space-y-2 text-sm">
          {computers.map((computer, index) => (
            <li key={computer.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <span>
                <span className="font-medium">{computer.purpose === "home" ? "Computador do seu ArkoBot" : `Computador ${index + 1}`}</span>
                <span className="block text-xs text-slate-500">
                  {computer.status === "preparing" ? "Estamos contratando e instalando; leva de minutos a algumas horas." : `Desde ${dayMonthYear.format(new Date(computer.since))}`}
                  {computer.endsAt ? ` · até ${dayMonthYear.format(new Date(computer.endsAt))}` : ""}
                </span>
              </span>
              <Badge tone={STATUS[computer.status][1]}>{STATUS[computer.status][0]}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {priceCents ? <p className="mt-4 text-sm text-slate-600">Computador próprio (VPS): {brl(priceCents)}/mês cada, em qualquer plano. O primeiro recebe o seu ArkoBot, com mais memória e só para você.</p> : null}
    </Card>
  );
}
