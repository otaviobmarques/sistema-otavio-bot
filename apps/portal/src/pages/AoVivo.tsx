import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { companies, type Bot } from "../data/mock";
import { Personagem } from "../components/Figurinha";
import { Logo } from "../components/Shell";
import { Bar, Dot } from "../components/ui";
import { statusColor } from "../lib/colors";
import { useCounts, usePortal } from "../state/store";

const W = 1100;
const TOP = 46;
const FLOOR_H = 178;
const ROOM_Y = 14;
const ROOM_H = 126;
const INFO_W = 140;
const SHAFT_X = 150;
const SHAFT_W = 54;
const ROOM_X0 = 218;
const ROOM_W = 236;
const ROOM_GAP = 16;
const WINDOW_X = 990;
const CORRIDOR_Y = 134;
const CAR_Y = 70;
const CAR_H = 98;
const WALK_Y = 136;
const SLOT_X = [30, 122];
const floorsTopDown = ["domma", "redbox", "master-laudo"] as const;
const H = TOP + FLOOR_H * 4 + 22;

const floorTop = (index: number) => TOP + index * FLOOR_H;
const roomX = (i: number) => ROOM_X0 + i * (ROOM_W + ROOM_GAP);

/** Linha do tempo do bot que anda: a Lia (Conteúdo, 1º andar) sobe para pedir um anúncio à Criação da RedBox IA. */
const CYCLE = 40;
type Phase = "mesa" | "indo" | "entrando" | "subindo" | "saindo" | "andando" | "conversando" | "voltando" | "entrando2" | "descendo" | "saindo2" | "retornando";
const timeline: { phase: Phase; start: number; end: number }[] = [
  { phase: "mesa", start: 0, end: 4 },
  { phase: "indo", start: 4, end: 8 },
  { phase: "entrando", start: 8, end: 9 },
  { phase: "subindo", start: 9, end: 12 },
  { phase: "saindo", start: 12, end: 13 },
  { phase: "andando", start: 13, end: 17 },
  { phase: "conversando", start: 17, end: 23 },
  { phase: "voltando", start: 23, end: 27 },
  { phase: "entrando2", start: 27, end: 28 },
  { phase: "descendo", start: 28, end: 31 },
  { phase: "saindo2", start: 31, end: 32 },
  { phase: "retornando", start: 32, end: 37 },
  { phase: "mesa", start: 37, end: 40 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const ML = 2; // índice do 1º andar (de cima para baixo)
const RB = 1; // índice do 2º andar
const LIA_DESK_X = roomX(2) + SLOT_X[0]! + 14;
const SHAFT_STAND_X = SHAFT_X + 12;
const CRIACAO_X = roomX(1) + 150;

function walkerState(t: number) {
  const local = t % CYCLE;
  const seg = timeline.find((s) => local >= s.start && local < s.end) ?? timeline[0]!;
  const p = ease((local - seg.start) / (seg.end - seg.start));
  const carY = (k: number) => floorTop(k) + CAR_Y;
  let x = LIA_DESK_X;
  let floor = ML;
  let inCar = false;
  let car = carY(ML);
  switch (seg.phase) {
    case "mesa":
      break;
    case "indo":
      x = lerp(LIA_DESK_X, SHAFT_STAND_X + 30, p);
      break;
    case "entrando":
      x = lerp(SHAFT_STAND_X + 30, SHAFT_STAND_X, p);
      break;
    case "subindo":
      inCar = true;
      x = SHAFT_STAND_X;
      car = lerp(carY(ML), carY(RB), p);
      break;
    case "saindo":
      floor = RB;
      car = carY(RB);
      x = lerp(SHAFT_STAND_X, SHAFT_STAND_X + 30, p);
      break;
    case "andando":
      floor = RB;
      car = carY(RB);
      x = lerp(SHAFT_STAND_X + 30, CRIACAO_X, p);
      break;
    case "conversando":
      floor = RB;
      car = carY(RB);
      x = CRIACAO_X;
      break;
    case "voltando":
      floor = RB;
      car = carY(RB);
      x = lerp(CRIACAO_X, SHAFT_STAND_X + 30, p);
      break;
    case "entrando2":
      floor = RB;
      car = carY(RB);
      x = lerp(SHAFT_STAND_X + 30, SHAFT_STAND_X, p);
      break;
    case "descendo":
      inCar = true;
      x = SHAFT_STAND_X;
      car = lerp(carY(RB), carY(ML), p);
      break;
    case "saindo2":
      x = lerp(SHAFT_STAND_X, SHAFT_STAND_X + 30, p);
      break;
    case "retornando":
      x = lerp(SHAFT_STAND_X + 30, LIA_DESK_X, p);
      break;
  }
  const facingLeft = seg.phase === "indo" || seg.phase === "voltando" || seg.phase === "entrando" || seg.phase === "entrando2";
  return { phase: seg.phase, x, floor, inCar, car, facingLeft, atDesk: seg.phase === "mesa" };
}

const phaseEvents: Partial<Record<Phase, string>> = {
  entrando: "**Lia** (Conteúdo) pegou o elevador para o 2º andar",
  conversando: "**Lia** pediu um anúncio de franquias à **Duda** (Criação · RedBox IA)",
  retornando: "**Lia** voltou para o Marketing com o pedido aceito",
};
const ambientEvents = [
  "**Bia** qualificou um lead de Contagem",
  "**Nina** fechou um chamado da loja de Uberaba",
  "**Max** ajustou lances da Auto Visão",
  "**Gui** fez push no PR #142",
  "**Zé** rodou 38 testes, todos passaram",
  "**Kim** respondeu 3 clientes no WhatsApp",
  "**Rui** pausou um conjunto com CPA alto",
  "**Davi** gerou o laudo da Portaria 01524",
];

function useAnimationClock(speed: number, paused: boolean) {
  const [t, setT] = useState(0);
  const last = useRef<number | null>(null);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  speedRef.current = speed;
  pausedRef.current = paused;
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null && !pausedRef.current) {
        const dt = Math.min(0.1, (now - last.current) / 1000);
        setT((v) => v + dt * speedRef.current);
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

const clockLabel = (t: number) => {
  const total = 16 * 3600 + 7 * 60 + Math.floor(t * 10);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function Abs({ x, y, w, h, className = "", style, children, title, onClick }: { x: number; y: number; w?: number; h?: number; className?: string; style?: CSSProperties; children?: ReactNode; title?: string; onClick?: () => void }) {
  return (
    <div title={title} onClick={onClick} className={`absolute ${className}`} style={{ left: x, top: y, width: w, height: h, ...style }}>
      {children}
    </div>
  );
}

function Desk({ x, on, w = 70 }: { x: number; on: boolean; w?: number }) {
  const mid = x + w / 2;
  return (
    <>
      <Abs x={mid - 14} y={44} w={28} h={18} className="rounded-[3px] border-2 border-[#2a3346] bg-[#0b0f17]">
        <div className={`h-full w-full ${on ? "anim-screen bg-[#2563eb]" : "bg-[#151c2b]"}`} />
      </Abs>
      <Abs x={mid - 3} y={62} w={6} h={5} className="bg-[#2a3346]" />
      <Abs x={x} y={66} w={w} h={6} className="rounded-sm bg-[#3a2f28]" />
      <Abs x={x + 4} y={72} w={4} h={22} className="bg-[#2b231e]" />
      <Abs x={x + w - 8} y={72} w={4} h={22} className="bg-[#2b231e]" />
    </>
  );
}

/** Posições das mesas numa sala: duas mesas largas, ou mais mesas estreitas quando o time cresce. */
function deskSlots(count: number): { x: number; w: number }[] {
  if (count <= 2) return SLOT_X.map((x) => ({ x, w: 70 }));
  const step = (ROOM_W - 20) / count;
  return Array.from({ length: count }, (_, i) => ({ x: 10 + i * step, w: Math.min(70, step - 8) }));
}

function Plant({ x, y = 64 }: { x: number; y?: number }) {
  return (
    <Abs x={x} y={y} w={24} h={34}>
      <div className="absolute left-[2px] top-0 h-[20px] w-[20px] rounded-full bg-[#15803d]" />
      <div className="absolute left-[9px] top-[-5px] h-[14px] w-[13px] rounded-full bg-[#22c55e]" />
      <div className="absolute bottom-0 left-[5px] h-[13px] w-[14px] rounded-b-[4px] bg-[#9a5a35]" />
    </Abs>
  );
}

function Whiteboard({ x }: { x: number }) {
  return (
    <Abs x={x} y={8} w={62} h={30} className="rounded-[3px] border-2 border-[#cbd5e1] bg-[#f1f5f9] p-[4px]">
      <div className="mb-[4px] h-[3px] w-[80%] rounded bg-[#3b82f6]" />
      <div className="mb-[4px] h-[3px] w-[60%] rounded bg-[#f59e0b]" />
      <div className="h-[3px] w-[70%] rounded bg-[#22c55e]" />
    </Abs>
  );
}

function Cooler({ x }: { x: number }) {
  return (
    <>
      <Abs x={x + 3} y={34} w={12} h={14} className="rounded-t-[4px] bg-[#60a5fa]" />
      <Abs x={x} y={48} w={18} h={44} className="rounded-[3px] bg-[#2a3346]" />
    </>
  );
}

function Sofa({ x, y = 70, w = 70 }: { x: number; y?: number; w?: number }) {
  return (
    <>
      <Abs x={x} y={y} w={w} h={14} className="rounded-t-[5px] bg-[#334155]" />
      <Abs x={x} y={y + 14} w={w} h={12} className="rounded-b-[3px] bg-[#293548]" />
    </>
  );
}

function Character({ bot, x, y, onClick, bubble, walking }: { bot: Bot; x: number; y: number; onClick?: () => void; bubble?: string; walking?: boolean }) {
  const anim = walking ? "anim-bob" : bot.status === "trabalhando" ? "anim-bob" : bot.status === "bloqueado" ? "anim-shake" : "";
  return (
    <Abs x={x} y={y} w={40} className="z-10 flex cursor-pointer flex-col items-center" onClick={onClick} title={`${bot.name} · ${bot.role} · ${bot.status}`}>
      {(bot.status === "esperando" || bot.status === "bloqueado") && !walking && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2">
          <span className="anim-pulse absolute inset-0 rounded-full" style={{ background: statusColor[bot.status] }} />
          <span className="relative block rounded-full px-1.5 text-[9px] font-bold leading-[14px] text-ink-900" style={{ background: statusColor[bot.status] }}>
            {bot.status === "bloqueado" ? "2FA" : "!"}
          </span>
        </div>
      )}
      {bot.status === "ocioso" && !walking && <span className="absolute -top-3 right-0 text-[9px] font-semibold text-muted">zz</span>}
      {bubble && (
        <div className="absolute -top-9 left-1/2 z-20 w-max max-w-[170px] -translate-x-1/2 rounded-md bg-white px-2 py-1 text-[10px] font-medium leading-tight text-slate-900 shadow">
          {bubble}
        </div>
      )}
      <div className={`relative ${anim}`} style={{ opacity: bot.status === "ocioso" && !walking ? 0.75 : 1 }}>
        <Personagem f={bot.figurinha} size={walking ? 28 : 32} />
        <span className="absolute right-[2px] top-[6px] h-[7px] w-[7px] rounded-full" style={{ background: statusColor[bot.status], boxShadow: "0 0 0 1.5px #0b0f17" }} />
      </div>
      {!walking && (
        <div className="mt-0.5 whitespace-nowrap text-center leading-none">
          <div className="text-[9.5px] font-semibold text-white">{bot.name}</div>
          <div className="text-[8.5px] text-muted">{bot.role}</div>
        </div>
      )}
    </Abs>
  );
}

export function AoVivoPage() {
  const { state } = usePortal();
  const counts = useCounts();
  const navigate = useNavigate();
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const t = useAnimationClock(speed, paused);
  const walker = walkerState(t);
  const [events, setEvents] = useState<{ id: number; time: string; text: string }[]>([
    { id: -2, time: "16:05", text: "**Téo** pediu aprovação para enviar 12 propostas" },
    { id: -1, time: "16:01", text: "**Otávio** travou no 2FA do Canva" },
  ]);
  const lastPhase = useRef<Phase>("mesa");
  const lastAmbient = useRef(0);

  useEffect(() => {
    const add = (text: string) => setEvents((ev) => [{ id: Date.now() + Math.random(), time: clockLabel(t), text }, ...ev].slice(0, 8));
    if (walker.phase !== lastPhase.current) {
      lastPhase.current = walker.phase;
      const msg = phaseEvents[walker.phase];
      if (msg) add(msg);
    }
    const slot = Math.floor(t / 7);
    if (slot !== lastAmbient.current && slot > 0) {
      lastAmbient.current = slot;
      add(ambientEvents[slot % ambientEvents.length]!);
    }
  }, [t, walker.phase]);

  const hired = state.bots.filter((b) => b.hired);
  const pending = state.bots.filter((b) => !b.hired);
  const lia = hired.find((b) => b.id === "lia");
  const tavinho = hired.find((b) => b.id === "tavinho");
  const openBot = (b: Bot) => navigate(b.status === "bloqueado" ? `/computador/${b.id}` : `/chat/${b.id}`);
  const spent = 733 + t * 0.02;
  const doorsOpen = ["entrando", "saindo", "entrando2", "saindo2"].includes(walker.phase);

  return (
    <div className="min-h-screen bg-ink-900">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <Logo compact />
        <span className="font-display text-[17px] font-semibold text-white">Prédio Otávio</span>
        <span className="text-[13px] text-muted">· escritório virtual ao vivo</span>
        <span className="chip">
          <Dot color="#22c55e" size={7} /> {counts.working} trabalhando · {counts.approvals} esperando você · {counts.blocked} bloqueado
        </span>
        <span className="chip font-mono text-[13px] text-white">{clockLabel(t)}</span>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/" className="btn">
            <ArrowLeft size={15} /> Painel
          </Link>
          <button className="btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? "Continuar" : "Pausar"}
          </button>
          {[1, 2, 4].map((s) => (
            <button key={s} className={`btn w-12 ${speed === s ? "border-tavinho bg-tavinho/10" : ""}`} onClick={() => setSpeed(s)} aria-pressed={speed === s}>
              {s}x
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-5 p-5">
        <div className="max-w-full overflow-x-auto rounded-2xl border border-line bg-[#0d1322] p-[14px]">
          <div
            className="live relative"
            style={{ width: W, height: H, "--speed": speed, "--play": paused ? "paused" : "running" } as CSSProperties}
          >
            <Abs x={22} y={24} w={W - 44} h={H - 24} className="rounded-t-xl border border-[#243049] bg-[#101828]" />
            <Abs x={W / 2 - 58} y={6} w={116} h={30} className="flex items-center justify-center rounded-full bg-tavinho text-[12px] font-bold tracking-[0.12em] text-white shadow-[0_0_24px_#3b82f6aa]">
              OTÁVIO BOT
            </Abs>
            <Abs x={SHAFT_X} y={TOP} w={SHAFT_W} h={FLOOR_H * 4} className="bg-[#0a0f1a]" />

            {floorsTopDown.map((id, k) => {
              const co = companies.find((c) => c.id === id)!;
              const top = floorTop(k);
              const carHere = !walker.inCar && Math.abs(walker.car - (top + CAR_Y)) < 1;
              return (
                <Abs key={id} x={0} y={top} w={W} h={FLOOR_H}>
                  <Abs x={30} y={FLOOR_H - 4} w={SHAFT_X - 30} h={4} className="bg-[#1c2538]" />
                  <Abs x={SHAFT_X + SHAFT_W} y={FLOOR_H - 4} w={W - 30 - SHAFT_X - SHAFT_W} h={4} className="bg-[#1c2538]" />
                  <Abs x={SHAFT_X + SHAFT_W} y={CORRIDOR_Y + 10} w={W - 30 - SHAFT_X - SHAFT_W} h={FLOOR_H - CORRIDOR_Y - 14} className="bg-[#0f1726]" />
                  <Abs x={44} y={ROOM_Y + 4} w={INFO_W - 40}>
                    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted">{co.floorLabel}</div>
                    <Link to={`/empresas/${co.id}`} className="block text-[13px] font-semibold leading-tight text-white hover:underline">
                      {co.name}
                    </Link>
                    <Bar value={co.budget.spent} max={co.budget.cap} className="mt-2" />
                    <div className="mt-1.5 text-[10px] text-muted">
                      R$ {co.budget.spent} / {co.budget.cap}
                    </div>
                  </Abs>
                  <Abs x={SHAFT_X + 2} y={CAR_Y - 4} w={SHAFT_W - 4} h={CAR_H + 8} className="rounded-sm border-2 border-[#2a3346]" />
                  <Abs x={SHAFT_X + SHAFT_W / 2 - 4} y={CAR_Y - 12} w={8} h={5} className={`rounded-sm ${carHere ? "bg-tavinho" : "bg-[#1c2538]"}`} />
                  {co.departments.map((d, i) => {
                    const room = hired.filter((b) => b.companyId === co.id && b.departmentId === d.id);
                    const slots = deskSlots(room.length);
                    const rx = roomX(i);
                    return (
                      <Abs key={d.id} x={rx} y={ROOM_Y} w={ROOM_W} h={ROOM_H} className="rounded-lg border border-[#243049] bg-[#121a2b]">
                        <div className="absolute left-2.5 top-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{d.name}</div>
                        {i === 0 && <Whiteboard x={136} />}
                        {i === 1 && slots.length <= 2 && <Cooler x={204} />}
                        {i === 2 && room.length < 2 && <Sofa x={140} />}
                        {i !== 1 && slots.length <= 2 && <Plant x={204} />}
                        {slots.map((slot, si) => {
                          const b = room[si];
                          const away = b?.id === "lia" && !walker.atDesk;
                          return <Desk key={si} x={slot.x} w={slot.w} on={!!b && !away && b.status !== "ocioso"} />;
                        })}
                        {room.map((b, si) => {
                          const slot = slots[si]!;
                          const sx = slot.x + slot.w / 2 - 35;
                          if (b.id === "lia" && !walker.atDesk) return null;
                          const bubble =
                            b.id === "duda" && walker.phase === "conversando" && t % CYCLE > 20 ? "Fechado, mando hoje." : undefined;
                          return <Character key={b.id} bot={b} x={sx + 15} y={58} onClick={() => openBot(b)} bubble={bubble} />;
                        })}
                      </Abs>
                    );
                  })}
                  <Abs x={WINDOW_X - 4} y={ROOM_Y + 6} w={62} h={70} className="rounded border-2 border-[#2a3346] bg-gradient-to-b from-[#1e3a5f] to-[#14243d]">
                    <div className="absolute inset-y-0 left-1/2 w-[2px] bg-[#2a3346]" />
                    <div className="absolute inset-x-0 bottom-0 flex h-[22px] items-end justify-around px-1">
                      {[14, 20, 10, 18, 12].map((hh, j) => (
                        <span key={j} className="w-[5px] bg-[#0b1320]" style={{ height: hh }} />
                      ))}
                    </div>
                  </Abs>
                </Abs>
              );
            })}
            {(() => {
              const top = floorTop(3);
              const recW = 2 * ROOM_W + ROOM_GAP - 80;
              const conX = ROOM_X0 + recW + ROOM_GAP;
              const conW = WINDOW_X - 16 - conX;
              return (
                <Abs x={0} y={top} w={W} h={FLOOR_H}>
                  <Abs x={30} y={FLOOR_H - 4} w={W - 60} h={4} className="bg-[#1c2538]" />
                  <Abs x={44} y={ROOM_Y + 4} w={INFO_W - 40}>
                    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted">Térreo</div>
                    <div className="text-[13px] font-semibold text-white">Recepção</div>
                    <div className="mt-1 text-[10px] text-muted">entradas e conselho</div>
                  </Abs>
                  <Abs x={SHAFT_X + 2} y={CAR_Y - 4} w={SHAFT_W - 4} h={CAR_H + 8} className="rounded-sm border-2 border-[#2a3346]" />
                  <Abs x={SHAFT_X + 5} y={CAR_Y} w={SHAFT_W - 10} h={CAR_H} className="rounded-sm bg-gradient-to-r from-[#334155] via-[#1f2a3d] to-[#334155]" />
                  <Abs x={ROOM_X0} y={ROOM_Y} w={recW} h={ROOM_H} className="rounded-lg border border-[#243049] bg-[#121a2b]">
                    <div className="absolute left-2.5 top-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">Recepção</div>
                    <Abs x={16} y={64} w={160} h={32} className="flex items-center rounded-md bg-[#1e293b] pl-3 text-[11px] font-bold tracking-[0.14em] text-tavinho-soft">
                      OTÁVIO BOT
                    </Abs>
                    {tavinho && <Character bot={{ ...tavinho, role: "Diretor · recepção" }} x={118} y={44} onClick={() => openBot(tavinho)} />}
                    <Abs x={214} y={24} w={118} className="rounded-md border border-line-strong bg-[#0b0f17] px-2 py-1.5 text-[10px] leading-snug text-soft">
                      <div>
                        <strong className="text-white">WhatsApp</strong> · 7 conversas
                      </div>
                      <div>
                        <strong className="text-white">Voz</strong> · ouvindo
                      </div>
                      <div>
                        <strong className="text-white">E-mail</strong> · 0
                      </div>
                    </Abs>
                    <Plant x={184} y={74} />
                    {pending.map((b, i) => (
                      <Character key={b.id} bot={{ ...b, role: "aguardando conselho" }} x={344 + i * 40} y={58} onClick={() => navigate("/conselho")} />
                    ))}
                  </Abs>
                  <Abs
                    x={conX}
                    y={ROOM_Y}
                    w={conW}
                    h={ROOM_H}
                    className="cursor-pointer rounded-lg border border-wait/80 bg-[#1a1608]"
                    onClick={() => navigate("/conselho")}
                  >
                    <div className="absolute left-2.5 top-2 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-wait">Sala do conselho · você</div>
                    <Abs x={conW - 178} y={30} w={160} className="rounded-md border-2 border-wait bg-[#0b0f17] px-2.5 py-1.5">
                      <div className="text-[9.5px] font-bold uppercase tracking-wider text-white">Aprovações</div>
                      <div className="text-[10.5px] text-wait">
                        {state.approvals.length === 0 ? "nenhuma pendente" : `${state.approvals.length} ${state.approvals.length === 1 ? "pendente" : "pendentes"}`}
                      </div>
                    </Abs>
                    <Abs x={30} y={72} w={200} h={8} className="rounded bg-[#3a2f28]" />
                    <Abs x={40} y={80} w={4} h={22} className="bg-[#2b231e]" />
                    <Abs x={216} y={80} w={4} h={22} className="bg-[#2b231e]" />
                    <Abs x={112} y={46} w={30} h={30} className="flex items-center justify-center rounded-full bg-tavinho text-[11px] font-bold italic text-white shadow-[0_0_16px_#3b82f6]">
                      VC
                    </Abs>
                    <Abs x={116} y={82} className="text-[9px] text-muted">
                      você
                    </Abs>
                    {state.approvals.length > 0 && (
                      <Abs x={150} y={42} w={10} h={10}>
                        <span className="anim-pulse absolute inset-0 rounded-full bg-wait" />
                        <span className="absolute inset-[2px] rounded-full bg-wait" />
                      </Abs>
                    )}
                    <Plant x={conW - 40} y={72} />
                  </Abs>
                  <Abs x={WINDOW_X - 4} y={ROOM_Y + 6} w={62} h={70} className="rounded border-2 border-[#2a3346] bg-gradient-to-b from-[#1e3a5f] to-[#14243d]">
                    <div className="absolute inset-y-0 left-1/2 w-[2px] bg-[#2a3346]" />
                  </Abs>
                </Abs>
              );
            })()}
            <Abs x={SHAFT_X + 5} y={walker.car} w={SHAFT_W - 10} h={CAR_H} className="z-20 overflow-hidden rounded-sm border border-[#475569] shadow-[0_0_12px_#0008]" style={{ background: doorsOpen ? "transparent" : "#0b111c" }}>
              <div className="mx-auto mt-1 h-[3px] w-[50%] rounded bg-tavinho" />
              {walker.inCar && lia && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                  <Personagem f={lia.figurinha} size={26} />
                </div>
              )}
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#3b4a63] to-[#2a3650] transition-[width] duration-300"
                style={{ width: doorsOpen ? 3 : "50%", opacity: walker.inCar ? 0.45 : 1 }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-gradient-to-l from-[#3b4a63] to-[#2a3650] transition-[width] duration-300"
                style={{ width: doorsOpen ? 3 : "50%", opacity: walker.inCar ? 0.45 : 1 }}
              />
            </Abs>
            {lia && !walker.atDesk && !walker.inCar && (
              <div style={{ position: "absolute", left: 0, top: 0, transform: walker.facingLeft ? "scaleX(1)" : undefined }}>
                <Character
                  bot={lia}
                  walking
                  x={walker.x}
                  y={floorTop(walker.floor) + WALK_Y}
                  onClick={() => openBot(lia)}
                  bubble={walker.phase === "conversando" && t % CYCLE <= 20 ? "Duda, faz um anúncio de franquias?" : undefined}
                />
              </div>
            )}
          </div>
        </div>

        <aside className="w-full space-y-4 lg:w-[250px]">
          <section className="card px-4 py-4">
            <div className="eyebrow mb-2.5">Eventos</div>
            <ul className="space-y-2 text-[12.5px] text-soft">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-[11px] text-muted">{e.time}</span>
                  <span>
                    {e.text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
                      p.startsWith("**") ? (
                        <strong key={i} className="text-white">
                          {p.slice(2, -2)}
                        </strong>
                      ) : (
                        <span key={i}>{p}</span>
                      ),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card px-4 py-4">
            <div className="eyebrow mb-2.5">Gasto de API agora</div>
            <div className="font-display text-[20px] font-semibold text-white">R$ {spent.toFixed(2).replace(".", ",")}</div>
            <div className="text-[12px] text-muted">de R$ 1.500 no mês</div>
            <div className="mt-3 space-y-2.5 text-[12px] text-soft">
              {companies.map((co, i) => {
                const v = co.budget.spent + t * (0.004 + i * 0.003);
                return (
                  <div key={co.id}>
                    <div className="flex justify-between">
                      <span>{co.name}</span>
                      <span className="text-muted">
                        R$ {v.toFixed(0)} / {co.budget.cap}
                      </span>
                    </div>
                    <Bar value={v} max={co.budget.cap} className="mt-1" />
                  </div>
                );
              })}
            </div>
          </section>
          <p className="px-1 text-[12px] leading-relaxed text-muted">Clique num bot para abrir o chat ou o computador dele. Clique na sala do conselho para ver as aprovações.</p>
        </aside>
      </div>
    </div>
  );
}
