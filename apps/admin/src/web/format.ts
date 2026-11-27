const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const intFormat = new Intl.NumberFormat("pt-BR");
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const brl = (cents: number | string | null | undefined) => brlFormat.format(Number(cents ?? 0) / 100);
export const int = (value: number | string | null | undefined) => intFormat.format(Number(value ?? 0));

/** A calendar date ("2026-11-25") or a timestamp, shown as dd/mm/aaaa. */
export function date(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateFormat.format(new Date(value));
}

export const dateTime = (value: string | null | undefined) => (value ? dateTimeFormat.format(new Date(value)) : "—");

export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

export function documentFormat(digits: string | null | undefined): string {
  if (!digits) return "—";
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return digits;
}

export type Tone = "green" | "amber" | "red" | "slate" | "cyan" | "violet";

export const ORG_STATUS: Record<string, [string, Tone]> = {
  active: ["Ativo", "green"],
  suspended: ["Suspenso", "amber"],
  canceled: ["Cancelado", "slate"],
};

export const SUB_STATUS: Record<string, [string, Tone]> = {
  pending: ["Aguardando 1º pagamento", "cyan"],
  active: ["Em dia", "green"],
  past_due: ["Em atraso", "red"],
  suspended: ["Suspensa", "amber"],
  canceled: ["Cancelada", "slate"],
};

export const PAYMENT_STATUS: Record<string, [string, Tone]> = {
  pending: ["Pendente", "cyan"],
  confirmed: ["Confirmado", "green"],
  received: ["Recebido", "green"],
  overdue: ["Vencido", "red"],
  refunded: ["Estornado", "violet"],
  chargeback: ["Chargeback", "red"],
  canceled: ["Cancelado", "slate"],
};

export const INSTANCE_STATE: Record<string, [string, Tone]> = {
  setting_up: ["Preparando", "cyan"],
  ready: ["Pronta", "green"],
  stopped: ["Parada", "slate"],
  payment_problem: ["Problema de pagamento", "red"],
  failed: ["Falhou", "red"],
};

export const EVENT_STATUS: Record<string, [string, Tone]> = {
  received: ["Na fila", "cyan"],
  processed: ["Processado", "green"],
  ignored: ["Ignorado", "slate"],
  failed: ["Falhou", "red"],
};

export const REPORT_STATUS: Record<string, [string, Tone]> = {
  new: ["Novo", "amber"],
  seen: ["Visto", "cyan"],
  closed: ["Fechado", "slate"],
};

export const BILLING_TYPE: Record<string, string> = {
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de crédito",
  UNDEFINED: "Cliente escolhe",
};

export const LEDGER_KIND: Record<string, string> = {
  plan_grant: "Cota do plano",
  plan_expire: "Cota expirada",
  purchase: "Compra avulsa",
  admin_adjust: "Ajuste manual",
  refund_reversal: "Estorno",
  chargeback_reversal: "Chargeback",
  usage: "Consumo de IA",
};

export const AI_PROVIDER: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  google: "Google AI Studio (Gemini)",
  nvidia: "NVIDIA (catálogo de API)",
  groq: "Groq",
  cerebras: "Cerebras",
  other: "Outro (compatível com OpenAI)",
};

const ACTIONS: Record<string, string> = {
  "admin.login": "Entrou no painel",
  "admin.created": "Administrador criado",
  "admin.reactivated": "Administrador reativado",
  "admin.totp_enabled": "Ativou o 2º fator",
  "admin.totp_disabled": "Desativou o 2º fator",
  "organization.created": "Cliente cadastrado",
  "organization.suspended": "Cliente suspenso",
  "organization.reactivated": "Cliente reativado",
  "organization.canceled": "Cliente cancelado",
  "credits.adjusted": "Créditos ajustados",
  "subscription.created": "Assinatura criada",
  "subscription.active": "Assinatura em dia",
  "subscription.past_due": "Assinatura em atraso",
  "subscription.suspended": "Assinatura suspensa",
  "subscription.canceled": "Assinatura cancelada",
  "subscription.addon_changed": "Adicionais alterados",
  "subscription.courtesy_granted": "Cortesia liberada",
  "subscription.courtesy_revoked": "Cortesia encerrada",
  "payment.credit_charge_created": "Cobrança de créditos gerada",
  "payment.refunded": "Pagamento estornado",
  "payment.after_cancel": "Pagamento após cancelamento",
  "plan.created": "Plano criado",
  "plan.updated": "Plano alterado",
  "plan.deleted": "Plano excluído",
  "addon.updated": "Adicional alterado",
  "billing_account.created": "Conta de cobrança cadastrada",
  "billing_account.updated": "Conta de cobrança alterada",
  "billing_account.api_key_replaced": "Chave do Asaas trocada",
  "billing_account.webhook_token_rotated": "Token do webhook trocado",
  "billing_account.activated_for_new": "Conta ativa para novos trocada",
  "billing_event.retried": "Evento reprocessado",
  "ai_key.created": "Chave de IA cadastrada",
  "ai_key.updated": "Chave de IA alterada",
  "ai_key.rotated": "Chave de IA trocada",
  "ai_key.deleted": "Chave de IA excluída",
  "vps_account.created": "Conta Hostinger cadastrada",
  "vps_account.updated": "Conta Hostinger alterada",
  "vps_account.rotated": "Token Hostinger trocado",
  "gateway_token.issued": "Token do gateway emitido",
  "gateway_token.revoked": "Token do gateway revogado",
  "model_price.created": "Modelo adicionado à tabela de preços",
  "model_price.updated": "Preço de modelo alterado",
  "gateway_settings.updated": "Câmbio/markup do gateway alterados",
  "usage.threshold_50": "Consumo chegou a 50% da cota",
  "usage.threshold_80": "Consumo chegou a 80% da cota",
  "usage.threshold_100": "Consumo chegou a 100% da cota",
  "account.signed_up": "Cliente criou a conta",
  "account.login": "Cliente entrou na área do cliente",
  "account.data_exported": "Cliente exportou os dados",
  "account.deletion_requested": "Cliente pediu exclusão da conta",
  "account.deletion_completed": "Exclusão da conta atendida",
  "account.deletion_rejected": "Exclusão da conta recusada",
  "terms.accepted": "Termos aceitos",
  "subscription.canceled_by_customer": "Cliente cancelou a assinatura",
  "bug_report.status_changed": "Situação de relatório alterada",
  "instance.provisioned": "Instância criada",
  "instance.assigned": "Instância colocada num servidor",
  "instance.ready": "Instância pronta",
  "instance.stopped": "Instância parada pelo operador",
  "instance.started": "Instância ligada pelo operador",
  "instance.reprovisioned": "Instância reprovisionada",
  "instance.decommissioned": "Instância desativada",
  "instance.opened": "Cliente abriu o ArkoBot",
  "node.created": "Servidor cadastrado",
  "node.token_rotated": "Token do servidor trocado",
  "node.status_changed": "Situação do servidor alterada",
  "instance.moved": "Instância mudou de servidor",
  "instance.move_waiting_copy": "Instância espera cópia dos dados para o computador próprio",
  "computer.requested": "Computador (VPS) pedido",
  "computer.approved": "Compra de VPS aprovada",
  "computer.ordered": "VPS comprada no provedor",
  "computer.order_failed": "Compra de VPS falhou",
  "computer.running": "Computador (VPS) no ar",
  "computer.canceled": "Pedido de VPS desfeito",
  "computer.discarded": "Pedido de VPS descartado",
  "computer.retried": "VPS: nova tentativa",
  "computer.release_pending": "VPS a encerrar no provedor",
  "computer.released": "Renovação da VPS desligada",
  "computer.deleted": "VPS apagada no provedor",
  "computer.settings_changed": "Configurações de compra de VPS alteradas",
  "subscription.trial_started": "Teste grátis iniciado",
};

export const actionLabel = (action: string) => ACTIONS[action] ?? action;

export const ACTOR: Record<string, string> = { admin: "Admin", system: "Sistema", webhook: "Webhook", cli: "Linha de comando", customer: "Cliente" };
