const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendOTPOptions {
	apiKey: string;
	from: string;
	replyTo?: string;
}

export function createResendSendOTP(options: SendOTPOptions) {
	return async ({ email, otp }: { email: string; otp: string }) => {
		const res = await fetch(RESEND_API_URL, {
			method: "POST",
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				from: options.from,
				to: [email],
				reply_to: options.replyTo,
				subject: `Your Site Diagnostics sign-in code: ${otp}`,
				text: `Your sign-in code is ${otp}. It expires in 5 minutes.\n\nIf you didn't request this, ignore this email.`,
				html: `<p>Your sign-in code is <strong style="font-size:18px;letter-spacing:2px">${otp}</strong>.</p><p>It expires in 5 minutes.</p><p style="color:#666;font-size:12px">If you didn't request this, ignore this email.</p>`,
			}),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`Resend send failed (${res.status}): ${body}`);
		}
	};
}

export function resolveSendOTPFromEnv(env: {
	RESEND_API_KEY?: string;
	RESEND_FROM_EMAIL?: string;
}) {
	if (!env.RESEND_API_KEY) return undefined;
	const from =
		env.RESEND_FROM_EMAIL ??
		"Site Diagnostics <noreply@diagnostics.decocms.com>";
	return createResendSendOTP({ apiKey: env.RESEND_API_KEY, from });
}
