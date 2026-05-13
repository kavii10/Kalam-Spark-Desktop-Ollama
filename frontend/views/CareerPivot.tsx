import React, { useState } from "react";
import { UserProfile } from "../types";
import {
  ArrowRight, BrainCircuit, Target, RefreshCw,
  Briefcase, ChevronRight, ShieldCheck, Zap, AlertCircle, CheckCircle2, Info, AlertTriangle, X
} from "lucide-react";
import { dbService } from "../dbService";

interface Props {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
}

interface PivotResult {
  transferPercentage: number;
  transferableSkills: string[];
  biggestGap: string;
  marketDemand: string;
  timeToTransition: string;
  bridgePlan: { title: string; action: string }[];
}

/* ── In-App Confirmation Modal ── */
function ConfirmModal({
  title, message, confirmLabel, onConfirm, onCancel
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-7 flex flex-col gap-5 relative"
        style={{
          background: 'linear-gradient(135deg, rgba(15,8,35,0.98) 0%, rgba(25,12,50,0.98) 100%)',
          border: '1px solid rgba(139,92,246,0.4)',
          boxShadow: '0 0 60px rgba(139,92,246,0.2), 0 24px 60px rgba(0,0,0,0.6)',
          animation: 'confirmIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        {/* Icon */}
        <div className="flex items-center justify-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}
          >
            <AlertTriangle size={26} className="text-amber-400" />
          </div>
        </div>
        {/* Text */}
        <div className="text-center">
          <h3 className="font-cinzel text-lg font-bold text-gold-100 mb-2">{title}</h3>
          <p className="text-sm text-gold-300/60 leading-relaxed">{message}</p>
        </div>
        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
              border: '1px solid rgba(139,92,246,0.5)',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
            }}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
        <style>{`
          @keyframes confirmIn {
            from { opacity: 0; transform: scale(0.88) translateY(16px); }
            to   { opacity: 1; transform: scale(1)    translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}

const getBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  return "http://localhost:8000";
};
const BACKEND_URL = getBackendUrl();

export default function CareerPivot({ user, setUser }: Props) {
  const [newDream, setNewDream] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PivotResult | null>(null);
  const [error, setError] = useState("");
  const [pivotSuccess, setPivotSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleAnalyze = async () => {
    if (!newDream.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");

    try {
      // Roadmap data is stored in Supabase — fetch it directly from dbService
      const currentRoadmap = await dbService.getRoadmap(user.id).catch(() => null);
      const stages = Array.isArray(currentRoadmap?.stages) ? currentRoadmap.stages : [];
      const currentSkills = stages
        .flatMap((s: any) => Array.isArray(s.skills) ? s.skills : [])
        .filter(Boolean)
        .join(", ") || user.branch || "General academic knowledge";

      const res = await fetch(`${BACKEND_URL}/api/pivot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_dream: user.dream,
          new_dream: newDream.trim(),
          branch: user.branch || "",
          year: user.year || "",
          current_skills: currentSkills,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Backend error: ${res.status}`);
      }

      const data: PivotResult = await res.json();
      if (data.transferPercentage === undefined || !Array.isArray(data.bridgePlan)) {
        throw new Error("Invalid analysis response (missing fields). Please try again.");
      }
      setResult(data);
    } catch (e: any) {
      console.error("Career Pivot analysis failed:", e);
      setError(e.message || "Analysis failed. Make sure the backend is running (uvicorn main:app).");
    }
    setLoading(false);
  };

  const applyPivot = async () => {
    setShowConfirm(false);
    try {
      localStorage.removeItem("kalamspark_roadmap_data");
      localStorage.setItem("kalamspark_force_refresh", "true");
      
      const updated = { ...user, dream: newDream, currentStageIndex: 0 };
      await dbService.saveUser(updated);
      await dbService.saveRoadmap(updated, null); // Clear Supabase roadmap cache
      
      setUser(updated);
      setPivotSuccess(true);
      setTimeout(() => {
        window.location.hash = "#/roadmap";
        window.location.reload();
      }, 1500);
    } catch (e) {
      setError("Failed to save changes. Please try again.");
    }
  };

  if (pivotSuccess) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-8 fade-up">
        <CheckCircle2 size={64} className="text-emerald-400 mb-6 animate-pulse" />
        <h2 className="text-3xl font-cinzel font-bold text-gold-200 mb-3">Pivot Committed!</h2>
        <p className="text-gold-400/60 text-sm">
          Generating your new roadmap for <span className="text-purple-400 font-bold">{newDream}</span>...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 animate-in fade-in duration-500 pb-20">
      {/* In-App Confirm Modal */}
      {showConfirm && (
        <ConfirmModal
          title="Commit to Career Pivot?"
          message={`Change your career goal to "${newDream}"? This will clear your current roadmap and generate a new one.`}
          confirmLabel="Yes, Commit!"
          onConfirm={applyPivot}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      {/* Header */}
      <div className="glass-card p-8 relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gold-500 via-orange-400 to-purple-500" />
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-500/20 to-purple-500/20 border border-gold-500/30 flex items-center justify-center mb-6">
          <BrainCircuit size={32} className="text-gold-400" />
        </div>
        <h1 className="text-4xl font-cinzel font-bold text-gold-100 mb-3 tracking-wider">Career Pivot Sandbox</h1>
        <p className="text-sm text-gold-500/60 max-w-lg mb-2 leading-relaxed">
          Thinking about switching paths? Our local AI (Gemma4) analyzes your current skills and calculates exactly how much transfers — giving you a realistic, personalized bridge plan.
        </p>

        {/* How it works note */}
        <div className="flex items-center gap-2 text-xs text-gold-500/40 mb-6 italic">
          <Info size={12} />
          <span>Powered by your local Ollama backend — no API limits, fully private analysis</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center w-full max-w-2xl gap-4">
          {/* Current Dream */}
          <div className="flex-1 flex flex-col items-start w-full">
            <label className="text-xs font-bold text-gold-400 tracking-widest uppercase mb-2 ml-1">Current Career</label>
            <div className="w-full bg-black/40 border border-gold-500/20 rounded-xl px-4 py-3 flex items-center gap-3 text-gold-200/60">
              <Briefcase size={18} />
              <span className="truncate font-medium">{user.dream || "Not set"}</span>
            </div>
          </div>
          <ArrowRight size={24} className="text-gold-500/50 rotate-90 sm:rotate-0 my-2 sm:my-0 sm:mt-6 flex-shrink-0" />
          {/* New Dream */}
          <div className="flex-1 flex flex-col items-start w-full">
            <label className="text-xs font-bold text-purple-400 tracking-widest uppercase mb-2 ml-1">New Career Goal</label>
            <div className="relative w-full">
              <input
                type="text"
                placeholder="e.g. AI Product Manager"
                value={newDream}
                onChange={(e) => setNewDream(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                className="w-full bg-black/60 border border-purple-500/40 rounded-xl px-11 py-3 text-purple-100 placeholder-purple-300/30 focus:outline-none focus:border-purple-400 focus:shadow-[0_0_20px_rgba(147,51,234,0.3)] transition-all font-medium"
              />
              <Target size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
            </div>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!newDream.trim() || loading || newDream.toLowerCase() === (user.dream || "").toLowerCase()}
          className="mt-8 btn-primary px-10 py-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
          style={{ background: loading ? "rgba(124,58,237,0.5)" : "linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)" }}
        >
          {loading ? (
            <><RefreshCw size={20} className="animate-spin" /> Analyzing ...</>
          ) : (
            <><BrainCircuit size={20} /> Analyze Pivot Potential</>
          )}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card p-5 flex items-start gap-3 border-red-500/30">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm leading-relaxed">{error}</p>
            <p className="text-red-400/50 text-xs mt-1">Tip: Make sure <code className="bg-red-500/10 px-1 rounded">uvicorn main:app</code> is running in the backend folder.</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="glass-card p-1 overflow-hidden animate-in fade-in duration-700">
          <div className="bg-gradient-to-b from-purple-900/20 to-transparent p-8 rounded-xl">

            {/* Key Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              <div className="bg-black/40 border border-purple-500/20 rounded-2xl p-5 text-center">
                <div
                  className="relative flex items-center justify-center w-28 h-28 rounded-full mx-auto mb-3"
                  style={{ background: `conic-gradient(#9333ea ${result.transferPercentage}%, rgba(255,255,255,0.05) 0)` }}
                >
                  <div className="absolute inset-2 rounded-full bg-black/90 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-purple-300">{result.transferPercentage}%</span>
                    <span className="text-[9px] uppercase tracking-widest text-gold-500/60 font-bold">Match</span>
                  </div>
                </div>
                <p className="text-xs text-gold-400/60 font-semibold">Skills Transfer Rate</p>
              </div>
              <div className="bg-black/40 border border-gold-500/20 rounded-2xl p-5 flex flex-col justify-center items-center text-center">
                <RefreshCw size={24} className="text-gold-400 mb-2" />
                <p className="text-xs text-gold-500/50 uppercase tracking-widest mb-1">Market Demand</p>
                <p className="text-sm text-gold-200 font-medium leading-relaxed">{result.marketDemand}</p>
              </div>
              <div className="bg-black/40 border border-emerald-500/20 rounded-2xl p-5 flex flex-col justify-center items-center text-center">
                <RefreshCw size={24} className="text-emerald-400 mb-2" />
                <p className="text-xs text-emerald-500/50 uppercase tracking-widest mb-1">Time to Transition</p>
                <p className="text-lg font-bold text-emerald-300 text-center">{result.timeToTransition}</p>
              </div>
            </div>

            {/* Transferable Skills + Biggest Gap */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div>
                <h3 className="text-lg font-cinzel font-bold text-gold-300 mb-3 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-purple-400" /> You Already Know
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.transferableSkills.map((skill, idx) => (
                    <span key={idx} className="px-4 py-2 rounded-full text-xs font-semibold bg-purple-500/10 border border-purple-500/30 text-purple-200">
                      ✓ {skill}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-cinzel font-bold text-gold-300 mb-3 flex items-center gap-2">
                  <Zap size={18} className="text-orange-400" /> Biggest Gap to Bridge
                </h3>
                <p className="text-sm text-gold-100/80 bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl leading-relaxed">
                  {result.biggestGap}
                </p>
              </div>
            </div>

            {/* Bridge Plan */}
            <div>
              <h3 className="text-lg font-cinzel font-bold text-center text-purple-300 mb-6 border-b border-purple-500/20 pb-4">
                Your Personalized 3-Step Bridge Plan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {result.bridgePlan.map((step, idx) => (
                  <div key={idx} className="bg-black/40 border border-purple-500/20 p-6 rounded-2xl relative hover:border-purple-500/50 transition-colors group">
                    <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg border-2 border-black text-sm">
                      {idx + 1}
                    </div>
                    <h4 className="font-bold text-gold-200 mb-3 ml-2 group-hover:text-gold-100 transition-colors">{step.title}</h4>
                    <p className="text-xs text-gold-500/70 leading-relaxed ml-2">{step.action}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Commit Button */}
            <div className="mt-10 flex justify-center border-t border-purple-500/20 pt-8">
              <button
                onClick={() => setShowConfirm(true)}
                className="btn-primary py-4 px-12 text-sm uppercase tracking-widest flex items-center gap-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all shadow-[0_0_30px_rgba(124,58,237,0.4)]"
              >
                <CheckCircle2 size={18} /> Commit to Pivot — Become {newDream} <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
