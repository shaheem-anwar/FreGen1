/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  auth, 
  isFirebaseAvailable 
} from "../lib/firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  User,
  onAuthStateChanged
} from "firebase/auth";
import { 
  LogIn, 
  UserPlus, 
  User as UserIcon, 
  LogOut, 
  CloudRain, 
  Cloud, 
  AlertCircle, 
  Lock, 
  Mail, 
  Activity,
  Chrome
} from "lucide-react";
import { AppTheme } from "./ThemeSelector";

interface AuthModalProps {
  currentUser: User | null;
  theme: AppTheme;
  onClose: () => void;
  totalCreations?: number;
}

export default function AuthModal({ 
  currentUser, 
  theme, 
  onClose,
  totalCreations = 0 
}: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseAvailable || !auth) {
      setErrorText("Cloud services are currently offline. Running in Local Storage sandbox.");
      return;
    }
    if (!email || !password) {
      setErrorText("Please fill out both email and password fields.");
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err: any) {
      console.error("Email auth error", err);
      // Clean readable error strings
      let cleanMsg = err.message;
      if (err.code === "auth/invalid-credential") cleanMsg = "Invalid email or password combination.";
      if (err.code === "auth/email-already-in-use") cleanMsg = "This email is already registered.";
      if (err.code === "auth/weak-password") cleanMsg = "Password must be at least 6 characters long.";
      setErrorText(cleanMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!isFirebaseAvailable || !auth) {
      setErrorText("Cloud services are currently offline.");
      return;
    }
    setLoading(true);
    setErrorText(null);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onClose();
    } catch (err: any) {
      console.warn("Google popup failed (could be iframe sandboxing blocks it):", err);
      setErrorText(
        "Social Popups are sometimes blocked inside secure previews. Try using the Email Register form or anonymous cloud sync below!"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSync = async () => {
    if (!isFirebaseAvailable || !auth) {
      setErrorText("Cloud services are currently offline.");
      return;
    }
    setLoading(true);
    setErrorText(null);

    try {
      await signInAnonymously(auth);
      onClose();
    } catch (err: any) {
      console.error("Anonymous sync failing", err);
      setErrorText("Failed to initialize credentials-less cloud synchronization.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogOut = async () => {
    if (auth) {
      await signOut(auth);
    }
    onClose();
  };

  // Theme styling mapping
  const isDark = theme !== "bright";
  const panelBg = isDark ? "bg-[#0b0c10]/95 text-slate-100" : "bg-white text-slate-800";
  const borderCol = isDark ? "border-slate-800" : "border-slate-100";
  const inputBg = isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className={`w-full max-w-sm rounded-3xl p-6 border shadow-[0_20px_50px_rgba(0,0,0,0.4)] ${panelBg} ${borderCol}`}>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-700/20">
          <div className="flex items-center gap-2">
            <UserIcon size={18} className="text-emerald-500 animate-pulse" />
            <h3 className="font-mono font-bold tracking-wider text-xs uppercase">
              Cloud Synchronizer
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-mono font-semibold opacity-70 hover:opacity-100 uppercase"
          >
            Close
          </button>
        </div>

        {currentUser ? (
          /* Profile Details if logged-in */
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center text-center p-4 rounded-2xl bg-black/10">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-[#10B981] flex items-center justify-center font-bold text-white text-lg mb-2 shadow-inner">
                {currentUser.email ? currentUser.email[0].toUpperCase() : "G"}
              </div>
              <span className="text-xs font-semibold overflow-hidden text-ellipsis max-w-[200px]">
                {currentUser.isAnonymous ? "Credentials-less Cloud Sync" : currentUser.email}
              </span>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/25">
                <Cloud size={10} />
                <span>Live Backed Sync</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-black/10 flex flex-col justify-center">
                <span className="opacity-60 text-[10px] uppercase font-mono">My Creations</span>
                <span className="font-mono text-lg font-bold">{totalCreations}</span>
              </div>
              <div className="p-3 rounded-xl bg-black/10 flex flex-col justify-center">
                <span className="opacity-60 text-[10px] uppercase font-mono">Service Tier</span>
                <span className="font-mono text-xs font-bold text-emerald-400">NVIDIA Unlimited</span>
              </div>
            </div>

            <button
              onClick={handleLogOut}
              className="mt-2 w-full py-2.5 rounded-xl text-xs font-bold bg-rose-600/20 text-rose-400 hover:bg-red-600/30 border border-rose-500/30 transition flex items-center justify-center gap-2"
            >
              <LogOut size={14} />
              <span>Sign Out Account</span>
            </button>
          </div>
        ) : (
          /* Login/Register Form */
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h4 className="font-bold text-sm">
                {isSignUp ? "Create Synced Account" : "Access Visual Vault"}
              </h4>
              <p className="text-[10px] opacity-70 mt-0.5">
                Keep artwork and custom synthesizers safe across devices
              </p>
            </div>

            {errorText && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-300 flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{errorText}</span>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-55" />
                <input
                  type="email"
                  placeholder="Enter Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={`w-full text-xs pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 border ${inputBg}`}
                />
              </div>

              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-55" />
                <input
                  type="password"
                  placeholder="Password (min 6 chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className={`w-full text-xs pl-9 pr-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 border ${inputBg}`}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 mt-1 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition disabled:opacity-50"
              >
                {loading ? "Authenticating..." : isSignUp ? "Sign Up & Sync" : "Login Account"}
              </button>
            </form>

            <div className="flex items-center my-1 text-slate-500 gap-2 text-[10px] uppercase font-mono select-none">
              <div className="h-px bg-slate-700/20 flex-1" />
              <span>Or Cloud Sync</span>
              <div className="h-px bg-slate-700/20 flex-1" />
            </div>

            {/* Instant anonymous guest synced login + Google option */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-2 text-xs font-medium border border-[#3b82f6]/30 hover:bg-[#3b82f6]/10 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Chrome size={13} className="text-[#3b82f6]" />
                <span>Sign in with Google</span>
              </button>

              <button
                onClick={handleAnonymousSync}
                disabled={loading}
                className="w-full py-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition flex items-center justify-center gap-2"
                title="Saves in cloud instantly without credential configuration"
              >
                <Activity size={12} />
                <span>Instant Credentials-less Cloud Sync</span>
              </button>
            </div>

            {/* Toggle Sign Up / Login */}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-center text-[10px] hover:underline font-medium opacity-80"
            >
              {isSignUp ? "Already registered? Login here" : "Need an account? Sign Up free"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
export { LogIn, UserPlus, LogOut };
