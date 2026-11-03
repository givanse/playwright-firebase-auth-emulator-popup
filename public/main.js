import { initializeApp } from '/vendor/firebase-app.js';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from '/vendor/firebase-auth.js';

const statusEl = document.querySelector('#status');
const emailEl = document.querySelector('#email');
const signInButton = document.querySelector('#sign-in');

const showSignedOut = () => {
  statusEl.textContent = 'signed out';
  emailEl.textContent = '';
};

const start = async () => {
  const response = await fetch('/config.json');
  if (!response.ok) {
    statusEl.textContent = 'config failed';
    return;
  }

  const config = await response.json();
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
  });
  const auth = getAuth(app);
  connectAuthEmulator(auth, config.authEmulatorUrl, { disableWarnings: true });

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      showSignedOut();
      return;
    }
    statusEl.textContent = 'signed in';
    emailEl.textContent = user.email ?? '';
  });

  signInButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((error) => {
      const code = error && error.code ? error.code : error.message;
      statusEl.textContent = String(code);
    });
  });

  signInButton.disabled = false;
  signInButton.dataset.ready = 'true';
};

start().catch((error) => {
  statusEl.textContent = error instanceof Error ? error.message : String(error);
});
