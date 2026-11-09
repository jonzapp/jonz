// The client version gate. Phones send `Jonz-Client: ios/1.4.2 (57)`; a build
// older than the minimum for its platform gets 426 and the app shows its
// "Update Jonz" screen. The web always runs the latest build, and MCP clients
// and scripts send no header, so neither is gated.

import { Problem } from "./problem";

export const CLIENT_PLATFORMS = ["ios", "android", "web"] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export interface ClientInfo {
  platform: ClientPlatform;
  version: string;
  build: number;
}

/** Lowest supported build per phone platform. Raise it only with a forced update planned. */
export type MinimumBuilds = Partial<Record<Exclude<ClientPlatform, "web">, number>>;

const HEADER = /^(ios|android|web)\/(\d+\.\d+\.\d+)(?: \((\d+)\))?$/;

export function parseClient(header: string | null | undefined): ClientInfo | null {
  const match = header?.trim().match(HEADER);
  if (!match) return null;
  return { platform: match[1] as ClientPlatform, version: match[2], build: match[3] ? Number(match[3]) : 0 };
}

/** Throws `client_too_old` when a phone build is below its platform's minimum. */
export function checkClient(header: string | null | undefined, minimum: MinimumBuilds): ClientInfo | null {
  const client = parseClient(header);
  if (!client || client.platform === "web") return client;
  const min = minimum[client.platform];
  if (min !== undefined && client.build < min) {
    throw new Problem("client_too_old", "This version of Jonz is too old. Update it to keep going.", {
      "Jonz-Minimum-Build": String(min),
    });
  }
  return client;
}
