# GharPlate Security Architecture (`docs/SECURITY.md`)

## 1. Real Database-Backed Authentication & Argon2id Password Hashing

- **Argon2id Password Hashing (`backend/app/core/security.py`)**:
  - Passwords are hashed using **Argon2id** (`argon2-cffi`, `time_cost=2, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16`).
  - Plaintext passwords are never stored in the database, browser storage, cookies, or logs.
  - Password verification runs in constant time via `PasswordHasher.verify()`.
- **Server-Validated Sessions (`user_sessions`) & HttpOnly Cookies**:
  - Upon registration (`POST /api/v1/auth/register`) or sign-in (`POST /api/v1/auth/login`), the server generates 256-bit cryptographically random session and CSRF tokens (`secrets.token_urlsafe(32)`).
  - Only the **SHA-256 hex digests** (`session_token_hash`, `csrf_token_hash`) are stored in the `user_sessions` table.
  - The raw session token is delivered in an `HttpOnly`, `SameSite=Lax` cookie (`gharplate_session`, with `Secure=True` automatically enabled in production).
  - Session tokens are rotated on login and revoked on the server (`revoked_at` timestamp + cookie deletion) upon `POST /api/v1/auth/logout`.
- **CSRF Protection (`X-CSRF-Token`)**:
  - Every state-changing authenticated request (`POST`, `PUT`, `PATCH`, `DELETE`) requires the `X-CSRF-Token` HTTP header matching the active session's `csrf_token_hash` verified via `secrets.compare_digest`.
- **Strict Account & Household Ownership Isolation**:
  - Every `Household` is bound to `owner_user_id` (`user_accounts.id`).
  - Every private API endpoint enforces `CurrentUser = Annotated[UserAccount, Depends(get_current_user)]` and `verify_household_ownership()`.
  - Supplying another user's `household_token`, `member_id`, `recipe_id`, or `conversation_id` is rejected with HTTP `403 Forbidden`.

## 2. Input & Upload Validation

- **Pydantic v2 Schema Validation**: Every request body and query parameter is validated through strict Pydantic v2 models (`backend/app/schemas/api_schemas.py`) enforcing numeric bounds (e.g., `gt=0` on quantities and servings, `min_length=2, max_length=4` on product comparisons).
- **Image Upload Restrictions**:
  - Allowed MIME types are restricted to `image/jpeg`, `image/png`, and `image/webp` (`ALLOWED_IMAGE_MIMES`).
  - Maximum upload size is enforced at 5 MB (`MAX_UPLOAD_SIZE_BYTES = 5242880`).
  - Uploaded streams are verified via `PIL.Image.open(buf).verify()` in memory before processing; invalid or executable payloads (e.g., `.exe` or malformed streams) are rejected with HTTP `400 Bad Request`.

## 3. Database & Injection Protection

- **Parameterised ORM Operations**: All database reads and writes use SQLAlchemy 2.0 ORM queries with bound parameters (`backend/app/models/entities.py`), preventing SQL injection across multilingual search and barcode lookups.
- **Foreign Key Integrity**: SQLite `PRAGMA foreign_keys=ON` is enforced on every database connection.

## 4. Safe Error Handling & Secrets Management

- **Global Exception Shield**: `backend/app/main.py` registers a global exception handler that prevents internal stack traces or filesystem paths from leaking to clients on unexpected `500` errors.
- **CORS Policy**: Configured via `CORS_ORIGINS` environment variable (`app/core/config.py`) with `allow_credentials=True` restricted to configured origins.
- **Zero Hardcoded Secrets**: All configuration resides in environment variables documented in `.env.example`. Docker Hub credentials in CI/CD use GitHub Secrets (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).
