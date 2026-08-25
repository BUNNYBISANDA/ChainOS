/**
 * Runs before every integration test file. Integration tests hit whatever
 * database `DATABASE_URL` currently points to — there is no separate
 * "TEST_DATABASE_URL" indirection, so the safety rule is: never run
 * `pnpm test:integration` against a database you care about. CI points it
 * at a disposable `postgres:` service container (see .github/workflows).
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Integration tests need a real (disposable) Postgres — " +
      "see docs/architecture/testing.md.",
  );
}
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = "integration-test-access-secret";
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = "integration-test-refresh-secret";

jest.setTimeout(30000);

console.log(`[integration tests] target: ${maskCredentials(process.env.DATABASE_URL)}`);

function maskCredentials(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}
