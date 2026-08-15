import { describe, expect, it } from "vitest";
import { etaLabel, money, requestTone } from "@/app/console/_lib/format";
import type { RequestStatus } from "@/app/console/_lib/types";

/**
 * These are the console's display rules. They lived inside a 684-line client
 * component, where checking that a 90-minute ETA reads "1h 30m" meant rendering
 * the whole page, so nothing checked them at all.
 */

describe("etaLabel", () => {
  it("keeps sub-hour ETAs in minutes", () => {
    expect(etaLabel(15)).toBe("15 min");
    expect(etaLabel(59)).toBe("59 min");
  });

  it("drops the minutes component when an ETA is a whole number of hours", () => {
    expect(etaLabel(60)).toBe("1h");
    expect(etaLabel(120)).toBe("2h");
  });

  it("renders hours and minutes together", () => {
    expect(etaLabel(90)).toBe("1h 30m");
    expect(etaLabel(1439)).toBe("23h 59m");
  });

  it("handles the bounds the bid endpoint actually accepts", () => {
    // The API constrains ETAs to 15 minutes .. 24 hours.
    expect(etaLabel(15)).toBe("15 min");
    expect(etaLabel(1440)).toBe("24h");
  });
});

describe("requestTone", () => {
  it("gives every lifecycle status a distinct tone", () => {
    const statuses: RequestStatus[] = ["open", "matched", "review", "disputed", "verified"];
    const tones = statuses.map(requestTone);
    expect(new Set(tones).size).toBe(statuses.length);
  });

  it("marks a dispute in red and a verified outcome in green", () => {
    expect(requestTone("disputed")).toContain("red");
    expect(requestTone("verified")).toContain("#73f59a");
  });
});

describe("money", () => {
  it("formats whole dollars without cents", () => {
    // Rewards are shown at dollar resolution; cents are noise in the queue.
    expect(money.format(28500 / 100)).toBe("$285");
    expect(money.format(0)).toBe("$0");
  });
});
