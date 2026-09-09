// OpenBioPage — the API.
//
// `createApp` brings the OpenAPI router, the per-request database wiring, and
// the two discovery routes (`/api/openapi.json`, `/llms.txt`) that let the org's
// agent learn this API without anyone documenting it twice.

import { createApp } from "@clawnify/app";
import type { Env } from "./env.js";
import { registerPages } from "./routes/pages.js";
import { registerBlocks } from "./routes/blocks.js";
import { registerStats } from "./routes/stats.js";
import { registerChecks } from "./routes/checks.js";
import { registerSettings } from "./routes/settings.js";
import { registerTemplates } from "./routes/templates.js";
import { registerUploads } from "./routes/uploads.js";
import { registerPublic } from "./routes/public.js";

const app = createApp<Env>({
  title: "OpenBioPage",
  version: "1.0.0",
  description:
    "Link-in-bio pages an agency runs for its clients: one install, many pages, each on its own domain, with every click written to this app's own database rather than rented back from a vendor.",
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || String(err) }, 500);
});

registerPages(app);
registerBlocks(app);
registerStats(app);
registerChecks(app);
registerSettings(app);
  registerTemplates(app);
  registerUploads(app);

// Last, and off the OpenAPI surface: the public page, the counting redirect and
// the avatar. Registered after the authenticated routes so a public path can
// never shadow one.
registerPublic(app);

export default app;
