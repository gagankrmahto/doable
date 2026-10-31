// Browser entry for the Firebase JS SDK (bundled by scripts/vendor.js into web/vendor/firebase.js)
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signInWithPopup, GoogleAuthProvider, EmailAuthProvider, linkWithCredential, signOut,
} from 'firebase/auth';
import {
  getFirestore, collection, doc, query, where, orderBy, getDocsFromServer, writeBatch, serverTimestamp, onSnapshot, Timestamp,
} from 'firebase/firestore';

window.firebaseSdk = {
  initializeApp,
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signInWithPopup, GoogleAuthProvider, EmailAuthProvider, linkWithCredential, signOut,
  getFirestore, collection, doc, query, where, orderBy, getDocsFromServer, writeBatch, serverTimestamp, onSnapshot, Timestamp,
};
