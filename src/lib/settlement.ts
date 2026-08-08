type TransferInput = {
  payoutId: string;
  workOrderId: string;
  netCents: number;
  stripeAccountId: string | null;
};

export type SettlementResult = { provider: "sandbox" | "stripe"; reference: string };

export async function releaseSettlement(input: TransferInput): Promise<SettlementResult> {
  const mode = process.env.CERTIFERA_SETTLEMENT_MODE || "sandbox";
  if (mode === "sandbox") {
    return { provider: "sandbox", reference: `cert-sandbox-${crypto.randomUUID().slice(0, 12)}` };
  }

  const stripeSecret = process.env.CERTIFERA_STRIPE_SECRET_KEY;
  if (mode !== "stripe" || !stripeSecret || !input.stripeAccountId) {
    throw new Error("Production settlement requires CERTIFERA_SETTLEMENT_MODE=stripe, CERTIFERA_STRIPE_SECRET_KEY, and a relay Stripe Connect account.");
  }

  const body = new URLSearchParams({
    amount: String(input.netCents),
    currency: "usd",
    destination: input.stripeAccountId,
    transfer_group: `certifera_${input.workOrderId}`,
    description: `Certifera payout ${input.payoutId}`,
    "metadata[payout_id]": input.payoutId,
    "metadata[work_order_id]": input.workOrderId,
  });
  const response = await fetch("https://api.stripe.com/v1/transfers", {
    method: "POST",
    headers: {
      authorization: `Bearer ${stripeSecret}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": `certifera-payout-${input.payoutId}`,
    },
    body,
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) throw new Error(payload.error?.message || "Stripe could not create the payout transfer.");
  return { provider: "stripe", reference: payload.id };
}
