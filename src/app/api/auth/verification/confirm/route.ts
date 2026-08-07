import { NextResponse } from "next/server";
import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { writeAudit } from "@/lib/auth";
import { opaqueHash } from "@/lib/security";
import { and, eq, gt, isNull } from "drizzle-orm";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return NextResponse.redirect(new URL("/access?verification=invalid", request.url));
  const [record] = await db
    .select()
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.tokenHash, opaqueHash(token)), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, new Date())))
    .limit(1);
  if (!record) return NextResponse.redirect(new URL("/access?verification=invalid", request.url));

  await db.transaction(async (tx) => {
    await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, record.id));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, record.userId));
  });
  await writeAudit({ actorId: record.userId, action: "email_verified", resourceType: "user", resourceId: record.userId, request });
  return NextResponse.redirect(new URL("/access?verification=success", request.url));
}
