import { describe, expect, it } from "vitest";

import { companyApprovalLine } from "./company-approval";

describe("an approval card a company put there", () => {
  it("names the company and its rules, or its budget, and nothing on any other card", () => {
    expect(companyApprovalLine({ companyApproval: { kind: "rule", companyId: "co_1", company: "RedBox", rules: [
      { id: "r1", trigger: "bulk-send", threshold: 20 }, { id: "r2", trigger: "publish" },
    ] } })).toBe("RedBox rule: send to more than 20 contacts, publish or deliver outside");
    expect(companyApprovalLine({ companyApproval: { kind: "budget", companyId: "co_1", company: "FoodX", month: "2026-11" } })).toBe("FoodX budget");
    expect(companyApprovalLine({})).toBeNull();
    expect(companyApprovalLine(undefined)).toBeNull();
  });
});
