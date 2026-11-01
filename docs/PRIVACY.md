# GharPlate Privacy Policy & Data Handling (`docs/PRIVACY.md`)

## 1. Authenticated Private Household Accounts

- GharPlate protects each user's household profiles, family member health conditions, saved recipes, and AI Assistant conversations behind a database-backed `UserAccount` (`user_accounts`) and server-validated `HttpOnly` session (`user_sessions`).
- Passwords are hashed using **Argon2id** (`argon2-cffi`) and are never stored in plaintext.
- Each account owns an isolated `Household` (`households.owner_user_id`). Other users cannot view or modify your household members, saved recipes, or assistant conversations, even if they attempt to supply your `household_token`, `member_id`, `recipe_id`, or `conversation_id`.

## 2. Minimal Household Profile Data

- Household member profiles store only:
  - A display nickname (e.g., `"Amma"`, `"Ajji"`, `"Aarav"`).
  - Broad age group (`child`, `adolescent`, `adult`, `older_adult`).
  - Dietary preference (`vegetarian`, `eggetarian`, `non_vegetarian`, `vegan`, `jain`).
  - Selected educational health condition codes, allergies, and intolerances.
- Do not enter government identification numbers (Aadhaar/PAN), residential addresses, or clinical medical record numbers.

## 3. Private AI Assistant Conversation History

- AI Assistant conversations (`assistant_conversations` and `assistant_messages`) are stored in the database scoped strictly to your `user_id`.
- You can view, continue, start new, or permanently delete any conversation thread from the **Ask GharPlate** assistant drawer (`DELETE /api/v1/assistant/conversations/{conversation_id}`).

## 4. Strict In-Memory Image Processing (`RAM-Only`)

- When you upload a packaged food nutrition label image (`/api/v1/scan/ocr-image`) or a meal photograph (`/api/v1/scan/recognize-dish`):
  1. The uploaded byte stream is read into an in-memory `io.BytesIO` buffer.
  2. Image format, dimensions, and OCR/colour statistics are computed strictly in RAM.
  3. The buffer is closed, the byte reference is deleted (`del file_bytes`), and `gc.collect()` is invoked before returning the response.
- Uploaded photographs are **never** written to disk, public directories, SQLite/PostgreSQL databases, or application logs.

## 5. Right to Erasure / Instant Household Reset

- Clicking **"Reset Household Profiles & Recipes"** on the Household Dashboard or Privacy & Safety page calls `DELETE /api/v1/households/{token}`, which cascades deletion of all household member profiles and saved recipes in your household and creates a clean empty household for your account.
