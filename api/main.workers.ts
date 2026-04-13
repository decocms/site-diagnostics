// Wrangler rules (wrangler.toml) resolve this import as a Text module.
import CLIENT_HTML from "../dist/client/index.html";
import { createApp } from "./app.ts";

export default createApp({
	clientHTML: CLIENT_HTML as unknown as string,
});
