import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  RotateCcw, Brain, Plus, X, BarChart3, Calendar, ChevronLeft,
  ChevronRight, Eye, EyeOff, ThumbsUp, ThumbsDown, Zap, Flame,
  CheckCircle, XCircle, Loader2, BookOpen, TrendingUp, Clock,
  AlertCircle, HelpCircle, Trash2, Target, Image as ImageIcon, Edit2,
  Download, Paperclip
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { taskRevisionService, TaskRevision, scoreToGrade } from "../taskRevisionService";
import { flashcardService, CardWithStats } from "../flashcardService";
import { ebisuService } from "../ebisuService";
import { generateMicroQuiz } from "../geminiService";
import { UserProfile, QuizQuestion } from "../types";

interface Props {
  user: UserProfile;
  onXpGain: (amount: number) => void;
}

type Tab = "revision" | "flashcards" | "analytics";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const card = (extra = "") =>
  `rounded-2xl p-5 ${extra}`;
const glassCard = (extra = "") =>
  `${card(extra)} backdrop-blur-md`;

function gradeLabel(g: 1|2|3|4) {
  return g === 4 ? "Easy" : g === 3 ? "Good" : g === 2 ? "Hard" : "Again";
}
function gradeColor(g: 1|2|3|4) {
  return g === 4 ? "text-green-400" : g === 3 ? "text-blue-400" : g === 2 ? "text-orange-400" : "text-red-400";
}
function scoreColor(s: number) {
  return s >= 80 ? "text-green-400" : s >= 55 ? "text-yellow-400" : "text-red-400";
}

const renderMedia = (src: string, isExpanded = false) => {
  if (!src) return null;
  const className = isExpanded 
    ? "max-h-64 object-contain rounded-xl border border-white/10 shadow-lg w-full"
    : "max-h-24 w-auto object-contain rounded-lg border border-white/10 mb-2";

  if (src.startsWith('data:video/')) {
    return <video src={src} controls className={className} />;
  }
  if (src.startsWith('data:audio/')) {
    return <audio src={src} controls className="w-full mb-2" />;
  }
  if (src.startsWith('data:application/pdf')) {
    return <object data={src} type="application/pdf" className={`w-full ${isExpanded ? 'h-96' : 'h-32 rounded-lg'}`}><p className="text-xs text-white/50 text-center py-2 border border-white/10 rounded-lg">PDF Attached</p></object>;
  }
  return <img src={src} className={className} alt="Flashcard visual" />;
};

// ──────────────────────────────────────────────────────────────
// Task Revision Tab
// ──────────────────────────────────────────────────────────────
function TaskRevisionTab({ user, onXpGain }: Props) {
  const isLight = user.settings?.theme === 'light';
  const [dueTasks, setDueTasks] = useState<TaskRevision[]>([]);
  const [allTasks, setAllTasks]   = useState<TaskRevision[]>([]);
  const [loading, setLoading]     = useState(true);

  // Active quiz state
  const [activeRevision, setActiveRevision] = useState<TaskRevision | null>(null);
  const [quiz, setQuiz]           = useState<QuizQuestion[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [answers, setAnswers]     = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [due, all] = await Promise.all([
      taskRevisionService.getDueTasks(user.id),
      taskRevisionService.getAllRevisions(user.id),
    ]);
    setDueTasks(due);
    setAllTasks(all);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const startReview = async (rev: TaskRevision) => {
    setActiveRevision(rev);
    setAnswers({});
    setShowResults(false);
    setQuiz(null);
    setQuizLoading(true);
    try {
      // Use career dream as main context, with the specific task as the focus
      const q = await generateMicroQuiz(user.dream, [rev.taskTitle]);
      setQuiz(q);
    } catch {
      setQuiz([]);
    }
    setQuizLoading(false);
  };

  const submitQuiz = async () => {
    if (!activeRevision || !quiz) return;
    const correct = quiz.filter((q, i) => answers[i] === q.correctAnswer).length;
    const scorePercent = Math.round((correct / quiz.length) * 100);
    const grade = scoreToGrade(scorePercent);
    const xp = grade === 4 ? 30 : grade === 3 ? 20 : grade === 2 ? 10 : 5;
    await taskRevisionService.recordReview(activeRevision.id, scorePercent);
    onXpGain(xp);
    setShowResults(true);
    await load();
  };

  const doneReview = () => {
    setActiveRevision(null);
    setQuiz(null);
    setShowResults(false);
    setAnswers({});
  };

  if (loading) return (
    <div className="flex justify-center items-center h-48">
      <Loader2 className="animate-spin text-gold-400" size={32} />
    </div>
  );

  // Quiz flow
  if (activeRevision) {
    if (quizLoading) return (
      <div className="flex flex-col items-center gap-3 h-48 justify-center">
        <Loader2 className="animate-spin text-gold-400" size={28} />
        <p className="text-sm text-gold-300/60">Generating quiz for "{activeRevision.taskTitle}"...</p>
      </div>
    );

    if (showResults && quiz) {
      const correct = quiz.filter((q, i) => answers[i] === q.correctAnswer).length;
      const score = Math.round((correct / quiz.length) * 100);
      const grade = scoreToGrade(score);
      const nextInterval =
        grade === 4 ? "~1 month" : grade === 3 ? "~1 week" : grade === 2 ? "~3 days" : "tomorrow";
      return (
        <div className="w-full space-y-4 fade-up">
          <div className={glassCard("text-center")} style={isLight ? { border: "1px solid rgba(211,156,59,0.3)", background: "white" } : { border: "1px solid rgba(211,156,59,0.2)", background: "rgba(6,3,18,0.6)" }}>
            <div className={`text-5xl font-bold mb-1 font-cinzel ${scoreColor(score)}`}>{score}%</div>
            <p className="text-gold-400 text-sm font-semibold uppercase tracking-widest mb-1">{gradeLabel(grade)}</p>
            <p className="text-gold-300/60 text-xs">{correct}/{quiz.length} correct · Next review: {nextInterval}</p>
          </div>
          {quiz.map((q, i) => (
            <div key={i} className={glassCard("space-y-2")} style={isLight ? { border: `1px solid ${answers[i] === q.correctAnswer ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`, background: "white" } : { border: `1px solid ${answers[i] === q.correctAnswer ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`, background: "rgba(6,3,18,0.5)" }}>
              <p className={`text-sm font-semibold ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>{q.question}</p>
              <div className="flex items-center gap-2 text-xs">
                {answers[i] === q.correctAnswer
                  ? <><CheckCircle size={14} className="text-green-400" /><span className="text-green-400">Correct</span></>
                  : <><XCircle size={14} className="text-red-400" /><span className="text-red-400">Your answer: {q.options[answers[i]]}</span></>}
              </div>
              <p className="text-xs text-gold-500/60 italic">{q.explanation}</p>
            </div>
          ))}
          <button onClick={doneReview} className="w-full btn-primary py-3 font-bold">Done → Back to Queue</button>
        </div>
      );
    }

    if (quiz && quiz.length > 0) {
      const answered = Object.keys(answers).length;
      const total = quiz.length;
      return (
        <div className="w-full space-y-5 fade-up">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs uppercase tracking-widest ${isLight ? 'text-gold-600' : 'text-gold-500/60'}`}>Revising</p>
              <h3 className={`text-lg font-bold font-cinzel ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>{activeRevision.taskTitle}</h3>
            </div>
            <button onClick={doneReview} className={`hover:text-gold-500 transition-colors ${isLight ? 'text-gold-400' : 'text-gold-500/40 hover:text-gold-300'}`}><X size={20} /></button>
          </div>
          {/* Progress */}
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-gold-400 to-orange-400 transition-all duration-500" style={{ width: `${(answered / total) * 100}%` }} />
          </div>
          {/* Questions */}
          <div className="space-y-4">
            {quiz.map((q, i) => (
              <div key={i} className={`flashcard-card ${glassCard()}`} style={isLight ? { border: "1px solid rgba(255,140,66,0.3)", background: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" } : { border: "1px solid rgba(255,140,66,0.15)", background: "rgba(6,3,18,0.55)" }}>
                <p className={`flashcard-text font-semibold mb-3 text-sm ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>{i + 1}. {q.question}</p>
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt, j) => (
                    <button
                      key={j}
                      onClick={() => setAnswers(prev => ({ ...prev, [i]: j }))}
                      className={`flashcard-option text-left px-4 py-2.5 rounded-xl text-sm transition-all font-medium ${
                        answers[i] === j
                          ? isLight ? "bg-gold-100 border border-gold-400 text-gold-800 flashcard-option-selected" : "bg-gold-500/20 border border-gold-400/60 text-gold-200 flashcard-option-selected"
                          : isLight ? "bg-zinc-50 border border-zinc-200 text-zinc-600 hover:border-gold-300 hover:bg-white" : "bg-white/5 border border-white/10 text-gold-300/70 hover:border-gold-500/30"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            disabled={answered < total}
            onClick={submitQuiz}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${answered >= total ? "btn-primary" : "opacity-40 cursor-not-allowed bg-white/10 text-gold-500"}`}
          >
            {answered < total ? `Answer all questions (${answered}/${total})` : "Submit & See Results"}
          </button>
        </div>
      );
    }
  }

  // Main dashboard
  return (
    <div className="space-y-6 fade-up">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Due Now", val: dueTasks.length, color: "text-red-500", bg: isLight ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.08)" },
          { label: "Total Queued", val: allTasks.length, color: "text-gold-500", bg: isLight ? "rgba(211,156,59,0.1)" : "rgba(211,156,59,0.08)" },
          { label: "Reviewed", val: allTasks.filter(t => t.totalReviews > 0).length, color: "text-green-500", bg: isLight ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.08)" },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl text-center" style={{ background: s.bg, border: isLight ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(255,255,255,0.08)" }}>
            <p className={`text-3xl font-bold font-cinzel ${s.color}`}>{s.val}</p>
            <p className={`text-xs uppercase tracking-wider mt-1 ${isLight ? 'text-zinc-500' : 'text-gold-500/50'}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Due tasks */}
      {dueTasks.length > 0 ? (
        <div className="space-y-3">
          <h3 className={`font-semibold flex items-center gap-2 text-sm uppercase tracking-wider ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>
            <AlertCircle size={14} className="text-red-500" /> Due for Revision
          </h3>
          {dueTasks.map(r => (
            <div key={r.id} className={glassCard("flex items-center justify-between gap-3")} style={isLight ? { border: "1px solid rgba(239,68,68,0.3)", background: "white" } : { border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.04)" }}>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold truncate text-sm ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>{r.taskTitle}</p>
                <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-gold-500/50'}`}>
                  {r.totalReviews === 0 ? "Never reviewed" : `Last score: ${r.lastQuizScore}% · ${r.totalReviews} reviews`}
                </p>
              </div>
              <button onClick={() => startReview(r)} className="btn-primary px-4 py-2 text-xs font-bold flex-shrink-0 flex items-center gap-1.5">
                <HelpCircle size={13} /> Quiz Me
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-2xl text-center" style={isLight ? { border: "1px dashed rgba(34,197,94,0.4)", background: "white" } : { border: "1px dashed rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.04)" }}>
          <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />
          <h3 className={`text-lg font-semibold mb-1 ${isLight ? 'text-green-700' : 'text-green-300'}`}>All caught up!</h3>
          <p className={`text-sm ${isLight ? 'text-zinc-500' : 'text-gold-300/60'}`}>No tasks due for revision. Complete more tasks in the Planner — they'll auto-appear here.</p>
        </div>
      )}

      {/* Upcoming */}
      {allTasks.filter(t => !dueTasks.find(d => d.id === t.id)).length > 0 && (
        <div className="space-y-2">
          <h3 className={`font-semibold flex items-center gap-2 text-sm uppercase tracking-wider ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>
            <Clock size={14} className="text-gold-500" /> Upcoming Revisions
          </h3>
          {allTasks.filter(t => !dueTasks.find(d => d.id === t.id)).slice(0, 6).map(r => (
            <div key={r.id} className="px-4 py-3 rounded-xl flex items-center justify-between" style={isLight ? { background: "white", border: "1px solid rgba(0,0,0,0.1)" } : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className={`text-sm truncate ${isLight ? 'text-zinc-700' : 'text-gold-100/80'}`}>{r.taskTitle}</p>
              <span className={`text-xs ml-2 flex-shrink-0 ${isLight ? 'text-zinc-400' : 'text-gold-500/50'}`}>
                {r.nextReview.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Flashcards Tab (simple exam notes vault)
// ──────────────────────────────────────────────────────────────
function FlashcardsTab({ user }: { user: UserProfile }) {
  const isLight = user.settings?.theme === 'light';
  const [cards, setCards]         = useState<CardWithStats[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCard, setNewCard]     = useState({ deckId: "exam-notes", front: "", back: "", frontImg: "", backImg: "" });
  const [saving, setSaving]       = useState(false);
  const [flipSet, setFlipSet]     = useState<Set<string>>(new Set());
  const [filterDeck, setFilterDeck] = useState("all");
  const [expandedCard, setExpandedCard] = useState<CardWithStats | null>(null);
  const [expandedFlipped, setExpandedFlipped] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportToPDF = async () => {
    const el = document.getElementById("pdf-export-hidden");
    if (!el || filtered.length === 0) return;
    setExporting(true);
    el.style.display = "block";
    try {
      const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.9);
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`Flashcards_${filterDeck}.pdf`);
    } catch (e) {
      console.error(e);
    }
    el.style.display = "none";
    setExporting(false);
  };

  const exportSinglePDF = async (card: CardWithStats) => {
    setExporting(true);
    const pdf = new jsPDF("p", "mm", "a4");
    const [fText, fImg] = card.card.front.split("|||IMAGE:");
    const [bText, bImg] = card.card.back.split("|||IMAGE:");
    
    // Quick hidden node to run html2canvas on single card
    const div = document.createElement('div');
    div.style.padding = '40px';
    div.style.width = '800px';
    div.style.background = 'white';
    div.style.color = 'black';
    div.innerHTML = `
      <h1 style="font-size:24px; font-weight:bold; margin-bottom:20px; border-bottom:2px solid black; padding-bottom:10px;">Flashcard - ${card.card.deckId}</h1>
      <div style="margin-bottom:20px; padding:20px; border:1px solid #ddd; border-radius:12px;">
        <div style="margin-bottom:15px;">
          <strong style="font-size:18px;">Q:</strong> <span style="font-size:18px;">${fText}</span>
          ${fImg?.startsWith('data:image/') ? `<img src="${fImg}" style="max-height:300px; display:block; margin-top:15px; border-radius:8px;" />` : ''}
        </div>
        <div style="padding-left:20px; border-left:4px solid #6366f1; padding-top:5px;">
          <strong style="font-size:18px;">A:</strong> <span style="font-size:18px;">${bText}</span>
          ${bImg?.startsWith('data:image/') ? `<img src="${bImg}" style="max-height:300px; display:block; margin-top:15px; border-radius:8px;" />` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(div);
    try {
      const canvas = await html2canvas(div, { scale: 1.5, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.9);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Flashcard_${card.card.id}.pdf`);
    } catch(err) {}
    document.body.removeChild(div);
    setExporting(false);
  };


  const load = useCallback(async () => {
    setLoading(true);
    // Get all due cards + load by deck — simplified: just get due cards as demonstration
    // In a real app you'd have "getAllFlashcards" — we use getDueCards as placeholder
    try {
      const due = await flashcardService.getDueCards(user.id);
      setCards(due);
    } catch { setCards([]); }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const toggleFlip = (id: string) => {
    setFlipSet(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleImageRead = (e: React.ChangeEvent<HTMLInputElement>, field: 'frontImg' | 'backImg') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewCard(p => ({ ...p, [field]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCard.front.trim() && !newCard.frontImg) return;
    if (!newCard.back.trim() && !newCard.backImg) return;
    setSaving(true);
    const frontBlob = newCard.front + (newCard.frontImg ? "|||IMAGE:" + newCard.frontImg : "");
    const backBlob = newCard.back + (newCard.backImg ? "|||IMAGE:" + newCard.backImg : "");
    try {
      if (editingId) {
        await flashcardService.updateFlashcard(editingId, frontBlob, backBlob, newCard.deckId);
      } else {
        await flashcardService.createFlashcard(user.id, newCard.deckId, frontBlob, backBlob);
      }
      setNewCard({ deckId: newCard.deckId, front: "", back: "", frontImg: "", backImg: "" });
      setEditingId(null);
      setShowCreate(false);
      await load();
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const openEdit = (c: CardWithStats) => {
    const [fText, fImg] = c.card.front.split("|||IMAGE:");
    const [bText, bImg] = c.card.back.split("|||IMAGE:");
    setNewCard({ deckId: c.card.deckId, front: fText || "", back: bText || "", frontImg: fImg || "", backImg: bImg || "" });
    setEditingId(c.card.id);
    setShowCreate(true);
  };

  const deleteCard = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remove this flashcard permanently?")) return;
    try {
      await flashcardService.deleteFlashcard(id);
      await load();
    } catch (err) { console.error(err); }
  };

  const decks = ["all", ...Array.from(new Set(cards.map(c => c.card.deckId)))];
  const filtered = filterDeck === "all" ? cards : cards.filter(c => c.card.deckId === filterDeck);

  if (loading) return <div className="flex justify-center h-32 items-center"><Loader2 className="animate-spin text-gold-400" size={28} /></div>;

  return (
    <>
      <div className="space-y-5 fade-up">
      {/* Deck filter + create button */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {decks.map(d => (
            <button key={d} onClick={() => setFilterDeck(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${filterDeck === d ? (isLight ? "bg-gold-100 text-gold-700 border border-gold-300" : "bg-gold-500/20 text-gold-300 border border-gold-400/40") : (isLight ? "bg-white text-zinc-500 border border-zinc-200 hover:border-gold-300" : "bg-white/5 text-gold-500/60 border border-white/10 hover:border-gold-500/30")}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button onClick={exportToPDF} disabled={exporting} className="bg-purple-500/10 text-purple-300 border border-purple-400/30 px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all hover:bg-purple-500/20 disabled:opacity-50">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {exporting ? "Exporting..." : "Export Doc"}
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5 rounded-xl">
            <Plus size={14} /> Add Card
          </button>
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="p-10 rounded-2xl text-center" style={isLight ? { border: "1px dashed rgba(211,156,59,0.4)", background: "white" } : { border: "1px dashed rgba(211,156,59,0.2)", background: "rgba(211,156,59,0.03)" }}>
          <BookOpen size={36} className={`mx-auto mb-3 ${isLight ? 'text-gold-400' : 'text-gold-500/30'}`} />
          <h3 className={`font-semibold mb-1 ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}>No flashcards yet</h3>
          <p className={`text-xs mb-3 ${isLight ? 'text-zinc-500' : 'text-gold-500/50'}`}>Create cards for your exam notes, formulas, or key concepts.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary px-4 py-2 text-xs font-bold">Create First Card</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => {
            const isFlipped = flipSet.has(c.card.id);
            const mem = ebisuService.predictRecall(c.stats.ebisuModel);
            const [fText, fImg] = c.card.front.split("|||IMAGE:");
            const [bText, bImg] = c.card.back.split("|||IMAGE:");
            const currentText = isFlipped ? bText : fText;
            const currentImg = isFlipped ? bImg : fImg;

            return (
              <div
                key={c.card.id}
                className="flashcard-card-grid rounded-2xl p-6 min-h-[160px] flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] relative cursor-pointer group shadow-sm"
                style={isLight ? { background: isFlipped ? "rgba(124,58,237,0.05)" : "white", border: `1px solid ${isFlipped ? "rgba(124,58,237,0.3)" : "rgba(0,0,0,0.1)"}` } : { background: isFlipped ? "rgba(124,58,237,0.12)" : "rgba(6,3,18,0.6)", border: `1px solid ${isFlipped ? "rgba(124,58,237,0.35)" : "rgba(255,140,66,0.18)"}` }}
                onClick={() => toggleFlip(c.card.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] uppercase tracking-widest font-semibold ${isLight ? 'text-zinc-500' : 'text-gold-500/50'}`}>{isFlipped ? "Answer" : "Question"}</span>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="p-1 rounded hover:bg-white/10 text-blue-400/50 hover:text-blue-300" title="Edit"><Edit2 size={13} /></button>
                    <button onClick={e => deleteCard(c.card.id, e)} className="p-1 rounded hover:bg-white/10 text-red-400/50 hover:text-red-300" title="Delete"><Trash2 size={13} /></button>
                    <button onClick={e => { e.stopPropagation(); setExpandedCard(c); setExpandedFlipped(isFlipped); }} className="p-1 rounded hover:bg-white/10 text-gold-400/50 hover:text-gold-300" title="Expand view"><Eye size={13} /></button>
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col justify-center gap-3">
                  {renderMedia(currentImg, false)}
                  {currentText && <p className="text-base font-semibold text-gold-100 leading-relaxed line-clamp-3 whitespace-pre-wrap text-left whitespace-pre-line">{currentText}</p>}
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                  <p className="text-[10px] text-gold-500/40">Deck: {c.card.deckId}</p>
                  <span className={`text-[10px] font-bold ${mem > 70 ? "text-green-400" : mem > 40 ? "text-yellow-400" : "text-red-400"}`}>{mem}% recall</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Fullscreen expanded card modal */}
      {expandedCard && createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setExpandedCard(null)}
        >
          <div
            className="flashcard-modal w-full max-w-3xl rounded-3xl p-8 sm:p-12 relative flex flex-col gap-8 cursor-pointer shadow-2xl transition-all duration-300 transform scale-100"
            style={{ 
              background: expandedFlipped ? "rgba(16,8,30,0.95)" : "rgba(6,3,18,0.97)", 
              border: `1px solid ${expandedFlipped ? "rgba(124,58,237,0.3)" : "rgba(255,140,66,0.25)"}`, 
              minHeight: "450px" 
            }}
            onClick={e => { e.stopPropagation(); setExpandedFlipped(f => !f); }}
          >
            {/* Header / Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className={`text-sm uppercase tracking-[0.2em] font-bold ${expandedFlipped ? "text-purple-400/80" : "text-gold-500/60"}`}>
                {expandedFlipped ? "Answer" : "Question"} · {expandedCard.card.deckId}
              </span>
              <div className="flex items-center gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); exportSinglePDF(expandedCard); }} 
                  className="text-purple-400/60 hover:text-purple-300 transition-colors flex items-center gap-1.5 text-xs font-bold bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10" 
                  disabled={exporting}
                >
                  {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 
                  <span>Export Doc</span>
                </button>
                <button 
                  onClick={e => { e.stopPropagation(); setExpandedCard(null); }} 
                  className="text-white/40 hover:text-white transition-colors p-1"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Content properly handles base64 image + text */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              {(() => {
                const [fText, fImg] = expandedCard.card.front.split("|||IMAGE:");
                const [bText, bImg] = expandedCard.card.back.split("|||IMAGE:");
                const currentText = expandedFlipped ? bText : fText;
                const currentImg = expandedFlipped ? bImg : fImg;

                return (
                  <>
                    {renderMedia(currentImg, true)}
                    {currentText && (
                      <p className={`text-2xl sm:text-4xl font-semibold leading-relaxed text-center whitespace-pre-wrap ${expandedFlipped ? "text-purple-100" : "text-gold-100"}`}>
                        {currentText}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Status Footer */}
            <div className="flex items-center justify-between border-t border-white/10 pt-6 mt-4 opacity-50">
              <span className="text-xs tracking-wider uppercase flex items-center gap-2"><Eye size={14}/> Tap anywhere to flip</span>
              <span className="text-xs tracking-wider uppercase">{ebisuService.predictRecall(expandedCard.stats.ebisuModel)}% Recall</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create / Edit Modal */}
      {showCreate && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="flashcard-create-modal w-full max-w-md rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto" style={{ background: "rgba(6,3,18,0.97)", border: "1px solid rgba(124,58,237,0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <button onClick={() => { setShowCreate(false); setEditingId(null); setNewCard({ deckId: newCard.deckId, front: "", back: "", frontImg: "", backImg: "" }); }} className="absolute top-4 right-4 text-gold-500/40 hover:text-gold-300"><X size={20} /></button>
            <h2 className="flashcard-create-title heading-gold font-cinzel text-lg font-bold mb-5 flex items-center gap-2">
              {editingId ? <Edit2 size={16} /> : <Plus size={16} />} {editingId ? "Edit Flashcard" : "New Flashcard"}
            </h2>
            <form onSubmit={create} className="space-y-5">
              <div>
                <label className="flashcard-create-label block text-xs uppercase tracking-wider text-gold-500/60 mb-1">Deck / Subject</label>
                <input value={newCard.deckId} onChange={e => setNewCard(p => ({ ...p, deckId: e.target.value }))}
                  className="flashcard-create-input w-full bg-black/40 border border-gold-500/20 rounded-xl px-4 py-3 text-gold-100 placeholder:text-gold-500/30 focus:outline-none focus:border-gold-500/50 text-sm"
                  placeholder="e.g. data-structures" required />
              </div>

              {/* Front Side */}
              <div className="flashcard-create-box p-3 rounded-xl border border-white/10 bg-white/5 space-y-3">
                <label className="flashcard-create-label-front block text-xs uppercase tracking-wider text-gold-300 font-bold border-b border-white/10 pb-2">Question (Front)</label>
                <textarea value={newCard.front} onChange={e => setNewCard(p => ({ ...p, front: e.target.value }))}
                  className="flashcard-create-input w-full bg-black/40 border border-gold-500/20 rounded-xl px-4 py-3 text-gold-100 placeholder:text-gold-500/30 focus:outline-none focus:border-gold-500/50 resize-none h-16 text-sm"
                  placeholder="What is Big O notation?" />
                
                <div className="flex items-center gap-3">
                  <label className="flashcard-create-btn cursor-pointer text-xs font-semibold flex items-center gap-1.5 px-3 py-2 bg-black/50 border border-gold-500/30 rounded-lg hover:bg-gold-500/20 text-gold-400 transition-colors">
                    <Paperclip size={14} /> Attach File (Audio/Video/Doc)
                    <input type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={e => handleImageRead(e, 'frontImg')} />
                  </label>
                  {newCard.frontImg && (
                    <div className="relative flex items-center gap-2 bg-white/10 px-2 py-1 rounded border border-white/20">
                      <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center overflow-hidden">
                        {renderMedia(newCard.frontImg, false)}
                      </div>
                      <span className="text-[10px] text-white/70 max-w-[80px] truncate">Attachment saved</span>
                      <button type="button" onClick={() => setNewCard(p => ({ ...p, frontImg: '' }))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 z-10 hover:bg-red-400"><X size={10} /></button>
                    </div>
                  )}
                </div>
              </div>

              {/* Back Side */}
              <div className="flashcard-create-box p-3 rounded-xl border border-white/10 bg-white/5 space-y-3">
                <label className="flashcard-create-label-back block text-xs uppercase tracking-wider text-purple-300 font-bold border-b border-white/10 pb-2">Answer (Back)</label>
                <textarea value={newCard.back} onChange={e => setNewCard(p => ({ ...p, back: e.target.value }))}
                  className="flashcard-create-input w-full bg-black/40 border border-purple-500/20 rounded-xl px-4 py-3 text-purple-100 placeholder:text-purple-500/30 focus:outline-none focus:border-purple-500/50 resize-none h-16 text-sm"
                  placeholder="A notation describing algorithm time/space complexity..." />
                
                <div className="flex items-center gap-3">
                  <label className="flashcard-create-btn cursor-pointer text-xs font-semibold flex items-center gap-1.5 px-3 py-2 bg-black/50 border border-purple-500/30 rounded-lg hover:bg-purple-500/20 text-purple-400 transition-colors">
                    <Paperclip size={14} /> Attach File (Audio/Video/Doc)
                    <input type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={e => handleImageRead(e, 'backImg')} />
                  </label>
                  {newCard.backImg && (
                    <div className="relative flex items-center gap-2 bg-white/10 px-2 py-1 rounded border border-white/20">
                      <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center overflow-hidden">
                        {renderMedia(newCard.backImg, false)}
                      </div>
                      <span className="text-[10px] text-white/70 max-w-[80px] truncate">Attachment saved</span>
                      <button type="button" onClick={() => setNewCard(p => ({ ...p, backImg: '' }))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 z-10 hover:bg-red-400"><X size={10} /></button>
                    </div>
                  )}
                </div>
              </div>

              <button type="submit" disabled={saving || (!newCard.front && !newCard.frontImg) || (!newCard.back && !newCard.backImg)} className="w-full btn-primary py-3 font-bold">
                {saving ? "Saving..." : (editingId ? "Update Flashcard" : "Save Flashcard")}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* Hidden Div for PDF Export */}
      <div id="pdf-export-hidden" style={{ display: 'none', padding: '40px', background: 'white', color: 'black', width: '800px', position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '30px', borderBottom: '2px solid black', paddingBottom: '10px', color: '#000' }}>
          Flashcards Notes - {filterDeck.toUpperCase()}
        </h1>
        {filtered.map((c, i) => {
          const [fText, fImg] = c.card.front.split("|||IMAGE:");
          const [bText, bImg] = c.card.back.split("|||IMAGE:");
          return (
            <div key={i} style={{ marginBottom: '40px', padding: '20px', border: '1px solid #ddd', borderRadius: '12px', pageBreakInside: 'avoid' }}>
              <div style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#000', fontSize: '18px' }}>Q:</strong> <span style={{ fontSize: '18px' }}>{fText}</span>
                {fImg && fImg.startsWith('data:image/') && <img src={fImg} style={{ maxHeight: '200px', display: 'block', marginTop: '15px', borderRadius: '8px' }} />}
              </div>
              <div style={{ paddingLeft: '20px', borderLeft: '4px solid #6366f1', paddingTop: '5px' }}>
                <strong style={{ color: '#000', fontSize: '18px' }}>A:</strong> <span style={{ fontSize: '18px' }}>{bText}</span>
                {bImg && bImg.startsWith('data:image/') && <img src={bImg} style={{ maxHeight: '200px', display: 'block', marginTop: '15px', borderRadius: '8px' }} />}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Analytics Tab — Calendar + Retention chart
// ──────────────────────────────────────────────────────────────
function AnalyticsTab({ user }: { user: UserProfile }) {
  const isLight = user.settings?.theme === 'light';
  const [allRevisions, setAllRevisions] = useState<TaskRevision[]>([]);
  const [loading, setLoading]           = useState(true);
  const [calMonth, setCalMonth]         = useState(new Date());

  useEffect(() => {
    taskRevisionService.getAllRevisions(user.id).then(r => {
      setAllRevisions(r);
      setLoading(false);
    });
  }, [user.id]);

  if (loading) return <div className="flex justify-center h-32 items-center"><Loader2 className="animate-spin text-gold-400" size={28} /></div>;

  // Calendar helpers
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dueByDay: Record<string, number> = {};
  allRevisions.forEach(r => {
    const d = r.nextReview;
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = d.getDate().toString();
      dueByDay[key] = (dueByDay[key] || 0) + 1;
    }
  });

  const today = new Date();

  // Retention analytics
  const reviewed = allRevisions.filter(r => r.totalReviews > 0);
  const avgScore = reviewed.length > 0 ? Math.round(reviewed.reduce((s, r) => s + (r.lastQuizScore || 0), 0) / reviewed.length) : 0;
  const strongCount  = reviewed.filter(r => (r.lastQuizScore || 0) >= 80).length;
  const mediumCount  = reviewed.filter(r => (r.lastQuizScore || 0) >= 55 && (r.lastQuizScore || 0) < 80).length;
  const weakCount    = reviewed.filter(r => (r.lastQuizScore || 0) < 55).length;

  return (
    <div className="space-y-6 fade-up">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Avg Score", val: `${avgScore}%`, icon: <Target size={18} className="text-gold-400" />, bg: "rgba(211,156,59,0.08)" },
          { label: "Strong (≥80%)", val: strongCount, icon: <ThumbsUp size={18} className="text-green-400" />, bg: "rgba(34,197,94,0.08)" },
          { label: "Needs Work", val: mediumCount, icon: <Zap size={18} className="text-yellow-400" />, bg: "rgba(234,179,8,0.08)" },
          { label: "At Risk (<55%)", val: weakCount, icon: <AlertCircle size={18} className="text-red-400" />, bg: "rgba(239,68,68,0.08)" },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-xl space-y-2" style={{ background: s.bg, border: "1px solid rgba(255,255,255,0.06)" }}>
            {s.icon}
            <p className="text-2xl font-bold text-gold-100 font-cinzel">{s.val}</p>
            <p className="text-[11px] text-gold-500/50 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Score Distribution Bar */}
          {reviewed.length > 0 && (
            <div className="analytics-card p-5 rounded-2xl space-y-3" style={isLight ? { background: "white", border: "1px solid rgba(0,0,0,0.1)" } : { background: "rgba(6,3,18,0.5)", border: "1px solid rgba(255,140,66,0.12)" }}>
              <h3 className={`analytics-title font-semibold flex items-center gap-2 text-sm ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}><TrendingUp size={15} className={isLight ? 'text-orange-500' : 'text-gold-400'} /> Retention Distribution</h3>
          <div className="space-y-2.5">
            {[
              { label: "Strong Memory (≥80%)", count: strongCount, color: "bg-green-500", total: reviewed.length },
              { label: "Moderate (55-79%)", count: mediumCount, color: "bg-yellow-500", total: reviewed.length },
              { label: "Needs Revision (<55%)", count: weakCount, color: "bg-red-500", total: reviewed.length },
            ].map(b => (
              <div key={b.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="analytics-text text-gold-300/70">{b.label}</span>
                  <span className="text-gold-400 font-semibold">{b.count}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full ${b.color} transition-all duration-700`}
                    style={{ width: `${b.total > 0 ? (b.count / b.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

          {/* Score per task list */}
          {reviewed.length > 0 && (
            <div className="analytics-card p-5 rounded-2xl space-y-3" style={isLight ? { background: "white", border: "1px solid rgba(0,0,0,0.1)" } : { background: "rgba(6,3,18,0.5)", border: "1px solid rgba(255,140,66,0.12)" }}>
              <h3 className={`analytics-title font-semibold flex items-center gap-2 text-sm ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}><BarChart3 size={15} className={isLight ? 'text-orange-500' : 'text-gold-400'} /> Per-Task Scores</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {[...reviewed].sort((a, b) => (a.lastQuizScore || 0) - (b.lastQuizScore || 0)).map(r => (
                  <div key={r.id} className="flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className={`analytics-text truncate text-xs ${isLight ? 'text-zinc-600' : 'text-gold-100/80'}`}>{r.taskTitle}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${(r.lastQuizScore||0) >= 80 ? "bg-green-500" : (r.lastQuizScore||0) >= 55 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${r.lastQuizScore || 0}%` }} />
                  </div>
                  <span className={`text-xs font-bold ${scoreColor(r.lastQuizScore || 0)}`}>{r.lastQuizScore || 0}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

        {/* Revision Calendar */}
        <div className="analytics-card p-5 rounded-2xl space-y-4" style={isLight ? { background: "white", border: "1px solid rgba(0,0,0,0.1)" } : { background: "rgba(6,3,18,0.5)", border: "1px solid rgba(255,140,66,0.12)" }}>
          <div className="flex items-center justify-between">
            <h3 className={`analytics-title font-semibold flex items-center gap-2 text-sm ${isLight ? 'text-zinc-800' : 'text-gold-100'}`}><Calendar size={15} className={isLight ? 'text-orange-500' : 'text-gold-400'} /> Revision Calendar</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} className={`p-1.5 rounded-lg transition-colors ${isLight ? 'hover:bg-zinc-100 text-orange-500' : 'hover:bg-white/10 text-gold-400'}`}><ChevronLeft size={16} /></button>
              <span className={`text-xs font-semibold ${isLight ? 'text-zinc-600' : 'text-gold-300'}`}>
              {calMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-white/10 text-gold-400 transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 text-center mb-1">
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
              <div key={d} className={`text-[10px] font-semibold py-1 ${isLight ? 'text-zinc-400' : 'text-gold-500/40'}`}>{d}</div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const due = dueByDay[day.toString()] || 0;
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            return (
              <div
                key={day}
                className={`analytics-day-cell aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] font-medium transition-all
                  ${isToday ? (isLight ? "border-2 border-orange-500 text-orange-600" : "border-2 border-gold-400 text-gold-300") : (isLight ? "text-zinc-500" : "text-gold-300/60")}
                  ${due > 0 ? (isLight ? "bg-purple-100 text-purple-700 analytics-day-due" : "bg-purple-500/20 text-purple-300 analytics-day-due") : (isLight ? "hover:bg-zinc-50 analytics-day-empty" : "hover:bg-white/5 analytics-day-empty")}`}
              >
                <span>{day}</span>
                {due > 0 && <span className={`text-[8px] mt-0.5 font-bold ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>{due}</span>}
              </div>
            );
          })}
        </div>
          <div className={`flex items-center gap-4 text-[10px] ${isLight ? 'text-zinc-500' : 'text-gold-500/50'}`}>
            <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded inline-block ${isLight ? 'bg-purple-200' : 'bg-purple-500/30'}`} /> Tasks due that day</span>
            <span className="flex items-center gap-1"><span className={`w-3 h-3 rounded border-2 inline-block ${isLight ? 'border-orange-500' : 'border-gold-400'}`} /> Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────
export default function RevisionEngine({ user, onXpGain }: Props) {
  const [tab, setTab] = useState<Tab>("revision");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "revision",   label: "Task Revision",  icon: <RotateCcw size={14} /> },
    { id: "flashcards", label: "Flashcards",      icon: <BookOpen size={14} /> },
    { id: "analytics",  label: "Analytics",       icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="space-y-6 w-full fade-up">
      {/* Page Header */}
      <div className="p-6 rounded-2xl" style={{ background: user.settings?.theme === 'light' ? "linear-gradient(135deg, rgba(211,156,59,0.05) 0%, rgba(124,58,237,0.05) 100%)" : "linear-gradient(135deg, rgba(211,156,59,0.1) 0%, rgba(124,58,237,0.1) 100%)", border: user.settings?.theme === 'light' ? "1px solid rgba(211,156,59,0.3)" : "1px solid rgba(211,156,59,0.2)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`heading-gold font-cinzel text-2xl font-bold mb-1 ${user.settings?.theme === 'light' ? 'text-zinc-800' : ''}`}>Revision Engine</h1>
            <p className={`text-sm max-w-lg ${user.settings?.theme === 'light' ? 'text-zinc-600' : 'text-gold-300/60'}`}>
              Complete tasks → auto-scheduled for spaced revision. Flashcards for quick exam notes. FSRS adapts to your quiz scores.
            </p>
          </div>
          <Brain size={36} className={`${user.settings?.theme === 'light' ? 'text-gold-500' : 'text-gold-400/25'} flex-shrink-0`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 rounded-xl gap-1" style={user.settings?.theme === 'light' ? { background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.1)" } : { background: "rgba(255,140,66,0.05)", border: "1px solid rgba(255,140,66,0.15)" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id
                ? user.settings?.theme === 'light' ? "bg-white text-gold-700 shadow-sm" : "bg-gold-500/20 text-gold-300 border border-gold-400/40"
                : user.settings?.theme === 'light' ? "text-zinc-500 hover:text-zinc-800 hover:bg-white/50" : "text-gold-500/60 hover:text-gold-300 hover:bg-white/5"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "revision"   && <TaskRevisionTab user={user} onXpGain={onXpGain} />}
      {tab === "flashcards" && <FlashcardsTab user={user} />}
      {tab === "analytics"  && <AnalyticsTab user={user} />}
    </div>
  );
}
