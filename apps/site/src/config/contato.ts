/**
 * Para onde levam os botões do site. PREENCHA ANTES DE PUBLICAR.
 *
 * - `urlAssinatura`: página de cadastro ou pagamento dos planos ("Começar agora" e "Assinar").
 *   Vazia, esses botões usam o mesmo canal de "Falar com um especialista".
 * - `whatsapp`: só dígitos, com código do país e DDD (ex.: "5511912345678"). Tem prioridade sobre o e-mail.
 * - `whatsappVisivel`: o mesmo número, formatado para aparecer no site.
 * - `email`: endereço completo (ex.: "contato@seudominio.com.br"). Vazio, não aparece no site.
 * - `mensagemInicial`: texto que já vem escrito no WhatsApp ou no assunto do e-mail.
 *
 * Com tudo vazio, os botões levam à seção de contato do próprio site, que avisa que os canais saem em breve.
 */
export const contato = {
  urlAssinatura: '',
  whatsapp: '5519987822290',
  whatsappVisivel: '+55 (19) 98782-2290',
  email: '',
  mensagemInicial: 'Olá! Quero conhecer o ArkoBot.',
};

export type Acao = 'assinar' | 'falar';
export type Destino = { href: string; externo: boolean };

export function canalDeContato(): Destino {
  const texto = encodeURIComponent(contato.mensagemInicial);
  const digitos = contato.whatsapp.replace(/\D/g, '');
  if (digitos) return { href: `https://wa.me/${digitos}?text=${texto}`, externo: true };
  if (contato.email.trim()) return { href: `mailto:${contato.email.trim()}?subject=${texto}`, externo: true };
  return { href: '#contato', externo: false };
}

export function destinoDe(acao: Acao): Destino {
  if (acao === 'assinar' && contato.urlAssinatura.trim()) return { href: contato.urlAssinatura.trim(), externo: true };
  return canalDeContato();
}

export function temCanalConfigurado(): boolean {
  return canalDeContato().href !== '#contato';
}
