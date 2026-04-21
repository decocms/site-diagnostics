import { describe, expect, it } from "bun:test";
import { authContext } from "./context.ts";

describe("authContext", () => {
	it("returns undefined outside a run scope", () => {
		expect(authContext.get()).toBeUndefined();
	});

	it("returns the bound context inside run", () => {
		authContext.run(
			{
				email: "u@example.com",
				orgId: "org-a",
				isAnonymous: false,
				loadCredentials: async () => ({}),
			},
			() => {
				expect(authContext.get()?.orgId).toBe("org-a");
			},
		);
	});

	it("isolates concurrent scopes", async () => {
		const observed: string[] = [];
		const run = (orgId: string) =>
			authContext.run(
				{
					email: "",
					orgId,
					isAnonymous: false,
					loadCredentials: async () => ({}),
				},
				async () => {
					await new Promise((r) => setTimeout(r, 5));
					observed.push(authContext.get()?.orgId ?? "");
				},
			);

		await Promise.all([run("org-a"), run("org-b"), run("org-c")]);
		expect(observed.sort()).toEqual(["org-a", "org-b", "org-c"]);
	});

	it("getOrAnonymous returns default when unset", () => {
		const ctx = authContext.getOrAnonymous();
		expect(ctx.isAnonymous).toBe(true);
		expect(ctx.orgId).toBe("");
	});
});
