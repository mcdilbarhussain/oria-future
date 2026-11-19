// Pure P&L helpers – unit tested. Distinguishes ACTUAL (realised, approved) from ESTIMATED figures.
export type TxLite = { type: "INCOME" | "EXPENSE"; category: string; amount: number; isEstimated: boolean; status: string };

export function profitAndLoss(txs: TxLite[]) {
  const counted = txs.filter((t) => t.status === "APPROVED");
  const sum = (f: (t: TxLite) => boolean) => Math.round(counted.filter(f).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const actualIncome = sum((t) => t.type === "INCOME" && !t.isEstimated);
  const actualExpense = sum((t) => t.type === "EXPENSE" && !t.isEstimated);
  const estIncome = sum((t) => t.type === "INCOME" && t.isEstimated);
  const estExpense = sum((t) => t.type === "EXPENSE" && t.isEstimated);
  const byCategory: Record<string, number> = {};
  for (const t of counted.filter((t) => !t.isEstimated)) byCategory[t.category] = Math.round(((byCategory[t.category] ?? 0) + (t.type === "INCOME" ? t.amount : -t.amount)) * 100) / 100;
  return {
    actual: { income: actualIncome, expense: actualExpense, profit: Math.round((actualIncome - actualExpense) * 100) / 100 },
    estimated: { income: actualIncome + estIncome, expense: actualExpense + estExpense, profit: Math.round((actualIncome + estIncome - actualExpense - estExpense) * 100) / 100 },
    byCategory,
  };
}
