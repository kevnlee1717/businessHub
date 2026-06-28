import { describe, expect, it } from "vitest";
import { computeEffectivePermissions, permissions, ROLE_PERMISSIONS } from "./permissions";

describe("computeEffectivePermissions", () => {
  it("returns the role defaults when there are no overrides", () => {
    expect(computeEffectivePermissions("sales", [])).toEqual(ROLE_PERMISSIONS.sales);
  });

  it("grants a valid permission that is not in the role defaults", () => {
    expect(computeEffectivePermissions("sales", [{ permission: "finance.view", effect: "grant" }])).toContain(
      "finance.view"
    );
  });

  it("revokes a valid permission that is in the role defaults", () => {
    expect(computeEffectivePermissions("sales", [{ permission: "case.manage", effect: "revoke" }])).not.toContain(
      "case.manage"
    );
  });

  it("ignores grants for permissions outside the catalog", () => {
    expect(computeEffectivePermissions("sales", [{ permission: "legacy.manage", effect: "grant" }])).toEqual(
      ROLE_PERMISSIONS.sales
    );
  });

  it("returns permissions in catalog order", () => {
    const result = computeEffectivePermissions("sales", [
      { permission: "finance.view", effect: "grant" },
      { permission: "employee.view", effect: "grant" },
      { permission: "case.manage", effect: "revoke" }
    ]);

    expect(result).toEqual(permissions.filter((permission) => result.includes(permission)));
  });
});
