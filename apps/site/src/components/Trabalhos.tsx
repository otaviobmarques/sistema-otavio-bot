'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, Monitor, Plus } from 'lucide-react';
import { botPorId } from '@/config/equipe';
import { trabalhos } from '@/config/trabalhos';
import { AvatarBot } from './AvatarBot';
import { BotaoContato, CabecalhoSecao, Revelar, Secao } from './ui';

export function Trabalhos() {
  const [ativo, setAtivo] = useState(trabalhos[0].id);
  const t = trabalhos.find((x) => x.id === ativo) ?? trabalhos[0];
  const bot = botPorId(t.bot);

  return (
    <Secao id="trabalhos" rotulada="trabalhos-titulo">
      <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <CabecalhoSecao
            id="trabalhos-titulo"
            titulo="Dê a cada bot um trabalho que valha a pena."
            texto="Escolha um trabalho para ver o que o bot entrega e o que ele espera você aprovar."
          />
          <Revelar>
            <div role="tablist" aria-label="Trabalhos" className="mt-8 flex flex-wrap gap-2">
              {trabalhos.map((x) => {
                const b = botPorId(x.bot);
                const sel = x.id === ativo;
                return (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    id={`aba-${x.id}`}
                    aria-selected={sel}
                    aria-controls="painel-trabalho"
                    onClick={() => setAtivo(x.id)}
                    className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[15px] transition ${
                      sel ? 'border-ciano-forte/50 bg-cyan-50 text-tinta' : 'border-linha bg-white text-tinta hover:border-tinta/30'
                    }`}
                  >
                    <AvatarBot bot={b} className="h-5 w-5" />
                    {x.aba}
                  </button>
                );
              })}
            </div>
            <div id="painel-trabalho" role="tabpanel" aria-labelledby={`aba-${t.id}`} className="mt-8 min-h-[13rem]">
              <AnimatePresence mode="wait">
                <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                  <p className="text-lg leading-relaxed text-tinta">{t.descricao}</p>
                  <dl className="mt-5 grid grid-cols-[4.5rem_1fr] gap-y-2 text-[15px]">
                    <dt className="text-cinza">Roda</dt>
                    <dd className="text-tinta">{t.roda}</dd>
                    <dt className="text-cinza">Usa</dt>
                    <dd className="text-tinta">{t.usa}</dd>
                    <dt className="text-cinza">Bot</dt>
                    <dd className="text-tinta">
                      {bot.nome}, {bot.funcao.toLowerCase()}
                    </dd>
                  </dl>
                </motion.div>
              </AnimatePresence>
              <BotaoContato acao="assinar" variante="secundario" className="mt-6">
                Montar a minha equipe
              </BotaoContato>
            </div>
          </Revelar>
        </div>

        <Revelar atraso={0.1}>
          <div className="mx-auto w-full max-w-[20rem] rounded-[2.6rem] border-[3px] border-tinta bg-white p-3 shadow-[0_30px_80px_-40px_rgba(11,18,48,0.6)]">
            <div className="mx-auto mb-2 h-6 w-24 rounded-full bg-tinta" aria-hidden />
            <div className="flex items-center justify-between px-1">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-cartao" aria-hidden>
                <ChevronLeft className="h-4 w-4" />
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-cartao" aria-hidden>
                <Monitor className="h-4 w-4" />
              </span>
            </div>
            <div className="-mt-6 flex flex-col items-center">
              <AvatarBot bot={bot} className="h-14 w-14" />
              <span className="mt-1.5 rounded-full bg-cartao px-3 py-0.5 text-sm font-semibold text-tinta">{t.aba}</span>
            </div>
            <div className="mt-4 h-[21rem] overflow-hidden">
              <p className="text-center text-xs text-cinza">Hoje, {t.roda.split(' às ')[1] ?? '9h'}</p>
              <AnimatePresence mode="wait">
                <motion.ul key={t.id} className="mt-2 space-y-2" initial="oculto" animate="visivel" exit="oculto">
                  {t.conversa.map((f, i) => (
                    <motion.li
                      key={i}
                      variants={{ oculto: { opacity: 0, y: 8 }, visivel: { opacity: 1, y: 0, transition: { delay: i * 0.35 } } }}
                      className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                        f.de === 'voce' ? 'ml-auto rounded-br-md bg-tinta text-white' : 'rounded-bl-md bg-cartao text-tinta'
                      }`}
                    >
                      {f.texto}
                    </motion.li>
                  ))}
                </motion.ul>
              </AnimatePresence>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-cartao" aria-hidden>
                <Plus className="h-4 w-4" />
              </span>
              <span className="flex-1 rounded-full bg-cartao px-3 py-2 text-xs text-cinza">Pedir para {bot.nome}</span>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-cinza">Conversa ilustrativa com dados fictícios.</p>
        </Revelar>
      </div>
    </Secao>
  );
}
