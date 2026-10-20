const { EXPENSE_FIELDS } = require('../constants/file.constants');

function parseMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Extra = all expense lines except setDeal; deal = setDeal; amount = extra + deal.
 * Falls back to totalBill when expenses are empty but bill > 0 (legacy rows).
 */
function splitFileExpensesForInvoice(expenses, totalBillFallback) {
  const exp = expenses && typeof expenses === 'object' ? expenses : {};
  let extraAmount = 0;
  for (const field of EXPENSE_FIELDS) {
    if (field === 'setDeal') continue;
    extraAmount += parseMoney(exp[field]);
  }
  const dealAmount = parseMoney(exp.setDeal);
  let amount = extraAmount + dealAmount;
  if (amount <= 0) {
    amount = parseMoney(totalBillFallback);
    if (amount > 0 && extraAmount === 0 && dealAmount === 0) {
      extraAmount = amount;
    }
  }
  return { extraAmount, dealAmount, amount };
}

module.exports = {
  splitFileExpensesForInvoice,
};
