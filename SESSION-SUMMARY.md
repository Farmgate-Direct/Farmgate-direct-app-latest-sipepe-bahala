# FarmGate Direct — Session Summary (Lahat ng Prompts & Gawa)

## 1. Province na lumiliit sa register
**Prompt:** Sa register farmer at buyer, lumiit ang province.
**Gawa (`client/mobile/app/auth/register-farmer.tsx`):**
- Region/Province text: `text-[5px]` → `text-[15px]`.
- City dropdown placeholder: `fontSize: 5` → `fontSize: 15`.
- Buyer registration: walang Province field by design (address ay sa Profile → New Address sine-set, naka-Bulacan lock din doon).

## 2. "Expired or already used" sa email verification
**Prompt:** Tuwing resend at verify, laging expired/already used ang link.
**Gawa (farmer + buyer register):**
- Bawat resend ay nagpapaso sa lumang link — nilagyan ng 60s resend cooldown at helper text ("Only the newest link works").
- Recovery sa `auth/email-already-in-use` via sign-in gamit ang original password.

## 3. Auth account nagagawa kahit hindi tapos ang form
**Prompt:** Dapat walang pumapasok sa Authentication kapag hindi tinapos; hindi pumapasok sa database pero pumapasok sa auth. Kasunod na LOG: `auth/invalid-credential` tuwing register.
**Gawa:**
- Auth user ay ginagawa lang sa final submit (hindi sa Step 2).
- Auth persistence (`FirebaseConfig.ts` + AsyncStorage) para hindi mawala ang session pag ni-restart ang app.
- Friendly message para sa `auth/invalid-credential`.

## 4. Reject dapat nagtatanggal din sa Authentication
**Prompt:** Kapag na-reject, matanggal na rin sa auth para magamit pa ang email; pati auto-reject dapat burado sa Firestore at auth. Confirm: kapag hindi natanggal sa auth, "email already registered" ang labas — tama.
**Gawa:**
- Backend: bagong `DELETE /admin/users/:uid` (admin-only) — burado ang Firestore doc + Auth account (`farmgate-backend/index.js`).
- Admin `rejectUser` ay tumatawag na sa backend imbes na Firestore-only delete.
- Auto-reject script: walang binago — burado na nito ang pareho dati pa.
- Confirm: oo, kapag naiwan ang Auth user, `email-already-in-use` ang haharang sa re-registration.

## 5. "Couldn't reject this request" debugging
**Prompt:** Nag-error ang reject pagkatapos ng changes.
**Nadiskubre at ginawa:**
- Ang naka-deploy na backend ay HINDI ang local folder kundi ang hiwalay na repo `Farmgate-Direct/FarmGate-Backend` (ang local ay git submodule lang) — kaya 404 "Route not found" ang endpoint.
- Na-push ang endpoint sa tamang repo (`24d7bf6`), na-redeploy sa Render, gumana ang reject.
- Pinalinaw din na ang Firebase Console errors na pinaste ay galing sa Console tab mismo (benign), hindi sa admin app — ang tamang debug ay DevTools sa admin tab (Network: `DELETE admin/users/...`).

## 6. Buyer New Address — prefill at +63 design
**Prompt:** Since registered na ang phone number, dapat nakalagay na ito sa New Address, +63 design at 11 digits kapag inedit.
**Gawa (`app/buyer/profile/new-address.tsx`):**
- Auto-prefill ng Full Name at phone mula sa naka-login na account.
- Phone field: +63 prefix box + 10-digit input (tulad sa register), sine-save bilang `09XXXXXXXXX`.

## 7. Login password toggle + 8-character hint + error loops
**Prompt:** Lagyan ng toggle ang password sa login; 8-length password sa registration; bakit may `invalid-credential` LOG loop hanggang `too-many-requests`; kapag used ang email, "email has been used" ang message.
**Gawa:**
- Login: eye toggle (show/hide) sa password field.
- Farmer + buyer register: helper text "At least 8 characters, with letters and numbers."
- Used email + maling password = failed sign-in loop → rate limit. Kaya ngayon: used email ay laging "This email is already registered. Try signing in instead." (inihahagis ulit ang original error imbes na invalid-credential), tama ang original password ay nagpapatuloy ang registration, at may 60s submit lock pagkatapos ng 3 fails.

## 8. Save sa database kahit hindi pa verified
**Prompt:** Pag submit, nasasave na sa database kahit hindi pa verified ang email.
**Gawa (farmer + buyer):**
- Submit = gawa ng Auth user + send verification lang, walang save.
- Bagong `finalizeRegistration()` (ID upload + Firestore save + success dialog) ay tumatakbo lang PAGKATAPOS ma-verify ang email; pag pumalya ang upload, balik sa Farm/ID step nang hindi nawawala ang session.

## 9. Walang email sa manual reject + email design (verification, auto-reject, reject)
**Prompt:** Bakit walang email message sa reject? Lagyan ng design base sa system (screenshot ng plain Firebase email), pati auto-reject at reject message. Sender: same Gmail account; verification: backend branded email.
**Gawa:**
- Backend `emailService.js` (bago): FarmGate-branded HTML emails (green #14532d header, button, footer) via Gmail SMTP + plain-text fallback.
- Manual reject: nagse-send ng branded rejection email bago burahin ang account.
- `POST /auth/send-verification`: branded verification email na may pangalan ("Hi <name>") — priority: registration form → Firestore doc → Auth displayName.
- Mobile `emailVerificationService.ts`: backend-first, fallback sa Firebase default kapag walang backend/SMTP.
- Auto-reject (`notify.ts` sa `farmgate-approval-screen`, private repo): branded HTML na rin; na-rebase sa 2 bagong workflow commits at na-push (`b1d853f`).
- Note: isang push (`cf64d2b`) ay nadamay ang teammate/user na `POST /auth/check-email-status` endpoint na naka-stuck nang uncommitted — na-verify na buo at pumasa sa tests (7/7).
- Kailangan sa Render: `GMAIL_USER` + `GMAIL_APP_PASSWORD` env vars, redeploy, at rebuilt na mobile app (kasama `EXPO_PUBLIC_BACKEND_URL`).

## Mga kailangan pang gawin (deployment)
- Render redeploy pagkatapos ng bawat backend push + env vars na naka-set.
- Mobile app rebuild para pumasok ang service changes.
- Test: bagong registration → branded verification email (mula sa Gmail, hindi `noreply@...`); admin Decline → branded rejection email. Kung Firebase default pa rin ang dumarating, tingnan ang Render Logs (`[EMAIL] ... sent` vs `skipped`) habang nagte-test.
