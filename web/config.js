// Cloud sync settings: the Firebase web app config from Firebase console → Project settings → Your apps (see SETUP.md).
// These values are meant to be public: Firebase security rules keep each user's data private.
// Leave `firebase` empty to run Doable as a local-only app.
window.DOABLE_CONFIG = window.DOABLE_CONFIG || {
  firebase: null,
  // Where password-reset links return to (your website address).
  siteUrl: '',
};
