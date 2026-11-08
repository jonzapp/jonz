import { SHARE_IMAGE, offerSign } from "@app/core";
import { ImageResponse } from "next/og";

import { Card, cardFonts } from "@/lib/share/card";
import { offerFor } from "@/lib/share/offer";

/**
 * An offer link's picture in the chat it was pasted into: what it gives on
 * the amber plate ("Half off") and "Your House Pass, a gift from Jonz." under
 * it. Stopped, ended or unknown, it still gets a picture, "Offer ended", so
 * the chat never shows a broken one. Never who it's for.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [found, fonts] = await Promise.all([offerFor(code), cardFonts()]);
  return new ImageResponse(<Card sign={offerSign(found?.offer ?? null)} />, {
    ...SHARE_IMAGE,
    fonts,
    // A stopped offer's card says so within five minutes.
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
