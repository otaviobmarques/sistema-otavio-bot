import type { CancelResult, MachineRef, OrderRequest, OrderResult, VirtualMachine, VpsProvider, VpsProviderKind } from "../src/computers/provider.ts";
import { VpsProviderError } from "../src/computers/provider.ts";

/** An in-memory VPS provider: it never spends anything, and it records every call. */
export class FakeVps implements VpsProvider {
  readonly kind: VpsProviderKind;
  readonly deletesOnCancel: boolean;
  orders: OrderRequest[] = [];
  machines = new Map<string, VirtualMachine>();
  setups: string[] = [];
  cleanups: string[] = [];
  cancels: MachineRef[] = [];
  /** The next order fails like this. */
  failNext: VpsProviderError | null = null;
  /** What a new machine looks like right after the order. */
  initialPhase: VirtualMachine["phase"] = "installing";
  /** Answer the order with no machine yet (Hostinger 202). */
  pending = false;
  #seq = 0;

  constructor(kind: VpsProviderKind = "hetzner") {
    this.kind = kind;
    this.deletesOnCancel = kind === "hetzner";
  }

  async order(request: OrderRequest): Promise<OrderResult> {
    this.orders.push(request);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    const id = String(1000 + ++this.#seq);
    const machine: VirtualMachine = { id, subscriptionRef: `sub_${id}`, phase: this.initialPhase, state: this.initialPhase, hostname: `srv${id}.example`, ipv4: `198.51.100.${this.#seq}` };
    this.machines.set(id, machine);
    return {
      orderRef: `ord_${id}`, subscriptionRef: machine.subscriptionRef, machine: this.pending ? null : { ...machine },
      regionRef: request.regionRef, imageRef: request.imageRef ?? "ubuntu-24.04", scriptRef: this.kind === "hostinger" ? `script_${id}` : null,
    };
  }

  async status(ref: MachineRef) {
    const found = ref.vmId ? this.machines.get(ref.vmId) : [...this.machines.values()].find((m) => m.subscriptionRef === ref.subscriptionRef);
    return found ? { ...found } : null;
  }

  async setup(vmId: string) {
    this.setups.push(vmId);
    this.machines.get(vmId)!.phase = "installing";
  }

  async cleanup(scriptRef: string) {
    this.cleanups.push(scriptRef);
  }

  async cancel(ref: MachineRef): Promise<CancelResult> {
    this.cancels.push(ref);
    if (this.deletesOnCancel && ref.vmId) this.machines.delete(ref.vmId);
    return { autoRenew: false, expiresAt: this.deletesOnCancel ? null : "2026-12-25T12:00:00Z" };
  }

  set(id: string, phase: VirtualMachine["phase"], state: string = phase) {
    const machine = this.machines.get(id)!;
    machine.phase = phase;
    machine.state = state;
  }
}
