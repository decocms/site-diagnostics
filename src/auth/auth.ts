import { type BetterAuthOptions, betterAuth } from "better-auth";
import { anonymous, emailOTP } from "better-auth/plugins";
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
		],
	};
}

export function createAuth(config: AuthConfig) {
	return betterAuth(buildAuthOptions(config));
}

export type Auth = ReturnType<typeof createAuth>;
