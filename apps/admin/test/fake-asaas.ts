import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown> | null;
}

/**
 * An in-memory stand-in for Asaas API v3: the endpoints the Admin calls, the
 * `access_token` check and the error shape (`{ errors: [{ code, description }] }`).
 */
export class FakeAsaas {
  readonly requests: RecordedRequest[] = [];
  readonly customers = new Map<string, Record<string, unknown>>();
  readonly subscriptions = new Map<string, Record<string, unknown>>();
  readonly payments = new Map<string, Record<string, unknown>>();
  apiKey: string;
  #server: Server | null = null;
  #seq = 0;

  constructor(apiKey = "$aact_test_fake_key_0000000000000000") {
    this.apiKey = apiKey;
  }

  get baseUrl(): string {
    const address = this.#server?.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}/v3`;
  }

  #id(prefix: string) {
    this.#seq++;
    return `${prefix}_${String(this.#seq).padStart(6, "0")}`;
  }

  async start(): Promise<void> {
    this.#server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const text = Buffer.concat(chunks).toString("utf8");
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      const path = (req.url ?? "").replace(/^\/v3/, "");
      this.requests.push({ method: req.method ?? "", path, headers: req.headers, body });
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const fail = (status: number, code: string, description: string) => send(status, { errors: [{ code, description }] });
      if (req.headers.access_token !== this.apiKey) return fail(401, "invalid_access_token", "A chave de API fornecida é inválida");

      if (req.method === "POST" && path === "/customers") {
        if (!body?.cpfCnpj) return fail(400, "invalid_cpfCnpj", "O CPF/CNPJ do cliente é obrigatório");
        const customer = { object: "customer", id: this.#id("cus"), ...body };
        this.customers.set(customer.id, customer);
        return send(200, customer);
      }
      if (req.method === "POST" && path === "/subscriptions") {
        if (!this.customers.has(String(body?.customer))) return fail(400, "invalid_customer", "Cliente inexistente");
        if (!["PIX", "BOLETO", "CREDIT_CARD", "UNDEFINED"].includes(String(body?.billingType))) return fail(400, "invalid_billingType", "Forma de pagamento inválida");
        const subscription = { object: "subscription", id: this.#id("sub"), status: "ACTIVE", deleted: false, ...body };
        this.subscriptions.set(subscription.id, subscription);
        const firstId = this.#id("pay");
        this.payments.set(firstId, {
          object: "payment", id: firstId, status: "PENDING", subscription: subscription.id, customer: body?.customer, billingType: body?.billingType,
          value: body?.value, dueDate: body?.nextDueDate, invoiceUrl: `https://sandbox.asaas.com/i/${firstId}`,
        });
        return send(200, subscription);
      }
      const subPaymentsMatch = path.match(/^\/subscriptions\/([^/?]+)\/payments(\?.*)?$/);
      if (req.method === "GET" && subPaymentsMatch) {
        if (!this.subscriptions.has(subPaymentsMatch[1]!)) return fail(404, "not_found", "Assinatura não encontrada");
        const data = [...this.payments.values()].filter((payment) => payment.subscription === subPaymentsMatch[1]);
        return send(200, { object: "list", hasMore: false, totalCount: data.length, limit: 20, offset: 0, data });
      }
      const subMatch = path.match(/^\/subscriptions\/([^/]+)$/);
      if (subMatch) {
        const sub = this.subscriptions.get(subMatch[1]!);
        if (!sub) return fail(404, "not_found", "Assinatura não encontrada");
        if (req.method === "DELETE") {
          sub.deleted = true;
          sub.status = "INACTIVE";
          return send(200, { deleted: true, id: sub.id });
        }
        if (req.method === "POST") {
          Object.assign(sub, body);
          if (body?.updatePendingPayments) {
            for (const payment of this.payments.values()) {
              if (payment.subscription === sub.id && payment.status === "PENDING") payment.value = body.value;
            }
          }
          return send(200, sub);
        }
      }
      if (req.method === "POST" && path === "/payments") {
        if (!this.customers.has(String(body?.customer))) return fail(400, "invalid_customer", "Cliente inexistente");
        const id = this.#id("pay");
        const payment = { object: "payment", id, status: "PENDING", invoiceUrl: `https://sandbox.asaas.com/i/${id}`, ...body };
        this.payments.set(id, payment);
        return send(200, payment);
      }
      const qrMatch = path.match(/^\/payments\/([^/]+)\/pixQrCode$/);
      if (req.method === "GET" && qrMatch) {
        if (!this.payments.has(qrMatch[1]!)) return fail(404, "not_found", "Cobrança não encontrada");
        return send(200, { encodedImage: "iVBORw0KGgo=", payload: `00020126580014br.gov.bcb.pix-${qrMatch[1]}`, expirationDate: "2026-12-31 23:59:59" });
      }
      if (req.method === "GET" && path === "/finance/balance") return send(200, { balance: 1234.5 });
      return fail(404, "not_found", `Rota ${req.method} ${path} não existe no Asaas falso`);
    });
    await new Promise<void>((resolve) => this.#server!.listen(0, "127.0.0.1", resolve));
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.#server?.close(() => resolve()));
  }

  /** A webhook body as Asaas sends it for a payment event. */
  paymentEvent(event: string, payment: Record<string, unknown>, eventId = this.#id("evt")) {
    return { id: eventId, event, dateCreated: "2026-11-25 10:00:00", payment: { object: "payment", ...payment } };
  }

  subscriptionEvent(event: string, subscription: Record<string, unknown>, eventId = this.#id("evt")) {
    return { id: eventId, event, dateCreated: "2026-11-25 10:00:00", subscription: { object: "subscription", ...subscription } };
  }
}
