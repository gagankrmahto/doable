# Setting up hosting, sync and releases

Doable is three things that share one codebase in `web/`:

| Piece | Hosted on | Cost |
|---|---|---|
| Website (Chrome, Firefox, Edge, Safari) | **Firebase Hosting** | Free (Spark plan) |
| Cloud sync (sign-in + database + live updates) | **Firebase Authentication + Cloud Firestore** | Free (Spark plan) |
| Android app (APK) | **GitHub Releases**, built by **GitHub Actions** | Free |
| Google Calendar on the website (optional) | **Cloud Functions for Firebase** | Needs the Blaze plan (pay-as-you-go; personal use stays in the free allowance) |

Everything on Firebase lives in one project under your Google account. The code and the APK releases live on GitHub.

---

## 1. Put the code on GitHub

```bash
gh repo create <your-username>/doable --public --source . --remote origin --push
```

The repo can also be private: Firebase Hosting doesn't need it to be public, and Releases work either way.

## 2. Create the Firebase project

Install the Firebase CLI once (`npm install -g firebase-tools`) and sign in with the Google account that should own Doable. `login:add` keeps any other accounts the CLI already knows; `login:use` makes this one the default for this folder only.

```bash
firebase login:add
firebase login:use you@gmail.com
firebase projects:create doable-<something-unique> --display-name Doable
firebase use doable-<something-unique>
firebase firestore:databases:create "(default)" --location asia-south1
firebase apps:create web Doable
firebase apps:sdkconfig web
```

Copy the config object that `apps:sdkconfig` prints into [`web/config.js`](web/config.js):

```js
window.DOABLE_CONFIG = window.DOABLE_CONFIG || {
  firebase: { apiKey: '…', authDomain: 'doable-….firebaseapp.com', projectId: 'doable-…', storageBucket: '…', messagingSenderId: '…', appId: '…' },
  siteUrl: 'https://doable-….web.app/',
};
```

These values are meant to be public. The security rules in [`firebase/firestore.rules`](firebase/firestore.rules) are what keep each person's data private.

## 3. Turn on sign-in

Firebase console → **Build → Authentication → Get started → Sign-in method**:

- **Email/Password**: enable (the Android app signs in this way).
- **Google**: enable, choose your support email, save (the website gets a "Continue with Google" button).

## 4. Publish the website and the security rules

```bash
npm run deploy
```

The site is live at `https://<project-id>.web.app`. Run `npm run deploy` again after any change to `web/`.

**Lock it to you.** Open the site, click **Cloud sync** (bottom of the sidebar) and create your account. If you used **Continue with Google**, open Cloud sync again and use **Add password** so the Android app can sign in too. Then, in Firebase console → **Authentication → Settings → User actions**, untick **Enable create (sign-up)**. From then on nobody else can create an account, and the rules already stop any account from reading anyone else's data.

## 5. Cloud MCP server (optional, needs Blaze)

Lets Claude on any device use your Doable. One Cloud Function (`firebase/functions/mcp.js`) serves an OAuth 2.1 server and the MCP endpoint at `https://<project-id>.web.app/mcp`; Hosting rewrites in `firebase.json` route `/mcp`, `/authorize`, `/token`, `/register` and the `/.well-known/oauth-*` documents to it. Sign-in is the Doable site's Google login; only the UIDs in `DOABLE_OWNER_UIDS` are ever issued tokens.

1. Put your Firebase Auth UID (Authentication → Users → User UID) in `firebase/functions/.env`: `DOABLE_OWNER_UIDS=<uid>` (comma-separate for more than one).
2. `npm run deploy:functions` and `npm run deploy`.
3. In claude.ai: Settings → Connectors → Add custom connector → `https://<project-id>.web.app/mcp`. In Claude Code: `claude mcp add --transport http doable https://<project-id>.web.app/mcp`.

## 6. Google Calendar on the website (optional)

The Android app reads Google Calendar feeds directly. Browsers aren't allowed to (Google's feed has no CORS headers), so the website asks a small Cloud Function, [`firebase/functions/index.js`](firebase/functions/index.js), to fetch the feed. It only works for signed-in users and only reads Google, Outlook, iCloud, Zoho and Yahoo calendar addresses. Cloud Functions need the **Blaze** plan (Firebase console → Upgrade; it asks for a card, and a personal app stays within the monthly free allowance). Then:

```bash
npm run deploy:calendar
```

## 7. Let GitHub sign the Android app

The release signing key was generated on your PC in `C:\ws\tools\doable-signing\`, outside the repo, so it's never committed. **Back up that folder** (a password manager or a private drive). Every future update must be signed with the same key.

1. Open `C:\ws\tools\doable-signing\github-secrets.txt`.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**, then add these four, copying each value from the file:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

## 8. Publish an Android release

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions tests the sync engine, builds the signed APK, and creates a **Release** with `Doable-1.0.0.apk` attached (about 5 minutes). For later updates, bump the tag (`v1.0.1`, `v1.1.0`, …).

## 9. Install everywhere

- **Android:** on your phone, open the repo's **Releases** page, download the APK, open it, and allow "Install unknown apps" if asked. Later versions install over the top and keep your data.
- **Desktop Chrome / Edge:** open the website and click the **Install** icon in the address bar to get an app window.
- **Desktop Firefox:** open the website (Firefox doesn't install web apps on desktop, but everything works in a tab).
- **iPhone:** open the website in Safari → Share → **Add to Home Screen**.

Then click **Cloud sync** (bottom of the sidebar) and sign in with the same account everywhere: Google or email + password on the website, email + password in the Android app. Changes appear on your other devices within about a second.

---

## Ask Claude (optional)

The **Ask Claude** button (top right) opens an assistant that can answer questions about your day and add, move or complete tasks, log habits and plan courses for you. Every change it makes can be undone in one tap.

It uses your own Anthropic API key, so usage is billed to your Anthropic account:

1. Create a key at [console.anthropic.com → API keys](https://console.anthropic.com/settings/keys) (add a few dollars of credit under **Billing**).
2. In Doable, tap **Ask Claude** and paste the key.

The key is stored only on that device. It isn't synced to your other devices or sent anywhere except Anthropic, so paste it once on each device where you want the assistant. Your messages, and the task details Claude looks up to answer, are sent to Anthropic.

## Sharing a space or project with a passcode

On a project page or the Freelance hub, click **Share**, choose a passcode and what to include (notes, money). Doable encrypts a read-only snapshot on your device with that passcode and publishes it to `shared/<random id>`; the link is `https://doable-gagan.web.app/share.html#<id>`. Give people the link and tell them the passcode separately. Changes republish within seconds from the device that set the passcode. **Stop sharing** deletes the published copy. Firestore rules let anyone read the ciphertext and only you write it; without the passcode it is noise.

## How sync works

- **Offline-first:** every device saves to itself first, so the app is instant and works without internet. Changes upload when you're back online.
- **Per task:** each task and list syncs separately, so edits to different tasks on two devices both survive. If the *same* task is edited in two places while offline, the last edit to reach the server wins.
- **Deletes sync**, completion stats merge, and only one browser tab syncs at a time (other tabs follow it).
- **First sign-in on a device that already has tasks** asks whether to *merge* them with your account or *replace* them. A fresh install just downloads your account.
- Tested by `npm test`: multi-device scenarios against a simulated server, plus the Firestore backend against a simulated Firestore.

## Building the APK on your own PC (optional)

Needs Android Studio installed. The signing key is read from `android/keystore.properties`, which is already set up on this PC and is ignored by git.

```bash
npm install
npm run build:android
```

The APK appears at `android/app/build/outputs/apk/release/app-release.apk`.
