import { Cabecalho } from '@/components/Cabecalho';
import { Computadores } from '@/components/Computadores';
import { Controle } from '@/components/Controle';
import { Dores, Equipe } from '@/components/Dores';
import { Final, Rodape } from '@/components/Final';
import { Heroi } from '@/components/Heroi';
import { FaixaLogos, Integracoes } from '@/components/Integracoes';
import { Movimento } from '@/components/Movimento';
import { Perguntas } from '@/components/Perguntas';
import { Planos } from '@/components/Planos';
import { PredioAoVivo } from '@/components/PredioAoVivo';

export default function Inicio() {
  return (
    <Movimento>
      <Cabecalho />
      <main id="conteudo">
        <Heroi />
        <FaixaLogos />
        <Dores />
        <Equipe />
        <Integracoes />
        <Computadores />
        <Controle />
        <PredioAoVivo />
        <Planos />
        <Perguntas />
        <Final />
      </main>
      <Rodape />
    </Movimento>
  );
}
