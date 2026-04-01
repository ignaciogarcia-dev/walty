// Pipeline layers (composable, for custom pipelines)
export { withAuth, withBusinessContext, withPermission } from "./pipeline"

// Typed convenience functions (for routes)
export { withBusinessAuth, type BusinessAuthContext } from "./with-business-auth"

// Error handling
export { withErrorHandling } from "./with-error-handling"
export { AppError, AuthError, ForbiddenError, ValidationError, NotFoundError, ConflictError } from "./errors"

// Response helpers
export { ok } from "./response"

// Utilities
export { getIp } from "./get-ip"
export { assert } from "./assert"
