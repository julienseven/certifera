import "dotenv/config";

const LOCAL_HOST = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/;

/**
 * Guards the suite against running on a shared database.
 *
 * These tests are not read-only: the maintenance suite deletes every expired
 * session, verification token, reset token, and rate-limit window it finds,
 * with no scoping to rows the test created. Against a real environment that is
 * silent data loss.
 *
 * This is not hypothetical — `neon env pull` rewrites DATABASE_URL in .env to
 * the production branch, and the suite reads that same .env, so a routine setup
 * command is enough to repoint the whole suite at production.
 *
 * TEST_DATABASE_URL wins when present. Otherwise a non-local host is refused
 * unless ALLOW_REMOTE_TEST_DB=true is set deliberately.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const databaseUrl = process.env.DATABASE_URL ?? "";

if (databaseUrl && !LOCAL_HOST.test(databaseUrl) && process.env.ALLOW_REMOTE_TEST_DB !== "true") {
  const host = databaseUrl.match(/@([^/?]+)/)?.[1] ?? "an unrecognised host";
  throw new Error(
    `Refusing to run the test suite against ${host}.\n` +
      "These tests delete rows they did not create, so they must not touch a shared database.\n" +
      "Set TEST_DATABASE_URL to a local Postgres, or ALLOW_REMOTE_TEST_DB=true to override.",
  );
}
