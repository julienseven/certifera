/**
 * In-process short-circuit for callers already known to be over their limit.
 *
 * The limiter itself is a Postgres upsert on a (subject, route, window) row.
 * That is correct and it is shared across instances, but it means an abusive
 * caller still buys a row lock and a write on every request it makes — the
 * requests being rejected are exactly as expensive to the database as the ones
 * being served, and they contend on a single hot row while doing it. Under the
 * small connection pool this deployment runs, a caller hammering one route can
 * therefore degrade every other caller despite being refused.
 *
 * Once the database has told us a subject exceeded its window, that verdict
 * cannot change until the window rolls over: the count only increases. So the
 * answer is cached until that instant and served without a query.
 *
 * Deliberately per-instance and advisory. It never *grants* access, only
 * repeats a denial the database already issued, so a cold instance is not more
 * permissive than a warm one, and the shared counter stays the source of truth.
 */

type Breach = { until: number };

const globalForRateLimit = globalThis as typeof globalThis & {
  __certiferaRateLimitBreaches?: Map<string, Breach>;
};

const breaches = (globalForRateLimit.__certiferaRateLimitBreaches ??= new Map<string, Breach>());

/**
 * Bounds the map so a spray of distinct subjects cannot grow it without limit.
 * Entries are tiny and expire on their own; this is a backstop against a
 * pathological key space, not routine maintenance.
 */
const MAX_TRACKED_BREACHES = 10_000;

function key(subject: string, route: string) {
  return `${subject}\u0000${route}`;
}

/** Milliseconds until the fixed window containing `now` rolls over. */
export function windowEndsAt(now: number) {
  return Math.floor(now / 60_000) * 60_000 + 60_000;
}

/**
 * Returns the retry-after in seconds when this subject is known to be over its
 * limit for the current window, or null when the request should be counted
 * normally.
 */
export function knownBreach(subject: string, route: string, now = Date.now()): number | null {
  const found = breaches.get(key(subject, route));
  if (!found) return null;
  if (found.until <= now) {
    // Window rolled over; the caller gets a fresh budget.
    breaches.delete(key(subject, route));
    return null;
  }
  return Math.max(1, Math.ceil((found.until - now) / 1000));
}

/** Records that the shared counter refused this subject for the current window. */
export function rememberBreach(subject: string, route: string, now = Date.now()) {
  if (breaches.size >= MAX_TRACKED_BREACHES) {
    // Drop whatever has already expired before resorting to eviction.
    for (const [entry, breach] of breaches) {
      if (breach.until <= now) breaches.delete(entry);
    }
    if (breaches.size >= MAX_TRACKED_BREACHES) {
      const oldest = breaches.keys().next();
      if (!oldest.done) breaches.delete(oldest.value);
    }
  }
  breaches.set(key(subject, route), { until: windowEndsAt(now) });
}

/** Tests re-run windows deliberately; requests never clear this. */
export function resetRateLimitBreaches() {
  breaches.clear();
}

export function trackedBreachCount() {
  return breaches.size;
}
