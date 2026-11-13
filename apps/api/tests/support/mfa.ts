import { createHmac } from "node:crypto";

import type { Actor } from "./clients";
import { rightNow } from "./clock";

/** RFC 6238 code for a base32 secret, as an authenticator app would show it. */
export function totp(secret: string, now = rightNow().getTime()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Adds a TOTP factor and passes it, so the session's token says aal2. */
export async function passSecondFactor(actor: Actor) {
  const { data: enrolled, error } = await actor.db.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw error;
  const { error: verifyError } = await actor.db.auth.mfa.challengeAndVerify({
    factorId: enrolled.id,
    code: totp(enrolled.totp.secret),
  });
  if (verifyError) throw verifyError;
}
