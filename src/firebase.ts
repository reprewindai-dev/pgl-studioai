import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase App Configuration from active platform credential
const firebaseConfig = {
  projectId: "tidy-bindery-483522-k9",
  appId: "1:148308704956:web:64e3eb4c62cbb5ef979ab9",
  apiKey: "AIzaSyAS2oeyf1bFPK803v-D2VRQiNT0A0nai54",
  authDomain: "tidy-bindery-483522-k9.firebaseapp.com",
  databaseId: "ai-studio-0d539274-86cf-4bb5-9d92-8e95480414c1", // firestoreDatabaseId
  storageBucket: "tidy-bindery-483522-k9.firebasestorage.app",
  messagingSenderId: "148308704956"
};

// Initialize Firebase App gracefully
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with specific database ID if available
const db = getFirestore(app, firebaseConfig.databaseId);

// Initialize Firebase Authentication
const auth = getAuth(app);

export { app, db, auth };
