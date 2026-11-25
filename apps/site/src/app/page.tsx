import { Cabecalho } from '@/components/Cabecalho';
import { Final, Rodape } from '@/components/Final';
import { Heroi } from '@/components/Heroi';
import { FaixaLogos } from '@/components/Integracoes';
import { Movimento } from '@/components/Movimento';
import { Passos } from '@/components/Passos';
import { Perguntas } from '@/components/Perguntas';
import { Planos, Valor } from '@/components/Planos';
import { Recursos } from '@/components/Recursos';
import { Seguranca } from '@/components/Seguranca';
import { Trabalhos } from '@/components/Trabalhos';

export default function Inicio() {
  return (
    <Movimento>
      <Cabecalho />
      <main id="conteudo">
        <Heroi />
        <FaixaLogos />
        <Passos />
        <Recursos />
        <Trabalhos />
        <Seguranca />
        <Planos />
        <Valor />
        <Perguntas />
        <Final />
      </main>
      <Rodape />
    </Movimento>
  );
}
