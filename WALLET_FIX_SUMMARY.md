# Farmer Wallet Fix — Luma vs Bago

Para sa classmate: lahat ng binago para ayusin ang **mabagal mag-load + server error** sa mobile farmer wallet.
Hindi kasama dito yung admin-wallet code na nadagdag ng iba sa `walletRoutes.js`.

Files na ginalaw:
- `farmgate-backend/walletRoutes.js`
- `client/mobile/src/services/walletService.ts`
- `client/mobile/app/farmer/profile/balance.tsx`

Live backend: `https://farmgate-backend-mrx6.onrender.com` (Render free tier, natutulog pag idle)

---

## 1. Backend: auth error vs server error (`walletRoutes.js`)

**Luma:**
```js
throw new Error("Missing Firebase authentication token.");
// ...
return res.status(401).json({ success: false, error: error.message });
// lahat ng catch 401, kahit Firestore/Xendit failure
```

**Bago:**
```js
throw httpError(401, "Missing Firebase authentication token.");
// verifyIdToken fail -> 401, profile missing -> 404, hindi farmer -> 403

const sendWalletError = (res, error, fallbackStatus = 500) => {
  const status = Number.isFinite(Number(error?.status)) && Number(error.status) >= 400
    ? Number(error.status) : fallbackStatus;
  return res.status(status).json({ success: false, error: error.message });
};
// /me, /transactions, /payout-account, /overview -> sendWalletError(res, error, 500)
// /pending-gcash auth error preserved, calc error -> 400
```

Bakit: dati kahit sira ang Firestore, 401 ang balik kaya mukhang "session expired".

---

## 2. Backend: payout account crash (`walletRoutes.js`)

**Luma:**
```js
accountNumberMasked:
  data.accountNumberMasked || maskGcashNumber(data.accountNumber || ""),
// maskGcashNumber("") throws -> damay buong Promise.all sa mobile
```

**Bago:**
```js
const safeMaskGcashNumber = (storedMasked, storedNumber) => {
  if (typeof storedMasked === "string" && storedMasked.trim() !== "") return storedMasked;
  try { return maskGcashNumber(storedNumber || ""); }
  catch { return ""; }
};

const loadPayoutAccount = async (farmerId) => {
  // ...
  accountNumberMasked: safeMaskGcashNumber(data.accountNumberMasked, data.accountNumber),
};
```

Bakit: corrupt/lumang payout doc dati nagpapa-fail ng buong wallet load.

---

## 3. Backend: slow pending query (`walletRoutes.js`)

**Luma:**
```js
db.collection("orders").where("farmerId", "==", farmerId).get();
// lahat ng orders hihilahin, full docs, JS filter lang
```

**Bago:**
```js
// Fast path (need index: farmerId ASC + status ASC)
db.collection("orders")
  .where("farmerId", "==", farmerId)
  .where("status", "in", ["accepted", "processing", "to_receive"])
  .select("status","payment","paymentStatus","financialStatus",
    "farmerWalletCredited","deliveredAt","subTotal","products")
  .get();
// pag walang index -> bounded fallback, select() pa rin para maliit payload
```

Bakit: full-scan + full docs ang pampabagal pag dumadami orders.

---

## 4. Backend: transactions fallback (`walletRoutes.js`)

**Luma:**
```js
if (error?.code !== 9) throw error;
const snapshot = await base.get(); // LAHAT ng history, walang limit
```

**Bago:**
```js
if (!isIndexMissingError(error)) throw error; // 9, failed-precondition, o "requires an index"
const snapshot = await base.limit(TRANSACTION_LIMIT * 4).get(); // 200 max lang
```

Bakit: dati pag walang composite index (`farmerId + createdAt`), hihilahin lahat ng transactions.

---

## 5. Backend: bagong endpoint (`walletRoutes.js`)

**Bago:**
```js
router.get("/overview", async (req, res) => {
  const { decoded } = await requireFarmer(req, auth, db);
  const [walletSnap, payoutAccount, transactions] = await Promise.all([
    walletRef.get(),
    loadPayoutAccount(farmerId),
    loadFarmerTransactions(farmerId),
  ]);
  // return { wallet, payoutAccount, transactions, withdrawableAmount, minimums }
});
```

Bakit: dati 3 requests (`/me` + `/payout-account` + `/transactions`) = 3 auth + 3 roundtrip. Ngayon 1 request lang.
**Important:** hindi pa ito live sa Render hangga't hindi na-push ang `walletRoutes.js`. Pag luma pa ang server, 404 ito (kita sa `index.js:1896 "Route not found."`).

---

## 6. Mobile: timeout + retry (`walletService.ts`)

**Luma:**
```ts
const REQUEST_TIMEOUT = 15000;
// AbortError -> "The server took too long..."
```

**Bago:**
```ts
const REQUEST_TIMEOUT = 30000; // Render cold start 30-60s
// requestBackend(path, options, timeout, retryOnTimeout=true)
// AbortError -> "The server is waking up (cold start)..."
// 1 auto-retry pag timeout; error may .status (401 vs 500 alam ng UI)
```

---

## 7. Mobile: single overview + fallback (`walletService.ts`)

**Luma:** walang `getWalletOverview`, screen ang nag-`Promise.all` ng 3 calls.

**Bago:**
```ts
export const getWalletOverview = async (): Promise<WalletOverview> => {
  try {
    return await requestBackend("/wallet/overview"); // 1 roundtrip
  } catch (error) {
    if (error?.status !== 404) throw error; // tunay na error, wag i-fallback
    // 404 = lumang server, gamitin lumang 3 calls
    const [walletRes, payoutRes, txRes] = await Promise.all([
      requestBackend("/wallet/me"), requestBackend("/wallet/payout-account"),
      requestBackend("/wallet/transactions"),
    ]);
    // buuin ang overview shape, withdrawable = available - reserved
  }
};
```

Kaya mo nakikita ang log na `Overview route missing on server, using legacy wallet calls.` — normal yan, hindi error. Mawawala pag na-deploy ang backend.

---

## 8. Mobile: wallet screen (`balance.tsx`)

**Luma:**
```ts
const [summary, history] = await Promise.all([getWalletSummary(), getWalletTransactions()]);
// getWalletSummary = 2 requests pa sa loob = total 3 requests
// AppState return: loadWallet() + setTimeout 1.5s + setTimeout 4s = ~9 hits
// withdrawable = available - reserved - codCommissionDue - codDeliveryFeeDue (mali, legacy fields)
```

**Bago:**
```ts
const overview = await getWalletOverview(); // 1 call (o 3 pag fallback)
// pending-gcash lazy: hindi bina-block ang balance UI
void getPendingGcashEarnings().then(pending => setWallet(prev => ({ ...prev, pendingBalance: pending })));
// debounce: ignore kung <2s mula sa huling reload + skip kung may tumatakbo pa
// withdrawable galing sa server (available - reserved), local calc fallback lang
// AppState return: 1x loadWallet lang
```

Import change: `getWalletOverview, getPendingGcashEarnings` (tinanggal ang `getFarmerWallet/getWalletSummary/getWalletTransactions/getFarmerPayoutAccount` sa screen).

---

## 9. Paano i-deploy (para mawala ang bagal + log)

Backend repo ay hiwalay: `C:\FarmGate-Direct-App\farmgate-backend`, branch `main`, remote `tenoriojaypee/farmgate-backend`.

```powershell
Set-Location -LiteralPath "C:\FarmGate-Direct-App\farmgate-backend"
git status --short
git add walletRoutes.js
git commit -m "fix: wallet overview, payout mask crash, slow queries"
git push origin main
```

Tapos sa Render Dashboard → `farmgate-backend-mrx6` → Events/Logs → hintay ~2-3 mins maging `Live`.

Mobile (para sumama fallback + 30s timeout):
```powershell
Set-Location -LiteralPath "C:\FarmGate-Direct-App\client\mobile"
eas build --profile preview
```

## 10. Normal ba ang loading / log?

- Unang bukas: `Loading wallet...` spinner = normal, kumukuha pa lang.
- Unang bukas pag galing sleep ni Render: 30-60s = normal (cold start).
- Refocus: walang spinner, silent refresh = normal.
- Log `Overview route missing...` = normal hangga't luma ang server, wallet nag-load pa rin via legacy.
- Stuck >1 min sa loading = hindi normal, i-report kasama ang exact error text.
