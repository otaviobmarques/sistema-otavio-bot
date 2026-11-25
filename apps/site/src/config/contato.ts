/**
 * Canais de contato usados pelos botões "Começar" e "Falar com a gente".
 *
 * PREENCHA ANTES DE PUBLICAR. Enquanto os dois campos estiverem vazios, os
 * botões levam à seção de contato do próprio site, que avisa que os canais
 * serão publicados em breve.
 *
 * - `whatsapp`: só dígitos, com código do país e DDD (ex.: "5511912345678").
 *   Quando preenchido, tem prioridade sobre o e-mail.
 * - `email`: endereço completo (ex.: "contato@seudominio.com.br").
 * - `mensagemInicial`: texto que já vem escrito no WhatsApp ou no assunto do e-mail.
 */
export const contato = {
  whatsapp: '',
  email: '',
  mensagemInicial: 'Olá! Quero conhecer o ArkoBot.',
};

export type CanalContato = { href: string; externo: boolean; rotulo: string };

export function canalPrincipal(): CanalContato {
  const texto = encodeURIComponent(contato.mensagemInicial);
  const digitos = contato.whatsapp.replace(/\D/g, '');
  if (digitos) return { href: `https://wa.me/${digitos}?text=${texto}`, externo: true, rotulo: 'WhatsApp' };
  if (contato.email.trim()) {
    return { href: `mailto:${contato.email.trim()}?subject=${texto}`, externo: true, rotulo: 'E-mail' };
  }
  return { href: '#contato', externo: false, rotulo: 'Contato' };
}

export function temCanalConfigurado(): boolean {
  return canalPrincipal().href !== '#contato';
}
