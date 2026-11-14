import { callV1 } from './v1';

// The time zones a house can be set to (public.time_zones() on /v1): the
// places the database knows, and UTC. The picker keeps those that are a
// place people live (zoneChoices in @app/core).

/** Every zone the database knows by an IANA name, and UTC. */
export function timeZones(): Promise<string[]> {
  return callV1('time_zones', {});
}
