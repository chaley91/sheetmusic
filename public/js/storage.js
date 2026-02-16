// Firebase storage module - Firestore CRUD + anonymous auth

let db = null;
let auth = null;
let currentUser = null;
let firebaseReady = false;
const readyCallbacks = [];

function onReady(cb) {
  if (firebaseReady) { cb(); return; }
  readyCallbacks.push(cb);
}

export async function initFirebase(config) {
  if (db) return;

  // Dynamic import Firebase from CDN
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js');
  const { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, Timestamp }
    = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js');
  const { getAuth, signInAnonymously, onAuthStateChanged }
    = await import('https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js');

  const app = initializeApp(config);
  db = getFirestore(app);
  auth = getAuth(app);

  // Store references for use in other functions
  storage._fb = { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, query, where, orderBy, Timestamp };

  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
      } else {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
      }
      firebaseReady = true;
      readyCallbacks.forEach(cb => cb());
      readyCallbacks.length = 0;
      resolve(currentUser);
    });
  });
}

export const storage = {
  _fb: null,

  isReady() {
    return firebaseReady && currentUser;
  },

  getDeviceId() {
    return currentUser ? currentUser.uid : null;
  },

  async saveSong(songData) {
    if (!this.isReady()) throw new Error('Firebase not initialized');
    const { collection, addDoc, Timestamp } = this._fb;

    const docData = {
      deviceId: currentUser.uid,
      title: songData.title,
      artist: songData.artist,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      simple: songData.simple || null,
      detailed: songData.detailed || null
    };

    const ref = await addDoc(collection(db, 'songs'), docData);
    return { id: ref.id, ...docData };
  },

  async updateSong(songId, updates) {
    if (!this.isReady()) throw new Error('Firebase not initialized');
    const { doc, updateDoc, Timestamp } = this._fb;

    await updateDoc(doc(db, 'songs', songId), {
      ...updates,
      updatedAt: Timestamp.now()
    });
  },

  async deleteSong(songId) {
    if (!this.isReady()) throw new Error('Firebase not initialized');
    const { doc, deleteDoc } = this._fb;
    await deleteDoc(doc(db, 'songs', songId));
  },

  async getSong(songId) {
    if (!this.isReady()) throw new Error('Firebase not initialized');
    const { doc, getDoc } = this._fb;

    const snap = await getDoc(doc(db, 'songs', songId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  },

  async listSongs() {
    if (!this.isReady()) throw new Error('Firebase not initialized');
    const { collection, query, where, orderBy, getDocs } = this._fb;

    const q = query(
      collection(db, 'songs'),
      where('deviceId', '==', currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};
