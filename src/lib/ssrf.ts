/**
 * SSRF protection: detect private/internal network hostnames and IPs.
 */
export function isPrivateHost(hostname: string): boolean {
	// Normalize: strip brackets from IPv6
	const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();

	// IPv6 checks
	if (h === "::1" || h === "::") return true;
	if (h.startsWith("fc") || h.startsWith("fd")) return true;
	if (h.startsWith("fe80")) return true;

	// IPv4-mapped IPv6: ::ffff:x.x.x.x
	const v4Mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (v4Mapped) {
		return isPrivateIPv4(v4Mapped[1]);
	}

	// IPv4 checks
	if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
		return isPrivateIPv4(h);
	}

	// Hostnames
	if (h === "localhost" || h.endsWith(".localhost")) return true;

	return false;
}

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
	const [a, b, c, d] = parts;

	// 0.0.0.0
	if (a === 0 && b === 0 && c === 0 && d === 0) return true;
	// 10.x.x.x
	if (a === 10) return true;
	// 172.16-31.x.x
	if (a === 172 && b >= 16 && b <= 31) return true;
	// 192.168.x.x
	if (a === 192 && b === 168) return true;
	// 127.x.x.x
	if (a === 127) return true;
	// 169.254.x.x (link-local + cloud metadata)
	if (a === 169 && b === 254) return true;

	return false;
}
