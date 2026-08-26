import {
  classifyInventoryRisk,
  decimalToNumber,
  isOtifSuccess,
  resolveDateRange,
  resolveTrendBucket,
  safePercent,
  trendBucketKey,
} from "./analytics.util";

describe("resolveDateRange", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("defaults to the last 30 days when nothing is supplied, snapped to that day's UTC midnight", () => {
    const range = resolveDateRange({}, now);
    expect(range.preset).toBe("30d");
    expect(range.to.getTime()).toBe(now.getTime());
    expect(range.from.toISOString()).toBe("2026-07-26T00:00:00.000Z");
  });

  it("resolves the today preset to UTC start-of-day through now", () => {
    const range = resolveDateRange({ range: "today" }, now);
    expect(range.from.toISOString()).toBe("2026-08-25T00:00:00.000Z");
    expect(range.to.getTime()).toBe(now.getTime());
  });

  it("prefers explicit from/to over the range preset, even when both are given", () => {
    const range = resolveDateRange({ range: "7d", from: "2026-01-01", to: "2026-01-10" }, now);
    expect(range.preset).toBe("custom");
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-01-10");
  });
});

describe("safePercent", () => {
  it("returns null on a zero denominator instead of 0 or NaN", () => {
    expect(safePercent(0, 0)).toBeNull();
  });

  it("computes a rounded percentage", () => {
    expect(safePercent(1, 3)).toBeCloseTo(33.33, 2);
  });
});

describe("decimalToNumber", () => {
  it("returns 0 for null/undefined", () => {
    expect(decimalToNumber(null)).toBe(0);
    expect(decimalToNumber(undefined)).toBe(0);
  });

  it("converts a Decimal-like object via toString", () => {
    expect(decimalToNumber({ toString: () => "85.50" } as never)).toBe(85.5);
  });
});

describe("resolveTrendBucket", () => {
  it("buckets short ranges daily, medium ranges weekly, long ranges monthly", () => {
    expect(resolveTrendBucket(new Date("2026-01-01"), new Date("2026-01-15"))).toBe("day");
    expect(resolveTrendBucket(new Date("2026-01-01"), new Date("2026-03-01"))).toBe("week");
    expect(resolveTrendBucket(new Date("2026-01-01"), new Date("2027-01-01"))).toBe("month");
  });
});

describe("trendBucketKey", () => {
  it("keys a day bucket to its ISO date", () => {
    expect(trendBucketKey(new Date("2026-08-25T15:30:00Z"), "day")).toBe("2026-08-25");
  });

  it("keys a month bucket to its year-month", () => {
    expect(trendBucketKey(new Date("2026-08-25T15:30:00Z"), "month")).toBe("2026-08");
  });

  it("keys a week bucket to that week's Monday", () => {
    // 2026-08-25 is a Tuesday; the week's Monday is 2026-08-24.
    expect(trendBucketKey(new Date("2026-08-25T15:30:00Z"), "week")).toBe("2026-08-24");
  });
});

describe("classifyInventoryRisk", () => {
  it("is STOCKOUT whenever available <= 0, regardless of incoming supply", () => {
    expect(classifyInventoryRisk(0, 500)).toBe("STOCKOUT");
    expect(classifyInventoryRisk(-10, 500)).toBe("STOCKOUT");
  });

  it("is PROJECTED_STOCKOUT when available > 0 but the projection goes negative", () => {
    expect(classifyInventoryRisk(300, -500)).toBe("PROJECTED_STOCKOUT");
  });

  it("is HEALTHY when the projection is non-negative", () => {
    expect(classifyInventoryRisk(1000, 300)).toBe("HEALTHY");
    expect(classifyInventoryRisk(1000, 0)).toBe("HEALTHY");
  });
});

describe("isOtifSuccess", () => {
  it("fails an incomplete order even if delivered early", () => {
    expect(
      isOtifSuccess({ fullyFulfilled: false, deliveredAt: new Date("2026-08-09"), requestedDeliveryDate: new Date("2026-08-10") }),
    ).toBe(false);
  });

  it("fails a complete order delivered after the requested date", () => {
    expect(
      isOtifSuccess({ fullyFulfilled: true, deliveredAt: new Date("2026-08-12"), requestedDeliveryDate: new Date("2026-08-10") }),
    ).toBe(false);
  });

  it("passes a complete order delivered on or before the requested date", () => {
    expect(
      isOtifSuccess({ fullyFulfilled: true, deliveredAt: new Date("2026-08-09"), requestedDeliveryDate: new Date("2026-08-10") }),
    ).toBe(true);
    expect(
      isOtifSuccess({ fullyFulfilled: true, deliveredAt: new Date("2026-08-10"), requestedDeliveryDate: new Date("2026-08-10") }),
    ).toBe(true);
  });
});
