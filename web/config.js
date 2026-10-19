// Cloud sync settings. Fill these in from Supabase → Project Settings → API (see SETUP.md).
// The "anon"/"publishable" key is designed to be public: row level security keeps each user's data private.
// Leave them empty to run Doable as a local-only app.
window.DOABLE_CONFIG = window.DOABLE_CONFIG || {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Where email confirmation / password reset links should land (your GitHub Pages URL).
  siteUrl: '',
};
