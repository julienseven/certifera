import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionIdentity } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const identity = await getSessionIdentity();
  if (!identity) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  const [user] = await db.select({ createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, identity.userId)).limit(1);
  return Response.json({ user: { ...identity, createdAt: user?.createdAt, lastLoginAt: user?.lastLoginAt } });
}
