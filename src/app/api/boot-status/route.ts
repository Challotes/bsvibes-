import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getBootPrice, getBootPriceForUser } from "@/services/fairness/pricing";

export const dynamic = "force-dynamic";

/**
 * GET /api/boot-status?pubkey=<address>
 *
 * Returns the current free boots remaining and boot price for the given identity.
 * Used by Feed.tsx to initialise client-side state on first load.
 */
export async function GET(req: NextRequest) {
  // Rate limit: 30 requests per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`boot-status:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const pubkey = req.nextUrl.searchParams.get("pubkey") ?? "";

  if (!pubkey || pubkey.trim().length === 0) {
    const price = getBootPrice(db);
    return NextResponse.json({ freeBootsRemaining: 0, bootPrice: price, isFree: false });
  }

  const { price, isFree, freeRemaining } = getBootPriceForUser(db, pubkey);

  return NextResponse.json({
    freeBootsRemaining: freeRemaining,
    bootPrice: price > 0 ? price : getBootPrice(db),
    isFree,
  });
}
