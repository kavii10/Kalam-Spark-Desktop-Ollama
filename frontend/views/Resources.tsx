import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, Youtube, Newspaper, FlaskConical, Search, RefreshCw,
  ExternalLink, Loader2, ChevronLeft, ChevronRight, AlertCircle,
  X, Library, GraduationCap, Atom, Rss, Bookmark, Plus, ListVideo, FolderPlus, Check, Trash2, Volume2
} from 'lucide-react';
import { UserProfile, CareerRoadmap } from '../types';
import {
  fetchDirectResources, searchAllResources,
  BookResource, VideoResource, PaperResource, NewsResource, ResourceData
} from '../resourceApiService';
import { dbService } from '../dbService';
import { useNavigate } from 'react-router-dom';

// ─── Glassmorphism card base style ─────────────────────────────────────────────
const gc: React.CSSProperties = {
  background: 'rgba(6,3,18,0.45)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,140,66,0.22)',
  borderRadius: 14,
};

// ─── Source badge colours ───────────────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  'google-books':    '#4285F4',
  'open-library':    '#16a34a',
  'gutendex':        '#7c3aed',
  'youtube':         '#ef4444',
  'khan-academy':    '#16a34a',
  'mit-ocw':         '#6366f1',
  'arxiv':           '#e85d04',
  'semantic-scholar':'#0ea5e9',
  'nyt':             '#000000',
};

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] || '#888';
  const labels: Record<string, string> = {
    'google-books':     'Google Books',
    'open-library':     'Open Library',
    'gutendex':         'Gutenberg',
    'youtube':          'YouTube',
    'khan-academy':     'Khan Academy',
    'mit-ocw':          'MIT OCW',
    'arxiv':            'arXiv',
    'semantic-scholar': 'Semantic Scholar',
  };
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {labels[source] || source}
    </span>
  );
}

// ─── Horizontal scroll row ──────────────────────────────────────────────────────
function ScrollRow({
  title, icon: Icon, iconColor, items, renderCard, emptyMsg,
}: {
  title: string; icon: any; iconColor: string; items: any[];
  renderCard: (item: any, idx: number) => React.ReactNode;
  emptyMsg?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') =>
    ref.current?.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gold-300 flex items-center gap-2">
          <Icon size={15} className={iconColor} />
          {title}
          <span className="text-[11px] text-gold-500/35 font-normal ml-1">
            ({items.length})
          </span>
        </h3>
        <div className="flex items-center gap-1">
          {(['left', 'right'] as const).map(dir => (
            <button
              key={dir}
              onClick={() => scroll(dir)}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={{ background: 'rgba(255,140,66,0.08)', border: '1px solid rgba(255,140,66,0.22)', color: '#ff8c42' }}
            >
              {dir === 'left' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto pb-3 scroll-smooth"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,140,66,0.3) transparent' }}
      >
        {items.length === 0 ? (
          <div
            className="flex-shrink-0 w-56 h-36 flex flex-col items-center justify-center rounded-xl gap-2"
            style={{ border: '1px dashed rgba(255,140,66,0.18)' }}
          >
            <AlertCircle size={18} className="text-gold-500/30" />
            <p className="text-xs text-gold-500/35">{emptyMsg || 'No results found'}</p>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex-shrink-0 w-64">{renderCard(item, i)}</div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Book Card ──────────────────────────────────────────────────────────────────
function BookCard({ item }: { item: BookResource }) {
  const navigate = useNavigate();
  const sendToFileSpeaker = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    sessionStorage.setItem('fs_import_url', item.link);
    navigate('/filespeaker');
  };

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="resource-card block rounded-xl overflow-hidden flex flex-col h-[290px] transition-all hover:scale-[1.02] hover:shadow-lg"
      style={gc}
    >
      <div
        className="flex justify-center items-center p-4 h-[120px] shrink-0"
        style={{ background: 'rgba(255,140,66,0.05)', borderBottom: '1px solid rgba(255,140,66,0.12)' }}
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="h-[96px] object-contain rounded shadow-lg"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div
            className="w-16 h-20 rounded flex items-center justify-center"
            style={{ background: 'rgba(255,140,66,0.10)', border: '1px solid rgba(255,140,66,0.25)' }}
          >
            <BookOpen size={24} className="text-gold-400" />
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1 gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SourceBadge source={item.source} />
          {item.isOpenAccess && (
            <span className="text-[9px] text-emerald-400 font-bold uppercase">Free</span>
          )}
        </div>
        <h4 className="resource-card-text text-xs font-semibold text-gold-200 line-clamp-2 leading-snug">
          {item.title}
        </h4>
        <p className="resource-card-text text-[10px] text-gold-500/50 opacity-70 truncate">
          {item.authors}
        </p>
        <div className="flex-1" />
        <div className="flex items-center justify-between mt-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gold-400">
            Open Book <ExternalLink size={9} />
          </span>
          <button onClick={sendToFileSpeaker}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/40 transition-all"
            title="Send to File Speaker">
            <Volume2 size={9} /> Speak
          </button>
        </div>
      </div>
    </a>
  );
}

// ─── Video Card ─────────────────────────────────────────────────────────────────
function VideoCard({ item }: { item: VideoResource }) {
  const navigate = useNavigate();
  const iconColors: Record<string, string> = {
    'youtube': '#ef4444',
    'khan-academy': '#16a34a',
    'mit-ocw': '#6366f1',
  };
  const color = iconColors[item.source] || '#ff8c42';

  const sendToFileSpeaker = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    sessionStorage.setItem('fs_import_url', item.link);
    navigate('/filespeaker');
  };

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="resource-card block rounded-xl overflow-hidden flex flex-col h-[290px] group transition-all hover:scale-[1.02] hover:shadow-lg"
      style={gc}
    >
      <div className="relative h-[130px] shrink-0" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Youtube size={36} style={{ color: `${color}60` }} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg" style={{ background: color }}>
            <Youtube size={18} className="text-white ml-0.5" />
          </div>
        </div>
        <div className="absolute bottom-2 left-2">
          <SourceBadge source={item.source} />
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="resource-card-text text-xs font-semibold text-gold-200 line-clamp-2 leading-snug mb-1">
          {item.title}
        </h4>
        <p className="resource-card-text text-[10px] opacity-60 truncate" style={{ color }}>
          {item.channel}
        </p>
        <div className="flex-1" />
        <div className="flex items-center justify-between mt-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color }}>
            Watch Now <ExternalLink size={9} />
          </span>
          <button onClick={sendToFileSpeaker}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/40 transition-all"
            title="Send to File Speaker">
            <Volume2 size={9} /> Speak
          </button>
        </div>
      </div>
    </a>
  );
}

// ─── Research Paper Card ────────────────────────────────────────────────────────
function PaperCard({ item }: { item: PaperResource }) {
  const navigate = useNavigate();
  const sendToFileSpeaker = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    sessionStorage.setItem('fs_import_url', item.link);
    navigate('/filespeaker');
  };

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="resource-card block rounded-xl overflow-hidden flex flex-col h-[260px] transition-all hover:scale-[1.02] hover:shadow-lg"
      style={gc}
    >
      <div
        className="p-3 flex items-center gap-2 shrink-0"
        style={{ background: 'rgba(232,93,4,0.06)', borderBottom: '1px solid rgba(232,93,4,0.12)' }}
      >
        <Atom size={14} className="text-orange-400 shrink-0" />
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <SourceBadge source={item.source} />
          {item.publishedYear && (
            <span className="text-[9px] text-gold-500/50">{item.publishedYear}</span>
          )}
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h4 className="resource-card-text text-xs font-semibold text-gold-200 line-clamp-3 leading-snug mb-1">
          {item.title}
        </h4>
        <p className="resource-card-text text-[10px] text-gold-500/50 opacity-70 line-clamp-2 mb-1">
          {item.authors}
        </p>
        <div className="flex-1" />
        <div className="flex items-center justify-between mt-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-orange-400">
            Read Paper <ExternalLink size={9} />
          </span>
          <button onClick={sendToFileSpeaker}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/40 transition-all"
            title="Send to File Speaker">
            <Volume2 size={9} /> Speak
          </button>
        </div>
      </div>
    </a>
  );
}

// ─── News Card ──────────────────────────────────────────────────────────────────
function NewsCard({ item }: { item: NewsResource }) {
  const navigate = useNavigate();
  const sendToFileSpeaker = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    sessionStorage.setItem('fs_import_url', item.link);
    navigate('/filespeaker');
  };

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="resource-card block rounded-xl overflow-hidden flex flex-col h-[220px] transition-all hover:scale-[1.02] hover:shadow-lg"
      style={gc}
    >
      {item.imageUrl && (
        <div className="h-[80px] shrink-0 overflow-hidden">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-5 h-5 rounded flex items-center justify-center shrink-0"
            style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)' }}
          >
            <Newspaper size={10} className="text-emerald-400" />
          </div>
          <span className="text-[9px] text-emerald-400/70 font-medium truncate">{item.source}</span>
        </div>
        <h4 className="resource-card-text text-xs font-semibold text-gold-200 line-clamp-3 leading-snug flex-1">
          {item.title}
        </h4>
        <div className="flex items-center justify-between mt-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
            Read Article <ExternalLink size={9} />
          </span>
          <button onClick={sendToFileSpeaker}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/40 transition-all"
            title="Send to File Speaker">
            <Volume2 size={9} /> Speak
          </button>
        </div>
      </div>
    </a>
  );
}

// ─── Tab types ──────────────────────────────────────────────────────────────────
type Tab = 'books' | 'videos' | 'papers' | 'news' | 'watch-later' | 'playlists';

const TABS: { key: Tab; label: string; icon: any; color: string }[] = [
  { key: 'books',  label: 'Books',           icon: BookOpen,     color: '#f59e0b' },
  { key: 'videos', label: 'Video Lectures',  icon: Youtube,      color: '#ef4444' },
  { key: 'papers', label: 'Research Papers', icon: FlaskConical, color: '#f97316' },
  { key: 'news',   label: 'Industry News',   icon: Newspaper,    color: '#10b981' },
  { key: 'watch-later', label: 'Watch Later', icon: Bookmark,    color: '#3b82f6' },
  { key: 'playlists',   label: 'Playlists',   icon: ListVideo,   color: '#a855f7' },
];


// ─── Resource Actions Helper ──────────────────────────────────────────────────
function ResourceActions({ item, roadmap, onUpdate, inStack = false }: { item: any, roadmap: CareerRoadmap, onUpdate: (rm: CareerRoadmap) => void, inStack?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleExpand = (e: CustomEvent) => {
      if (e.detail !== item.link) setOpen(false);
    };
    window.addEventListener('resource-popover-open', handleExpand as EventListener);
    return () => window.removeEventListener('resource-popover-open', handleExpand as EventListener);
  }, [item.link]);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', clickOutside);
    }
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [open]);

  const isShared = item.link; // mostly we identify by link
  const inWatchLater = roadmap.watchLater?.some((x: any) => x.link === item.link);
  
  const toggleWatchLater = () => {
    const rm = { ...roadmap };
    if (!rm.watchLater) rm.watchLater = [];
    if (inWatchLater) rm.watchLater = rm.watchLater.filter((x: any) => x.link !== item.link);
    else rm.watchLater.push(item);
    onUpdate(rm);
    setOpen(false);
  };

  const addToPlaylist = (plId: string) => {
    const rm = { ...roadmap };
    const pl = rm.playlists?.find(p => p.id === plId);
    if (!pl) return;
    if (!pl.items.some(x => x.link === item.link)) {
        pl.items.push(item);
    }
    onUpdate(rm);
    setOpen(false);
    setShowPlaylists(false);
  };
  
  const createPlaylist = () => {
    if (!newPlName.trim()) return;
    const rm = { ...roadmap };
    if (!rm.playlists) rm.playlists = [];
    rm.playlists.push({ id: Date.now().toString(), name: newPlName.trim(), items: [item] });
    onUpdate(rm);
    setNewPlName('');
    setOpen(false);
    setShowPlaylists(false);
  };

  return (
    <div className={inStack ? "relative z-10" : "absolute top-2 right-2 z-10"} ref={menuRef}>
      <button 
        onClick={(e) => { 
          e.preventDefault(); 
          if (!open) {
            window.dispatchEvent(new CustomEvent('resource-popover-open', { detail: item.link }));
          }
          setOpen(!open); 
          setShowPlaylists(false); 
        }}
        className="w-8 h-8 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/80 text-white border border-white/20 shadow-lg backdrop-blur"
      >
        <Plus size={16} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-48 rounded-xl p-1 bg-[#1a1423] border border-gold-500/20 shadow-2xl flex flex-col gap-1 z-20 popover-menu">
          <button 
            onClick={(e) => { e.preventDefault(); toggleWatchLater(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-gold-200 text-left"
          >
            <Bookmark size={14} className={inWatchLater ? "text-blue-400 fill-blue-400" : ""} /> 
            {inWatchLater ? 'Remove Watch Later' : 'Watch Later'}
          </button>
          
          <div className="h-px bg-white/10 w-full my-1" />
          
          {!showPlaylists ? (
            <button 
              onClick={(e) => { e.preventDefault(); setShowPlaylists(true); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-gold-200 text-left"
            >
              <ListVideo size={14} className="text-purple-400" /> Add to Playlist
            </button>
          ) : (
            <div className="p-2 space-y-2">
               <p className="text-xs text-gold-500/50 mb-1">Select Playlist:</p>
               {roadmap.playlists?.map(pl => (
                 <button key={pl.id} onClick={(e) => { e.preventDefault(); addToPlaylist(pl.id); }} className="block w-full text-left text-xs px-2 py-1.5 hover:bg-white/10 rounded">{pl.name}</button>
               ))}
               <div className="flex gap-1 mt-2">
                 <input 
                   type="text" 
                   placeholder="New playlist..." 
                   value={newPlName} 
                   onChange={e => setNewPlName(e.target.value)}
                   onClick={e => e.preventDefault()}
                   className="flex-1 bg-black/20 text-xs text-gold-200 px-2 py-1 rounded border border-white/10 outline-none"
                 />
                 <button onClick={(e) => { e.preventDefault(); createPlaylist(); }} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30">
                   <Check size={12} />
                 </button>
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function Resources({ user }: { user: UserProfile }) {
  const [activeTab, setActiveTab] = useState<Tab>('books');
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [roadmap, setRoadmap] = useState<CareerRoadmap | null>(null);
  const [data, setData] = useState<ResourceData>({ books: [], videos: [], papers: [], news: [] });
  const isLight = user.settings?.theme === 'light';

  // Keep a stable ref to the latest user to avoid stale closures in callbacks
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Update Roadmap helper – stable via useCallback
  const updateRoadmap = useCallback(async (rm: CareerRoadmap) => {
    setRoadmap(rm);
    await dbService.saveRoadmap(userRef.current, rm);
  }, []);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<ResourceData>({ books: [], videos: [], papers: [], news: [] });
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Fetch curriculum resources ───────────────────────────────────────────────
  const fetchCurriculum = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setSearchMode(false);
    setSearchQuery('');

    const currentUser = userRef.current;

    try {
      let rm = await dbService.getRoadmap(currentUser.id);
      if (!rm) {
        rm = {
          dream: currentUser.dream || 'Professional',
          summary: 'Your personalized roadmap',
          stages: [{
            id: 'fallback-stage-1',
            title: currentUser.dream ? `Foundations of ${currentUser.dream}` : 'Getting Started',
            description: 'Build a strong foundation',
            duration: '2-3 weeks',
            subjects: [currentUser.branch || currentUser.dream || 'Fundamentals'],
            skills: ['Core concepts'],
            projects: ['Starter project'],
            resources: [],
          }],
        };
      }
      setRoadmap(rm);

      const stageIdx = Math.min(currentUser.currentStageIndex, rm.stages.length - 1);
      const stage = rm.stages[stageIdx];
      if (!stage) { setLoading(false); setInitialized(true); return; }

      let cached = rm.cachedResources;

      // ── Cache Logic ──────────────────────────────────────────────────────────
      // Re-fetch ONLY if:
      //   1. No cache exists
      //   2. The user has pivoted careers (dream mismatch)
      //   3. The user has moved to a new stage in the roadmap
      const dreamMismatch = cached?.cachedForDream && cached.cachedForDream !== currentUser.dream;
      const stageMismatch = cached?.cachedForStage !== undefined && cached.cachedForStage !== stageIdx;

      if (!cached || dreamMismatch || stageMismatch) {
        const fetched = await fetchDirectResources(
          currentUser.dream, stage.title, stage.subjects || [], currentUser.year
        );
        cached = {
          books:  (Array.isArray(fetched.books)  ? fetched.books  : []).filter((b: any) => b?.link?.startsWith('http')).slice(0, 10),
          videos: (Array.isArray(fetched.videos) ? fetched.videos : []).filter((v: any) => v?.link?.startsWith('http')).slice(0, 10),
          papers: (Array.isArray(fetched.papers) ? fetched.papers : []).filter((p: any) => p?.link?.startsWith('http')).slice(0, 10),
          news:   (Array.isArray(fetched.news)   ? fetched.news   : []).filter((n: any) => n?.link?.startsWith('http')).slice(0, 10),
          cachedForDream: currentUser.dream,
          cachedForStage: stageIdx,
        } as any;
        rm = { ...rm, cachedResources: cached, _loadMoreCount: 0 };
        await dbService.saveRoadmap(currentUser, rm);
      }

      setRoadmap({ ...rm });
      setData(cached as ResourceData);
    } catch (e) {
      console.error('fetchCurriculum error:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [user.currentStageIndex, user.id, user.dream, user.year, user.branch]);

  useEffect(() => {
    let active = true;
    if (active) fetchCurriculum();
    return () => { active = false; };
  }, [fetchCurriculum]);

  // ── Load next batch — REPLACES current data with fresh resources ─────────────
  const loadNextBatch = useCallback(async () => {
    if (!roadmap || !Array.isArray(roadmap.stages) || roadmap.stages.length === 0) return;
    setLoading(true);
    const currentUser = userRef.current;

    const stageIdx = Math.min(currentUser.currentStageIndex ?? 0, roadmap.stages.length - 1);
    const stage = roadmap.stages[stageIdx];
    if (!stage) {
      setLoading(false);
      return;
    }

    // Rotate through subjects + skills so each click gets fresh unique content
    const subjects = stage.subjects?.length ? stage.subjects : [stage.title];
    const skills   = stage.skills?.length   ? stage.skills   : [];
    const allTerms = [...subjects, ...skills, currentUser.dream].filter(Boolean);
    const loadCount = (roadmap as any)._loadMoreCount || 0;
    const rotatedTerm = allTerms[loadCount % allTerms.length];

    try {
      const fetched = await fetchDirectResources(
        currentUser.dream, rotatedTerm, [rotatedTerm], currentUser.year, 0
      );

      // REPLACE (not append) — show fresh unique set of 10 per category
      const freshData = {
        books:  fetched.books.filter((b: any)  => b.link?.startsWith('http')).slice(0, 10),
        videos: fetched.videos.filter((v: any) => v.link?.startsWith('http')).slice(0, 10),
        papers: fetched.papers.filter((p: any) => p.link?.startsWith('http')).slice(0, 10),
        news:   fetched.news.filter((n: any)   => n.link?.startsWith('http')).slice(0, 10),
        cachedForDream: currentUser.dream,
        cachedForStage: stageIdx,
      };

      const updatedRm = { ...roadmap, cachedResources: freshData as any, _loadMoreCount: loadCount + 1 };
      await dbService.saveRoadmap(currentUser, updatedRm);
      setRoadmap(updatedRm);
      setData(freshData as ResourceData);
    } catch (e) {
      console.error('loadNextBatch error:', e);
    } finally {
      setLoading(false);
    }
  }, [roadmap]);

  // ── Search ────────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) { setSearchMode(false); return; }
    setIsSearching(true);
    setSearchMode(true);
    try {
      // Pass user.dream so news results stay career-relevant even for technical queries
      const results = await searchAllResources(q, user.dream || '');
      setSearchResults(results);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchMode(false);
    setSearchResults({ books: [], videos: [], papers: [], news: [] });
  };

  const displayed = searchMode ? searchResults : data;

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (!initialized || (loading && !roadmap)) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center fade-up gap-4">
        <Loader2 className="animate-spin text-gold-400" size={28} />
        <p className="text-sm text-gold-500/40">Preparing your study center...</p>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center fade-up gap-4">
        <AlertCircle size={32} className="text-gold-500/30" />
        <p className="text-sm text-gold-300">Initializing study center...</p>
        <button onClick={fetchCurriculum} className="btn-primary px-6 py-2 rounded-xl">Retry</button>
      </div>
    );
  }

  if (loadError && !roadmap) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center fade-up gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255,140,66,0.08)', border: '1px solid rgba(255,140,66,0.22)' }}>
          <AlertCircle size={24} className="text-gold-500/40" />
        </div>
        <p className="text-sm text-gold-300/60 font-medium">Couldn't load resources</p>
        <p className="text-xs text-gold-500/35">Check your connection and try again</p>
        <button onClick={fetchCurriculum} className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium">
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    );
  }

  const currentStageIndex = Math.min(user.currentStageIndex, (roadmap?.stages.length || 1) - 1);
  const currentStage = roadmap?.stages[currentStageIndex];

  const currentTabData: Record<string, any[]> = {
    books:  displayed.books || [],
    videos: displayed.videos || [],
    papers: displayed.papers || [],
    news:   displayed.news || [],
    'watch-later': roadmap?.watchLater || [],
    playlists: roadmap?.playlists || [],
  };

  // If everything is truly empty, generate a small fallback to avoid "Empty Screen" feel
  const totalItems = (displayed.books?.length || 0) + (displayed.videos?.length || 0) + (displayed.papers?.length || 0) + (displayed.news?.length || 0);
  if (totalItems === 0 && !searchMode && !loading) {
    // Inject some high-quality fallbacks for the dream/stage
    displayed.books = [
      {
        id: 'fb-book-1',
        title: `Comprehensive Guide to ${user.dream || 'Success'}`,
        authors: 'Kalam Spark Expert Team',
        category: 'Foundations',
        summary: `A foundational overview of key principles and modern practices in ${user.dream || 'your field'}.`,
        link: `https://books.google.com/books?q=${encodeURIComponent(user.dream || '')}`,
        source: 'google-books',
        isOpenAccess: true
      }
    ];
    displayed.videos = [
      {
        id: 'fb-vid-1',
        title: `Introduction to ${currentStage?.title || user.dream}`,
        channel: 'Top Educational Channels',
        summary: `Core concepts and career overview for ${user.dream}.`,
        link: `https://www.youtube.com/results?search_query=${encodeURIComponent(user.dream || '')}+basics`,
        source: 'youtube'
      }
    ];
  }

  return (
    <div className="space-y-6 fade-up">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gold-500/40 font-semibold uppercase tracking-wider mb-1">
            Step {currentStageIndex + 1} · Study Hub
          </p>
          <h2 className="heading-gold font-cinzel text-2xl font-bold">
            {searchMode ? 'Search Results' : (currentStage?.title || 'Study Center')}
          </h2>
          <p className="text-xs text-gold-500/45 mt-1">
            {searchMode
              ? `Showing results for "${searchQuery}"`
              : <>Resources for <span className="text-gold-400">{currentStage?.subjects?.[0] || user.dream}</span></>
            }
          </p>
        </div>

        {/* Stats chips */}
        {!searchMode && (
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Books',  count: data.books.length,  color: '#f59e0b' },
              { label: 'Videos', count: data.videos.length, color: '#ef4444' },
              { label: 'Papers', count: data.papers.length, color: '#f97316' },
              { label: 'News',   count: data.news.length,   color: '#10b981' },
            ].map(s => (
              <div key={s.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: `${s.color}14`, border: `1px solid ${s.color}35`, color: s.color }}
              >
                <span>{s.count}</span>
                <span className="opacity-70">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Search Bar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className="resource-search-bar flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: 'rgba(6,3,18,0.45)', border: '1px solid rgba(255,140,66,0.22)' }}
        >
          <Search size={15} className="text-gold-500/40 shrink-0" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search books, videos, papers, news…"
            className="resource-search-input flex-1 bg-transparent text-sm text-gold-200 placeholder-gold-500/30 outline-none"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="text-gold-500/40 hover:text-gold-300 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="btn-primary flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
          {searchMode && (
            <button
              onClick={clearSearch}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(255,140,66,0.08)', border: '1px solid rgba(255,140,66,0.22)', color: '#ff8c42' }}
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div
        className="resource-tab-bar flex items-center gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar"
        style={{ background: 'rgba(6,3,18,0.4)', border: '1px solid rgba(255,140,66,0.15)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`resource-tab-btn flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-1 justify-center ${
              activeTab === tab.key ? 'resource-tab-active' : 'resource-tab-inactive'
            }`}
            style={activeTab === tab.key ? {
              background: `${tab.color}1a`,
              border: `1px solid ${tab.color}44`,
              color: tab.color,
            } : {
              border: '1px solid transparent',
              color: 'rgba(255,200,100,0.45)',
            }}
          >
            <tab.icon size={13} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            {currentTabData[tab.key]?.length > 0 && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{ background: `${tab.color}25`, color: tab.color }}
              >
                {currentTabData[tab.key].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {isSearching ? (
        <div className="h-40 flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-gold-400" size={24} />
          <p className="text-xs text-gold-500/40">Searching across all sources…</p>
        </div>
      ) : (
        <div className="space-y-0">
          {activeTab === 'books' && (
            <div className="space-y-8">
              <ScrollRow
                title="Books" icon={Library} iconColor="text-amber-400"
                items={displayed.books}
                renderCard={(item, i) => <div key={i} className="relative group"><BookCard item={item} /><ResourceActions item={item} roadmap={roadmap!} onUpdate={updateRoadmap} /></div>}
                emptyMsg="No books found for this topic"
              />
            </div>
          )}

          {activeTab === 'videos' && (
            <div className="space-y-8">
              <ScrollRow
                title="Video Lectures" icon={GraduationCap} iconColor="text-red-400"
                items={displayed.videos}
                renderCard={(item, i) => <div key={i} className="relative group"><VideoCard item={item} /><ResourceActions item={item} roadmap={roadmap!} onUpdate={updateRoadmap} /></div>}
                emptyMsg="No video lectures found"
              />
            </div>
          )}

          {activeTab === 'papers' && (
            <div className="space-y-8">
              <ScrollRow
                title="Research Papers" icon={Atom} iconColor="text-orange-400"
                items={displayed.papers}
                renderCard={(item, i) => <div key={i} className="relative group"><PaperCard item={item} /><ResourceActions item={item} roadmap={roadmap!} onUpdate={updateRoadmap} /></div>}
                emptyMsg="No research papers found"
              />
            </div>
          )}



          {activeTab === 'watch-later' && (
            <div className="space-y-8">
              <ScrollRow
                title="Watch Later" icon={Bookmark} iconColor="text-blue-400"
                items={roadmap?.watchLater || []}
                renderCard={(item, i) => {
                  let CardType: any = BookCard;
                  if (item.source && (item.source === 'youtube' || item.link?.includes('youtube') || item.channel)) CardType = VideoCard;
                  else if (item.authors && item.publishedYear) CardType = PaperCard;
                  else if (item.imageUrl || item.link?.includes('news')) CardType = NewsCard;
                  return (
                          <div key={i} className="relative group">
                            <CardType item={item} />
                            <div className="absolute top-2 left-2 z-10 pointer-events-none">
                              <span className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md bg-black/60 text-white backdrop-blur border border-white/10 shadow-lg" style={{ color: CardType === BookCard ? '#f59e0b' : CardType === VideoCard ? '#ef4444' : CardType === PaperCard ? '#f97316' : '#10b981' }}>
                                {CardType === BookCard ? 'Book' : CardType === VideoCard ? 'Video' : CardType === PaperCard ? 'Paper' : 'News'}
                              </span>
                            </div>
                            <ResourceActions item={item} roadmap={roadmap!} onUpdate={updateRoadmap} />
                          </div>
                        );
                }}
                emptyMsg="No items in Watch Later"
              />
            </div>
          )}


          {activeTab === 'playlists' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl playlist-header-bg" style={{ background: 'rgba(6,3,18,0.4)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div>
                  <h3 className="text-sm font-semibold text-purple-300">Your Playlists</h3>
                  <p className="text-xs text-gold-500/50 mt-1">Organize resources into custom collections</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <input 
                    type="text" 
                    placeholder="New playlist name..." 
                    id="newPlaylistNameInput"
                    className="flex-1 sm:w-48 bg-black/20 text-sm text-gold-200 px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-purple-400/50 transition-colors"
                  />
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      const inp = document.getElementById('newPlaylistNameInput') as HTMLInputElement;
                      if (!inp || !inp.value.trim()) return;
                      const rm = { ...roadmap! };
                      if (!rm.playlists) rm.playlists = [];
                      rm.playlists.push({ id: Date.now().toString(), name: inp.value.trim(), items: [] });
                      updateRoadmap(rm);
                      inp.value = '';
                    }}
                    className="btn-primary flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-purple-600 hover:bg-purple-500"
                    style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)', boxShadow: '0 4px 14px rgba(124,58,237,0.40)' }}
                  >
                    <Plus size={16} /> Create
                  </button>
                </div>
              </div>

              {(!roadmap?.playlists || roadmap.playlists.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-white/5 bg-white/5 gap-3 playlist-empty-bg">
                  <ListVideo size={32} className="text-gold-500/30" />
                  <p className="text-sm text-gold-500/50">No playlists yet. Add resources to playlists first.</p>
                </div>
              ) : (
                roadmap.playlists.map(pl => (
                  <div key={pl.id} className="space-y-4 relative">
                    <ScrollRow
                      title={pl.name} icon={FolderPlus} iconColor="text-purple-400"
                      items={pl.items}
                      renderCard={(item, i) => {
                        let CardType: any = BookCard;
                        if (item.source && (item.source === 'youtube' || item.link?.includes('youtube') || item.channel)) CardType = VideoCard;
                        else if (item.authors && item.publishedYear) CardType = PaperCard;
                        else if (item.imageUrl || item.link?.includes('news')) CardType = NewsCard;
                        
                        return (
                          <div key={i} className="relative group">
                            <CardType item={item} />
                            <div className="absolute top-2 left-2 z-10 pointer-events-none">
                              <span className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md bg-black/60 text-white backdrop-blur border border-white/10 shadow-lg" style={{ color: CardType === BookCard ? '#f59e0b' : CardType === VideoCard ? '#ef4444' : CardType === PaperCard ? '#f97316' : '#10b981' }}>
                                {CardType === BookCard ? 'Book' : CardType === VideoCard ? 'Video' : CardType === PaperCard ? 'Paper' : 'News'}
                              </span>
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1 z-10">
                              <button 
                                  onClick={(e) => { 
                                    e.preventDefault(); 
                                    const rm = {...roadmap!}; 
                                    const targetPl = rm.playlists!.find(p => p.id === pl.id);
                                    if (targetPl) { targetPl.items = targetPl.items.filter(x => x.link !== item.link); updateRoadmap(rm); }
                                  }}
                                  className="w-8 h-8 rounded-full flex items-center justify-center bg-black/60 hover:bg-black/80 text-white border border-white/20 shadow-lg backdrop-blur"
                              >
                                  <Trash2 size={12} className="text-red-400" />
                              </button>
                              <ResourceActions item={item} roadmap={roadmap!} onUpdate={updateRoadmap} inStack={true} />
                            </div>
                          </div>
                        );
                      }}
                      emptyMsg="No items in this playlist"
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'news' && (
            <div className="space-y-8">
              <ScrollRow
                title="Industry News" icon={Rss} iconColor="text-emerald-400"
                items={displayed.news}
                renderCard={(item, i) => <div key={i} className="relative group"><NewsCard item={item} /><ResourceActions item={item} roadmap={roadmap!} onUpdate={updateRoadmap} /></div>}
                emptyMsg="No news articles found"
              />
            </div>
          )}
        </div>
      )}


      {/* ── Load Next Batch ── */}
      {!searchMode && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={loadNextBatch}
            disabled={loading}
            className="btn-primary flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Load More Resources'}
          </button>
        </div>
      )}

      {/* ── Source Credits ── */}
      <div
        className="rounded-xl p-4 flex flex-wrap gap-3 items-center"
        style={{ 
          background: isLight ? 'rgba(211,156,59,0.05)' : 'rgba(6,3,18,0.25)', 
          border: isLight ? '1px solid rgba(211,156,59,0.2)' : '1px solid rgba(255,140,66,0.10)' 
        }}
      >
        <p className={`text-[10px] font-medium uppercase tracking-wider ${isLight ? 'text-amber-700/80' : 'text-gold-500/30'}`}>Powered by:</p>
        {[
          'Google Books', 'Open Library', 'Project Gutenberg',
          'YouTube', 'Khan Academy', 'MIT OCW',
          'arXiv', 'Semantic Scholar',
          'NewsData.io', 'GNews', 'New York Times', 'Currents',
        ].map(src => (
          <span key={src} className={`text-[10px] font-medium ${isLight ? 'text-amber-900/60' : 'text-gold-500/25'}`}>{src}</span>
        ))}
      </div>
    </div>
  );
}
