// ============================================================
//  HandQuiz — auth.js
//  Google Authentication utilities
// ============================================================

const googleProvider = new firebase.auth.GoogleAuthProvider();

// Sign in with Google popup
function signInWithGoogle() {
  return auth.signInWithPopup(googleProvider);
}

// Sign out and redirect to login
function signOutUser() {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}

// บังคับให้ login ก่อนใช้งาน — คืน Promise<user>
// ถ้ายังไม่ login จะ redirect ไป login.html
function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      unsubscribe();
      if (!user) {
        window.location.href = 'login.html';
      } else {
        resolve(user);
      }
    });
  });
}
