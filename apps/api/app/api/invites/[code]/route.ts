import { SHARE_NAMES_HOUSE } from "@app/core";

import { inviteFor } from "@/lib/share/invite";

/**
 * The house a join link opens, for the join page before anyone has signed
 * in: its name, how many live there and whether it's a family. The same as
 * the link's card in a chat shows (/api/share, /api/og/join), and no more:
 * the money rules wait for sign-in. `invite` is null for a code that opens
 * nothing, and for every code while SHARE_NAMES_HOUSE is off, so the page
 * goes straight to signing in.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = SHARE_NAMES_HOUSE ? await inviteFor(code) : null;
  const invite = found?.invite ?? null;
  return Response.json(
    { names: SHARE_NAMES_HOUSE, invite },
    {
      headers: {
        // A renamed house or a reset code shows within a minute.
        "Cache-Control": "public, max-age=60, s-maxage=60",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
