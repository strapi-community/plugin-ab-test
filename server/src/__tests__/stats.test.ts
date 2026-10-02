import { describe, expect, it } from 'vitest';

import { meanSignificance, proportionSignificance, uplift } from '../utils/stats';

describe('proportionSignificance', () => {
  it('matches a two-proportion z-test', () => {
    // 100/1000 against 130/1000: z = 2.103, two-sided p = 0.0355.
    const significance = proportionSignificance(
      { visitors: 1000, conversions: 100 },
      { visitors: 1000, conversions: 130 }
    );

    expect(significance).toBeCloseTo(0.9645, 3);
  });

  it('does not depend on which version is ahead', () => {
    const ahead = proportionSignificance(
      { visitors: 500, conversions: 50 },
      { visitors: 500, conversions: 80 }
    );
    const behind = proportionSignificance(
      { visitors: 500, conversions: 80 },
      { visitors: 500, conversions: 50 }
    );

    expect(ahead).toBeCloseTo(behind as number, 10);
  });

  it('is zero for identical rates', () => {
    expect(
      proportionSignificance({ visitors: 200, conversions: 40 }, { visitors: 400, conversions: 80 })
    ).toBeCloseTo(0, 6);
  });

  it('waits for enough visitors in each version', () => {
    expect(
      proportionSignificance({ visitors: 29, conversions: 10 }, { visitors: 500, conversions: 80 })
    ).toBeNull();
  });

  it('waits for enough conversions and non-conversions', () => {
    expect(
      proportionSignificance({ visitors: 100, conversions: 1 }, { visitors: 100, conversions: 3 })
    ).toBeNull();
    expect(
      proportionSignificance({ visitors: 100, conversions: 99 }, { visitors: 100, conversions: 98 })
    ).toBeNull();
  });
});

describe('meanSignificance', () => {
  it("matches Welch's test with the normal approximation", () => {
    // Means 2.0 and 2.3, variances 4 and 5, 400 visitors each: z = 2, two-sided p = 0.0455.
    const significance = meanSignificance(
      { visitors: 400, mean: 2, variance: 4 },
      { visitors: 400, mean: 2.3, variance: 5 }
    );

    expect(significance).toBeCloseTo(0.9545, 3);
  });

  it('waits for enough visitors, and for values that vary', () => {
    expect(
      meanSignificance(
        { visitors: 10, mean: 2, variance: 4 },
        { visitors: 400, mean: 3, variance: 5 }
      )
    ).toBeNull();
    expect(
      meanSignificance(
        { visitors: 400, mean: 1, variance: 0 },
        { visitors: 400, mean: 1, variance: 0 }
      )
    ).toBeNull();
  });
});

describe('uplift', () => {
  it('is relative to the original', () => {
    expect(uplift(0.1, 0.13)).toBeCloseTo(0.3, 10);
    expect(uplift(0.2, 0.1)).toBeCloseTo(-0.5, 10);
  });

  it('is unknown when the original has no value to compare with', () => {
    expect(uplift(0, 0.1)).toBeNull();
    expect(uplift(null, 0.1)).toBeNull();
    expect(uplift(0.1, null)).toBeNull();
  });
});
