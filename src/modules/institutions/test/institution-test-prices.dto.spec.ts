import { ReplaceInstitutionTestPricesSchema } from '../dto/institution-test-prices.dto';

const TEST_ID = '00000000-0000-4000-8000-000000000001';

const valid = {
  prices: [{ testId: TEST_ID, price: 100_000 }],
};

describe('ReplaceInstitutionTestPricesSchema', () => {
  it('accepts a deal price list', () => {
    expect(ReplaceInstitutionTestPricesSchema.safeParse(valid).success).toBe(
      true,
    );
  });

  it('accepts an empty list (clear every override)', () => {
    expect(
      ReplaceInstitutionTestPricesSchema.safeParse({ prices: [] }).success,
    ).toBe(true);
  });

  it('rejects a non-positive price (a Rp 0 invoice cannot be paid)', () => {
    expect(
      ReplaceInstitutionTestPricesSchema.safeParse({
        prices: [{ testId: TEST_ID, price: 0 }],
      }).success,
    ).toBe(false);
    expect(
      ReplaceInstitutionTestPricesSchema.safeParse({
        prices: [{ testId: TEST_ID, price: -1 }],
      }).success,
    ).toBe(false);
  });

  it('rejects a fractional price', () => {
    expect(
      ReplaceInstitutionTestPricesSchema.safeParse({
        prices: [{ testId: TEST_ID, price: 100_000.5 }],
      }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid testId', () => {
    expect(
      ReplaceInstitutionTestPricesSchema.safeParse({
        prices: [{ testId: 'wpt', price: 100_000 }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate testIds', () => {
    const result = ReplaceInstitutionTestPricesSchema.safeParse({
      prices: [
        { testId: TEST_ID, price: 100_000 },
        { testId: TEST_ID, price: 90_000 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('testIds must be unique'),
        ),
      ).toBe(true);
    }
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      ReplaceInstitutionTestPricesSchema.safeParse({
        ...valid,
        institutionId: 'other',
      }).success,
    ).toBe(false);
  });
});
