import { Cabecalho } from '@/components/Cabecalho';
import { ComoFunciona } from '@/components/ComoFunciona';
import { Computadores } from '@/components/Computadores';
import { FaixaIAs } from '@/components/FaixaIAs';
import { Final, Rodape } from '@/components/Final';
import { Galeria } from '@/components/Galeria';
import { Heroi } from '@/components/Heroi';
import { Movimento } from '@/components/Movimento';
import { Perguntas } from '@/components/Perguntas';
import { Planos } from '@/components/Planos';
import { PredioAoVivo } from '@/components/PredioAoVivo';
import { Recursos } from '@/components/Recursos';
import { SecaoIAs } from '@/components/SecaoIAs';

export default function Inicio() {
  return (
    <Movimento>
      <Cabecalho />
      <main id="conteudo">
        <Heroi />
        <FaixaIAs />
        <ComoFunciona />
        <Computadores />
        <SecaoIAs />
        <PredioAoVivo />
        <Recursos />
        <Galeria />
        <Planos />
        <Perguntas />
        <Final />
      </main>
      <Rodape />
    </Movimento>
  );
}
