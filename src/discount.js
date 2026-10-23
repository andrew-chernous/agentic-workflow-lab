/**
 * Minimum price the store allows so promotions never reduce an order below
 * the lowest charge the store can accept.
 */
export const MIN_PRICE = 1.0;

const DISCOUNT_MULTIPLIERS = {
  SAVE20: 0.8,
  SAVE50: 0.5,
  HALFOFF: 0.5,
};

/**
 * Known discount codes are matched exactly so only the configured marketing
 * codes and aliases are honored, and discounted totals are clamped because the
 * store never charges less than its minimum allowed price.
 */
export function applyDiscount(price, code) {
  if (!Object.hasOwn(DISCOUNT_MULTIPLIERS, code)) {
    return price;
  }

  const discountedPrice = price * DISCOUNT_MULTIPLIERS[code];
  return discountedPrice < MIN_PRICE ? MIN_PRICE : discountedPrice;
}
