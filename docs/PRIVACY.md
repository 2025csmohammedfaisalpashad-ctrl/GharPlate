# GharPlate Privacy Policy & Data Handling (`docs/PRIVACY.md`)

## 1. Passwordless Browser Convenience Token

- GharPlate requires **no mandatory account registration, email address, phone number, or password** for its initial version.
- When you open GharPlate, the browser generates a random UUID convenience identifier (`hh_<uuid>`) stored in `localStorage['gharplate_household_token']`.
- **Important Disclosure**: This token is a convenience identifier to remember your household member profiles and saved recipes across browser sessions. It is **not** strong cryptographic authentication or identity verification. Anyone with access to the same browser profile or token string can view or edit the associated household profile.

## 2. Minimal Household Profile Data

- Household member profiles store only:
  - A display nickname (e.g., `"Amma"`, `"Ajji"`, `"Aarav"`).
  - Broad age group (`child`, `adolescent`, `adult`, `older_adult`).
  - Dietary preference (`vegetarian`, `eggetarian`, `non_vegetarian`, `vegan`, `jain`).
  - Selected educational health condition codes, allergies, and intolerances.
- Do not enter full legal names, government identification numbers (Aadhaar/PAN), residential addresses, or clinical medical record numbers.

## 3. Strict In-Memory Image Processing (`RAM-Only`)

- When you upload a packaged food nutrition label image (`/api/v1/scan/ocr-image`) or a meal photograph (`/api/v1/scan/recognize-dish`):
  1. The uploaded byte stream is read into an in-memory `io.BytesIO` buffer.
  2. Image format, dimensions, and OCR/colour statistics are computed strictly in RAM.
  3. The buffer is closed, the byte reference is deleted (`del file_bytes`), and `gc.collect()` is invoked before returning the response.
- Uploaded photographs are **never** written to disk, public directories, SQLite/PostgreSQL databases, or application logs.

## 4. Right to Erasure / Instant Purge

- Clicking **"Delete Household Data & Reset Token"** on the Household Dashboard, Privacy & Safety page, or Settings page calls `DELETE /api/v1/households/{token}` (which cascades deletion of all household member profiles and saved recipes in SQLite) and clears `localStorage`.
