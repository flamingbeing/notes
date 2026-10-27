// Settings for the Notes MCP server. See README.md ("One-time owner setup").
//
// CLIENT_ID / CLIENT_SECRET: a Google OAuth client of type "Desktop app" in the Google Cloud project behind Notes'
// Firebase project. Google documents the secret of an installed-app client as not confidential (it ships inside every
// copy of the app) and its token endpoint still asks for it alongside PKCE, so both may live here in a public repo.
// Until the owner makes the client they stay REPLACE_ME and sign-in says so. Env overrides: NOTES_GOOGLE_CLIENT_ID,
// NOTES_GOOGLE_CLIENT_SECRET.
//
// API_KEY / PROJECT_ID: the web app's own public Firebase config (access is controlled by firestore.rules).
// Env override NOTES_FIREBASE_API_KEY, e.g. a separate key if the web key is restricted to websites.

import { APP, firebaseConfig } from '../app/src/config.js';

export const CLIENT_ID = process.env.NOTES_GOOGLE_CLIENT_ID || 'REPLACE_ME.apps.googleusercontent.com';
export const CLIENT_SECRET = process.env.NOTES_GOOGLE_CLIENT_SECRET || 'REPLACE_ME';
export const API_KEY = process.env.NOTES_FIREBASE_API_KEY || firebaseConfig.apiKey;
export const PROJECT_ID = firebaseConfig.projectId;
// the Worker that turns a Google sign-in into the app's role claims (POST /api/claims)
export const APP_URL = `https://${APP.host}`;

export const isConfigured = () => !CLIENT_ID.startsWith('REPLACE_ME') && !CLIENT_SECRET.startsWith('REPLACE_ME');
