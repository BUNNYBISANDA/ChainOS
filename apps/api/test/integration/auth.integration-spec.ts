import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { TEST_PASSWORD, TestTenant, cleanupTestTenant, createTestApp, createTestTenant } from "./helpers";

describe("Authentication", () => {
  let app: INestApplication;
  let tenant: TestTenant;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTestTenant("auth");
  }, 90000);

  afterAll(async () => {
    await cleanupTestTenant(tenant.tenantId);
    await app.close();
  });

  it("logs in with correct credentials and can call an authenticated route", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: tenant.slug, email: tenant.email, password: TEST_PASSWORD })
      .expect(200);

    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.refreshToken).toEqual(expect.any(String));
    expect(login.body.user.tenantId).toBe(tenant.tenantId);

    const me = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.tenantId).toBe(tenant.tenantId);
    expect(me.body.userId).toBe(tenant.userId);
  });

  it("rejects a wrong password with INVALID_CREDENTIALS, not a 500 or a schema leak", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: tenant.slug, email: tenant.email, password: "wrong-password" })
      .expect(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown organization slug with ORGANIZATION_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: "no-such-org", email: tenant.email, password: TEST_PASSWORD })
      .expect(401);
    expect(res.body.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("rejects a request with a garbage bearer token", async () => {
    await request(app.getHttpServer()).get("/me").set("Authorization", "Bearer not-a-real-token").expect(401);
  });

  it("refresh issues a new token pair and rotates the old refresh token out", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: tenant.slug, email: tenant.email, password: TEST_PASSWORD })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // The rotated-out refresh token can no longer be used.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it("logout revokes the refresh token", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ organizationSlug: tenant.slug, email: tenant.email, password: TEST_PASSWORD })
      .expect(200);

    await request(app.getHttpServer()).post("/auth/logout").send({ refreshToken: login.body.refreshToken }).expect(204);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
