import { getRequestListener } from "@hono/node-server";
import { createRuntime } from "../runtime.ts";
import { createApp } from "./app.ts";

// Vercel's Node.js launcher calls the default export with (IncomingMessage, ServerResponse).
// The context lives for the life of the function instance, so its pool is reused across requests.
const app = createApp(createRuntime());

export default getRequestListener(app.fetch);
