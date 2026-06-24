// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCBcjzcgnLMvVYp_6wh7pTGD-JJU3F_Dck",
  authDomain: "handquiz-60853.firebaseapp.com",
  projectId: "handquiz-60853",
  storageBucket: "handquiz-60853.firebasestorage.app",
  messagingSenderId: "974931378572",
  appId: "1:974931378572:web:c0e4bbf31c42659c8c96a9",
  measurementId: "G-V04XDRS6HZ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = (typeof firebase.firestore === 'function') ? firebase.firestore() : null;
