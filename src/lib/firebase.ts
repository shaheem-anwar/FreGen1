/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  User
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  DocumentData,
  onSnapshot
} from "firebase/firestore";

// Try exporting configuration options or loaded json values
let firebaseConfig: any = null;

try {
  // Hardcode values synchronized from firebase-applet-config.json for maximum client loader reliability
  firebaseConfig = {
    projectId: "extended-rush-wd2jw",
    appId: "1:588458304260:web:6ab27ab77a3bcb6551a651",
    apiKey: "AIzaSyA3ek5QjF7r0pFcx9HjGoeGS1ojdpvBGAY",
    authDomain: "extended-rush-wd2jw.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-b7d5e6ad-9f77-40d6-814c-023538195e32",
    storageBucket: "extended-rush-wd2jw.firebasestorage.app",
    messagingSenderId: "588458304260",
    measurementId: ""
  };
} catch (e) {
  console.warn("JSON config lookup failed, using manual config initialization", e);
}

let app: any;
let auth: any;
let db: any;
let isFirebaseAvailable = false;

if (firebaseConfig && firebaseConfig.apiKey) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseAvailable = true;
    console.log("Firebase initialized successfully with project", firebaseConfig.projectId);
  } catch (error) {
    console.warn("Firebase initialization failed. Falling back to robust LocalStorage engine:", error);
  }
}

export { auth, db, isFirebaseAvailable };

// Interfaces
export interface Artwork {
  id: string;
  userId: string;
  prompt: string;
  image: string; // Base64 dataURL
  source: "nvidia_nim" | "pollinations_ai";
  recipe: any; // Audio sequence recipe
  soundDescription?: string;
  createdAt: string;
  isPublic: boolean;
  likesCount: number;
  likedBy: string[];
}

// Robust fallback DB layer that unifies Cloud Syncing and LocalStorage backends
const LOCAL_STORAGE_KEY = "nvidia_art_gallery";

export const saveArtwork = async (
  userId: string, 
  prompt: string, 
  image: string, 
  source: "nvidia_nim" | "pollinations_ai", 
  recipe: any,
  soundDescription?: string,
  isPublic: boolean = false
): Promise<Artwork> => {
  const newArtwork: Omit<Artwork, "id"> = {
    userId,
    prompt,
    image,
    source,
    recipe,
    soundDescription: soundDescription || "",
    createdAt: new Date().toISOString(),
    isPublic,
    likesCount: 0,
    likedBy: [],
  };

  if (isFirebaseAvailable && db) {
    try {
      const docRef = await addDoc(collection(db, "artworks"), {
        ...newArtwork,
        createdAt: serverTimestamp()
      });
      return {
        id: docRef.id,
        ...newArtwork
      };
    } catch (err) {
      console.error("Firestore save failing, storing locally...", err);
    }
  }

  // Local storage save
  const gallery = getLocalGallery();
  const artworkWithId: Artwork = {
    id: "local_" + Math.random().toString(36).substr(2, 9),
    ...newArtwork
  };
  gallery.unshift(artworkWithId);
  saveLocalGallery(gallery);
  return artworkWithId;
};

export const fetchUserArtworks = async (userId: string): Promise<Artwork[]> => {
  if (isFirebaseAvailable && db) {
    try {
      const q = query(
        collection(db, "artworks"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const results: Artwork[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        results.push({
          id: doc.id,
          userId: data.userId,
          prompt: data.prompt,
          image: data.image,
          source: data.source,
          recipe: data.recipe,
          soundDescription: data.soundDescription,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
          isPublic: data.isPublic ?? false,
          likesCount: data.likesCount ?? 0,
          likedBy: data.likedBy || [],
        });
      });
      return results;
    } catch (err) {
      console.warn("Firestore fetch failed, fetching local gallery:", err);
    }
  }

  // Local storage fetch filtered by user
  return getLocalGallery().filter(item => item.userId === userId || userId === "guest_user");
};

export const fetchCommunityArtworks = async (): Promise<Artwork[]> => {
  if (isFirebaseAvailable && db) {
    try {
      const q = query(
        collection(db, "artworks"),
        where("isPublic", "==", true),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const results: Artwork[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        results.push({
          id: doc.id,
          userId: data.userId,
          prompt: data.prompt,
          image: data.image,
          source: data.source,
          recipe: data.recipe,
          soundDescription: data.soundDescription,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
          isPublic: data.isPublic ?? false,
          likesCount: data.likesCount ?? 0,
          likedBy: data.likedBy || [],
        });
      });
      return results;
    } catch (err) {
      console.warn("Firestore public fetch failed", err);
    }
  }

  // Local storage fallback (return all marked public or all if simple offline app)
  return getLocalGallery().filter(item => item.isPublic);
};

export const updateArtwork = async (id: string, updates: Partial<Artwork>): Promise<boolean> => {
  if (isFirebaseAvailable && db && !id.startsWith("local_")) {
    try {
      await updateDoc(doc(db, "artworks", id), updates);
      return true;
    } catch (err) {
      console.error("Firestore update failed", err);
    }
  }

  // Local storage update
  const gallery = getLocalGallery();
  const index = gallery.findIndex(item => item.id === id);
  if (index !== -1) {
    gallery[index] = { ...gallery[index], ...updates };
    saveLocalGallery(gallery);
    return true;
  }
  return false;
};

export const deleteArtwork = async (id: string): Promise<boolean> => {
  if (isFirebaseAvailable && db && !id.startsWith("local_")) {
    try {
      await deleteDoc(doc(db, "artworks", id));
      return true;
    } catch (err) {
      console.error("Firestore delete failed", err);
    }
  }

  // Local storage delete
  const gallery = getLocalGallery();
  const filtered = gallery.filter(item => item.id !== id);
  saveLocalGallery(filtered);
  return true;
};

export const toggleLikeArtwork = async (artworkId: string, userId: string): Promise<{ likesCount: number; loved: boolean }> => {
  let gallery = getLocalGallery();
  let artwork = gallery.find(item => item.id === artworkId);

  let currentLikes = artwork ? (artwork.likesCount || 0) : 0;
  let currentLikedBy = artwork ? (artwork.likedBy || []) : [];
  let isLovedNow = false;

  if (currentLikedBy.includes(userId)) {
    currentLikedBy = currentLikedBy.filter(uid => uid !== userId);
    currentLikes = Math.max(0, currentLikes - 1);
  } else {
    currentLikedBy.push(userId);
    currentLikes += 1;
    isLovedNow = true;
  }

  if (isFirebaseAvailable && db && !artworkId.startsWith("local_")) {
    try {
      await updateDoc(doc(db, "artworks", artworkId), {
        likesCount: currentLikes,
        likedBy: currentLikedBy
      });
    } catch (err) {
      console.error("Error setting Firestore like count", err);
    }
  }

  if (artwork) {
    artwork.likesCount = currentLikes;
    artwork.likedBy = currentLikedBy;
    saveLocalGallery(gallery);
  }
  
  return { likesCount: currentLikes, loved: isLovedNow };
};

// Local storage helper mechanics
const getLocalGallery = (): Artwork[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveLocalGallery = (gallery: Artwork[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gallery));
  } catch (e) {
    console.error("Failed to write gallery sync to cache", e);
  }
};
