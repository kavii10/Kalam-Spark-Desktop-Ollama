/**
 * Resource API Service — Production Ready
 * Multi-source aggregator for Books, Video Lectures, Research Papers, and News.
 * Each category has a waterfall of provider fallbacks so that rate limits
 * on one provider are silently absorbed by the next.
 */

// ─── API Keys ─────────────────────────────────────────────────────────────────
const YOUTUBE_API_KEY   = import.meta.env.VITE_YOUTUBE_API_KEY || '';
const BOOKS_API_KEY     = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';
const NYT_API_KEY       = import.meta.env.VITE_NYT_API_KEY || '';
const NEWSDATA_API_KEY  = import.meta.env.VITE_NEWSDATA_API_KEY || '';
const GNEWS_API_KEY     = import.meta.env.VITE_GNEWS_API_KEY || '';
const CURRENTS_API_KEY  = import.meta.env.VITE_CURRENTS_API_KEY || '';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface BookResource {
  id: string;
  title: string;
  authors: string;
  category: string;
  summary: string;
  /** Direct link to the book page / preview */
  link: string;
  thumbnail?: string;
  /** Which API provided this */
  source: 'google-books' | 'open-library' | 'gutendex';
  /** Whether the full text is freely readable */
  isOpenAccess?: boolean;
}

export interface VideoResource {
  id: string;
  title: string;
  channel: string;
  summary: string;
  /** Direct watch link */
  link: string;
  thumbnail?: string;
  source: 'youtube' | 'khan-academy' | 'mit-ocw';
}

export interface PaperResource {
  id: string;
  title: string;
  authors: string;
  summary: string;
  /** Direct link to the paper page / PDF */
  link: string;
  source: 'arxiv' | 'semantic-scholar';
  publishedYear?: string;
}

export interface NewsResource {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt?: string;
  imageUrl?: string;
}

export interface ResourceData {
  books: BookResource[];
  videos: VideoResource[];
  papers: PaperResource[];
  news: NewsResource[];
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Wraps a fetch with a timeout so hung requests don't block the waterfall. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** Generates a stable, unique id for a resource item. */
function makeId(prefix: string, val: string): string {
  return `${prefix}-${val.slice(0, 40).replace(/\W/g, '-')}`;
}

/** Sanity-check a URL to make absolutely sure it will open properly. */
function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BOOKS
// ══════════════════════════════════════════════════════════════════════════════

// ── Provider 1: Google Books ──────────────────────────────────────────────────
async function fetchGoogleBooks(query: string, maxResults = 20, startIndex = 0): Promise<BookResource[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(maxResults, 40)),
      startIndex: String(startIndex),
      orderBy: 'relevance',
      printType: 'books',
      langRestrict: 'en',
    });
    // Only add key if it's actually configured — an empty key can cause API errors
    if (BOOKS_API_KEY) params.set('key', BOOKS_API_KEY);
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?${params}`
    );
    if (!res.ok) throw new Error(`Google Books ${res.status}`);
    const data = await res.json();
    return (data.items || [])
      .filter((item: any) => item.volumeInfo?.title)
      .map((item: any): BookResource => {
        const info = item.volumeInfo;
        const link =
          info.previewLink?.replace('http://', 'https://') ||
          `https://books.google.com/books?id=${item.id}`;
        return {
          id: makeId('gb', item.id),
          title: info.title || 'Untitled',
          authors: (info.authors || ['Unknown']).join(', '),
          category: (info.categories || ['Education'])[0],
          summary: info.description?.slice(0, 220) || `By ${(info.authors || ['Unknown']).join(', ')}`,
          link,
          thumbnail:
            info.imageLinks?.thumbnail?.replace('http://', 'https://') ||
            info.imageLinks?.smallThumbnail?.replace('http://', 'https://'),
          source: 'google-books',
          isOpenAccess: info.accessInfo?.epub?.isAvailable || false,
        };
      })
      .filter((b: BookResource) => isValidUrl(b.link));
  } catch (e) {
    console.warn('[Books] Google Books failed:', e);
    return [];
  }
}

// ── Relevance checker — ensures a book actually matches the query ─────────────
function isBookRelevant(title: string, subjects: string[], query: string): boolean {
  const queryTerms = query.toLowerCase()
    .replace(/(preparation|guide|textbook|tutorial|career|education|research|news)/gi, '')
    .split(/\s+/)
    .filter(t => t.length > 2);
  if (queryTerms.length === 0) return true;
  const haystack = `${title} ${subjects.join(' ')}`.toLowerCase();
  // At least 1 meaningful query term must appear — avoids being too strict for multi-word career queries
  return queryTerms.some(t => haystack.includes(t));
}

// ── Provider 2: Open Library ──────────────────────────────────────────────────
async function fetchOpenLibrary(query: string, maxResults = 20, startIndex = 0): Promise<BookResource[]> {
  try {
    const cleanQuery = query
      .replace(/(preparation|guide|textbook|tutorial|career|education|research)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const finalQuery = cleanQuery || query;

    const params = new URLSearchParams({
      q: finalQuery,
      limit: String(Math.min(maxResults * 3, 100)), // fetch more, then filter for relevance
      offset: String(startIndex),
      language: 'eng',
      fields: 'key,title,author_name,subject,first_sentence,cover_i,edition_count',
    });
    const res = await fetchWithTimeout(
      `https://openlibrary.org/search.json?${params}`
    );
    if (!res.ok) throw new Error(`Open Library ${res.status}`);
    const data = await res.json();
    return (data.docs || [])
      .filter((doc: any) =>
        doc.title &&
        doc.key &&
        // ← KEY FIX: Reject books that don't match the query at all
        isBookRelevant(doc.title, doc.subject || [], finalQuery)
      )
      .slice(0, maxResults)
      .map((doc: any): BookResource => {
        const key = doc.key.replace('/works/', '');
        const link = `https://openlibrary.org${doc.key}`;
        return {
          id: makeId('ol', key),
          title: doc.title,
          authors: (doc.author_name || ['Unknown']).slice(0, 3).join(', '),
          category: (doc.subject || ['Education'])[0] || 'Education',
          summary:
            (Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence) ||
            `A book about ${finalQuery}`,
          link,
          thumbnail: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : undefined,
          source: 'open-library',
          isOpenAccess: true,
        };
      })
      .filter((b: BookResource) => isValidUrl(b.link));
  } catch (e) {
    console.warn('[Books] Open Library failed:', e);
    return [];
  }
}

// ── Provider 3: Gutendex (Project Gutenberg) ──────────────────────────────────
async function fetchGutendex(query: string, maxResults = 15): Promise<BookResource[]> {
  try {
    const params = new URLSearchParams({ search: query, languages: 'en' });
    const res = await fetchWithTimeout(`https://gutendex.com/books/?${params}`);
    if (!res.ok) throw new Error(`Gutendex ${res.status}`);
    const data = await res.json();
    return (data.results || [])
      // ← KEY FIX: Apply the same relevance filter to Gutenberg results
      .filter((book: any) => isBookRelevant(book.title || '', book.subjects || [], query))
      .slice(0, maxResults)
      .map((book: any): BookResource => {
        const htmlFormat = book.formats?.['text/html'] || book.formats?.['text/html; charset=utf-8'];
        const link = htmlFormat || `https://www.gutenberg.org/ebooks/${book.id}`;
        return {
          id: makeId('gut', String(book.id)),
          title: book.title || 'Untitled',
          authors: (book.authors || []).map((a: any) => a.name).join(', ') || 'Unknown',
          category: (book.subjects || ['Classic Literature'])[0] || 'Classic Literature',
          summary: `A classic book from Project Gutenberg. Subjects: ${(book.subjects || []).slice(0, 3).join(', ') || 'General'}`,
          link,
          thumbnail: book.formats?.['image/jpeg'],
          source: 'gutendex',
          isOpenAccess: true,
        };
      })
      .filter((b: BookResource) => isValidUrl(b.link));
  } catch (e) {
    console.warn('[Books] Gutendex failed:', e);
    return [];
  }
}

/** Aggregate books from all providers, deduplicating by title.
 *  Google Books is by far the most accurate for technical/career queries.
 *  Open Library and Gutenberg are only added when Google Books yields few results,
 *  to avoid their popularity-biased rankings polluting the feed. */
export async function fetchBooks(query: string, maxPerProvider = 15, startIndex = 0): Promise<BookResource[]> {
  // Always fetch from all three in parallel for speed
  const [google, openLib, gut] = await Promise.allSettled([
    fetchGoogleBooks(query, maxPerProvider, startIndex),
    fetchOpenLibrary(query, maxPerProvider, startIndex),
    fetchGutendex(query, maxPerProvider),
  ]);

  const googleBooks = google.status === 'fulfilled' ? google.value : [];
  const openLibBooks = openLib.status === 'fulfilled' ? openLib.value : [];
  const gutBooks = gut.status === 'fulfilled' ? gut.value : [];

  // Prioritise Google Books. Only blend in fallbacks if Google yields < 5 results.
  const all: BookResource[] = googleBooks.length >= 5
    ? googleBooks  // Google is authoritative — don't dilute with popularity-ranked results
    : [
        ...googleBooks,
        ...openLibBooks,
        ...gutBooks,
      ];

  // Deduplicate by normalised title
  const seen = new Set<string>();
  return all.filter(b => {
    const key = b.title.toLowerCase().replace(/\W/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  VIDEO LECTURES
// ══════════════════════════════════════════════════════════════════════════════

// ── Provider 1: YouTube ───────────────────────────────────────────────────────
async function fetchYouTubeVideos(query: string, maxResults = 20): Promise<VideoResource[]> {
  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: String(Math.min(maxResults, 50)),
      order: 'relevance',
      relevanceLanguage: 'en',
      safeSearch: 'strict',
      key: YOUTUBE_API_KEY,
    });
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    const data = await res.json();
    return (data.items || [])
      .filter((item: any) => item.id?.videoId)
      .map((item: any): VideoResource => ({
        id: makeId('yt', item.id.videoId),
        title: item.snippet.title || 'Untitled Video',
        channel: item.snippet.channelTitle || 'Unknown Channel',
        summary: item.snippet.description?.slice(0, 200) || 'Educational video lecture',
        link: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url,
        source: 'youtube',
      }));
  } catch (e) {
    console.warn('[Videos] YouTube failed:', e);
    return [];
  }
}

// ── Provider 2: Khan Academy (curated topic links) ────────────────────────────
async function fetchKhanAcademy(query: string, maxResults = 6): Promise<VideoResource[]> {
  const lower = query.toLowerCase();

  // Extended subject map covering technical and career topics
  const subjectMap: Record<string, { path: string; topics: string[] }> = {
    // Tech / AI / ML
    'machine learning':  { path: 'computing', topics: ['computer-science', 'data-structures', 'computer-programming', 'algorithms'] },
    'artificial intelligence': { path: 'computing', topics: ['computer-science', 'algorithms', 'computer-programming'] },
    'deep learning':     { path: 'computing', topics: ['computer-science', 'linear-algebra', 'calculus', 'statistics'] },
    'neural network':    { path: 'computing', topics: ['computer-science', 'linear-algebra', 'statistics'] },
    'data science':      { path: 'computing', topics: ['statistics', 'linear-algebra', 'computer-programming', 'data-structures'] },
    'python':            { path: 'computing', topics: ['computer-programming', 'computer-science'] },
    'software engineer': { path: 'computing', topics: ['computer-programming', 'computer-science', 'algorithms', 'data-structures'] },
    'software':          { path: 'computing', topics: ['computer-programming', 'computer-science', 'data-structures'] },
    'web dev':           { path: 'computing', topics: ['computer-programming', 'html-css', 'javascript'] },
    'javascript':        { path: 'computing', topics: ['computer-programming'] },
    'algorithm':         { path: 'computing', topics: ['algorithms', 'data-structures', 'computer-science'] },
    'linear algebra':    { path: 'math', topics: ['linear-algebra'] },
    'calculus':          { path: 'math', topics: ['calculus-1', 'calculus-2', 'multivariable-calculus'] },
    'statistics':        { path: 'math', topics: ['statistics-probability', 'ap-statistics'] },
    'probability':       { path: 'math', topics: ['statistics-probability', 'precalculus'] },
    // General tech
    'computing':         { path: 'computing', topics: ['computer-programming', 'computer-science', 'data-structures'] },
    'programming':       { path: 'computing', topics: ['computer-programming', 'computer-science'] },
    'math':              { path: 'math', topics: ['algebra', 'geometry', 'calculus', 'statistics', 'linear-algebra'] },
    'science':           { path: 'science', topics: ['biology', 'chemistry', 'physics', 'cosmology-and-astronomy'] },
    'biology':           { path: 'science', topics: ['ap-biology', 'biology'] },
    'chemistry':         { path: 'science', topics: ['ap-chemistry', 'chemistry'] },
    'physics':           { path: 'science', topics: ['ap-physics-1', 'physics'] },
    'economics':         { path: 'economics-finance-domain', topics: ['microeconomics', 'macroeconomics', 'finance-capital-markets'] },
    'finance':           { path: 'economics-finance-domain', topics: ['personal-finance', 'finance-capital-markets', 'accounting-and-financial-statements'] },
    'history':           { path: 'humanities', topics: ['us-history', 'world-history', 'art-history'] },
    'medicine':          { path: 'test-prep', topics: ['mcat', 'health-and-medicine'] },
    'doctor':            { path: 'test-prep', topics: ['mcat', 'health-and-medicine'] },
    'nurse':             { path: 'test-prep', topics: ['mcat', 'health-and-medicine'] },
    'ias':               { path: 'test-prep', topics: ['civics', 'world-history', 'us-history'] },
    'upsc':              { path: 'test-prep', topics: ['civics', 'economics-finance-domain'] },
    'civics':            { path: 'humanities', topics: ['civics', 'us-government-and-civics'] },
    'governance':        { path: 'humanities', topics: ['civics', 'us-government-and-civics'] },
    'law':               { path: 'humanities', topics: ['us-government-and-civics', 'world-history'] },
    'sat':               { path: 'test-prep', topics: ['sat'] },
    'gre':               { path: 'test-prep', topics: ['gre'] },
  };

  // Find the best matching subject (longest match wins for specificity)
  const matchedSubject = Object.keys(subjectMap)
    .filter(k => lower.includes(k))
    .sort((a, b) => b.length - a.length)[0]; // longest match = most specific

  if (!matchedSubject) return [];

  const subject = subjectMap[matchedSubject];
  const results: VideoResource[] = subject.topics
    .slice(0, maxResults)
    .map(topic => ({
      id: makeId('ka', `${subject.path}-${topic}`),
      title: `Khan Academy: ${topic.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      channel: 'Khan Academy',
      summary: `Free interactive lessons on ${topic.replace(/-/g, ' ')} from Khan Academy. Practice problems, videos, and articles.`,
      link: `https://www.khanacademy.org/${subject.path}/${topic}`,
      thumbnail: undefined,
      source: 'khan-academy' as const,
    }));

  return results.filter(v => isValidUrl(v.link));
}

// ── Provider 3: MIT OCW (via CORS proxy on RSS feed) ─────────────────────────
// MIT OCW RSS is blocked by CORS; route through allorigins.win as a transparent proxy.
async function fetchMITOpenCourseWare(query: string, maxResults = 6): Promise<VideoResource[]> {
  try {
    const targetUrl = encodeURIComponent('https://ocw.mit.edu/feeds/rss/new_courses.xml');
    const proxyUrl = `https://api.allorigins.win/get?url=${targetUrl}`;
    const res = await fetchWithTimeout(proxyUrl, {}, 8000);
    if (!res.ok) throw new Error(`MIT OCW proxy ${res.status}`);
    const json = await res.json();
    const parser = new DOMParser();
    const doc = parser.parseFromString(json.contents || '', 'application/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    const lower = query.toLowerCase();
    const results: VideoResource[] = [];

    for (const item of items) {
      if (results.length >= maxResults) break;
      const title = item.querySelector('title')?.textContent?.trim() || '';
      const desc  = item.querySelector('description')?.textContent?.trim() || '';
      // Get <link> text — in RSS this can be tricky, also try <guid>
      const rawLink = item.querySelector('link')?.nextSibling?.textContent?.trim() ||
                      item.querySelector('guid')?.textContent?.trim() || '';
      const link = rawLink.startsWith('http') ? rawLink : '';

      // Only include if the course title or description actually matches the query
      const matches =
        title.toLowerCase().includes(lower) ||
        desc.toLowerCase().includes(lower);

      if (matches && link && isValidUrl(link)) {
        results.push({
          id: makeId('mit', link),
          title: title || 'MIT OpenCourseWare Course',
          channel: 'MIT OpenCourseWare',
          summary: desc.replace(/<[^>]*>/g, '').slice(0, 220) || 'Free MIT course materials',
          link,
          source: 'mit-ocw',
        });
      }
    }

    return results;
  } catch (e) {
    console.warn('[Videos] MIT OCW failed:', e);
    return []; // Fix: removed hardcoded CS fallbacks
  }
}

/** Aggregate videos from all providers, deduplicating strictly by videoId. */
export async function fetchVideos(query: string, maxPerProvider = 20): Promise<VideoResource[]> {
  const [yt, ka, mit] = await Promise.allSettled([
    fetchYouTubeVideos(query, maxPerProvider),
    fetchKhanAcademy(query, 6),
    fetchMITOpenCourseWare(query, 4),
  ]);

  const all: VideoResource[] = [
    ...(yt.status === 'fulfilled' ? yt.value : []),
    ...(ka.status === 'fulfilled' ? ka.value : []),
    ...(mit.status === 'fulfilled' ? mit.value : []),
  ];

  // Deduplicate by the actual YouTube videoId to prevent same video appearing multiple times
  const seenIds  = new Set<string>();
  const seenLinks = new Set<string>();
  return all.filter(v => {
    // Extract videoId from YouTube URLs
    const videoIdMatch = v.link.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    if (videoId) {
      if (seenIds.has(videoId)) return false;
      seenIds.add(videoId);
    } else {
      if (seenLinks.has(v.link)) return false;
      seenLinks.add(v.link);
    }
    return true;
  }).slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════════
//  RESEARCH PAPERS
// ══════════════════════════════════════════════════════════════════════════════

// ── Provider 1: arXiv (keyword search in title + abstract) ────────────────
async function fetchArxiv(query: string, maxResults = 15, startIndex = 0): Promise<PaperResource[]> {
  // Strip noise words, then build a title+abstract OR expression for each term
  // This gives broad coverage while staying relevant (a paper must mention each key term)
  const cleanQ = query.replace(/(preparation|guide|tutorial|career|education|news)/gi, '').trim();
  const terms = cleanQ.split(/\s+/).filter(t => t.length > 2);
  const keywordExpr = terms.length > 1
    ? terms.map(t => `ti:${t}+OR+abs:${t}`).join('+AND+')
    : `all:${cleanQ}`;

  try {
    const apiUrl = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(keywordExpr)}&start=${startIndex}&max_results=${Math.min(maxResults, 25)}&sortBy=relevance&sortOrder=descending`;
    // Use a CORS proxy since arXiv blocks browser origin requests
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
    const res = await fetchWithTimeout(proxyUrl, {}, 12000);
    if (!res.ok) throw new Error(`arXiv proxy ${res.status}`);
    const json = await res.json();
    if (!json.contents) throw new Error('arXiv proxy empty response');
    const parser = new DOMParser();
    const doc = parser.parseFromString(json.contents, 'application/xml');
    const entries = Array.from(doc.querySelectorAll('entry'));

    if (entries.length === 0) throw new Error('arXiv: no entries returned');

    return entries
      .map((entry): PaperResource => {
        const rawId = entry.querySelector('id')?.textContent?.trim() || '';
        const title = entry.querySelector('title')?.textContent?.trim().replace(/\s+/g, ' ') || 'Untitled';
        const summary = entry.querySelector('summary')?.textContent?.trim().slice(0, 300) || '';
        const authors = Array.from(entry.querySelectorAll('author name'))
          .map(n => n.textContent?.trim())
          .filter(Boolean)
          .slice(0, 4)
          .join(', ');
        const published = entry.querySelector('published')?.textContent?.slice(0, 4) || '';
        const absLink = rawId.replace('http://', 'https://');

        return {
          id: makeId('arxiv', rawId),
          title,
          authors,
          summary,
          link: absLink || `https://arxiv.org/search/?query=${encodeURIComponent(query)}&searchtype=all`,
          source: 'arxiv',
          publishedYear: published,
        };
      })
      .filter(p => isValidUrl(p.link));
  } catch (e) {
    console.warn('[Papers] arXiv failed:', e);
    return [];
  }
}

// ── Provider 2: Semantic Scholar (via CORS proxy fallback) ────────────────────
async function fetchSemanticScholar(query: string, maxResults = 12, startIndex = 0): Promise<PaperResource[]> {
  const tryFetch = async (useProxy: boolean) => {
    const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${Math.min(maxResults, 25)}&offset=${startIndex}&fields=title,authors,abstract,year,url,openAccessPdf`;
    const url = useProxy
      ? `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`
      : apiUrl;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`);
    const raw = await res.json();
    const data = useProxy ? JSON.parse(raw.contents || '{}') : raw;
    return data.data || [];
  };

  try {
    let papers: any[] = [];
    try {
      papers = await tryFetch(false); // try direct first
    } catch {
      papers = await tryFetch(true);  // fall back to proxy
    }

    return papers
      .filter((p: any) => p.title)
      .map((p: any): PaperResource => {
        const link =
          p.openAccessPdf?.url ||
          p.url ||
          `https://www.semanticscholar.org/paper/${p.paperId}`;
        return {
          id: makeId('ss', p.paperId || p.title),
          title: p.title,
          authors: (p.authors || [])
            .slice(0, 4)
            .map((a: any) => a.name)
            .join(', ') || 'Unknown',
          summary: p.abstract?.slice(0, 300) || 'Research paper from Semantic Scholar',
          link,
          source: 'semantic-scholar',
          publishedYear: p.year ? String(p.year) : undefined,
        };
      })
      .filter((p: PaperResource) => isValidUrl(p.link));
  } catch (e) {
    console.warn('[Papers] Semantic Scholar failed:', e);
    return [];
  }
}

// ── Provider 3: Crossref (no CORS issues, broad keyword search) ──────────────
// Crossref has proper CORS headers and returns DOI-linked papers from all fields.
async function fetchCrossref(query: string, maxResults = 10, startIndex = 0): Promise<PaperResource[]> {
  try {
    const params = new URLSearchParams({
      query,
      rows: String(Math.min(maxResults, 20)),
      offset: String(startIndex),
      select: 'DOI,title,author,abstract,published,URL,is-referenced-by-count',
      sort: 'relevance',
    });
    const res = await fetchWithTimeout(
      `https://api.crossref.org/works?${params}`,
      {},
      9000
    );
    if (!res.ok) throw new Error(`Crossref ${res.status}`);
    const data = await res.json();

    return (data.message?.items || [])
      .filter((item: any) => item.title?.[0] && item.DOI)
      .map((item: any): PaperResource => {
        const link = item.URL || `https://doi.org/${item.DOI}`;
        const authors = (item.author || [])
          .slice(0, 4)
          .map((a: any) => [a.given, a.family].filter(Boolean).join(' '))
          .join(', ') || 'Unknown';
        const year = item.published?.['date-parts']?.[0]?.[0];
        return {
          id: makeId('cr', item.DOI),
          title: item.title[0],
          authors,
          summary: item.abstract
            ? item.abstract.replace(/<[^>]*>/g, '').slice(0, 300)
            : `Published ${year || ''} · ${item['is-referenced-by-count'] || 0} citations`,
          link,
          source: 'semantic-scholar' as const, // reuse badge style
          publishedYear: year ? String(year) : undefined,
        };
      })
      .filter((p: PaperResource) => isValidUrl(p.link));
  } catch (e) {
    console.warn('[Papers] Crossref failed:', e);
    return [];
  }
}

/** Aggregate research papers from arXiv + Semantic Scholar + Crossref.
 *  Crossref has no CORS issues so it serves as a guaranteed fallback. */
export async function fetchPapers(query: string, maxPerProvider = 12, startIndex = 0): Promise<PaperResource[]> {
  const [arxiv, ss, cr] = await Promise.allSettled([
    fetchArxiv(query, maxPerProvider, startIndex),
    fetchSemanticScholar(query, maxPerProvider, startIndex),
    fetchCrossref(query, 8, startIndex),
  ]);

  const all: PaperResource[] = [
    ...(arxiv.status === 'fulfilled' ? arxiv.value : []),
    ...(ss.status   === 'fulfilled' ? ss.value   : []),
    ...(cr.status   === 'fulfilled' ? cr.value   : []),
  ];

  const seen = new Set<string>();
  return all.filter(p => {
    const key = p.title.toLowerCase().replace(/\W/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEWS
// ══════════════════════════════════════════════════════════════════════════════

// ── Provider 1: NewsData.io ───────────────────────────────────────────────────
async function fetchNewsData(query: string, maxResults = 10): Promise<NewsResource[]> {
  try {
    const params = new URLSearchParams({
      apikey: NEWSDATA_API_KEY,
      q: query,
      language: 'en',
      category: 'education,science,technology',
    });
    const res = await fetchWithTimeout(
      `https://newsdata.io/api/1/news?${params}`
    );
    if (!res.ok) throw new Error(`NewsData ${res.status}`);
    const data = await res.json();
    if (data.status !== 'success') throw new Error('NewsData non-success');

    return (data.results || [])
      .filter((a: any) => a.title && a.link)
      .slice(0, maxResults)
      .map((a: any): NewsResource => ({
        id: makeId('nd', a.article_id || a.link),
        title: a.title,
        summary: a.description?.slice(0, 220) || a.content?.slice(0, 220) || '',
        link: a.link,
        source: a.source_id || 'NewsData.io',
        publishedAt: a.pubDate,
        imageUrl: a.image_url || undefined,
      }))
      .filter((n: NewsResource) => isValidUrl(n.link));
  } catch (e) {
    console.warn('[News] NewsData.io failed:', e);
    return [];
  }
}

// ── Provider 2: GNews ─────────────────────────────────────────────────────────
async function fetchGNews(query: string, maxResults = 10): Promise<NewsResource[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      lang: 'en',
      max: String(Math.min(maxResults, 10)),
      token: GNEWS_API_KEY,
    });
    const res = await fetchWithTimeout(
      `https://gnews.io/api/v4/search?${params}`
    );
    if (!res.ok) throw new Error(`GNews ${res.status}`);
    const data = await res.json();

    return (data.articles || [])
      .filter((a: any) => a.title && a.url)
      .map((a: any): NewsResource => ({
        id: makeId('gn', a.url),
        title: a.title,
        summary: a.description?.slice(0, 220) || '',
        link: a.url,
        source: a.source?.name || 'GNews',
        publishedAt: a.publishedAt,
        imageUrl: a.image || undefined,
      }))
      .filter((n: NewsResource) => isValidUrl(n.link));
  } catch (e) {
    console.warn('[News] GNews failed:', e);
    return [];
  }
}

// ── Provider 3: New York Times ────────────────────────────────────────────────
async function fetchNYT(query: string, maxResults = 10): Promise<NewsResource[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      'api-key': NYT_API_KEY,
      sort: 'relevance',
      fl: 'headline,abstract,web_url,pub_date,multimedia,source',
    });
    const res = await fetchWithTimeout(
      `https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`
    );
    if (!res.ok) throw new Error(`NYT ${res.status}`);
    const data = await res.json();

    return (data.response?.docs || [])
      .filter((a: any) => a.headline?.main && a.web_url)
      .slice(0, maxResults)
      .map((a: any): NewsResource => {
        const imageObj = Array.isArray(a.multimedia)
          ? a.multimedia.find((m: any) => m.subtype === 'thumbnail' || m.subtype === 'xlarge')
          : undefined;
        return {
          id: makeId('nyt', a._id || a.web_url),
          title: a.headline.main,
          summary: a.abstract?.slice(0, 220) || a.snippet?.slice(0, 220) || '',
          link: a.web_url,
          source: a.source || 'The New York Times',
          publishedAt: a.pub_date,
          imageUrl: imageObj ? `https://www.nytimes.com/${imageObj.url}` : undefined,
        };
      })
      .filter((n: NewsResource) => isValidUrl(n.link));
  } catch (e) {
    console.warn('[News] NYT failed:', e);
    return [];
  }
}

// ── Provider 4: Currents API ──────────────────────────────────────────────────
async function fetchCurrentsNews(query: string, maxResults = 10): Promise<NewsResource[]> {
  try {
    const params = new URLSearchParams({
      keywords: query,
      language: 'en',
      apiKey: CURRENTS_API_KEY,
    });
    const res = await fetchWithTimeout(
      `https://api.currentsapi.services/v1/search?${params}`
    );
    if (!res.ok) throw new Error(`Currents ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('Currents non-ok');

    return (data.news || [])
      .filter((a: any) => a.title && a.url)
      .slice(0, maxResults)
      .map((a: any): NewsResource => ({
        id: makeId('cur', a.id || a.url),
        title: a.title,
        summary: a.description?.slice(0, 220) || '',
        link: a.url,
        source: a.author || 'Currents API',
        publishedAt: a.published,
        imageUrl: a.image && isValidUrl(a.image) ? a.image : undefined,
      }))
      .filter((n: NewsResource) => isValidUrl(n.link));
  } catch (e) {
    console.warn('[News] Currents failed:', e);
    return [];
  }
}

/** Aggregate news with a multi-provider waterfall.
 *  Tries providers in priority order; falls back gracefully on any rate-limit or error. */
export async function fetchNews(query: string, maxPerProvider = 8): Promise<NewsResource[]> {
  const [nd, gn, nyt, cur] = await Promise.allSettled([
    fetchNewsData(query, maxPerProvider),
    fetchGNews(query, maxPerProvider),
    fetchNYT(query, maxPerProvider),
    fetchCurrentsNews(query, maxPerProvider),
  ]);

  const all: NewsResource[] = [
    ...(nd.status === 'fulfilled' ? nd.value : []),
    ...(gn.status === 'fulfilled' ? gn.value : []),
    ...(nyt.status === 'fulfilled' ? nyt.value : []),
    ...(cur.status === 'fulfilled' ? cur.value : []),
  ];

  const seen = new Set<string>();
  return all.filter(n => {
    if (seen.has(n.link)) return false;
    seen.add(n.link);
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CURRENT AFFAIRS (IAS/UPSC dedicated)
// ══════════════════════════════════════════════════════════════════════════════

/** Check if a dream career is IAS/UPSC/civil-services related */
export function isUpscDream(dream: string): boolean {
  const lower = dream.toLowerCase();
  return ['ias', 'upsc', 'civil service', 'civil servant', 'administrative', 'bureaucrat', 'collector', 'magistrate'].some(k => lower.includes(k));
}

/** Fetch today's current affairs for IAS/UPSC aspirants from news APIs */
export async function fetchCurrentAffairs(maxItems = 3): Promise<{ title: string; link: string; source: string }[]> {
  const queries = ['India government policy', 'PIB press release India', 'UPSC current affairs today'];
  const results: { title: string; link: string; source: string }[] = [];

  for (const q of queries) {
    if (results.length >= maxItems) break;
    try {
      // Try NewsData.io first
      if (NEWSDATA_API_KEY) {
        const params = new URLSearchParams({
          apikey: NEWSDATA_API_KEY, q, language: 'en', country: 'in',
        });
        const res = await fetchWithTimeout(`https://newsdata.io/api/1/news?${params}`, {}, 6000);
        if (res.ok) {
          const data = await res.json();
          for (const a of (data.results || []).slice(0, maxItems - results.length)) {
            if (a.title && a.link) results.push({ title: a.title, link: a.link, source: a.source_id || 'NewsData' });
          }
        }
      }
      // Fallback: GNews
      if (results.length < maxItems && GNEWS_API_KEY) {
        const params = new URLSearchParams({ q, lang: 'en', country: 'in', max: '3', token: GNEWS_API_KEY });
        const res = await fetchWithTimeout(`https://gnews.io/api/v4/search?${params}`, {}, 6000);
        if (res.ok) {
          const data = await res.json();
          for (const a of (data.articles || []).slice(0, maxItems - results.length)) {
            if (a.title && a.url) results.push({ title: a.title, link: a.url, source: a.source?.name || 'GNews' });
          }
        }
      }
    } catch { /* silently continue */ }
  }

  return results.slice(0, maxItems);
}

/**
 * Clean a subject string by stripping parenthetical content and keeping only
 * the first 3–4 meaningful words, so APIs like Google Books get clean short queries.
 * e.g. "Infographic Design Principles (Data-Ink Ratio)" → "Infographic Design Principles"
 */
function cleanQueryTerm(term: string): string {
  return term
    .replace(/\(.*?\)/g, '')      // strip parenthetical e.g. "(Data-Ink Ratio)"
    .replace(/[^\w\s-]/g, ' ')   // remove special chars
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)                 // keep max 4 words
    .join(' ');
}

/**
 * Fetch all resource categories for a given career/stage context.
 * Guarantees at least 10 results per category by running multiple
 * parallel subject queries and merging + deduplicating results.
 */
export async function fetchDirectResources(
  dream: string,
  stageTopic: string,
  subjects: string[],
  level: string,
  page: number = 0
): Promise<ResourceData> {
  // Build clean, short query terms for each subject to maximise API hit rate
  const cleanDream   = cleanQueryTerm(dream);
  const cleanTopic   = cleanQueryTerm(stageTopic);
  const cleanSubjects = subjects.slice(0, 3).map(cleanQueryTerm).filter(Boolean);

  // Unique query pool: topic first, then each subject, then just the career name
  const queryPool = [...new Set([cleanTopic, ...cleanSubjects, cleanDream])].filter(Boolean);

  // ── Books: fetch from top 2 queries in parallel to ensure 10+ results ────
  const bookFetches = queryPool.slice(0, 2).map(q => fetchBooks(q, 12, 0));
  const bookResults = await Promise.allSettled(bookFetches);
  const seenBookLinks = new Set<string>();
  const mergedBooks: BookResource[] = [];
  for (const r of bookResults) {
    if (r.status === 'fulfilled') {
      for (const b of r.value) {
        if (!seenBookLinks.has(b.link) && mergedBooks.length < 10) {
          seenBookLinks.add(b.link);
          mergedBooks.push(b);
        }
      }
    }
  }

  // ── Videos: use the primary topic query, request 20 so after filtering we have 10 ──
  const videoQuery = `${cleanTopic} ${cleanDream} tutorial learn`.trim();

  // ── Papers: use the first clean subject, cap at 10 ────────────────────────
  const paperQuery = `${cleanTopic} ${cleanDream}`.trim();

  // ── News: use the career name for relevance ───────────────────────────────
  const newsQuery = `${cleanDream} ${cleanTopic}`.trim();

  const [videos, papers, news] = await Promise.allSettled([
    fetchVideos(videoQuery, 20),
    fetchPapers(paperQuery, 12, 0),
    fetchNews(newsQuery, 12),
  ]);

  return {
    books:  mergedBooks,
    videos: (videos.status === 'fulfilled' ? videos.value : []).slice(0, 10),
    papers: (papers.status === 'fulfilled' ? papers.value : []).slice(0, 10),
    news:   (news.status   === 'fulfilled' ? news.value   : []).slice(0, 10),
  };
}

/**
 * General-purpose search across all resource types.
 * Performs a strict search on the exact terms entered by the user.
 */
export async function searchAllResources(query: string, userDream = ''): Promise<ResourceData> {
  const [books, videos, papers, news] = await Promise.allSettled([
    fetchBooks(query, 10),
    fetchVideos(query, 10),
    fetchPapers(query, 8),
    fetchNews(query, 6),
  ]);

  return {
    books:  books.status  === 'fulfilled' ? books.value  : [],
    videos: videos.status === 'fulfilled' ? videos.value : [],
    papers: papers.status === 'fulfilled' ? papers.value : [],
    news:   news.status   === 'fulfilled' ? news.value   : [],
  };
}
