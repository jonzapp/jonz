// Writes apps/v1/openapi.json, the /v1 contract that CI's oasdiff step
// compares with main's. A test fails while it is out of date.

import { writeFileSync } from "node:fs";

import { openApi } from "@app/server";

import { V1_OPERATIONS } from "../src/operations";

writeFileSync(new URL("../openapi.json", import.meta.url), `${JSON.stringify(openApi(V1_OPERATIONS), null, 2)}\n`);
