import { joinCodeIn, joinPreview, offerCodeIn, offerPreview, pagePreview, shareHtml, type SharePreview } from "@app/core";

import { inviteFor } from "@/lib/share/invite";
import { offerFor } from "@/lib/share/offer";

/**
 * The page a link-preview bot gets for a jonz.app link: just the card's tags
 * (packages/core/src/share.ts). vercel.json sends iMessage's, WhatsApp's and
 * the other chat apps' bots here, by their user agent, with the path they
 * asked for; people get the app. A join link's card names its house; an
 * offer link's says what it gives; every other page's is the brand card with
 * the page's name.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const at = `/${path.map(encodeURIComponent).join("/")}`;
  const preview = await previewOf(at);
  return new Response(shareHtml(preview), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // A renamed house or a new code shows within five minutes.
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}

async function previewOf(at: string): Promise<SharePreview> {
  const offer = offerCodeIn(at);
  if (offer !== null) {
    const found = await offerFor(offer);
    return found ? offerPreview(found.code, found.offer) : pagePreview("/");
  }
  const code = joinCodeIn(at);
  const found = code === null ? null : await inviteFor(code);
  return found ? joinPreview(found.code, found.invite) : pagePreview(code === null ? at : "/");
}
