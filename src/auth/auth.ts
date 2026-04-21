import { type BetterAuthOptions, betterAuth } from "better-auth";
import { anonymous, emailOTP, mcp } from "better-auth/plugins";
import type { AuthDB } from "./db.ts";

export interface AuthConfig {
	db: AuthDB;
	baseURL?: string;
	secret?: string;
	/**
	 * Delivers the OTP code to the user. In local dev, defaults to
	 * logging to console. In prod, wire to an email provider.
	 */
	sendOTP?: (data: { email: string; otp: string }) => Promise<void>;
	/**
	 * URL of the UI page that handles sign-in (OTP + anonymous). The MCP
	 * OAuth flow redirects unauthed users here; after they sign in the page
	 * should POST back to /api/auth/mcp/authorize to continue the flow.
	 *
	 * Defaults to `/login` — served by the web build.
	 */
	loginPage?: string;
}

export function buildAuthOptions(config: AuthConfig): BetterAuthOptions {
	const send =
		config.sendOTP ??
		(async ({ email, otp }) => {
			console.log(`[auth] OTP for ${email}: ${otp}`);
		});

	return {
		database: config.db.betterAuthDB,
		baseURL: config.baseURL,
		secret: config.secret,
		plugins: [
			emailOTP({
				async sendVerificationOTP({ email, otp }) {
					await send({ email, otp });
				},
				otpLength: 6,
				expiresIn: 300,
			}),
			anonymous(),
			// MCP OAuth: exposes /.well-known/oauth-authorization-server,
			// /.well-known/oauth-protected-resource, /mcp/authorize,
			// /oauth2/consent, /oauth2/token. Clients (e.g. Claude Code)
			// discover the endpoints via 401 WWW-Authenticate hints and run
			// the PKCE auth-code dance on the user's behalf.
			mcp({ loginPage: config.loginPage ?? "/login" }),
		],
	};
}

export function createAuth(config: AuthConfig) {
	return betterAuth(buildAuthOptions(config));
}

export type Auth = ReturnType<typeof createAuth>;
