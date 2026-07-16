// ─── Package Entry Point ─────────────────────────────────────────────────────

// Database
export { initializeDatabase, getPrismaClient } from './database/init.js';
export { AuthLicenseRepository } from './database/repositories/auth-license.repository.js';
export { AuthServiceRepository } from './database/repositories/auth-service.repository.js';
export { AuthLicenseAuditRepository } from './database/repositories/auth-license-audit.repository.js';

// Utilities
export { canonicalJsonStringify } from './utils/key-sorter.js';
export { sha256 } from './utils/hash.js';
export { encryptData, decryptData, generateRandomKey } from './utils/crypto.js';

// Helpers
export { loadLicenseConfig, calculateLicenseSeed } from './helpers/license.helper.js';
export type { LicenseConfig } from './helpers/license.helper.js';

// Client
export { AuthServiceClient } from './client/auth.client.js';
export type { AuthClientConfig } from './client/auth.client.js';

// Middleware
export {
  validateReplayAttack,
  requireActiveLicense,
  authServiceErrorHandler,
  nonceCache
} from './middleware/security.middleware.js';

// Router
export { createAuthRouter } from './routes/auth.routes.js';
export type { AuthRouterOptions } from './routes/auth.routes.js';
