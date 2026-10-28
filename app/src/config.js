// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (`firebase apps:sdkconfig WEB`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = {"name":"notes","title":"Notes","host":"notes.flamingbeing.com","accent":"#7c5cd6"};
export const KIT = 'https://design.flamingbeing.com/v1/';
export const firebaseConfig = {
  "projectId": "flamingbeing-notes",
  "authDomain": "notes.flamingbeing.com",
  "apiKey": "AIzaSyA9QKAytwCAIaap4ozs17LgUfYlAsC3XCM",
  "appId": "1:372617276069:web:bf8b335dff4b977f743b4c",
  "storageBucket": "flamingbeing-notes.firebasestorage.app",
  "messagingSenderId": "372617276069"
};
