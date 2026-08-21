import type { Express } from "express";

// OAuth routes have been removed. App is now public and requires no authentication.
export function registerOAuthRoutes(app: Express) {
  // No-op: OAuth authentication is disabled
}
