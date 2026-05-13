
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, History, MessageSquare, Trash2,
  Loader2, Plus, ChevronRight, Mic, Paperclip, Image,
  FileText, Video, X, Sparkles, Eye, Copy, Volume2, Share2, Edit2, VolumeX, Menu, MoreVertical, Share
} from 'lucide-react';
import { UserProfile } from '../types';
import { dbService } from '../dbService';
import { getCurrentLang } from '../i18n';

/* ─── Types ─── */
interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  ts?: number;
  attachmentPreview?: string; // data URL for display
  attachmentName?: string;
}

interface HistorySession {
  sessionId: string;
  title: string;
  lastTs: number;
  messages: ChatMessage[];
}

interface AttachmentState {
  file: File;
  base64: string;       // pure base64, no prefix
  mimeType: string;     // image/png, image/jpeg, text, application/pdf, etc.
  preview: string;      // data URL for display
  name: string;
  isImage: boolean;
  isVideo: boolean;
  isDoc: boolean;
}

/* ─── Constants ─── */
const getBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  return "http://localhost:8000";
};
const BACKEND_URL = getBackendUrl();
const ACCEPTED_FILES = "image/*,video/*,.pdf,.docx,.doc,.txt,.md";

/* ─── Markdown renderer ─── */
function renderMd(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(124,58,237,0.15);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.85em">$1</code>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left:1.2em;list-style-type:decimal">$1</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li style="margin-left:1.2em;list-style-type:disc">$1</li>')
    .replace(/(<li[^>]*>[^<]+<\/li>\n?)+/g, m => `<ul style="margin:6px 0;padding:0">${m}</ul>`)
    .replace(/\n/g, '<br>');
}

/* ─── File → base64 + metadata helper ─── */
async function processAttachment(file: File): Promise<AttachmentState> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isDoc   = !isImage && !isVideo;

  return new Promise((resolve, reject) => {
    if (isVideo) {
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.muted = true;
      const url = URL.createObjectURL(file);
      videoEl.src = url;
      videoEl.currentTime = 0.5;
      videoEl.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = Math.min(videoEl.videoWidth,  960);
        canvas.height = Math.min(videoEl.videoHeight, 540);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const b64 = dataUrl.split(',')[1];
        URL.revokeObjectURL(url);
        resolve({
          file, base64: b64, mimeType: 'image/jpeg',
          preview: dataUrl, name: file.name,
          isImage: false, isVideo: true, isDoc: false,
        });
      };
      videoEl.onerror = reject;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        let mimeType = file.type || 'text/plain';
        if (isDoc) mimeType = 'text';
        resolve({
          file, base64: b64, mimeType,
          preview: isImage ? dataUrl : '',
          name: file.name,
          isImage, isVideo: false, isDoc,
        });
      };
      reader.onerror = reject;
      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          reader.readAsDataURL(file); 
        } else {
          reader.readAsText(file);
        }
      }
    }
  });
}

/* ─── API call ─── */
async function callLocalMentor(
  messages: ChatMessage[],
  userText: string,
  user: UserProfile,
  attachment?: AttachmentState
): Promise<string> {
  const payload: any = {
    user: {
      name: user.name || 'Student',
      dream: user.dream || 'a great career',
      year: user.year || 'student',
      branch: user.branch || 'general studies',
      currentStageIndex: user.currentStageIndex || 0,
    },
    messages: messages.map(m => ({ role: m.role, text: m.text })),
    new_message: userText,
    language: getCurrentLang() || 'en',
  };

  if (attachment) {
    payload.attachment_base64 = attachment.base64;
    payload.attachment_type   = attachment.mimeType;
  }

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Mentor API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  if (!data.reply) throw new Error('Empty response from Mentor AI');
  return data.reply;
}

/* ─── Welcome message ─── */
const makeWelcome = (user: UserProfile): ChatMessage => ({
  role: 'ai',
  text: `Hi ${user.name || 'there'}! 👋 I'm your **Dream Spark AI Mentor**. I can help with career planning, study tips, and skill development. I also understand **images, videos, and documents**! Ask me anything about your journey to become a ${user.dream || 'future professional'}. 🚀`,
  ts: Date.now()
});

/* ─── Main Component ─── */
export default function MentorChat({ user, isLight = false }: { user: UserProfile, isLight?: boolean }) {
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `sess_${Date.now()}`);
  const [messages, setMessages] = useState<ChatMessage[]>([makeWelcome(user)]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [attachLoading, setAttachLoading] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('kalamspark_mentor_titles');
    return saved ? JSON.parse(saved) : {};
  });
  const [isListening, setIsListening] = useState(false);
  const [menuOpenSessionId, setMenuOpenSessionId] = useState<string | null>(null);
  const [activeMsgMenu, setActiveMsgMenu] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const raw = await dbService.getMentorHistory(user.id);
      const grouped: Record<string, HistorySession> = {};
      
      raw.forEach((msg: any) => {
        const sid = msg.session_id || 'legacy';
        if (!grouped[sid]) {
          grouped[sid] = {
            sessionId: sid,
            title: '',
            lastTs: new Date(msg.created_at).getTime(),
            messages: []
          };
        }
        grouped[sid].messages.push({
          role: msg.role as 'user' | 'ai',
          text: msg.text,
          ts: new Date(msg.created_at).getTime()
        });
        if (msg.role === 'user' && !grouped[sid].title) {
          grouped[sid].title = msg.text.slice(0, 40) + (msg.text.length > 40 ? '...' : '');
        }
      });

      const sorted = Object.values(grouped).sort((a, b) => b.lastTs - a.lastTs);
      setSessions(sorted);
      
      if (currentSessionId && grouped[currentSessionId]) {
        // If we just loaded history and current session is found, sync it if it's the first load
        // But usually we don't want to overwrite active chat if user is typing
      }
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isTyping) return;

    const userText = input.trim() || (attachment ? `[Analyzing ${attachment.name}]` : '');
    const currentInput = input;
    setInput('');
    const att = attachment;
    setAttachment(null);

    const userMsg: ChatMessage = {
      role: 'user', text: userText, ts: Date.now(),
      attachmentPreview: att?.preview || undefined,
      attachmentName: att?.name,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    
    // Save to DB
    await dbService.saveMentorMessage(user.id, 'user', userText, currentSessionId);

    try {
      const aiText = await callLocalMentor([...messages, userMsg], userText, user, att || undefined);
      const aiMsg: ChatMessage = { role: 'ai', text: aiText, ts: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      await dbService.saveMentorMessage(user.id, 'ai', aiText, currentSessionId);
      loadHistory(); // Refresh sidebar
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMsg: ChatMessage = { role: 'ai', text: "Sorry, I'm having trouble connecting right now. Please try again later.", ts: Date.now() };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(`sess_${Date.now()}`);
    setMessages([makeWelcome(user)]);
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  const selectSession = (session: HistorySession) => {
    setCurrentSessionId(session.sessionId);
    setMessages(session.messages.length > 0 ? session.messages : [makeWelcome(user)]);
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  const handleDeleteSession = async (sid: string) => {
    if (confirm('Delete this chat session?')) {
      try {
        await dbService.deleteMentorSession(user.id, sid);
        setSessions(prev => prev.filter(s => s.sessionId !== sid));
        if (currentSessionId === sid) {
          handleNewChat();
        }
      } catch (err) {
        console.error('Delete failed', err);
      }
    }
  };

  const handleShareSession = (session: HistorySession) => {
    const text = session.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Mentor'}: ${m.text}`)
      .join('\n\n');
    
    if (navigator.share) {
      navigator.share({
        title: `AI Mentor Chat: ${sessionTitles[session.sessionId] || session.title || 'Chat'}`,
        text: text
      }).catch(() => {
        navigator.clipboard.writeText(text);
        alert('Chat content copied to clipboard!');
      });
    } else {
      navigator.clipboard.writeText(text);
      alert('Chat content copied to clipboard!');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachLoading(true);
      try {
        const att = await processAttachment(file);
        setAttachment(att);
      } catch (err) {
        alert('File too large or invalid format.');
      } finally {
        setAttachLoading(false);
      }
    }
  };

  const handleCopyMsg = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleRenameSession = (sid: string, newTitle: string) => {
    const updated = { ...sessionTitles, [sid]: newTitle };
    setSessionTitles(updated);
    localStorage.setItem('kalamspark_mentor_titles', JSON.stringify(updated));
    setEditingSessionId(null);
    setSessions(prev => prev.map(s => s.sessionId === sid ? { ...s, title: newTitle } : s));
  };

  const suggestions = [
    `How do I start learning ${user.branch || 'my subject'}?`,
    `What skills do I need for ${user.dream || 'my dream career'}?`,
    'Create a weekly study plan for me',
    'What projects should I build to get hired?'
  ];

  /* ── Message Actions ── */
  const handleReadAloud = (idx: number, text: string) => {
    if ('speechSynthesis' in window) {
      if (speakingIdx === idx && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setSpeakingIdx(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ''));
      const currentLang = getCurrentLang() || 'en';
      const langMap: Record<string, string> = { 'en': 'en-US', 'ta': 'ta-IN', 'hi': 'hi-IN' };
      
      let lang = langMap[currentLang] || 'en-US';
      // Auto-detect text language based on unicode ranges if the text contains native scripts
      if (/[\u0B80-\u0BFF]/.test(text)) lang = 'ta-IN'; // Tamil
      else if (/[\u0900-\u097F]/.test(text)) lang = 'hi-IN'; // Hindi/Marathi
      else if (/[\u0C00-\u0C7F]/.test(text)) lang = 'te-IN'; // Telugu
      else if (/[\u0C80-\u0CFF]/.test(text)) lang = 'kn-IN'; // Kannada
      else if (/[\u0D00-\u0D7F]/.test(text)) lang = 'ml-IN'; // Malayalam
      else if (/[\u0980-\u09FF]/.test(text)) lang = 'bn-IN'; // Bengali
      
      utterance.lang = lang;
      
      // Explicitly attach the voice object (browsers often ignore the 'lang' string)
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Try exact match first (e.g. 'ta-IN'), then broad match (e.g. 'ta')
        let voice = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
        if (voice) {
          utterance.voice = voice;
        }
      }

      utterance.onend = () => setSpeakingIdx(null);
      window.speechSynthesis.speak(utterance);
      setSpeakingIdx(idx);
    }
  };

  const handleShareMsg = (text: string) => {
    if (navigator.share) {
      navigator.share({ title: 'AI Mentor Chat', text }).catch(() => handleCopyMsg(text));
    } else {
      handleCopyMsg(text);
      alert('Link copied to clipboard!');
    }
  };

  const handleDeleteMsg = (idx: number) => {
    if (confirm('Delete this message?')) {
      setMessages(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const handleEditMsg = (idx: number, text: string) => {
    setInput(text);
    setMessages(prev => prev.slice(0, idx));
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = getCurrentLang() === 'ta' ? 'ta-IN' : 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.start();
  };

  return (
    <div className={`h-[calc(100vh-8rem)] flex relative mentor-container rounded-2xl overflow-hidden border ${isLight ? 'border-zinc-200 bg-white' : 'border-zinc-800/60 bg-zinc-950/40'}`}>
      
      {/* Backdrop overlay (Mobile & Desktop) */}
      {showSidebar && (
        <div 
          className="absolute inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-all animate-in fade-in duration-300"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ── Sidebar (History Page) ── */}
      <div className={`
        absolute inset-y-0 left-0 z-50 transition-all duration-500 ease-out flex flex-col overflow-hidden
        ${showSidebar ? 'w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full'}
        ${isLight 
          ? 'bg-white/80 backdrop-blur-2xl border-r border-white/20 shadow-2xl shadow-black/5' 
          : 'bg-zinc-900/70 backdrop-blur-2xl border-r border-white/5 shadow-2xl shadow-black/40'}
      `}>
        <div className="w-80 h-full flex flex-col p-5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <History size={18} className="text-violet-400" />
              <h2 className={`text-sm font-bold tracking-tight ${isLight ? 'text-zinc-800' : 'text-white'}`}>Chat History</h2>
            </div>
            <button 
              onClick={() => setShowSidebar(false)}
              className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`}
            >
              <X size={16} />
            </button>
          </div>

          <button
            onClick={handleNewChat}
            className={`w-full flex items-center gap-2 px-4 py-3.5 rounded-2xl text-xs font-bold mb-6 transition-all group ${
              isLight 
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-200 hover:bg-violet-700 hover:-translate-y-0.5 active:translate-y-0' 
                : 'bg-violet-600 text-white shadow-lg shadow-violet-950/50 hover:bg-violet-500 hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <Plus size={16} className="transition-transform group-hover:rotate-90" />
            <span>Start New Chat</span>
          </button>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
            <p className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 mb-4 ${isLight ? 'text-zinc-400' : 'text-zinc-600'}`}>Recent Sessions</p>
            {historyLoading && sessions.length === 0 && <div className="p-4 text-center"><Loader2 size={16} className="animate-spin inline text-violet-400" /></div>}
            {sessions.map(s => (
              <div key={s.sessionId} className="group relative">
                <button
                  onClick={() => selectSession(s)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all truncate pr-10 ${
                    currentSessionId === s.sessionId
                      ? isLight ? 'bg-violet-100 text-violet-700 font-medium' : 'bg-violet-500/15 text-violet-300 font-medium'
                      : isLight ? 'text-zinc-600 hover:bg-zinc-200/50' : 'text-zinc-400 hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 pr-6">
                    <MessageSquare size={13} className="shrink-0 opacity-40" />
                    {editingSessionId === s.sessionId ? (
                      <input
                        autoFocus
                        value={editTitleInput}
                        onChange={(e) => setEditTitleInput(e.target.value)}
                        onBlur={() => handleRenameSession(s.sessionId, editTitleInput)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameSession(s.sessionId, editTitleInput)}
                        className="bg-transparent border-b border-violet-500 outline-none w-full py-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate">{sessionTitles[s.sessionId] || s.title || 'Untitled Chat'}</span>
                    )}
                  </div>
                </button>
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenSessionId(menuOpenSessionId === s.sessionId ? null : s.sessionId);
                    }}
                    className={`p-1.5 rounded-lg transition-all ${
                      menuOpenSessionId === s.sessionId 
                        ? 'bg-violet-500/10 text-violet-400 opacity-100' 
                        : 'text-zinc-500 hover:text-violet-400 opacity-40 group-hover:opacity-100'
                    }`}
                  >
                    <MoreVertical size={14} />
                  </button>

                  {menuOpenSessionId === s.sessionId && (
                    <div 
                      className={`absolute right-0 top-full mt-1 w-36 py-1 rounded-xl shadow-xl z-[100] border animate-in fade-in zoom-in-95 duration-100 ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-800 border-zinc-700'
                      }`}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setEditingSessionId(s.sessionId);
                          setEditTitleInput(sessionTitles[s.sessionId] || s.title || '');
                          setMenuOpenSessionId(null);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-violet-500/10 transition-colors ${
                          isLight ? 'text-zinc-700' : 'text-zinc-300'
                        }`}
                      >
                        <Edit2 size={12} /> Rename
                      </button>
                      <button
                        onClick={() => {
                          handleShareSession(s);
                          setMenuOpenSessionId(null);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-violet-500/10 transition-colors ${
                          isLight ? 'text-zinc-700' : 'text-zinc-300'
                        }`}
                      >
                        <Share size={12} /> Share Chat
                      </button>
                      <div className={`h-px my-1 ${isLight ? 'bg-zinc-100' : 'bg-zinc-700'}`} />
                      <button
                        onClick={() => {
                          handleDeleteSession(s.sessionId);
                          setMenuOpenSessionId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className={`flex items-center justify-between px-6 py-4 border-b mentor-header shrink-0 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-zinc-800/60'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-2 rounded-lg transition-colors ${isLight ? 'text-zinc-500 hover:bg-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'}`}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h3 className={`text-sm font-bold truncate ${isLight ? 'text-zinc-800' : 'text-white'}`}>AI Mentor</h3>
              <p className={`text-[10px] truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>Personal Guide · {user.dream || 'Discovery'}</p>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className={`flex-1 overflow-y-auto space-y-4 p-5 mentor-chat-area no-scrollbar ${isLight ? 'bg-white' : 'bg-zinc-950/20'}`}
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 sm:gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} fade-up mb-2 group`}>
              <div className={`hidden sm:flex w-8 h-8 rounded-lg shrink-0 items-center justify-center ${
                msg.role === 'user' 
                  ? 'bg-violet-600 text-white shadow-lg' 
                  : isLight 
                    ? 'bg-violet-100 text-violet-600 border border-violet-200' 
                    : 'bg-zinc-800 border border-zinc-700 text-violet-400'
              }`}>
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className="flex flex-col gap-1 w-full sm:max-w-[80%]">
                {msg.attachmentPreview && (
                  <div className={`rounded-lg overflow-hidden border border-violet-500/20 mb-1 ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                    <img src={msg.attachmentPreview} alt="Attachment" className="max-w-[200px] max-h-[140px] object-cover" />
                  </div>
                )}
                <div
                  className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed ${
                    msg.role === 'user'
                      ? `bg-violet-600/10 border border-violet-500/20 ${isLight ? 'text-zinc-800' : 'text-zinc-100'} rounded-tr-sm ml-auto`
                      : isLight 
                        ? 'bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-tl-sm'
                        : 'bg-zinc-800/40 border border-zinc-700/30 text-zinc-200 rounded-tl-sm'
                  }`}
                  dangerouslySetInnerHTML={{ __html: renderMd(msg.text) }}
                />
                <div className={`flex items-center gap-1 mt-1 opacity-70 group-hover:opacity-100 transition-opacity ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <button onClick={() => handleCopyMsg(msg.text)} title="Copy" className="p-1 text-zinc-500 hover:text-violet-400">
                    <Copy size={11} />
                  </button>
                  {msg.role === 'ai' && (
                    <>
                      <button onClick={() => handleReadAloud(i, msg.text)} title="Listen" className={`p-1 transition-colors ${speakingIdx === i ? 'text-violet-400' : 'text-zinc-500 hover:text-violet-400'}`}>
                        {speakingIdx === i ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      </button>
                      <button onClick={() => handleShareMsg(msg.text)} title="Share" className="p-1 text-zinc-500 hover:text-violet-400">
                        <Share2 size={11} />
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDeleteMsg(i)} title="Delete" className="p-1 text-zinc-500 hover:text-red-400">
                    <Trash2 size={11} />
                  </button>
                  {msg.role === 'user' && (
                    <button onClick={() => handleEditMsg(i, msg.text)} title="Edit" className="p-1 text-zinc-500 hover:text-violet-400">
                      <Edit2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-4 fade-up">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-violet-400">
                <Bot size={14} />
              </div>
              <div className={`px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2 ${isLight ? 'bg-zinc-50 border border-zinc-200' : 'bg-zinc-800/40 border border-zinc-700/30'}`}>
                <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}

          {messages.length <= 1 && !isTyping && (
            <div className="pt-4 max-w-lg mx-auto">
              <div className={`mb-6 p-5 rounded-2xl border ${isLight ? 'bg-violet-50 border-violet-100' : 'bg-violet-500/5 border-violet-500/10'}`}>
                <p className={`text-xs font-bold mb-4 flex items-center gap-2 ${isLight ? 'text-violet-600' : 'text-violet-300'}`}>
                  <Sparkles size={14} /> Suggestions to start:
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(s)}
                      className={`text-left px-4 py-2.5 rounded-xl text-xs transition-all ${isLight ? 'bg-white hover:bg-violet-100 text-zinc-600 border border-zinc-100' : 'bg-zinc-800/40 hover:bg-zinc-800 text-zinc-400 border border-transparent'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`p-4 border-t mentor-input-wrapper shrink-0 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-zinc-800/60'}`}>
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {attachment && (
              <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-lg self-start">
                <FileText size={14} className="text-violet-400" />
                <span className="text-[11px] text-violet-300 truncate max-w-[200px]">{attachment.name}</span>
                <button onClick={() => setAttachment(null)} className="text-red-400 hover:text-red-300 ml-2"><X size={14} /></button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept={ACCEPTED_FILES}
              />
              
              {/* Unified Input Box Wrapper */}
              <div className={`flex-1 flex items-center min-w-0 rounded-2xl border transition-all ${
                isLight 
                  ? 'bg-white border-zinc-200 focus-within:border-violet-400 shadow-sm' 
                  : 'bg-zinc-800/60 border-zinc-700/50 focus-within:border-violet-500/50'
              }`}>
                
                {/* Left Action Buttons */}
                <div className="flex items-center gap-1 pl-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="p-2 rounded-xl text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all shrink-0"
                    title="Attach file"
                  >
                    <Paperclip size={18} />
                  </button>
                  <button 
                    onClick={handleVoiceInput}
                    className={`p-2 rounded-xl transition-all shrink-0 ${
                      isListening 
                        ? 'bg-red-500/20 text-red-400 animate-pulse' 
                        : 'text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10'
                    }`}
                    title="Voice input"
                  >
                    <Mic size={18} />
                  </button>
                </div>

                {/* Text Area */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Message your mentor..."
                  rows={1}
                  className="flex-1 bg-transparent px-3 py-3.5 text-sm focus:outline-none resize-none no-scrollbar min-w-0"
                  style={{ color: isLight ? '#1f2937' : '#ffffff', minHeight: '48px', maxHeight: '150px' }}
                />
              </div>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !attachment) || isTyping}
                className={`w-[48px] h-[48px] shrink-0 rounded-2xl flex items-center justify-center transition-all ${
                  (input.trim() || attachment) && !isTyping 
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 hover:scale-[1.02] active:scale-95' 
                    : 'bg-zinc-800 text-zinc-600'
                }`}
                title="Send message"
              >
                {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className={(input.trim() || attachment) && !isTyping ? "ml-0.5" : ""} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
