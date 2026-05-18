import bcrypt from "bcrypt"
import { BCRYPT_ROUNDS } from "./constants"

/**
 * Valid bcrypt hash used when no user exists so bcrypt.compare still runs
 * (mitigates user-enumeration timing via password check).
 */
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "__walty_login_timing_dummy__",
  BCRYPT_ROUNDS,
)
