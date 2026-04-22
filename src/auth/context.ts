import { AsyncLocalStorage } from "node:async_hooks";
import type { OrgCredentials } from "../workflows/diagnose/types.ts";

/**
 * Per-request auth context. Populated by the withAuth middleware and
 * read by any handler downstream (tool executes, pipeline runner, etc.).
 *
 * Using AsyncLocalStorage means:
 *   - no Request rebuild / no stringly-typed header smuggling
 *   - forgery-proof by construction (not a client-controlled channel)
 *   - nests cleanly inside decocms's own State.run scope
 */
export interface AuthContext {
	email: string;
	orgId: string;
	isAnonymous: boolean;
	/** Lazy loader so downstream code pays only when it actually needs creds. */
	loadCredentials: () => Promise<OrgCredentials>;
}

const storage = new AsyncLocalStorage<AuthContext>();

export const authContext = {
	run: <R>(ctx: AuthContext, fn: () => R): R => storage.run(ctx, fn),
	get: (): AuthContext | undefined => storage.getStore(),
	/** Convenience: returns a default-anonymous context when unset. */
	getOrAnonymous: (): AuthContext =>
		storage.getStore() ?? {
			email: "",
			orgId: "",
			isAnonymous: true,
			loadCredentials: async () => ({}),
		},
};
