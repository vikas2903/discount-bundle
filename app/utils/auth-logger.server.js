import { LogSeverity } from "@shopify/shopify-api";

// Shopify's normal debug output includes full JWTs. Emit only fixed diagnostic
// messages for auth failures; never forward debug strings or their context.
export function authDiagnostic(message) {
  if (message.includes("Failed to validate session token:")) {
    if (message.includes("invalid API key")) return "Session token audience mismatch: Railway SHOPIFY_API_KEY does not match the app that issued the token.";
    if (message.includes("signature verification failed")) return "Session token signature mismatch: verify Railway SHOPIFY_API_SECRET belongs to the installed app.";
    if (message.includes('"exp"')) return "Session token expired: Shopify must supply a fresh token.";
    if (message.includes('"nbf"')) return "Session token is not valid yet: check the server clock.";
    return "Session token validation failed: token is missing or malformed.";
  }
  if (message.includes("API token was invalid") || message.includes("Responding to invalid access token")) {
    return "Stored Shopify access token was rejected; the SDK is invalidating it for token exchange.";
  }
  return null;
}

export const authLogger = {
  level: LogSeverity.Debug,
  log(severity, message) {
    const diagnostic = authDiagnostic(message);
    if (diagnostic) {
      console.warn(`[auth-diagnostic] ${diagnostic}`);
    } else if (severity !== LogSeverity.Debug) {
      // Keep existing operational logs, but redact any JWT accidentally included
      // in an SDK exception and its accompanying context.
      console.log(message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED JWT]"));
    }
  },
};
