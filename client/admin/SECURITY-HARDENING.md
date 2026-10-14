# Admin Security Hardening

Scope: `client/admin` only. All changes below are inside this folder.

## 1. Input validation (client-side, defense in depth)

- `src/services/authService.ts` — email normalized (trim/lowercase), email regex
  + 254-char cap, password 1–128 chars. Invalid input is rejected before any
  Firebase call.
- `src/pages/login.jsx` — email trimmed on submit, `maxLength` on email (254)
  and password (128).
- `src/pages/profile.jsx` — full name trimmed, required, 100-char cap with
  `maxLength` on the name/password inputs. New password must be 6–128 chars.
- Search inputs (`src/pages/approvals.jsx`, `src/pages/users.jsx`,
  `src/pages/orders.jsx`) — `maxLength={100}`.
- `src/services/reportService.ts` — `getYearRevenue(year)` clamped to integer
  2000–2100. `src/services/orderService.ts` — `getRecentOrders(count)`
  clamped to 1–50.
- `src/components/CustomDatePicker.jsx` + `src/pages/orders.jsx` — strict ISO
  `YYYY-MM-DD` regex guard before `new Date()`. Invalid dates fall back safely
  instead of crashing (`RangeError` on `toLocaleDateString`).

## 2. Brute-force / abuse protection

- `src/services/authService.ts` — 5 failed logins trigger a 60-second lockout
  with a generic "Too many attempts" message. This is a second layer only;
  Firebase Auth server-side enforcement remains the real protection.

## 3. Mass assignment / privilege escalation prevention

- `src/services/adminService.ts` — `updateAdminProfile(uid, data: any)`
  changed to `updateAdminProfile(uid, name: string)`. Role, status, and email
  are no longer writable from the client.
- Removed dead privileged functions: `createAdmin`, `toggleAdminStatus`,
  `getAllAdmins`, `updateUser`/`deleteUser` (registered), `deleteUser` (user).
- UID validation (`assertUid`, max 128 chars) on
  `banUser` / `unbanUser` / `approveUser` / `rejectUser` / `updateLastLogin` /
  `updateAdminProfile`.

## 4. Server-side authorization (Firestore rules)

File: `firestore.rules`. Must be published in the Firebase Console to take effect.

- `admins` update: only the `name` field may change, enforced as
  `name is string && 1–100 chars`.
- `adminActivities` create: `description is string && <= 500 chars`, fixed
  action allowlist, `adminId == request.auth.uid`.
- `adminActivities` update/delete: `false`. Storage write: `false`.

## 5. Authentication / session handling

- `src/components/protectedRoute.jsx` — verifies `admins/{uid}` exists and
  `status == Active` before rendering, auto sign-out otherwise, plus an
  unmount guard against state updates after unmount. Route gate only; real
  protection is enforced by Firestore rules.

## 6. Sensitive-data exposure prevention

- `src/pages/profile.jsx`, `src/pages/logout.jsx` — Firebase `error.message`
  is no longer shown in toasts. Generic messages are used instead
  ("Could not save your profile…", "Could not log you out…").
- `src/pages/login.jsx` — validation errors use the generic
  "Invalid email or password" (no user enumeration). Firebase errors are not
  logged to the console.
- Activity log fields capped: `description` 500, `targetId` 128,
  `targetName` 100 chars.

## 7. XSS / injection posture

- Verified by search: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or
  local/session storage in the admin app. React default escaping plus
  `maxLength` and ISO-regex guards are the controls.
- Not applicable (no such code): SQL injection (Firestore is used, no raw
  SQL), CSRF (no cookies/sessions — Firebase ID token), file upload, SSRF,
  path traversal, command injection, CORS (no custom backend).

## 8. Audit logging

- `src/services/adminActivityService.ts` — login, logout, approve, decline,
  ban, unban, profile-update, password-change, and report-export are logged
  to `adminActivities`. Logging never throws, so it cannot break the action.

## 9. Wallet hardening (`src/pages/wallet.jsx`, `src/services/walletService.ts`)

- Input validation: account name trimmed, 3–100 chars; GCash number stripped
  to digits and must match `09XXXXXXXXX` (`639...` is normalized); amount must
  match `digits + optional 2-decimal` and be within 1–10,000,000. Invalid input
  is rejected before any backend call. `maxLength` on name (100), number (11),
  amount (12).
- Timeouts: 30s for reads, 60s for withdraw. Abort shows a generic retry message.
- Mass assignment: payout save only sends `accountName` + `accountNumber`.
  City, province, street, postal code are not writable from the client.
- Sensitive-data exposure: backend `error.message` and `details` are not shown
  in toasts. Generic messages are used instead ("Could not save...", "Could not
  process..."). Load errors use a generic message. Double-submit is blocked
  with `saving` / `withdrawing` flags.
- Safe fallbacks: transactions always resolve to an array; page clamp keeps
  pagination in range.
- Audit logging: payout update (`update_payout_account`) and withdrawal
  (`admin_withdraw`) are logged. `firestore.rules` allowlist updated for both.
  Real balance checks stay on the backend (`requireAdmin` + atomic hold).

## Verification

- `npm run lint` — 0 new issues (13 pre-existing pattern errors remain).
- `npm run build` — success (751 modules).
