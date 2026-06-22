# CLOUT — iOS & Android (Capacitor)

CLOUT ships to the App Store and Google Play as **native apps via [Capacitor](https://capacitorjs.com)**. The native shell wraps the exact CLOUT web app: the UI is bundled into `www/` (built from the SPA) and talks to the hosted API at `https://clout.kytepush.com` (CORS enabled). One codebase → web + iOS + Android.

- **App ID:** `com.kytepush.clout` · **Name:** CLOUT (see `capacitor.config.ts`)
- The SPA auto-detects the native shell (`window.Capacitor`) and calls the API/assets absolutely; share links point at the public site; status bar, splash, Android back button, and external links (news headlines open in the system browser) are wired in `public/app.js`.

## One-time machine prerequisites
- **iOS:** macOS + **Xcode** (full, from the App Store) + **CocoaPods** (`sudo gem install cocoapods`).
- **Android:** **Android Studio** + **JDK 17** (set `JAVA_HOME`/`ANDROID_HOME`).

## First build (from `~/Desktop/clout-app`)
```bash
npm install
npm run mobile:build          # generate www/ (the mobile web bundle)
npx cap add ios               # creates ./ios  (needs Xcode + CocoaPods)
npx cap add android           # creates ./android (needs Android Studio + JDK)
npm run mobile:assets         # app icons + splash from assets/icon.png & assets/splash.png
npx cap sync                  # copy web + native deps into both platforms
```

## Run
```bash
npm run mobile:ios            # opens Xcode → pick a simulator/device → Run   (or: npx cap run ios)
npm run mobile:android        # opens Android Studio → Run                    (or: npx cap run android)
```

## After changing the web app
```bash
npm run mobile:sync           # rebuild www/ + cap sync
```
Most content (index, cards, scores, chat) comes from the hosted API, so it updates **without** a rebuild. Only changes to the SPA shell/assets need a new build + store update (or add Capacitor live-updates later).

## Store submission (requires your accounts — I can't create accounts or pay fees)
- **Apple:** Apple Developer Program ($99/yr). Xcode → set Signing Team, bump version/build → Product ▸ Archive ▸ Distribute ▸ App Store Connect. Create the app in App Store Connect, add listing + screenshots + privacy + age rating, submit for review.
- **Google:** Play Console ($25 once). Android Studio → Build ▸ Generate Signed Bundle (AAB). Create the app in Play Console, add listing + content rating + data-safety, upload AAB, submit.

## Store-compliance checklist (CLOUT-specific)
- [x] **No gambling mechanics** — no paid randomness/loot boxes anywhere (acquisition is deterministic: free welcome pack, buy-from-reserve, Debut claim, barter). Keeps a broad age rating.
- [x] **13+ age gate** in-app; closed-loop coins **never cashable** (disclose in listing + ToS).
- [x] **No real-money resale references**; trades are card-for-card barter.
- [ ] **In-app purchases:** charging for coins *inside the app* must use **Apple IAP / Google Play Billing** (not Stripe). Integrate StoreKit/Play Billing (e.g. RevenueCat or `@capacitor-community/in-app-purchases`) and server-verify receipts → credit coins. (Web can keep Stripe.) Coins are a sandbox grant today.
- [ ] **Privacy policy URL** + Apple privacy nutrition / Play data-safety (we collect: handle, optional email, gameplay data).
- [ ] **In-app account deletion** (stores require it) — add a "Delete account" action.
- [ ] **Push notifications** (optional) — add `@capacitor/push-notifications` + APNs/FCM for Debut/frenzy alerts.
- [ ] **Attorney pass** on the no-likeness design + ToS before public launch (unchanged from web).

## Store-readiness features (status)
- **Account deletion** ✅ — in-app at *Profile → Delete my account* (`/api/me/delete` → `clout_delete_account`: purges cards/sessions/chat, anonymizes the append-only ledger). Satisfies Apple/Google deletion requirements.
- **Privacy policy** ✅ — `https://clout.kytepush.com/privacy` (use this URL in both store listings) + in-app screen.
- **Age gate** ✅ 13+, **no gambling** ✅ (deterministic acquisition, no paid randomness).

### Push notifications (plumbing done — needs Firebase/APNs to deliver)
Server + client are wired: `clout_push_tokens` table, `clout_register_push`, `POST /api/push/register`, and guarded native registration in `public/app.js` (no-op until configured). To turn on delivery:
1. `npm i @capacitor/push-notifications`
2. **Android:** create a Firebase project, add the Android app (`com.kytepush.clout`), drop `google-services.json` into `android/app/`, add the google-services Gradle plugin.
3. **iOS:** enable Push in the Apple Developer portal, add the APNs key, and the Firebase iOS app + `GoogleService-Info.plist`.
4. Send from the daily cron (or a new route) via FCM HTTP v1 using a Firebase **service-account** key stored as a Vercel env var → look up tokens in `clout_push_tokens` → push "Today's Debut" / frenzy alerts.

### In-app purchases (coins) — required before charging inside the apps
Apple/Google require their billing for in-app coin purchases (Stripe stays for web only). Recommended: **RevenueCat** (`@revenuecat/purchases-capacitor`) or `@capacitor-community/in-app-purchases`.
1. Create coin products in App Store Connect + Play Console.
2. On purchase success, call a server endpoint that **verifies the receipt** (RevenueCat webhook or store API) and credits coins via the append-only ledger (mirror `clout_coins_purchase`, reason `purchase`).
3. Until then, the in-app coin top-up should be hidden in native builds (web keeps the Stripe/sandbox flow).

### iOS
Generate on a Mac with **full Xcode** + **CocoaPods** (`brew install cocoapods`):
```bash
npm run mobile:build && npx cap add ios && npm run mobile:assets && npx cap sync
npm run mobile:ios   # opens Xcode → set Signing Team → Run on device/simulator
```
(Couldn't be generated in the build sandbox — no CocoaPods/Xcode and no iOS device.)

## What's already done in this repo
Capacitor + plugins installed; `capacitor.config.ts`; `www/` bundle builder (`scripts/build-mobile.mjs`); native behaviors in the SPA (API base, back button, external links, status bar, splash); CORS for `/api/*` (`proxy.ts`); icon + splash sources in `assets/`; npm scripts (`mobile:*`). The `ios/` and `android/` folders are generated by `cap add` on a machine with the toolchains above (gitignored).
