
import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, CheckCircle2, BookOpen, Code, Star, Lock,
  ChevronDown, ChevronUp, X, Zap, Trophy, Flame, ArrowRight, AlertTriangle
} from 'lucide-react';
import { UserProfile, CareerRoadmap } from '../types';
import { generateRoadmap } from '../geminiService';
import { dbService } from '../dbService';
import CareerPivot from './CareerPivot';
import { grantReward, makeStageCompleteReward } from '../rewardService';

/* ── In-App Toast Banner (replaces browser alert) ── */
function ToastBanner({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className="fixed top-20 left-1/2 z-[9000] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl"
      style={{
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, rgba(30,15,60,0.97), rgba(15,7,30,0.97))',
        border: '1px solid rgba(239,68,68,0.45)',
        boxShadow: '0 8px 40px rgba(239,68,68,0.2), 0 2px 8px rgba(0,0,0,0.5)',
        animation: 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        maxWidth: '90vw',
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
      >
        <Lock size={14} className="text-red-400" />
      </div>
      <span className="text-sm font-semibold text-red-200">{message}</span>
      <button onClick={onClose} className="ml-2 text-red-400/60 hover:text-red-300 transition-colors">
        <X size={14} />
      </button>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.92); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)       scale(1); }
        }
      `}</style>
    </div>
  );
}


/* ── Fix cached template-literal bugs like "Applied $(profile.branch)" ── */
function sanitizeSubjects(subjects: string[], dream: string, branch: string): string[] {
  const templatePattern = /\$\{?[a-z.]+\}?/gi; // matches ${...} and $(...)
  return subjects.map(s => {
    if (templatePattern.test(s)) {
      // Replace the whole string since it was a broken template
      const clean = s.replace(/applied \$[\({][^)\}]+[\)}\}]/gi, `Applied ${branch || dream || 'your field'}`);
      return clean.replace(templatePattern, branch || dream || 'your field');
    }
    return s;
  });
}

function sanitizeRoadmap(rm: CareerRoadmap, dream: string, branch: string): CareerRoadmap {
  return {
    ...rm,
    stages: rm.stages.map(stage => ({
      ...stage,
      subjects: sanitizeSubjects(stage.subjects || [], dream, branch),
    }))
  };
}


/* ────────── Celebration Overlay ────────── */
function CelebrationOverlay({ onClose, isLight }: { onClose: () => void; isLight?: boolean }) {
  const [xpCount, setXpCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(onClose, 5500);
    // Animate XP counter
    let current = 0;
    const interval = setInterval(() => {
      current += 5;
      setXpCount(Math.min(current, 100));
      if (current >= 100) clearInterval(interval);
    }, 18);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [onClose]);

  // Confetti particles - many shapes and colors
  const confetti = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 2}s`,
    color: ['#8b5cf6','#a78bfa','#fbbf24','#34d399','#f472b6','#60a5fa','#fb923c','#e879f9'][i % 8],
    size: `${6 + Math.random() * 12}px`,
    rotation: `${Math.random() * 360}deg`,
    isCircle: Math.random() > 0.5,
    isBar: Math.random() > 0.7,
  }));

  // Starburst beams
  const beams = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (i * 30),
    length: 80 + Math.random() * 60,
    delay: `${i * 0.05}s`,
    color: i % 2 === 0 ? '#8b5cf6' : '#fbbf24',
  }));

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center pointer-events-none overflow-hidden">
      {/* Backdrop with glow */}
      <div className={`absolute inset-0 backdrop-blur-sm ${isLight ? 'bg-white/70' : 'bg-black/70'}`} />

      {/* Pulsing radial glow */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ zIndex: 1 }}
      >
        <div
          style={{
            width: 500,
            height: 500,
            background: isLight 
              ? 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 40%, transparent 70%)'
              : 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0.1) 40%, transparent 70%)',
            animation: 'celebration-pulse 0.8s ease-in-out infinite alternate',
            borderRadius: '50%',
          }}
        />
      </div>

      {/* Starburst beams */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
        {beams.map(beam => (
          <div
            key={beam.id}
            style={{
              position: 'absolute',
              width: beam.length,
              height: 2,
              background: `linear-gradient(to right, ${beam.color}, transparent)`,
              transformOrigin: '0 50%',
              transform: `rotate(${beam.angle}deg)`,
              opacity: 0,
              animation: `beam-shoot 0.6s ${beam.delay} cubic-bezier(0,0,0.2,1) forwards`,
            }}
          />
        ))}
      </div>

      {/* Confetti */}
      {confetti.map(c => (
        <div
          key={c.id}
          style={{
            position: 'absolute',
            top: -20,
            left: c.left,
            animationDelay: c.delay,
            animationDuration: c.duration,
            width: c.isBar ? `${parseInt(c.size) * 0.4}px` : c.size,
            height: c.size,
            backgroundColor: c.color,
            borderRadius: c.isCircle ? '50%' : c.isBar ? '2px' : '2px',
            transform: `rotate(${c.rotation})`,
            animation: `confettiFall ${c.duration} ${c.delay} ease-in forwards`,
            zIndex: 10,
          }}
        />
      ))}

      {/* Central Badge */}
      <div
        className="relative pointer-events-auto"
        style={{
          zIndex: 15,
          animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) forwards',
        }}
      >
        {/* Outer glow ring - animated */}
        <div
          style={{
            position: 'absolute',
            inset: -20,
            borderRadius: 32,
            background: 'transparent',
            border: isLight ? '2px solid rgba(139,92,246,0.3)' : '2px solid rgba(139,92,246,0.6)',
            animation: 'ring-pulse 1s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: -40,
            borderRadius: 40,
            background: 'transparent',
            border: isLight ? '1px solid rgba(139,92,246,0.15)' : '1px solid rgba(139,92,246,0.3)',
            animation: 'ring-pulse 1s 0.3s ease-in-out infinite',
          }}
        />

        <div
          style={{
            background: isLight ? 'linear-gradient(135deg, #ffffff 0%, #f3e8ff 50%, #ffffff 100%)' : 'linear-gradient(135deg, #0f0f1a 0%, #1a0a2e 50%, #0f0f1a 100%)',
            border: isLight ? '1px solid rgba(139,92,246,0.3)' : '2px solid rgba(139,92,246,0.7)',
            borderRadius: 24,
            padding: '36px 48px',
            textAlign: 'center',
            boxShadow: isLight ? '0 10px 40px rgba(139,92,246,0.15), 0 20px 40px rgba(0,0,0,0.05)' : '0 0 60px rgba(139,92,246,0.4), 0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Shimmer sweep */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isLight ? 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.8) 50%, transparent 60%)' : 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 50%, transparent 60%)',
              animation: 'shimmer-sweep 2.5s linear infinite',
              backgroundSize: '200% 100%',
            }}
          />

          {/* Trophy icon with glow */}
          <div style={{ marginBottom: 12, position: 'relative', display: 'inline-block' }}>
            <div
              style={{
                fontSize: 56,
                filter: 'drop-shadow(0 0 20px #fbbf24) drop-shadow(0 0 40px #f59e0b)',
                animation: 'trophy-bounce 0.6s 0.5s ease-in-out infinite alternate',
                display: 'inline-block',
              }}
            >🏆</div>
          </div>

          <h2
            style={{
              fontSize: 26,
              fontWeight: 900,
              color: isLight ? '#4c1d95' : 'white',
              letterSpacing: '-0.5px',
              margin: '0 0 4px',
              textShadow: isLight ? 'none' : '0 0 20px rgba(139,92,246,0.6)',
            }}
          >Stage Complete!</h2>
          <p
            style={{
              color: isLight ? '#7c3aed' : '#a78bfa',
              fontWeight: 700,
              fontSize: 14,
              margin: '0 0 20px',
            }}
          >You're crushing it! 🔥</p>

          {/* Animated XP badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 20px',
              borderRadius: 99,
              background: isLight ? 'rgba(139,92,246,0.1)' : 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(251,191,36,0.15))',
              border: isLight ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(139,92,246,0.5)',
              marginBottom: 20,
            }}
          >
            <Zap size={16} style={{ color: isLight ? '#d97706' : '#fbbf24' }} />
            <span style={{ color: isLight ? '#b45309' : '#fde68a', fontWeight: 800, fontSize: 18 }}>
              +{xpCount}
            </span>
            <span style={{ color: isLight ? '#6d28d9' : '#a78bfa', fontWeight: 600, fontSize: 12 }}>XP EARNED</span>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: 99,
                fontSize: 11,
                color: '#fbbf24',
                fontWeight: 700,
              }}
            >
              <Trophy size={11} /> New Milestone!
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px',
                background: 'rgba(52,211,153,0.1)',
                border: '1px solid rgba(52,211,153,0.3)',
                borderRadius: 99,
                fontSize: 11,
                color: '#34d399',
                fontWeight: 700,
              }}
            >
              <Flame size={11} /> Keep Going!
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '10px 28px',
              background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
              color: 'white',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(139,92,246,0.5)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              (e.target as HTMLButtonElement).style.transform = 'scale(1.05)';
              (e.target as HTMLButtonElement).style.boxShadow = '0 6px 25px rgba(139,92,246,0.7)';
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.transform = 'scale(1)';
              (e.target as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(139,92,246,0.5)';
            }}
          >
            Continue →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes celebration-pulse {
          from { transform: scale(0.9); opacity: 0.6; }
          to { transform: scale(1.15); opacity: 1; }
        }
        @keyframes beam-shoot {
          from { opacity: 0; transform: rotate(var(--angle,0deg)) scaleX(0); }
          50% { opacity: 0.8; }
          to { opacity: 0; transform: rotate(var(--angle,0deg)) scaleX(1); }
        }
        @keyframes ring-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.03); }
        }
        @keyframes shimmer-sweep {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes trophy-bounce {
          from { transform: translateY(0) scale(1); }
          to { transform: translateY(-6px) scale(1.08); }
        }
      `}</style>
    </div>
  );
}

/* ────────── Stage Detail Panel ────────── */
function StageDetailPanel({ stage, onClose, theme }: { stage: any; onClose: () => void; theme?: string }) {
  const isLight = theme === 'light';
  
  // Auto-scroll to top of modal when opened
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [stage]);

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto pt-10 sm:pt-20" onClick={onClose}>
      <div
        ref={containerRef}
        className="glass-card glass-inner-shadow max-w-2xl w-full mb-20 p-8 animate-[slideUp_0.3s_ease-out_forwards]"
        style={{ 
          borderColor: isLight ? 'rgba(211,156,59,0.4)' : 'rgba(211,156,59,0.30)',
          background: isLight ? '#ffffff' : undefined
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs text-gold-400/50 font-semibold uppercase tracking-widest mb-1">{stage.duration}</p>
            <h3 className="font-cinzel text-xl font-bold text-gold-100">{stage.title}</h3>
            <p className="text-sm text-gold-300/40 mt-1 leading-relaxed">{stage.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/8 text-gold-500/40 hover:text-gold-200 transition-all shrink-0 ml-4"
          >
            <X size={18} />
          </button>
        </div>

        {stage.subjects && stage.subjects.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gold-400/60 uppercase tracking-widest mb-3 flex items-center gap-2">
              <BookOpen size={12} className="text-gold-500/50" /> Topics to Master
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {stage.subjects.map((sub: string, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl text-sm text-gold-200/60"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'rgba(211,156,59,0.6)' }} />
                  {sub}
                </div>
              ))}
            </div>
          </div>
        )}

        {stage.skills && stage.skills.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gold-400/60 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Zap size={12} className="text-gold-400/60" /> Skills You'll Build
            </h4>
            <div className="flex flex-wrap gap-2">
              {stage.skills.map((skill: string, i: number) => (
                <span key={i} className="px-3 py-1.5 rounded-full text-xs text-gold-200/60"
                  style={{ background: 'rgba(211,156,59,0.06)', border: '1px solid rgba(211,156,59,0.22)' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {stage.projects && stage.projects.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gold-400/60 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Code size={12} className="text-purple-400/60" /> Projects to Build
            </h4>
            <div className="space-y-2">
              {stage.projects.map((proj: string, i: number) => (
                <div key={i} className="p-3.5 rounded-xl text-sm text-gold-100/70 leading-relaxed italic"
                  style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.20)' }}>
                  {proj}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────── Main RoadmapView ────────── */
export default function RoadmapView({
  user,
  setUser,
  onXpGain,
  onStageAdvance
}: {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  onXpGain?: (amount: number) => void;
  onStageAdvance?: (newIndex: number) => void;
}) {
  const [roadmap, setRoadmap] = useState<CareerRoadmap | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [activeStageIndex, setActiveStageIndex] = useState(user.currentStageIndex);
  const [selectedStage, setSelectedStage] = useState<any | null>(null);
  const [celebration, setCelebration] = useState(false);
  const [showPivotModal, setShowPivotModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => setToast(msg);
  const [conceptProgress, setConceptProgress] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('kalamspark_concept_progress');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('kalamspark_concept_progress', JSON.stringify(conceptProgress));
  }, [conceptProgress]);
  const isLight = user.settings?.theme === 'light';

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const forceRefresh = localStorage.getItem("kalamspark_force_refresh") === "true";
        const existing = await dbService.getRoadmap(user.id);
        
        if (!forceRefresh && existing && existing.stages && existing.stages.length === 4 && existing.dream?.toLowerCase() === user.dream.trim().toLowerCase()) {
          const clean = sanitizeRoadmap(existing, user.dream, user.branch);
          setRoadmap(clean);
          await dbService.saveRoadmap(user, clean);
          const completed = await dbService.getCompletedStages(user.id);
          setCompletedStages(completed);
          setActiveStageIndex(Math.max(user.currentStageIndex, completed.length));
          setLoading(false);
          return;
        }

        // WebSockets generation - Reset progress for new dream
        setLoadingMsg('Connecting to AI Career Architect...');
        setCompletedStages([]);
        setConceptProgress({});
        localStorage.removeItem('kalamspark_concept_progress');
        await dbService.clearCompletedStages(user.id);

        const getBackendUrl = () => {
          const envUrl = import.meta.env.VITE_BACKEND_URL;
          if (envUrl) return envUrl.replace(/\/$/, '');
          if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
            return window.location.origin;
          }
          return "http://localhost:8000";
        };
        let backendUrl = getBackendUrl();
        const currentLang = localStorage.getItem('kalam_spark_lang') || 'en';
        const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        let wsUrl = backendUrl.replace(/^https?/, wsProtocol) + `/ws/roadmap?dream=${encodeURIComponent(user.dream)}&year=${encodeURIComponent(user.year)}&branch=${encodeURIComponent(user.branch)}&language=${currentLang}`;
        if (forceRefresh) {
          wsUrl += "&force_refresh=true";
          localStorage.removeItem("kalamspark_force_refresh");
        }

        const ws = new WebSocket(wsUrl);
        
        ws.onmessage = async (event) => {
          const res = JSON.parse(event.data || '{}');
          if (res.type === 'progress') {
             setLoadingMsg(res.msg || 'Generating your roadmap...');
          } else if (res.type === 'result') {
             const clean = sanitizeRoadmap(res.data, user.dream, user.branch);
             setRoadmap(clean);
             await dbService.saveRoadmap(user, clean);
             setLoading(false);
             if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
          } else if (res.type === 'error') {
             console.error('WS Error:', res.data);
             setError("Error generating roadmap: " + (res.data || 'Unexpected response from server.'));
             setLoading(false);
             if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
          }
        };

        ws.onerror = (err) => {
           console.error("WS connection error", err);
           setError("Connection error. Please check your internet or if the backend is running.");
           setLoading(false);
           if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
        };

        ws.onclose = () => {
          if (loading) setLoading(false);
        };

        return ws;
      } catch (error: any) {
        console.error("Failed to sync roadmap", error);
        setError(error.message || "An unexpected error occurred while loading your roadmap.");
        setLoading(false);
        return null;
      }
    };
    
    let activeWs: WebSocket | null = null;
    init().then(ws => { if (ws) activeWs = ws; });
    
    return () => {
      if (activeWs && activeWs.readyState !== WebSocket.CLOSED) {
        activeWs.close();
      }
    };
  }, [user.id, user.dream, user.branch, user.year, retryCount]);
  
  // Sequential completion logic is now handled manually to prevent auto-completion bugs from stale data.



  const toggleStage = async (id: string, stageIndex: number) => {
    const wasCompleted = completedStages.includes(id);
    if (wasCompleted) return;

    // Enforce sequential completion
    if (stageIndex > completedStages.length) {
      showToast("Please complete the previous stages first!");
      return;
    }

    const updated = [...completedStages, id];
    setCompletedStages(updated);

    if (onXpGain) onXpGain(100);
    dbService.saveCompletedStage(user.id, id);

    // Grant stage completion reward + shower
    const stageName = roadmap?.stages?.[stageIndex]?.title || `Stage ${stageIndex + 1}`;
    const reward = makeStageCompleteReward(stageName, stageIndex, user.dream);
    // Pass quiet: true to avoid global RewardShower popup (we have custom celebration)
    grantReward(user, reward, (updatedUser) => {
      // Advance the global stage index if this stage was the current one
      const nextIdx = stageIndex + 1;
      if (nextIdx > (user.currentStageIndex || 0)) {
        updatedUser.currentStageIndex = nextIdx;
      }
      setUser(updatedUser);
    }, true);

    // Trigger celebration overlay
    setCelebration(true);

    const nextIndex = stageIndex + 1;
    if (nextIndex > activeStageIndex) {
      setActiveStageIndex(nextIndex);
      if (onStageAdvance) onStageAdvance(nextIndex);
    }
  };

  const toggleConcept = (stageId: string, stageIndex: number, concept: string, totalConcepts: number) => {
    if (stageIndex > completedStages.length) {
      showToast("Please complete the previous stages first!");
      return;
    }

    setConceptProgress(prev => {
      const current = prev[stageId] || [];
      let next: string[];
      if (current.includes(concept)) {
        next = current.filter(c => c !== concept);
      } else {
        next = [...current, concept];
      }

      if (next.length === totalConcepts && !completedStages.includes(stageId)) {
        setTimeout(() => toggleStage(stageId, stageIndex), 50);
      }

      return { ...prev, [stageId]: next };
    });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center fade-up relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-gold-900/5 blur-3xl rounded-full" />
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 relative animate-pulse"
          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', boxShadow: '0 0 30px rgba(124,58,237,0.2)' }}>
          <Loader2 className="animate-spin text-purple-400" size={32} />
        </div>
        <h3 className="font-cinzel text-xl font-semibold text-gold-200 mb-3 drop-shadow-md">Architecting Blueprint...</h3>
        <p className="text-sm text-gold-400/80 font-mono tracking-wide max-w-md bg-black/40 px-4 py-2 rounded-lg border border-gold-500/20">{loadingMsg}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center fade-up relative">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/10 to-gold-900/5 blur-3xl rounded-full" />
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 relative"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', boxShadow: '0 0 30px rgba(239,68,68,0.1)' }}>
          <X className="text-red-400" size={32} />
        </div>
        <h3 className="font-cinzel text-xl font-semibold text-gold-200 mb-3 drop-shadow-md">Architecting Interrupted</h3>
        <p className="text-sm text-gold-400/80 mb-6 max-w-md bg-black/40 px-4 py-2 rounded-lg border border-red-500/20">{error}</p>
        <button 
          onClick={() => setRetryCount(prev => prev + 1)}
          className="btn-primary px-8 py-3 rounded-xl flex items-center gap-2"
          style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)' }}
        >
          <Zap size={18} /> Retry Generation
        </button>
      </div>
    );
  }

  if (!roadmap) return null;

  const completedCount = completedStages.length;
  const totalStages = roadmap.stages.length;
  const progressPercent = Math.round((completedCount / totalStages) * 100);

  return (
    <>
      {/* In-App Toast */}
      {toast && <ToastBanner message={toast} onClose={() => setToast(null)} />}
      {/* Career Pivot Modal - Rendered outside the fade-up div to prevent fixed positioning bugs */}
      {showPivotModal && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md overflow-y-auto" onClick={() => setShowPivotModal(false)}>
          <div className="relative max-w-4xl w-full mt-10 mb-auto animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowPivotModal(false)} 
              className={`absolute top-4 right-4 z-50 p-2 rounded-full transition-all border shadow-sm
                ${user.settings?.theme === 'light' 
                  ? 'bg-white hover:bg-zinc-50 text-zinc-600 border-zinc-200' 
                  : 'bg-black/50 hover:bg-black/80 text-white border-white/20'
                }`}
            >
              <X size={20} />
            </button>
            <CareerPivot user={user} setUser={setUser} />
          </div>
        </div>
      )}

      <div className="space-y-7 fade-up">
        {/* Stage Detail Panel */}
        {selectedStage && <StageDetailPanel theme={user.settings?.theme} stage={selectedStage} onClose={() => setSelectedStage(null)} />}

      {/* Header */}
      <div className="mb-2">
        <p className="text-gold-400/50 text-xs font-semibold uppercase tracking-widest mb-2">Your personalized career plan</p>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="heading-gold font-cinzel text-3xl lg:text-4xl font-bold">
              Kalam — {user.dream || 'AI Engineer'}
            </h2>
            {roadmap?.summary && (
              <p className="text-gold-300/40 text-sm mt-2 max-w-xl leading-relaxed">{roadmap.summary}</p>
            )}
          </div>
          <button 
            onClick={() => setShowPivotModal(true)} 
            className="btn-primary text-xs px-4 py-2 shrink-0 flex items-center gap-2 rounded-xl"
            style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)', boxShadow: '0 4px 15px rgba(124,58,237,0.2)' }}
          >
            <Zap size={14} className="text-purple-200" /> Career Pivot
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`glass-card p-5 flex items-center gap-5 ${isLight ? 'bg-white border-amber-500/30 shadow-sm' : ''}`} style={!isLight ? { borderColor: 'rgba(211,156,59,0.25)' } : {}}>
        <div className="flex-1 progress-track h-2.5">
          <div className="progress-bar-gold h-full" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className={`text-xs shrink-0 font-semibold ${isLight ? 'text-amber-800' : 'text-gold-300'}`}>{completedCount} / {totalStages} steps</span>
      </div>

      {/* Stages Timeline */}
      <div className="relative pl-8 mt-4">
        {/* Vertical line */}
        <div
          className="absolute left-3 top-3 bottom-0 w-[2px] rounded-full"
          style={{ background: 'linear-gradient(to bottom, rgba(124,58,237,0.8), rgba(211,156,59,0.3), transparent)' }}
        />

        <div className="space-y-5">
          {roadmap?.stages.map((stage, idx) => {
            const isCompleted = completedStages.includes(stage.id);
            const isLocked = idx > completedStages.length;
            const isCurrent = idx === completedStages.length && !isCompleted;

            return (
              <div
                key={stage.id}
                className={`relative transition-all duration-300 ${isLocked ? 'opacity-80' : 'opacity-100'}`}
              >
                {/* Timeline dot */}
                <div
                  className="absolute -left-5 top-7 w-6 h-6 rounded-full flex items-center justify-center z-10 transition-all"
                  style={isCompleted
                    ? { background: 'rgba(124,58,237,0.5)', border: '1px solid rgba(124,58,237,0.8)', boxShadow: '0 0 12px rgba(124,58,237,0.5)' }
                    : isCurrent
                    ? { background: 'rgba(211,156,59,0.15)', border: '1px solid rgba(211,156,59,0.7)', boxShadow: '0 0 12px rgba(211,156,59,0.4)' }
                    : { 
                        background: user.settings?.theme === 'light' ? 'rgba(211,156,59,0.1)' : 'rgba(10,7,24,0.8)', 
                        border: user.settings?.theme === 'light' ? '1px solid rgba(211,156,59,0.3)' : '1px solid rgba(255,255,255,0.1)' 
                      }
                  }
                >
                    {isCompleted
                      ? <CheckCircle2 size={12} className="text-purple-300" />
                      : isCurrent
                      ? <Zap size={11} className="text-gold-400" />
                      : isLocked
                      ? <Lock size={10} className="text-gold-500/20" />
                      : <span className={`roadmap-stage-number text-[10px] font-bold ${user.settings?.theme === 'light' ? 'text-amber-900' : 'text-gold-500/30'}`}>{idx + 1}</span>
                    }
                </div>

                {/* Stage Card */}
                <div
                  className={`transition-all ${isLight ? 'bg-white rounded-2xl border shadow-sm' : 'glass-card glass-inner-shadow'}`}
                  style={isCurrent
                    ? (isLight 
                        ? { borderColor: 'rgba(211,156,59,0.6)', boxShadow: '0 8px 24px rgba(211,156,59,0.15)' }
                        : { borderColor: 'rgba(211,156,59,0.45)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 25px rgba(211,156,59,0.10), inset 0 1px 0 rgba(255,255,255,0.05)' })
                    : isCompleted
                    ? (isLight ? { borderColor: 'rgba(124,58,237,0.30)', backgroundColor: 'rgba(250,245,255,0.5)' } : { borderColor: 'rgba(124,58,237,0.30)' })
                    : (isLight ? { borderColor: 'rgba(211,156,59,0.2)' } : {})
                  }
                >
                  {/* Card Header */}
                  <div className="p-5">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gold-500/60 font-semibold uppercase tracking-wider">Stage {idx + 1}</span>
                          {stage.duration && <span className="text-xs text-gold-500/30">· {stage.duration}</span>}
                          {isCurrent && (
                            <span className="text-[10px] bg-gold-500/15 text-gold-300 px-2 py-0.5 rounded-full font-semibold border border-gold-500/25">
                              Current
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-[10px] bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded-full font-semibold border border-purple-500/25">
                              ✓ Done
                            </span>
                          )}
                        </div>
                        <h3 className={`roadmap-stage-title font-cinzel text-xl font-semibold ${isLight ? 'text-amber-900' : 'text-gold-100'}`}>{stage.title}</h3>
                        <p className={`roadmap-stage-desc text-sm mt-1.5 leading-relaxed line-clamp-2 ${isLight ? 'text-amber-800/80' : 'text-gold-300/40'}`}>{stage.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCompleted && (
                          <span className="text-xs text-purple-400 font-semibold px-3 py-1.5 rounded-xl"
                            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}>
                            ✓ Completed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail always visible */}
                  <div
                      className="px-5 pb-6 pt-4 space-y-5"
                      style={{ borderTop: isLight ? '1px solid rgba(211,156,59,0.15)' : '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* Subjects */}
                        <div>
                          <p className="roadmap-stage-topic-title text-xs text-gold-400/60 font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
                            <BookOpen size={12} className="text-gold-500/50" /> Learn Concepts
                          </p>
                          <div className="space-y-1.5">
                            {stage.subjects?.map((sub: string, si: number) => {
                              const isConceptDone = (conceptProgress[stage.id] || []).includes(sub);
                              const totalConcepts = stage.subjects.length;
                              const canCheck = idx <= completedStages.length;

                              return (
                                <div
                                  key={si}
                                  onClick={() => {
                                    if (!isCompleted && canCheck) {
                                      toggleConcept(stage.id, idx, sub, totalConcepts);
                                    } else if (!canCheck) {
                                      showToast("Please complete the previous stages first!");
                                    }
                                  }}
                                  className={`roadmap-stage-topic-item flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all ${
                                    isCompleted ? 'opacity-70 cursor-default' : (!canCheck ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5')
                                  } ${isLight ? 'text-amber-900/80' : 'text-gold-200/60'}`}
                                  style={{ 
                                    background: isLight ? 'rgba(211,156,59,0.05)' : 'rgba(255,255,255,0.03)', 
                                    border: isLight 
                                      ? `1px solid ${isConceptDone ? 'rgba(124,58,237,0.4)' : 'rgba(211,156,59,0.15)'}` 
                                      : `1px solid ${isConceptDone ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                    boxShadow: isConceptDone ? '0 0 10px rgba(124,58,237,0.1)' : 'none'
                                  }}
                                >
                                  <div 
                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                                      isConceptDone 
                                        ? 'bg-purple-500 border-purple-400' 
                                        : 'border-gold-500/30'
                                    }`}
                                  >
                                    {isConceptDone && <CheckCircle2 size={10} className="text-white" />}
                                  </div>
                                  <span className={isConceptDone ? 'line-through opacity-50' : ''}>{sub}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Project */}
                        <div>
                          <p className="roadmap-stage-topic-title text-xs text-gold-400/60 font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Code size={12} className="text-purple-400/60" /> Project Task
                          </p>
                          <div
                            className={`roadmap-stage-topic-item p-3.5 rounded-xl text-sm leading-relaxed ${isLight ? 'text-purple-900/80 bg-purple-50 border-purple-200' : 'text-gold-100/70'}`}
                            style={!isLight ? { background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.20)' } : {}}
                          >
                            {stage.projects?.[0] || 'Create your first project'}
                          </div>
                        </div>
                      </div>

                      {/* Skills */}
                      {stage.skills && stage.skills.length > 0 && (
                        <div>
                          <p className="roadmap-stage-topic-title text-xs text-gold-400/60 font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Star size={12} className="text-gold-500/50" /> Skills You'll Gain
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {stage.skills.slice(0, 5).map((skill: string, si: number) => (
                              <span
                                key={si}
                                className={`roadmap-stage-topic-item px-3 py-1.5 rounded-full text-xs ${isLight ? 'text-amber-900/80 bg-amber-50 border-amber-200' : 'text-gold-200/60'}`}
                                style={!isLight ? { background: 'rgba(211,156,59,0.06)', border: '1px solid rgba(211,156,59,0.20)' } : {}}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedStage(stage); }}
                        className="roadmap-stage-topic-item text-xs text-gold-400/60 hover:text-gold-300 font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                      >
                        View full details <ArrowRight size={12} />
                      </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {celebration && <CelebrationOverlay onClose={() => setCelebration(false)} isLight={isLight} />}
    </div>
    </>
  );
}
