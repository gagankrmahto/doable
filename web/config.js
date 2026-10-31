// Cloud sync settings: the Firebase web app config (Firebase console → Project settings → Your apps; see SETUP.md).
// These values are meant to be public: Firebase security rules keep each user's data private.
// Set `firebase` to null to run Doable as a local-only app.
window.DOABLE_CONFIG = window.DOABLE_CONFIG || {
  firebase: {
    apiKey: 'AIzaSyCESqpuJ2sxQxp-v-6kL5cCSxeyYi0WcNc',
    authDomain: 'doable-gagan.firebaseapp.com',
    projectId: 'doable-gagan',
    storageBucket: 'doable-gagan.firebasestorage.app',
    messagingSenderId: '1018901214072',
    appId: '1:1018901214072:web:84bb072664ab4a04738e8d',
  },
  // Where password-reset links return to (your website address).
  siteUrl: 'https://doable-gagan.web.app/',
};
