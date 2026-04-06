import type { Authorization } from "../lib/types.js";

let sessionAuth: Authorization | null = null;

export function getSessionAuth(): Authorization | null {
    return sessionAuth;
}

export function setSessionAuth(auth: Authorization | null): void {
    sessionAuth = auth;
}
