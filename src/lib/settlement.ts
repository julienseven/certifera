type TransferInput = {
  payoutId: string;
  workOrderId: string;
  netCents: number;
  stripeAccountId: string | null;
  /**
   * The claim recorded on the payout row before this call. It is the provider
   * idempotency key, so retrying a claim that may already have reached Stripe
   * returns the original transfer instead of creating a second one.
   */
  attemptId: string;
};

export type SettlementResult = { provider: "sandbox" | "stripe"; reference: string };

export async function releaseSettlement(input: TransferInput): Promise<SettlementResult> {
  const mode = process.env.CERTIFERA_SETTLEMENT_MODE || "sandbox";
  if (mode === "sandbox") {
    return { provider: "sandbox", reference: `cert-sandbox-${input.attemptId.slice(0, 12)}` };
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
      // Keyed on the claim, not the payout: a retry of the same claim is
      // idempotent at Stripe, while a deliberate re-release after a *failed*
      // transfer takes a new claim and is allowed to create a new transfer.
      "idempotency-key": `certifera-payout-${input.attemptId}`,
    },
    body,
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) throw new Error(payload.error?.message || "Stripe could not create the payout transfer.");
  return { provider: "stripe", reference: payload.id };
}
