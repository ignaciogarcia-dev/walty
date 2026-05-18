// Pipeline layers (composable, for custom pipelines)
export { withAuth, withBusinessContext, withPermission } from "./pipeline"

// Typed convenience functions (for routes)
export { withBusinessAuth, type BusinessAuthContext } from "./with-business-auth"

// Error handling
export { withErrorHandling } from "./with-error-handling"
export { AppError, AuthError, ForbiddenError, ValidationError, NotFoundError, ConflictError } from "@walty/shared/api-utils/errors"

// Response helpers
export { ok } from "@walty/shared/api-utils/response"

// Utilities
export { getIp } from "@walty/shared/api-utils/get-ip"
export { assert } from "@walty/shared/api-utils/assert"
