/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Image as ImageIcon, 
  Layers, 
  Settings, 
  Download, 
  Volume2, 
  VolumeX, 
  Play, 
  Square,
  RefreshCw, 
  CloudLightning,
  Heart, 
  Share2, 
  User as UserIcon, 
  Library, 
  Eye, 
  EyeOff, 
  Trash2, 
  Scissors,
  HelpCircle,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ThemeSelector, { AppTheme } from "./components/ThemeSelector";
import SoundVisualizer from "./components/SoundVisualizer";
import CanvasEditor from "./components/CanvasEditor";
import AuthModal from "./components/AuthModal";
import { SoundSynth } from "./lib/synth";
import { 
  auth, 
  isFirebaseAvailable, 
  saveArtwork, 
  fetchUserArtworks, 
  fetchCommunityArtworks, 
  deleteArtwork, 
  updateArtwork, 
  toggleLikeArtwork, 
  Artwork 
} from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"create" | "gallery" | "community">("create");
  const [theme, setTheme] = useState<AppTheme>("green-aurora");

  // Workshop Input Prompt States
  const [prompt, setPrompt] = useState("");
  const [sfxDescription, setSfxDescription] = useState("");
  const [nvidiaKey, setNvidiaKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // Active Creation Outputs States
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<any | null>(null);
  const [imageSource, setImageSource] = useState<"nvidia_nim" | "pollinations_ai" | null>(null);
  const [isPublic, setIsPublic] = useState(false);

  // Loading States
  const [visualLoading, setVisualLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  // Sound Engine Refs & States
  const synthRef = useRef<SoundSynth | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Gallery Lists
  const [personalArtworks, setPersonalArtworks] = useState<Artwork[]>([]);
  const [communityArtworks, setCommunityArtworks] = useState<Artwork[]>([]);

  // Dialog Overlays
  const [editingArtwork, setEditingArtwork] = useState<Artwork | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Track state listeners
  useEffect(() => {
    // Initialize Web Audio Synth Engine
    if (!synthRef.current) {
      synthRef.current = new SoundSynth();
    }

    // Auth listener setup
    if (isFirebaseAvailable && auth) {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        if (user) {
          triggerGalleryRefreshes(user.uid);
        } else {
          triggerGalleryRefreshes("guest_user");
        }
      });
      return () => unsubscribe();
    } else {
      triggerGalleryRefreshes("guest_user");
    }
  }, []);

  // Sync galleries when switching tabs
  useEffect(() => {
    const uid = currentUser ? currentUser.uid : "guest_user";
    triggerGalleryRefreshes(uid);
  }, [activeTab]);

  const triggerGalleryRefreshes = async (uid: string) => {
    try {
      const personal = await fetchUserArtworks(uid);
      setPersonalArtworks(personal);
      
      const publicItems = await fetchCommunityArtworks();
      setCommunityArtworks(publicItems);
    } catch (e) {
      console.warn("Failed syncing database lists, falling back smoothly", e);
    }
  };

  // Function to generate the visual image asset alone
  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;

    setVisualLoading(true);
    setGeneratedImage(null);
    setImageSource(null);

    try {
      const imgRes = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, nvidiaKey }),
      });

      if (!imgRes.ok) {
        throw new Error("Failed visual generation segment.");
      }

      const imgData = await imgRes.json();
      setGeneratedImage(imgData.image);
      setImageSource(imgData.source);
    } catch (err: any) {
      console.error("Visual generation failed:", err);
      alert("A visual synthesis glitch occurred: " + err.message);
    } finally {
      setVisualLoading(false);
    }
  };

  // Function to synthesize audio recipe alone
  const handleGenerateAudio = async () => {
    const sfxTarget = sfxDescription.trim() ? sfxDescription : prompt;
    if (!sfxTarget.trim()) {
      alert("Please enter an SFX Sound Prompt or a Visual Prompt first so Gemini can construct the soundscape!");
      return;
    }

    setAudioLoading(true);
    setGeneratedRecipe(null);
    stopAudio();

    try {
      const audioRes = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt || sfxTarget, sfxDescription: sfxTarget }),
      });

      if (!audioRes.ok) {
        throw new Error("Failed audio synthesis segment.");
      }

      const audioData = await audioRes.json();
      setGeneratedRecipe(audioData.recipe);
      
      // Auto-play the synthesized SFX on arrival with a small delay for user delight
      setTimeout(() => {
        if (audioData.recipe) {
          playAudio(audioData.recipe);
        }
      }, 300);
    } catch (err: any) {
      console.error("Audio generation failed:", err);
      alert("An audio synthesis glitch occurred: " + err.message);
    } finally {
      setAudioLoading(false);
    }
  };

  // Sound triggers
  const playAudio = (recipe: any) => {
    if (!synthRef.current || !recipe) return;
    try {
      synthRef.current.playRecipe(recipe);
      setAnalyser(synthRef.current.getAnalyser());
      setIsAudioPlaying(true);

      // Timer to stop animation upon recipe completion duration
      const durationS = recipe.duration || 2;
      const timer = setTimeout(() => {
        setIsAudioPlaying(false);
      }, durationS * 1000);

      return () => clearTimeout(timer);
    } catch (err) {
      console.warn("Audio playback failed:", err);
    }
  };

  const stopAudio = () => {
    if (synthRef.current) {
      synthRef.current.stopAll();
      setIsAudioPlaying(false);
    }
  };

  // Save composite to database / localStorage
  const handleSaveToGallery = async () => {
    if (!generatedImage) return;
    const uid = currentUser ? currentUser.uid : "guest_user";
    
    try {
      const saved = await saveArtwork(
        uid,
        prompt,
        generatedImage,
        imageSource || "pollinations_ai",
        generatedRecipe || { soundName: "Empty Space", description: "No sound synthesized", duration: 1.0, oscillators: [] },
        sfxDescription,
        isPublic
      );

      // Refresh listings
      triggerGalleryRefreshes(uid);
      
      // Auto transition to gallery tab to view successfully saved item
      setActiveTab("gallery");
      
      // Reset workshop prompt optionally
      setPrompt("");
      setSfxDescription("");
    } catch (e: any) {
      alert("Failed syncing to user vault: " + e.message);
    }
  };

  // Save edited canvas output as a newly created artwork
  const handleSaveEditedImage = async (dataUrl: string) => {
    if (!editingArtwork) return;
    const uid = currentUser ? currentUser.uid : "guest_user";
    
    try {
      await saveArtwork(
        uid,
        editingArtwork.prompt + " (Edited)",
        dataUrl,
        editingArtwork.source,
        editingArtwork.recipe,
        editingArtwork.soundDescription,
        editingArtwork.isPublic
      );
      
      triggerGalleryRefreshes(uid);
      setEditingArtwork(null);
      setActiveTab("gallery");
    } catch (e: any) {
      alert("Failed storing edited layer: " + e.message);
    }
  };

  // Card items support operations
  const handleDeleteCard = async (id: string) => {
    if (!confirm("Are you sure you want to atomize this artwork from existence?")) return;
    const uid = currentUser ? currentUser.uid : "guest_user";
    await deleteArtwork(id);
    triggerGalleryRefreshes(uid);
  };

  const handleToggleCardPublic = async (card: Artwork) => {
    const updatedStatus = !card.isPublic;
    const uid = currentUser ? currentUser.uid : "guest_user";
    await updateArtwork(card.id, { isPublic: updatedStatus });
    
    // Quick local list re-assignment
    setPersonalArtworks(prev => 
      prev.map(item => item.id === card.id ? { ...item, isPublic: updatedStatus } : item)
    );
    triggerGalleryRefreshes(uid);
  };

  const handleLikeCard = async (id: string) => {
    const uid = currentUser ? currentUser.uid : "guest_user";
    const res = await toggleLikeArtwork(id, uid);
    
    // Dynamically update listings instantly
    setCommunityArtworks(prev => 
      prev.map(item => item.id === id ? { ...item, likesCount: res.likesCount, likedBy: res.loved ? [...item.likedBy, uid] : item.likedBy.filter(u => u !== uid) } : item)
    );
  };

  const getThemeStyles = (theme: AppTheme) => {
    switch (theme) {
      case "bright":
        return {
          bg: "bg-[#FAF7EE] text-slate-800 transition-colors duration-500",
          card: "bg-white border-2 border-amber-500/10 shadow-[0_8px_30px_rgba(217,119,6,0.04)] rounded-2xl",
          borderClass: "border-amber-200/50",
          accentText: "text-amber-600",
          accentBg: "bg-amber-500",
          buttonPrimary: "bg-amber-600 hover:bg-amber-500 text-white shadow-sm",
          navActive: "bg-amber-100 text-amber-900 border-amber-400",
          headline: "font-sans font-bold text-slate-900",
          glow: "border-amber-450/40",
          footer: "text-amber-800/60"
        };
      case "dark":
        return {
          bg: "bg-[#090D14] text-slate-100 transition-colors duration-500",
          card: "bg-[#111827] border-2 border-slate-800 shadow-[0_10px_45px_rgba(0,0,0,0.55)] rounded-2xl",
          borderClass: "border-slate-800",
          accentText: "text-cyan-400",
          accentBg: "bg-[#06B6D4]",
          buttonPrimary: "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg",
          navActive: "bg-slate-800 text-cyan-400 border-cyan-500",
          headline: "font-sans font-bold text-white",
          glow: "border-cyan-500/30",
          footer: "text-slate-500"
        };
      case "green-aurora":
        return {
          bg: "bg-[#010603] text-emerald-100/95 transition-colors duration-500 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#031d0d]/40 via-slate-950 to-black",
          card: "bg-[#09170e]/95 backdrop-blur-md border border-emerald-500/20 shadow-[0_10px_45px_rgba(16,185,129,0.05)] rounded-2xl",
          borderClass: "border-emerald-500/15",
          accentText: "text-[#10B981]",
          accentBg: "bg-emerald-500",
          buttonPrimary: "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.25)]",
          navActive: "bg-[#0c2417] text-[#10B981] border-emerald-400",
          headline: "font-sans font-semibold text-white",
          glow: "border-emerald-400/30",
          footer: "text-emerald-800/40"
        };
      case "violet-doom":
        return {
          bg: "bg-[#0F0218] text-fuchsia-100/90 transition-colors duration-500 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#2a083d]/35 via-[#0F0218] to-[#020004]",
          card: "bg-[#1A0B2E]/95 backdrop-blur-md border-2 border-violet-500/25 shadow-[0_12px_50px_rgba(59,7,100,0.2)] rounded-2xl",
          borderClass: "border-[#3B0764]",
          accentText: "text-fuchsia-400",
          accentBg: "bg-fuchsia-500",
          buttonPrimary: "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg",
          navActive: "bg-[#281347] text-fuchsia-300 border-fuchsia-500",
          headline: "font-sans font-semibold text-white",
          glow: "border-violet-500/30",
          footer: "text-violet-400/50"
        };
    }
  };

  const styles = getThemeStyles(theme);

  return (
    <div className={`min-h-screen flex flex-col font-sans p-4 md:p-6 ${styles.bg}`}>
      
      {/* Dynamic Header Block */}
      <header className={`w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 mb-4 border-b ${styles.borderClass}`}>
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-indigo-500 to-emerald-400 shadow-md`}>
            <Sparkles size={22} className="text-white animate-spin-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight font-sans">
              FreGen <span className={`${styles.accentText} uppercase font-mono text-sm ml-1`}>Studio</span>
            </h1>
            <p className="text-[10px] uppercase tracking-widest font-mono opacity-75">
              from Shaheem Anwar
            </p>
          </div>
        </div>

        {/* Global Nav Bar & Account controls */}
        <div className="flex flex-wrap items-center gap-3 select-none">
          <ThemeSelector theme={theme} onChange={(t) => setTheme(t)} />

          {/* Social Cloud Account status pill */}
          <button
            onClick={() => setShowAuthModal(true)}
            id="auth_avatar_bt"
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold hover:bg-white/5 transition-all ${styles.borderClass}`}
          >
            <UserIcon size={13} className={currentUser ? "text-emerald-400" : "text-slate-400"} />
            <span className="font-mono text-[11px] max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
              {currentUser ? (currentUser.isAnonymous ? "Cloud Active" : currentUser.email) : "Sync Cloud"}
            </span>
            {currentUser && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
          </button>
        </div>
      </header>

      {/* Primary Container Shell */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col gap-6">

        {/* Tabs Manager Navigation */}
        <div className="flex border-b border-white/5 pb-1 gap-2 self-start select-none">
          {[
            { id: "create", name: "Creation Portal", icon: Layers },
            { id: "gallery", name: "My Gallery", icon: Library, badge: personalArtworks.length },
            { id: "community", name: "Community Vault", icon: Share2, badge: communityArtworks.length }
          ].map((tab) => {
            const Icon = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab_bt_${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                  isTabActive ? styles.navActive : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <Icon size={14} />
                <span>{tab.name}</span>
                {tab.badge && tab.badge > 0 ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 font-mono">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Dynamic Tab Stage */}
        <div className="flex-1">
          {activeTab === "create" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Left Column: Workshop Inputs Bento (4 columns) */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                
                {/* CARD 1: PROMPT ENGINEERING BENTO BOX */}
                <div className={`p-5 flex flex-col gap-4 ${styles.card}`}>
                  <div className="border-b border-white/5 pb-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-mono font-bold tracking-widest uppercase opacity-80 flex items-center gap-1.5">
                        <ImageIcon size={14} className={styles.accentText} />
                        <span>Prompt Engineering</span>
                      </h2>
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/15">
                        v2.4 NIM
                      </span>
                    </div>
                    <p className="text-[10px] opacity-65 mt-1 leading-relaxed">
                      Configure high-quality visual prompt vectors to trigger Stable Diffusion image synthesis.
                    </p>
                  </div>

                  {/* Prompt textarea */}
                  <div className="flex flex-col gap-2">
                    <textarea
                      id="workshop_scene_prompt"
                      placeholder="Describe your visual concept..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      disabled={visualLoading}
                      rows={3}
                      className="w-full p-3 rounded-xl text-xs bg-black/35 border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-400 font-sans tracking-wide leading-relaxed resize-none text-slate-100"
                    />
                    
                    {/* Compact presets */}
                    <div className="flex flex-col gap-1.5 mt-1">
                      <span className="text-[9px] font-mono opacity-50 uppercase tracking-wider">Scenic Blueprints:</span>
                      <div className="flex flex-col gap-1">
                        {[
                          "Fluorescent neon wizard on floating mountain, retro sci-fi doom atmosphere",
                          "Cyberpunk metropolis flooded with purple light under giant bio-luminescent moon",
                          "Mystical glowing emerald bonsai tree in quiet obsidian rock gardens"
                        ].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => setPrompt(preset)}
                            disabled={visualLoading}
                            className={`text-[10px] text-left px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 truncate transition-all duration-200 ${
                              prompt === preset ? "border-indigo-400 bg-indigo-400/5 text-indigo-300" : "opacity-80"
                            }`}
                          >
                            &bull; {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Create Image Trigger Button */}
                  <button
                    onClick={handleGenerateImage}
                    disabled={visualLoading || !prompt.trim()}
                    className={`w-full py-3.5 mt-2 rounded-xl font-bold uppercase font-mono text-[11px] tracking-wider transition-all flex items-center justify-center gap-2 ${styles.buttonPrimary} disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer`}
                  >
                    {visualLoading ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Rendering image...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={13} />
                        <span>Synthesize Visuals</span>
                      </>
                    )}
                  </button>
                </div>

                {/* CARD 2: SFX SYNTHESIS BENTO BOX */}
                <div className={`p-5 flex flex-col gap-4 ${styles.card}`}>
                  <div className="border-b border-white/5 pb-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-mono font-bold tracking-widest uppercase opacity-80 flex items-center gap-1.5">
                        <Volume2 size={14} className={styles.accentText} />
                        <span>SFX Synthesis</span>
                      </h2>
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/15">
                        Twin-Synth
                      </span>
                    </div>
                    <p className="text-[10px] opacity-65 mt-1 leading-relaxed">
                      Gemini-generated audio instructions mapped automatically into a real-time sound recipe.
                    </p>
                  </div>

                  {/* SFX Field */}
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      id="workshop_sfx_prompt"
                      placeholder="Resonant hums, magical chimes, wind..."
                      value={sfxDescription}
                      onChange={(e) => setSfxDescription(e.target.value)}
                      disabled={audioLoading}
                      className="w-full px-3 py-2 rounded-xl text-xs bg-black/35 border border-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-400 font-sans text-slate-100"
                    />
                    <span className="text-[9px] opacity-55 italic leading-relaxed">
                      Leave empty to auto-extract soundscape settings directly from the image scene prompt.
                    </span>
                  </div>

                  {/* Credentials / API Key inside SFX / Options Card */}
                  <div className="pt-2 border-t border-white/5">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className="flex items-center gap-1.5 text-[9px] font-mono tracking-widest opacity-65 hover:opacity-100 uppercase"
                    >
                      <Settings size={10} />
                      <span>{showSettings ? "Hide Security Keys" : "Configure Credentials"}</span>
                    </button>
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden flex flex-col gap-1.5 p-2.5 mt-2 bg-black/40 rounded-xl"
                        >
                          <span className="text-[9px] opacity-75 leading-relaxed">
                            Uses Pollinations AI by default. To hook into your high-capacity NVIDIA Developer API Key directly, save it below:
                          </span>
                          <input
                            type="password"
                            placeholder="nvapi-xxxxxxxxxxxxxxxx"
                            value={nvidiaKey}
                            onChange={(e) => setNvidiaKey(e.target.value)}
                            className="w-full text-[10px] px-3 py-1.5 rounded bg-black/20 border border-white/10 font-mono focus:outline-none focus:border-indigo-400 text-slate-100"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Core generation trigger button */}
                  <button
                    onClick={handleGenerateAudio}
                    disabled={audioLoading}
                    className={`w-full py-3 rounded-xl font-bold uppercase font-mono text-[11px] tracking-wider transition-all flex items-center justify-center gap-2 ${styles.buttonPrimary} disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer`}
                  >
                    {audioLoading ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Synthesizing acoustics...</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={13} />
                        <span>Synthesize Soundscape</span>
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* Center Stage: Primary Asset Render Stage (6 columns) */}
              <div className="lg:col-span-6 flex flex-col h-full justify-between">
                {(generatedImage || visualLoading) ? (
                  /* Rendered Stage Outputs */
                  <div className={`p-5 flex flex-col gap-4 flex-1 h-full justify-between ${styles.card} ${styles.glow}`}>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <span className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase font-bold">
                          Asset Workspace Frame
                        </span>
                        {generatedImage && (
                          <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-black/75 border border-white/15 text-slate-300">
                            Gen: {imageSource === "nvidia_nim" ? "NVIDIA NIM" : "Pollinations AI"}
                          </span>
                        )}
                      </div>

                      {/* Canvas Container */}
                      <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black/20 border border-white/5 max-w-full aspect-square flex items-center justify-center min-h-[350px]">
                        {visualLoading ? (
                          <div className="flex flex-col items-center justify-center p-6 text-center animate-pulse">
                            <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
                              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10 border-t-indigo-500 animate-spin" />
                              <Sparkles size={24} className={`${styles.accentText}`} />
                            </div>
                            <p className="text-xs font-semibold tracking-wide text-indigo-300">
                              Forging Visual Asset...
                            </p>
                            <p className="text-[10px] opacity-60 mt-1 max-w-[250px]">
                              Invoking Stable Diffusion XL to project beautiful high-fidelity graphical matrix frames.
                            </p>
                          </div>
                        ) : generatedImage ? (
                          <img
                            src={generatedImage}
                            alt="Synthesized Artwork"
                            className="max-w-full max-h-[420px] object-contain block mx-auto rounded-lg"
                          />
                        ) : null}
                      </div>
                    </div>

                    {/* Integrated Generative Sound Synthesizer deck */}
                    {audioLoading ? (
                      <div className="p-4 rounded-xl bg-black/35 border border-white/5 flex flex-col items-center justify-center gap-3 mt-3 min-h-[140px]">
                        <RefreshCw size={20} className="animate-spin text-emerald-400" />
                        <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 animate-pulse">
                          SYNTHESIZING ACOUSTICS...
                        </span>
                        <p className="text-[9px] text-center opacity-60 max-w-[280px]">
                          Gemini is mapping spectral sound blueprints directly from the visual workspace prompt definitions.
                        </p>
                      </div>
                    ) : generatedRecipe ? (
                      <div className="p-4 rounded-xl bg-black/35 border border-white/5 flex flex-col gap-3 mt-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[9px] font-mono tracking-wider text-indigo-300 uppercase font-bold">
                              🔊 Generative Complementary Sound
                            </span>
                            <h4 className="font-bold text-sm mt-0.5 text-white flex items-center gap-1.5">
                              {generatedRecipe.soundName || "Symmetric Synths"}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => isAudioPlaying ? stopAudio() : playAudio(generatedRecipe)}
                              className={`p-2 rounded-full hover:scale-105 transition shadow-md flex items-center justify-center ${
                                isAudioPlaying ? "bg-rose-600 text-white" : styles.buttonPrimary
                              }`}
                              title={isAudioPlaying ? "Stop Synthesizer play" : "Trigger live Web Audio Synthesizer play"}
                            >
                              {isAudioPlaying ? <Square size={11} fill="white" /> : <Play size={11} fill="currentColor" />}
                            </button>
                          </div>
                        </div>

                        {/* Sound description text */}
                        <p className="text-[11px] opacity-75 italic leading-normal">
                          {generatedRecipe.description || "Gemini-generated audio parameters played procedurally."}
                        </p>

                        {/* Interactive Sound frequencies visualizer */}
                        <SoundVisualizer analyser={analyser} theme={theme} isPlaying={isAudioPlaying} />

                        {/* Metadata specs of synths */}
                        <div className="grid grid-cols-3 gap-2 text-[9px] uppercase font-mono opacity-85 pt-2 border-t border-white/5">
                          <div>
                            <span className="opacity-60 block">Duration:</span>
                            <span className="font-bold text-indigo-300">{generatedRecipe.duration || 2.0}s</span>
                          </div>
                          <div>
                            <span className="opacity-60 block">Oscillators:</span>
                            <span className="font-bold text-indigo-300">{generatedRecipe.oscillators?.length || 0} Dynamic</span>
                          </div>
                          <div>
                            <span className="opacity-60 block">Vibrato:</span>
                            <span className="font-bold text-indigo-300">{generatedRecipe.vibrato ? "Enabled" : "None"}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Sound Synthesizer Standby panel if no sound is synthesized yet */
                      <div className="p-4 rounded-xl bg-black/20 border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 mt-3 min-h-[80px]">
                        <Volume2 size={16} className="text-slate-500" />
                        <span className="text-[10px] font-mono opacity-50 uppercase tracking-widest text-center">
                          No Acoustic Sync Active
                        </span>
                        <p className="text-[9px] opacity-60 text-center">
                          Synthesize custom sound waves using Gemini by clicking the Synthesize Soundscape button on the left!
                        </p>
                      </div>
                    )}

                    {/* Actions and Save strip */}
                    {generatedImage && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-white/5">
                        
                        {/* Public share option checkbox toggler */}
                        <label className="flex items-center gap-2 text-xs select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            className="accent-indigo-500 scale-95"
                          />
                          <span className="opacity-80">Publish directly to Community Vault</span>
                        </label>

                        <div className="flex items-center gap-2">
                          {/* Launch pixel workspace studio editor */}
                          <button
                            onClick={() => setEditingArtwork({
                              id: "creation",
                              userId: "temp",
                              prompt: prompt,
                              image: generatedImage,
                              source: imageSource || "pollinations_ai",
                              recipe: generatedRecipe,
                              createdAt: new Date().toISOString(),
                              isPublic,
                              likesCount: 0,
                              likedBy: []
                            })}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold font-mono uppercase bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 rounded-xl transition cursor-pointer"
                            title="Open photo drawings and visual filters palette"
                          >
                            <Scissors size={12} />
                            <span>Creative Edit</span>
                          </button>

                          <button
                            onClick={handleSaveToGallery}
                            className={`flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold font-mono uppercase rounded-xl transition ${styles.buttonPrimary} cursor-pointer`}
                          >
                            <Library size={12} />
                            <span>Save Artwork</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Idle Screen Placeholder style from design HTML */
                  <div className={`p-8 text-center flex flex-col items-center justify-center min-h-[500px] flex-1 ${styles.card}`}>
                    <div className="w-16 h-16 rounded-full bg-slate-500/10 flex items-center justify-center mb-4">
                      <ImageIcon className="text-slate-500" size={24} />
                    </div>
                    <h3 className="font-bold text-sm tracking-wide">
                      Portal Workspace Ready
                    </h3>
                    <p className="text-xs max-w-sm mt-1.5 opacity-65 leading-relaxed">
                      Describe your creative vision in the controller, adjust portal settings, and ignite the generator to materialize premium artworks synchronized with Gemini synthesized sound effects.
                    </p>
                    
                    {/* Visual hint block mimicking the mockup style */}
                    <div className="mt-8 border border-white/5 bg-white/5 rounded-xl p-4 w-full max-w-sm flex items-center gap-3">
                      <div className="w-12 h-12 rounded bg-gradient-to-tr from-violet-600/30 to-fuchsia-600/30 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 text-xs font-bold shrink-0">
                        SDXL
                      </div>
                      <div className="text-left animate-pulse">
                        <span className="text-[10px] font-mono tracking-wider opacity-50 block uppercase">Standby Blueprint</span>
                        <span className="text-[11px] font-sans text-slate-300 font-medium">Image Ready for Review</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Quick Gallery Archive Shelf (2 columns) */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className={`p-4 flex flex-col gap-4 h-full ${styles.card}`}>
                  <div className="border-b border-white/5 pb-2">
                    <h3 className="text-xs font-mono font-bold tracking-widest uppercase opacity-85 flex items-center gap-1">
                      <Library size={12} className={styles.accentText} />
                      <span>Vault Shelf</span>
                    </h3>
                    <p className="text-[9px] opacity-60 mt-0.5 leading-tight">
                      Instantly play synths of your recent creations.
                    </p>
                  </div>

                  {/* Showcase contents */}
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto max-h-[460px] pr-1">
                    {personalArtworks.length > 0 ? (
                      personalArtworks.slice(0, 4).map((art) => (
                        <div 
                          key={art.id} 
                          className="relative aspect-square rounded-xl overflow-hidden group border border-white/5 hover:border-indigo-400/35 transition-all cursor-pointer bg-black/20 shrink-0"
                          onClick={() => {
                            // Load into main workspace preview or play sound
                            setPrompt(art.prompt);
                            if (art.soundDescription) {
                              setSfxDescription(art.soundDescription);
                            } else {
                              setSfxDescription("");
                            }
                            setGeneratedImage(art.image);
                            setGeneratedRecipe(art.recipe);
                            setImageSource(art.source as any);
                          }}
                          title="Click to load into visual playground"
                        >
                          <img 
                            src={art.image} 
                            alt={art.prompt} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center text-[9px]">
                            <span className="font-bold text-white mb-1 leading-snug truncate max-w-full">
                              {art.recipe?.soundName || "Play Synth"}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                playAudio(art.recipe);
                              }}
                              className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-lg transform hover:scale-110 transition shrink-0"
                              title="Play sound directly"
                            >
                              <Play size={10} fill="currentColor" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      /* Interactive Mockup cells that act as Preset seeds */
                      <div className="flex flex-col gap-3">
                        <span className="text-[8px] font-mono opacity-50 uppercase tracking-widest block font-bold text-center">Presets</span>
                        {[
                          { name: "Deep Forest", prompt: "Enchanted emerald forest under high-frequency wind chime sparkle, morning fog, realistic rendering", img: "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=150&q=80" },
                          { name: "Solar Flare", prompt: "Hyper-detailed warm gold solar flare energy explosion, retro synthwave style digital artwork", img: "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=150&q=80" },
                          { name: "Aurora", prompt: "Fluorescent green northern lights curtain draping over deep purple dark landscape, realistic photorealistic", img: "https://images.unsplash.com/photo-1483347756191-4a2eb269df1e?auto=format&fit=crop&w=150&q=80" },
                          { name: "Doom Violet", prompt: "Ominous cyberpunk city core under lightning purple neon sky, grand architectural towers", img: "https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?auto=format&fit=crop&w=150&q=80" }
                        ].map((m) => (
                          <div 
                            key={m.name} 
                            onClick={() => {
                              setPrompt(m.prompt);
                              setSfxDescription(`${m.name} acoustic hum, generative spatial waves`);
                            }}
                            className="relative aspect-square rounded-xl overflow-hidden group border border-white/5 hover:border-violet-500/40 transition-all cursor-pointer bg-black/20 shrink-0"
                            title={`Load preset seed: ${m.name}`}
                          >
                            <img 
                              src={m.img} 
                              alt={m.name} 
                              className="w-full h-full object-cover opacity-60 group-hover:opacity-85 transition-opacity"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-black/75 p-1.5 text-center text-[8px] font-mono font-medium truncate text-fuchsia-300 group-hover:text-fuchsia-200">
                              {m.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === "gallery" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold">Personal Vault</h3>
                  <p className="text-xs opacity-70">Browse and manage your private and published creations</p>
                </div>

                <div className="text-[11px] uppercase font-mono opacity-80 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Syncing: {isFirebaseAvailable ? "Cloud Synced" : "Local Storage Engine"}</span>
                </div>
              </div>

              {personalArtworks.length === 0 ? (
                <div className={`p-16 text-center flex flex-col items-center justify-center ${styles.card}`}>
                  <ImageIcon size={32} className="opacity-40 mb-3" />
                  <h4 className="font-bold text-sm">Gallery is currently empty</h4>
                  <p className="text-xs opacity-65 mt-1 max-w-xs leading-relaxed">
                    You haven't preserved any artworks yet. Ignite your first prompt in the Generator workspace!
                  </p>
                  <button
                    onClick={() => setActiveTab("create")}
                    className={`mt-4 px-4 py-2 rounded-xl text-xs font-bold gap-1 flex items-center ${styles.buttonPrimary}`}
                  >
                    <Plus size={14} />
                    <span>Create Now</span>
                  </button>
                </div>
              ) : (
                /* Gallery Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {personalArtworks.map((art) => (
                    <div
                      key={art.id}
                      className={`overflow-hidden flex flex-col ${styles.card} hover:scale-[1.01] transition-transform duration-300 relative group`}
                    >
                      {/* Image Frame */}
                      <div className="relative aspect-square bg-black/20 border-b border-white/5 overflow-hidden">
                        <img
                          src={art.image}
                          alt={art.prompt}
                          className="w-full h-full object-cover"
                        />

                        {/* Top float play overlay button for easy trigger */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                          <button
                            onClick={() => playAudio(art.recipe)}
                            className="p-3.5 bg-emerald-500 text-white rounded-full hover:scale-110 transition shadow-lg shrink-0"
                            title="Play Synth Frequencies"
                          >
                            <Play size={18} fill="currentColor" />
                          </button>
                        </div>

                        {/* Public sync check indicator */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] uppercase font-mono font-bold bg-black/75 backdrop-blur border border-white/10 shadow-md">
                          {art.isPublic ? (
                            <>
                              <Eye size={10} className="text-emerald-400" />
                              <span>Published</span>
                            </>
                          ) : (
                            <>
                              <EyeOff size={10} className="text-slate-400" />
                              <span>Private</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Info & sound prompter display card */}
                      <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                        <div>
                          <p className="text-xs font-bold text-white line-clamp-2" title={art.prompt}>
                            {art.prompt}
                          </p>
                          <span className="text-[10px] font-mono text-indigo-400 font-semibold uppercase mt-1 block">
                            Sound: {art.recipe?.soundName || "Acoustic FX"}
                          </span>
                        </div>

                        {/* Audio timeline viz representation */}
                        {art.recipe && (
                          <div className="flex items-center gap-2 p-1.5 rounded bg-black/25 text-[10px]">
                            <Volume2 size={11} className="text-slate-400" />
                            <span className="font-mono opacity-80 flex-1 truncate">{art.recipe.description || "Procedural Recipe"}</span>
                            <span className="font-mono text-indigo-400">({art.recipe.duration || 1.5}s)</span>
                          </div>
                        )}

                        {/* Footer action tools strip */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 gap-1.5 select-none">
                          <div className="flex items-center gap-1.5">
                            {/* Toggle visibility */}
                            <button
                              onClick={() => handleToggleCardPublic(art)}
                              className="p-1.5 rounded hover:bg-white/5 transition"
                              title={art.isPublic ? "Mark as private" : "Mark as public and catalog in vault"}
                            >
                              {art.isPublic ? <Eye size={14} className="text-emerald-400" /> : <EyeOff size={14} className="text-slate-400" />}
                            </button>

                            {/* Paint Edit */}
                            <button
                              onClick={() => setEditingArtwork(art)}
                              className="p-1.5 rounded hover:bg-white/5 text-slate-300 transition"
                              title="Re-open in Creative Pixel Painting studio"
                            >
                              <Scissors size={14} />
                            </button>

                            {/* Download PNG offline download icon */}
                            <a
                              href={art.image}
                              download={`nvidia_artwork_${art.id}.png`}
                              className="p-1.5 rounded hover:bg-white/5 text-slate-300 transition flex items-center justify-center"
                              title="Download PNG File"
                            >
                              <Download size={14} />
                            </a>
                          </div>

                          <button
                            onClick={() => handleDeleteCard(art.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-rose-400 hover:text-rose-300 transition"
                            title="Purge Artwork"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "community" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold">Community Creative Vault</h3>
                  <p className="text-xs opacity-70">Listen to and admire multi-modal visual arts shared by creators globally</p>
                </div>
              </div>

              {communityArtworks.length === 0 ? (
                <div className={`p-16 text-center flex flex-col items-center justify-center ${styles.card}`}>
                  <Share2 size={32} className="opacity-40 mb-3" />
                  <h4 className="font-bold text-sm">Community Vault is empty</h4>
                  <p className="text-xs opacity-65 mt-1 max-w-xs leading-relaxed">
                    No artworks have been synchronized publicly yet. Be the pioneer by checking 'Publish to Community Vault' in your creation strip!
                  </p>
                </div>
              ) : (
                /* Community Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {communityArtworks.map((art) => {
                    const uid = currentUser ? currentUser.uid : "guest_user";
                    const hasLiked = art.likedBy?.includes(uid) || false;
                    
                    return (
                      <div
                        key={art.id}
                        className={`overflow-hidden flex flex-col ${styles.card} hover:-translate-y-0.5 transition-all relative group`}
                      >
                        {/* Artwork Cover Display */}
                        <div className="relative aspect-square bg-slate-950 overflow-hidden border-b border-white/5">
                          <img
                            src={art.image}
                            alt={art.prompt}
                            className="w-full h-full object-cover"
                          />

                          {/* Quick hover sound anchor */}
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                            <button
                              onClick={() => playAudio(art.recipe)}
                              className="p-3.5 bg-emerald-500 text-white rounded-full hover:scale-105 transition shadow-lg flex items-center justify-center"
                              title="Hear Synced Sound"
                            >
                              <Play size={18} fill="currentColor" />
                            </button>
                          </div>
                        </div>

                        {/* Card metadata detail items */}
                        <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                          <div>
                            <p className="text-xs font-bold text-white line-clamp-2" title={art.prompt}>
                              {art.prompt}
                            </p>
                            <span className="text-[10px] font-mono text-slate-400 capitalize block mt-1.5">
                              Sound FX: {art.recipe?.soundName || "Atmospheric Resonance"}
                            </span>
                          </div>

                          {/* Up vote actions and counters block */}
                          <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
                            <span className="text-[9px] font-mono opacity-60">
                              By: {art.userId ? `Creator_${art.userId.substring(0, 5)}` : "Anonym"}
                            </span>

                            <div className="flex items-center gap-1.5 select-none">
                              {/* Direct SFX Play button in footer */}
                              <button
                                onClick={() => playAudio(art.recipe)}
                                className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 transition"
                                title="Hear procedural SFX"
                              >
                                <Volume2 size={13} />
                              </button>

                              <button
                                onClick={() => handleLikeCard(art.id)}
                                className={`flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-1 rounded-full transition-all ${
                                  hasLiked 
                                    ? "bg-rose-500/15 text-rose-400 border border-rose-500/20" 
                                    : "bg-white/5 border border-transparent hover:bg-white/10"
                                }`}
                                title="Approve creation"
                              >
                                <Heart size={11} className={hasLiked ? "text-rose-500 fill-rose-500" : "text-slate-400"} />
                                <span>{art.likesCount || 0}</span>
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      </main>

      {/* Footer System Lines */}
      <footer className="w-full max-w-7xl mx-auto border-t border-white/5 mt-8 pt-4 pb-2 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-mono select-none">
        <span className={styles.footer}>
          &copy; {new Date().getFullYear()} FreGen by Shaheem Anwar. Multi-Modal generative pipeline with local and community vaults.
        </span>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-ping" />
            <span className="opacity-70">FreGen Engine: Active</span>
          </span>
          <span className="opacity-70">|</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
            <span className="opacity-70">Web Audio synthesis: Enabled</span>
          </span>
        </div>
      </footer>

      {/* Dialog overlay 1: Post-Processor Premium Canvas Painting Workspace Studio */}
      <AnimatePresence>
        {editingArtwork && (
          <CanvasEditor
            imageUrl={editingArtwork.image}
            originalPrompt={editingArtwork.prompt}
            theme={theme}
            onClose={() => setEditingArtwork(null)}
            onSave={handleSaveEditedImage}
          />
        )}
      </AnimatePresence>

      {/* Dialog overlay 2: Cloud Account authentication, social profile managers and sign-up form */}
      <AnimatePresence>
        {showAuthModal && (
          <AuthModal
            currentUser={currentUser}
            theme={theme}
            onClose={() => setShowAuthModal(false)}
            totalCreations={personalArtworks.length}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
