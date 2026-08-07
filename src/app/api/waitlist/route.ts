import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { eq } from "drizzle-orm";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedProfiles = new Set(["agent-builder", "operator", "protocol", "researcher"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; profile?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const profile = typeof body.profile === "string" ? body.profile : "agent-builder";

    if (!emailPattern.test(email)) {
      return Response.json({ error: "Please enter a valid work email." }, { status: 400 });
    }

    if (!allowedProfiles.has(profile)) {
      return Response.json({ error: "Please choose a valid profile." }, { status: 400 });
    }

    const existing = await db
      .select({ id: waitlistSignups.id })
      .from(waitlistSignups)
      .where(eq(waitlistSignups.email, email))
      .limit(1);

    if (existing.length) {
      return Response.json({ ok: true, alreadyJoined: true });
    }

    await db.insert(waitlistSignups).values({ email, profile });
    return Response.json({ ok: true, alreadyJoined: false }, { status: 201 });
  } catch (error) {
    console.error("waitlist signup failed", error);
    return Response.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 500 },
    );
  }
}
