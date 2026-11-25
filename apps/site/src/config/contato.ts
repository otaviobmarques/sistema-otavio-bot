/**
 * Para onde levam os botões do site. PREENCHA ANTES DE PUBLICAR.
 *
 * - `urlAssinatura`: cadastro na Área do cliente ("Começar agora" e "Assinar"). Os botões de cada plano
 *   acrescentam `?plano=<id>` para o plano já vir escolhido. Vazia, esses botões usam o mesmo canal de
 *   "Falar com um especialista".
 * - `urlEntrar`: login de quem já é cliente (botão "Entrar" do topo).
 * - `whatsapp`: só dígitos, com código do país e DDD (ex.: "5511912345678"). Tem prioridade sobre o e-mail.
 * - `whatsappVisivel`: o mesmo número, formatado para aparecer no site.
 * - `email`: endereço completo (ex.: "contato@seudominio.com.br"). Vazio, não aparece no site.
 * - `mensagemInicial`: texto que já vem escrito no WhatsApp ou no assunto do e-mail.
 *
 * Com tudo vazio, os botões levam à seção de contato do próprio site, que avisa que os canais saem em breve.
 */
export const contato = {
  urlAssinatura: 'https://conta.arkobot.com.br/cadastro',
  urlEntrar: 'https://conta.arkobot.com.br/entrar',
  whatsapp: '5519987822290',
  whatsappVisivel: '+55 (19) 98782-2290',
  email: 'contato@arkobot.com.br',
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

export function destinoDe(acao: Acao, plano?: string): Destino {
  const url = contato.urlAssinatura.trim();
  if (acao === 'assinar' && url) return { href: plano ? `${url}?plano=${encodeURIComponent(plano)}` : url, externo: false };
  return canalDeContato();
}

export function temCanalConfigurado(): boolean {
  return canalDeContato().href !== '#contato';
}
