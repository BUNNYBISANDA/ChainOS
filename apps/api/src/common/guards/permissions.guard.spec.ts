import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { TenantContext } from "../tenant/tenant-context";
import { PERMISSIONS_KEY } from "./permissions.decorator";

function fakeContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  let tenantContext: TenantContext;
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    tenantContext = new TenantContext();
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector, tenantContext);
  });

  it("allows the request through when no @RequirePermissions is set", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    expect(guard.canActivate(fakeContext())).toBe(true);
  });

  it("allows the request when the caller has every required permission", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["po:create"]);
    const result = tenantContext.run({ tenantId: "t1", userId: "u1", permissions: ["po:create", "po:receive"] }, () =>
      guard.canActivate(fakeContext()),
    );
    expect(result).toBe(true);
  });

  it("rejects the request when the caller is missing a required permission", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["po:receive"]);
    expect(() =>
      tenantContext.run({ tenantId: "t1", userId: "u1", permissions: ["po:create"] }, () => guard.canActivate(fakeContext())),
    ).toThrow(/Missing required permission/);
  });

  it("uses PERMISSIONS_KEY as the reflector metadata key", () => {
    const spy = jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    guard.canActivate(fakeContext());
    expect(spy.mock.calls[0][0]).toBe(PERMISSIONS_KEY);
  });
});
