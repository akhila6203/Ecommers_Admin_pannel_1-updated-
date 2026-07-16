const roundMoney = (value) =>
  Math.round(
    (Number(value || 0) + Number.EPSILON) * 100
  ) / 100;

/**
 * Selling price already GST-inclusive.
 *
 * Example:
 * Amount ₹800, GST 12%
 * GST included = 800 × 12 / 112
 */
const calculateInclusiveGst = (
  amount,
  gstPercent
) => {
  const grossAmount = Number(amount || 0);
  const rate = Number(gstPercent || 0);

  if (grossAmount <= 0 || rate <= 0) {
    return {
      taxableValue: roundMoney(grossAmount),
      gstAmount: 0,
    };
  }

  const gstAmount =
    grossAmount * rate / (100 + rate);

  const taxableValue =
    grossAmount - gstAmount;

  return {
    taxableValue: roundMoney(taxableValue),
    gstAmount: roundMoney(gstAmount),
  };
};

module.exports = {
  roundMoney,
  calculateInclusiveGst,
};