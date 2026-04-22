export function renderLoginPage(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sign in · Site Diagnostics</title>
<style>
	* { box-sizing: border-box; }
	html, body { margin: 0; padding: 0; height: 100%; }
	body {
		font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
		background: #0b0c0f;
		color: #e8eaed;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}
	.card {
		width: 100%;
		max-width: 380px;
		background: #14161a;
		border: 1px solid #242830;
		border-radius: 12px;
		padding: 28px;
	}
	h1 { font-size: 18px; margin: 0 0 4px; }
	.sub { color: #8a92a0; font-size: 13px; margin: 0 0 22px; }
	label { display: block; font-size: 12px; color: #a8b0bd; margin-bottom: 6px; }
	input {
		width: 100%;
		padding: 10px 12px;
		background: #0b0c0f;
		border: 1px solid #2a2f38;
		color: #e8eaed;
		border-radius: 8px;
		font: inherit;
		outline: none;
	}
	input:focus { border-color: #3e6dff; }
	input[name="otp"] {
		letter-spacing: 4px;
		font-variant-numeric: tabular-nums;
		text-align: center;
		font-size: 20px;
	}
	button {
		width: 100%;
		margin-top: 14px;
		padding: 10px 14px;
		background: #3e6dff;
		border: 0;
		color: white;
		font: inherit;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
	}
	button:hover { background: #3358e0; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
	.link {
		background: transparent;
		color: #8a92a0;
		font-weight: 400;
		margin-top: 10px;
		padding: 6px;
	}
	.link:hover { color: #e8eaed; background: transparent; }
	.error {
		margin-top: 12px;
		padding: 10px 12px;
		background: #3a1414;
		border: 1px solid #5a1d1d;
		color: #f1a8a8;
		border-radius: 8px;
		font-size: 13px;
	}
	.hidden { display: none; }
	.sent {
		margin-top: 12px;
		color: #8a92a0;
		font-size: 12px;
	}
</style>
</head>
<body>
<div class="card">
	<h1>Sign in</h1>
	<p class="sub">Site Diagnostics — authorize MCP access</p>

	<form id="email-form">
		<label for="email">Email</label>
		<input id="email" name="email" type="email" autocomplete="email" required autofocus />
		<button type="submit" id="email-btn">Send code</button>
	</form>

	<form id="otp-form" class="hidden">
		<label for="otp">Verification code</label>
		<input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required />
		<p class="sent" id="sent-msg"></p>
		<button type="submit" id="otp-btn">Verify &amp; continue</button>
		<button type="button" class="link" id="back-btn">Use a different email</button>
	</form>

	<div id="error" class="error hidden"></div>
</div>
<script>
(function(){
	var emailForm = document.getElementById('email-form');
	var otpForm = document.getElementById('otp-form');
	var emailInput = document.getElementById('email');
	var otpInput = document.getElementById('otp');
	var emailBtn = document.getElementById('email-btn');
	var otpBtn = document.getElementById('otp-btn');
	var backBtn = document.getElementById('back-btn');
	var errorBox = document.getElementById('error');
	var sentMsg = document.getElementById('sent-msg');

	function showError(msg) {
		errorBox.textContent = msg;
		errorBox.classList.remove('hidden');
	}
	function clearError() {
		errorBox.classList.add('hidden');
		errorBox.textContent = '';
	}

	async function post(path, body) {
		var res = await fetch(path, {
			method: 'POST',
			credentials: 'include',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		var data = null;
		try { data = await res.json(); } catch(_) {}
		if (!res.ok) {
			var msg = (data && (data.message || data.error && data.error.message)) || ('Request failed (' + res.status + ')');
			throw new Error(msg);
		}
		return data;
	}

	emailForm.addEventListener('submit', async function(e) {
		e.preventDefault();
		clearError();
		var email = emailInput.value.trim();
		if (!email) return;
		emailBtn.disabled = true;
		emailBtn.textContent = 'Sending...';
		try {
			await post('/api/auth/email-otp/send-verification-otp', {
				email: email,
				type: 'sign-in'
			});
			emailForm.classList.add('hidden');
			otpForm.classList.remove('hidden');
			sentMsg.textContent = 'We sent a code to ' + email + '.';
			otpInput.focus();
		} catch (err) {
			showError(err.message || 'Could not send code.');
		} finally {
			emailBtn.disabled = false;
			emailBtn.textContent = 'Send code';
		}
	});

	otpForm.addEventListener('submit', async function(e) {
		e.preventDefault();
		clearError();
		var email = emailInput.value.trim();
		var otp = otpInput.value.trim();
		if (!otp) return;
		otpBtn.disabled = true;
		otpBtn.textContent = 'Verifying...';
		try {
			await post('/api/auth/sign-in/email-otp', { email: email, otp: otp });
			// Success: continue the MCP OAuth flow with the original query params.
			var qs = window.location.search || '';
			window.location.href = '/api/auth/mcp/authorize' + qs;
		} catch (err) {
			showError(err.message || 'Invalid or expired code.');
			otpBtn.disabled = false;
			otpBtn.textContent = 'Verify & continue';
		}
	});

	backBtn.addEventListener('click', function() {
		clearError();
		otpForm.classList.add('hidden');
		emailForm.classList.remove('hidden');
		otpInput.value = '';
		emailInput.focus();
	});
})();
</script>
</body>
</html>`;
}
