import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  companies,
  modelEstimates,
  providerModels,
  type Accessory,
  type ColorKey,
  type Eyes,
  type Figurinha as Fig,
  type HeadShape,
  type Provider,
} from "../data/mock";
import { Figurinha } from "../components/Figurinha";
import { Dot } from "../components/ui";
import { palette } from "../lib/colors";
import { usePortal } from "../state/store";

const colorKeys: ColorKey[] = ["roxo", "azul", "verde", "petroleo", "rosa", "laranja", "mostarda"];
const heads: { v: HeadShape; l: string }[] = [
  { v: "arredondada", l: "Arredondada" },
  { v: "quadrada", l: "Quadrada" },
  { v: "redonda", l: "Redonda" },
  { v: "alta", l: "Alta" },
  { v: "larga", l: "Larga" },
];
const eyesList: { v: Eyes; l: string }[] = [
  { v: "brilhantes", l: "Brilhantes" },
  { v: "pontos", l: "Pontinhos" },
  { v: "felizes", l: "Felizes" },
  { v: "visor", l: "Visor" },
  { v: "oculos", l: "Óculos" },
  { v: "codigo", l: "Código" },
  { v: "grafico", l: "Gráfico" },
];
const accessories: { v: Accessory; l: string }[] = [
  { v: "lapis", l: "Lápis" },
  { v: "gorro", l: "Gorro" },
  { v: "antena", l: "Antena" },
  { v: "fone", l: "Fone" },
  { v: "bone", l: "Boné" },
  { v: "estrela", l: "Estrela" },
  { v: "topete", l: "Topete" },
  { v: "chifres", l: "Chifres" },
  { v: "parafuso", l: "Parafuso" },
  { v: "nenhum", l: "Nenhum" },
];
const providers: Provider[] = ["Claude", "ChatGPT", "Grok", "Gemini", "OpenRouter", "Local"];
const reserves = ["Claude · Sonnet", "Claude · Opus", "ChatGPT · GPT-5", "ChatGPT · GPT-5 mini", "Grok · Grok 4 Fast", "Gemini · 2.5 Flash", "Nenhuma"];
const cheapModels = ["Claude · Haiku", "ChatGPT · GPT-5 mini", "Gemini · Flash-Lite", "O mesmo modelo"];
const steps = ["Empresa", "Identidade e IA", "Acessos e skills", "Regras e orçamento"];
const qualityLabel = ["melhor qualidade", "mais rápido", "mais barato", "alternativa"];
const skillOptions = ["proposta-franquia", "relatorio-semanal-ads", "docx · xlsx · pdf", "frontend-design", "laudo-portaria-01524"];

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-10 shrink-0 rounded-full transition ${on ? "bg-tavinho" : "bg-ink-700"}`}
    >
      <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[21px]" : "left-[3px]"}`} />
    </button>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select className="field appearance-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
    </select>
  );
}

export function ContratarPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { hire, toast } = usePortal();
  const initialCompany = companies.find((c) => c.id === params.get("empresa")) ?? companies.find((c) => c.id === "redbox")!;
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Otávio");
  const [role, setRole] = useState("Designer");
  const [companyId, setCompanyId] = useState(initialCompany.id);
  const [departmentId, setDepartmentId] = useState(
    params.get("departamento") ?? (initialCompany.id === "redbox" ? "criacao" : (initialCompany.departments[0]?.id ?? "")),
  );
  const [personality, setPersonality] = useState(
    "Você é o Otávio, designer da RedBox. Cria peças para anúncios (1080×1080 e 1080×1920) seguindo a paleta de cada cliente. Direto, sem enrolação. Sempre entrega 3 variações. Nunca publica nada sem aprovação do Diretor.",
  );
  const [provider, setProvider] = useState<Provider>("Grok");
  const [model, setModel] = useState("Grok 4");
  const [effort, setEffort] = useState("Alto");
  const [context, setContext] = useState("128k tokens");
  const [reserve, setReserve] = useState("Claude · Sonnet");
  const [cheap, setCheap] = useState("Claude · Haiku");
  const [cap, setCap] = useState(80);
  const [fig, setFig] = useState<Fig>({ color: "roxo", head: "arredondada", eyes: "brilhantes", accessory: "lapis", mouth: "sorriso" });
  const [access, setAccess] = useState({ computer: true, internet: true, runner: false, subagents: true });
  const [chosenSkills, setChosenSkills] = useState<string[]>(["frontend-design"]);

  const company = companies.find((c) => c.id === companyId)!;
  const providerInfo = providerModels[provider];
  const apiBased = provider === "Grok" || provider === "Gemini" || provider === "OpenRouter";
  const estimate = modelEstimates[model] ?? "—";

  const setCompany = (id: string) => {
    setCompanyId(id);
    const co = companies.find((c) => c.id === id);
    setDepartmentId(co?.departments[0]?.id ?? "");
  };

  const aiFigurinha = () => {
    const h = hash(`${role}:${name}`);
    const dept = company.departments.find((d) => d.id === departmentId);
    setFig({
      color: dept?.color ?? colorKeys[h % colorKeys.length]!,
      head: heads[h % heads.length]!.v,
      eyes: eyesList[(h >> 3) % eyesList.length]!.v,
      accessory: accessories[(h >> 6) % (accessories.length - 1)]!.v,
      mouth: "sorriso",
    });
    toast(`Figurinha criada a partir da função “${role}” (simulado).`);
  };

  const submit = () => {
    hire({ name, role, companyId, departmentId, provider, model: provider === "Claude" ? `Claude ${model}` : model, reserve, cap, figurinha: fig, personality });
    navigate("/conselho");
  };

  const previewSub = useMemo(() => `${role} · ${company.name} · ${provider === "Local" ? "Local" : provider}`, [role, company.name, provider]);

  return (
    <div className="mx-auto max-w-[1184px] px-4 py-6 sm:px-6 sm:py-7">
      <h1 className="text-[27px] font-semibold text-white">Contratar um bot</h1>
      <p className="mt-1 text-[14.5px] text-muted">Você define quem ele é, qual IA ele usa e o que ele pode fazer. Ele só começa depois que você aprovar no conselho.</p>
      <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {steps.map((s, i) => (
          <li key={s}>
            <button onClick={() => setStep(i)} className={`flex items-center gap-2 text-[13.5px] ${i === step ? "text-white" : "text-muted"}`}>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${
                  i < step ? "bg-ok text-ink-900" : i === step ? "bg-tavinho text-white" : "border border-line-strong text-muted"
                }`}
              >
                {i < step ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_528px]">
        <div className="space-y-5">
          {step === 0 && (
            <section className="card px-5 py-5">
              <div className="eyebrow mb-4">Empresa</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {companies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCompany(c.id)}
                    className={`rounded-xl border px-4 py-3 text-left ${c.id === companyId ? "border-tavinho bg-tavinho/10" : "border-line bg-ink-900 hover:bg-ink-750"}`}
                  >
                    <div className="text-[14px] font-semibold text-white">{c.name}</div>
                    <div className="text-[12.5px] text-muted">
                      {c.floorLabel} · R$ {c.budget.spent} / {c.budget.cap}
                    </div>
                  </button>
                ))}
              </div>
              <label className="label mt-5">Departamento</label>
              <Select value={departmentId} onChange={setDepartmentId}>
                {company.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · reporta ao Diretor
                  </option>
                ))}
              </Select>
            </section>
          )}

          {step === 1 && (
            <>
              <section className="card px-5 py-5">
                <div className="eyebrow mb-3">Identidade</div>
                <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="nome">
                      Nome
                    </label>
                    <input id="nome" className="field" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="funcao">
                      Função
                    </label>
                    <input id="funcao" className="field" value={role} onChange={(e) => setRole(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Empresa</label>
                    <Select value={companyId} onChange={setCompany}>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="label">Departamento · reporta a</label>
                    <Select value={departmentId} onChange={setDepartmentId}>
                      {company.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · reporta ao Diretor
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="perso">
                      Personalidade e instruções
                    </label>
                    <textarea id="perso" rows={4} className="field" value={personality} onChange={(e) => setPersonality(e.target.value)} />
                  </div>
                </div>
              </section>

              <section className="card px-5 py-5">
                <div className="eyebrow">Qual IA este bot usa</div>
                <p className="mb-4 mt-1 text-[12.5px] text-muted">Cada bot pode ter uma IA diferente. Pelas suas assinaturas (sem custo extra) ou por chave de API.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {providers.map((p) => {
                    const info = providerModels[p];
                    const sel = p === provider;
                    const dot = info.access === "adicionar" ? "#f59e0b" : "#22c55e";
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setProvider(p);
                          setModel(info.models[0] ?? "");
                        }}
                        className={`flex flex-col items-start rounded-xl border px-3.5 py-3 text-left ${sel ? "border-tavinho bg-tavinho/10" : "border-line bg-ink-900 hover:bg-ink-750"}`}
                      >
                        <span className="text-[14px] font-semibold text-white">{info.label}</span>
                        <span className="mt-0.5 text-[12px] leading-snug text-muted">{info.models.join(" · ")}</span>
                        <span className="chip mt-2 text-[11.5px]">
                          <Dot color={dot} size={7} /> {info.note}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-xl border border-line bg-ink-900 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
                    <div>
                      <label className="label">Modelo do {providerInfo.label} para este bot</label>
                      <Select value={model} onChange={setModel}>
                        {providerInfo.models.map((mm, i) => (
                          <option key={mm} value={mm}>
                            {mm} — {qualityLabel[i] ?? "alternativa"}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="label">Esforço de raciocínio</label>
                      <Select value={effort} onChange={setEffort}>
                        <option>Alto</option>
                        <option>Médio</option>
                        <option>Baixo</option>
                      </Select>
                    </div>
                    <div>
                      <label className="label">Contexto máximo</label>
                      <Select value={context} onChange={setContext}>
                        <option>128k tokens</option>
                        <option>256k tokens</option>
                        <option>1M tokens</option>
                      </Select>
                    </div>
                  </div>
                  <p className="mt-3 text-[12.5px] text-muted">
                    Estimativa para a função {role || "escolhida"}: <strong className="text-white">{estimate}</strong>
                  </p>
                  {apiBased && (
                    <p className="mt-2 text-[12.5px] text-muted">
                      Alternativa mais barata com qualidade parecida:{" "}
                      <button
                        className="text-tavinho-soft hover:underline"
                        onClick={() => {
                          setProvider("Claude");
                          setModel("Sonnet");
                        }}
                      >
                        Claude Sonnet pela assinatura (R$ 0)
                      </button>
                    </p>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">IA reserva (falha ou limite)</label>
                    <Select value={reserve} onChange={setReserve}>
                      {reserves.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="label">Modelo barato para tarefas simples</label>
                    <Select value={cheap} onChange={setCheap}>
                      {cheapModels.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="label" htmlFor="teto">
                      Teto de gasto do bot / mês
                    </label>
                    <input
                      id="teto"
                      className="field"
                      inputMode="numeric"
                      value={`R$ ${cap}`}
                      onChange={(e) => setCap(Number(e.target.value.replace(/\D/g, "")) || 0)}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {step === 2 && (
            <section className="card px-5 py-5">
              <div className="eyebrow mb-3">Skills que este bot recebe</div>
              <div className="space-y-2">
                {skillOptions.map((s) => {
                  const on = chosenSkills.includes(s);
                  return (
                    <label key={s} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-ink-900 px-4 py-3 text-[14px] text-soft">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setChosenSkills((list) => (on ? list.filter((x) => x !== s) : [...list, s]))}
                        className="h-4 w-4 accent-[#3b82f6]"
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-[12.5px] text-muted">As permissões de uma skill nunca passam das permissões do bot.</p>
            </section>
          )}

          {step === 3 && (
            <section className="card px-5 py-5">
              <div className="eyebrow mb-3">Regras e orçamento</div>
              <ul className="list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-soft">
                {company.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-ink-900 px-4 py-3">
                  <div className="text-[12.5px] text-muted">Teto do bot</div>
                  <div className="font-display text-[20px] font-semibold text-white">R$ {cap} / mês</div>
                  <div className="text-[12px] text-muted">aviso a 90%, parada e pedido de aprovação a 100%</div>
                </div>
                <div className="rounded-xl border border-line bg-ink-900 px-4 py-3">
                  <div className="text-[12.5px] text-muted">Orçamento de {company.name}</div>
                  <div className="font-display text-[20px] font-semibold text-white">
                    R$ {company.budget.cap} → {company.budget.cap + cap}
                  </div>
                  <div className="text-[12px] text-muted">o conselho aprova o aumento junto com a contratação</div>
                </div>
              </div>
              <button className="btn btn-primary mt-5 w-full py-2.5" onClick={submit}>
                Enviar contratação para o conselho
              </button>
            </section>
          )}

        </div>

        <div className="space-y-5">
          <section className="card px-5 py-5">
            <div className="eyebrow mb-3">Figurinha</div>
            <div className="flex flex-col items-center">
              <Figurinha f={fig} size={128} />
              <div className="mt-3 font-display text-[18px] font-semibold text-white">{name || "Sem nome"}</div>
              <div className="text-[12.5px] text-muted">{previewSub}</div>
            </div>
            <div className="mt-4 text-[12.5px] text-muted">Cor</div>
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              {colorKeys.map((c) => (
                <button
                  key={c}
                  title={palette[c].label}
                  aria-label={palette[c].label}
                  onClick={() => setFig({ ...fig, color: c })}
                  className={`h-[38px] w-[38px] rounded-lg ${fig.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-ink-800" : ""}`}
                  style={{ background: palette[c].bg }}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <div>
                <div className="mb-1.5 text-[12.5px] text-muted">Cabeça</div>
                <Select value={fig.head} onChange={(v) => setFig({ ...fig, head: v as HeadShape })}>
                  {heads.map((h) => (
                    <option key={h.v} value={h.v}>
                      {h.l}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] text-muted">Olhos</div>
                <Select value={fig.eyes} onChange={(v) => setFig({ ...fig, eyes: v as Eyes })}>
                  {eyesList.map((h) => (
                    <option key={h.v} value={h.v}>
                      {h.l}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <div className="mb-1.5 text-[12.5px] text-muted">Acessório</div>
                <Select value={fig.accessory} onChange={(v) => setFig({ ...fig, accessory: v as Accessory })}>
                  {accessories.map((h) => (
                    <option key={h.v} value={h.v}>
                      {h.l}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <button className="btn mt-3 w-full" onClick={aiFigurinha}>
              <Sparkles size={15} /> Deixar a IA criar pela função
            </button>
          </section>

          <section className="card px-5 py-5">
            <div className="eyebrow mb-2">Computador e acesso</div>
            <div className="divide-y divide-line text-[14px]">
              {(
                [
                  ["computer", "Computador próprio (Docker, Chrome isolado)", ""],
                  ["internet", "Acesso à internet", ""],
                  ["runner", "Pode controlar o seu PC (Runner)", "sempre com aprovação"],
                  ["subagents", "Pode contratar subagentes", ""],
                ] as const
              ).map(([k, label, note]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-3">
                  <span className="text-soft">
                    {label}
                    {note && <span className="text-[12.5px] text-muted"> · {note}</span>}
                  </span>
                  <Toggle label={label} on={access[k]} onChange={(v) => setAccess({ ...access, [k]: v })} />
                </div>
              ))}
              <div className="flex items-center justify-between py-3">
                <span className="text-soft">Orçamento mensal</span>
                <span className="font-semibold text-white">R$ {cap}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button className="btn" onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}>
          <ArrowLeft size={15} /> Voltar
        </button>
        <div className="flex gap-2">
          <button className="btn" onClick={() => toast(`Template “${name} · ${role}” salvo para reutilizar em outra empresa.`)}>
            Salvar como template
          </button>
          {step < 3 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Próximo: {steps[step + 1]?.toLowerCase()} <ArrowRight size={15} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit}>
              Enviar ao conselho <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
