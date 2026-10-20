# Setting up hosting, sync and releases

Doable is three things that share one codebase in `web/`:

| Piece | Hosted on | Cost |
|---|---|---|
| Website (Chrome, Firefox, Edge, Safari) | **GitHub Pages** | Free |
| Cloud sync (accounts + database + live updates) | **Supabase** | Free tier |
| Android app (APK) | **GitHub Releases**, built by **GitHub Actions** | Free |

Total time: about 15 minutes, once.

---

## 1. Put the code on GitHub

1. Create an **empty, public** repository on GitHub called `doable`. Don't add a README, .gitignore or license. GitHub Pages is free for public repos.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/doable.git
   git push -u origin main
   ```

## 2. Turn on the website (GitHub Pages)

1. Repo → **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
2. Repo → **Actions** → **Deploy website** → **Run workflow** (later pushes deploy automatically).
3. Your site is live at `https://<your-username>.github.io/doable/`.

## 3. Create the sync backend (Supabase)

1. Sign up at [supabase.com](https://supabase.com) and create a **New project** (any name, e.g. `doable`; choose the region nearest you).
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://<your-username>.github.io/doable/`
   - **Redirect URLs:** add the same URL.
4. Optional, for a personal app: **Authentication → Providers → Email**, turn off **Confirm email** so new accounts work instantly.
5. Open **Project Settings → API** (or **API Keys**) and copy:
   - the **Project URL**
   - the **anon / publishable** key. This key is meant to be public; row-level security keeps each user's data private. Never use the `service_role` / secret key.
6. Put them in [`web/config.js`](web/config.js):
   ```js
   window.DOABLE_CONFIG = window.DOABLE_CONFIG || {
     supabaseUrl: 'https://xxxxxxxx.supabase.co',
     supabaseAnonKey: 'eyJ...or sb_publishable_...',
     siteUrl: 'https://<your-username>.github.io/doable/',
   };
   ```
7. Commit and push. The website redeploys with sync switched on.
8. **Google Calendar on the website** (optional; the Android app doesn't need this). Browsers aren't allowed to read Google's calendar feed directly, so the website asks a small Supabase function to fetch it. The function only works for signed-in users and only reads Google, Outlook, iCloud, Zoho and Yahoo calendar addresses. Deploy it once from this folder:
   ```bash
   npx supabase login
   npx supabase functions deploy ics-proxy --project-ref <your-project-ref>
   ```
   The project ref is the `xxxxxxxx` part of your Project URL.

> Free Supabase projects pause after about a week with **no** activity at all. Normal daily use keeps it awake. If it ever pauses, click **Restore** in the dashboard; nothing is lost, and the apps keep working offline meanwhile.

## 4. Let GitHub sign the Android app

The release signing key was generated on your PC in `C:\ws\tools\doable-signing\`, outside the repo, so it's never committed. **Back up that folder** (a password manager or a private drive). Every future update must be signed with the same key.

1. Open `C:\ws\tools\doable-signing\github-secrets.txt`.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**, then add these four, copying each value from the file:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

## 5. Publish a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions tests the sync engine, builds the signed APK, and creates a **Release** with `Doable-1.0.0.apk` attached (about 5 minutes). For later updates, bump the tag (`v1.0.1`, `v1.1.0`, …).

## 6. Install everywhere

- **Android:** on your phone, open the repo's **Releases** page, download the APK, open it, and allow "Install unknown apps" if asked. Later versions install over the top and keep your data.
- **Desktop Chrome / Edge:** open the website and click the **Install** icon in the address bar to get an app window.
- **Desktop Firefox:** open the website (Firefox doesn't install web apps on desktop, but everything works in a tab).
- **iPhone:** open the website in Safari → Share → **Add to Home Screen**.

Then click **Cloud sync** (bottom of the sidebar), create an account once, and sign in with the same email and password everywhere. Changes appear on your other devices within about a second.

---

## How sync works

- **Offline-first:** every device saves to itself first, so the app is instant and works without internet. Changes upload when you're back online.
- **Per task:** each task and list syncs separately, so edits to different tasks on two devices both survive. If the *same* task is edited in two places while offline, the last edit to reach the server wins.
- **Deletes sync**, completion stats merge, and only one browser tab syncs at a time (other tabs follow it).
- **First sign-in on a device that already has tasks** asks whether to *merge* them with your account or *replace* them. A fresh install just downloads your account.
- Tested by `npm test`: 11 multi-device scenarios against a simulated server.

## Building the APK on your own PC (optional)

Needs Android Studio installed. The signing key is read from `android/keystore.properties`, which is already set up on this PC and is ignored by git.

```bash
npm install
npm run build:android
```

The APK appears at `android/app/build/outputs/apk/release/app-release.apk`.
