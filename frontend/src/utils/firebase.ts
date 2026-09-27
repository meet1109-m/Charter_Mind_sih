import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCIlbTMMSktB492Q5yhdGLW3jz1_VzkP4I",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "chartermind-417f3.firebaseapp.com",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID || "chartermind-417f3",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "chartermind-417f3.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "436035425887",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID || "1:436035425887:web:d26c5d6f6d1c8d9d432dea",
};

// Singleton — initialize Firebase only once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app); // Firestore instance for user data

export default app;
