import {
  CareerRoadmap,
  DailyTask,
  QuizQuestion,
  UserProfile,
  HeroStory,
} from "./types";
import { GoogleGenAI, Type } from "@google/genai";

// ─────────────────────────────────────────────────────────────
//  PRIMARY: Local AI Backend (Crawl4AI + Ollama Gemma4 (gemma4:e4b))
// ─────────────────────────────────────────────────────────────

const getBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  // If we are on a production domain but no backend URL is set, assume same-origin
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  return "http://localhost:8000";
};

const BACKEND_URL = getBackendUrl();
const BACKEND_TIMEOUT_MS = 180_000; 

/**
 * Try to generate roadmap from the local FastAPI + Crawl4AI + Gemma4 backend.
 * Returns null if the backend is unreachable or returns an error.
 */
async function generateRoadmapFromBackend(
  profile: UserProfile,
): Promise<CareerRoadmap | null> {
  try {
    const params = new URLSearchParams({
      dream: profile.dream || "",
      year: profile.year || "Student",
      branch: profile.branch || "General",
      language: localStorage.getItem('kalam_spark_lang') || 'en',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

    const res = await fetch(`${BACKEND_URL}/api/roadmap?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      console.warn(`[RoadmapBackend] HTTP ${res.status}: ${errText}`);
      return null;
    }

    const data = await res.json();

    // Validate the response has the expected shape
    if (
      data &&
      typeof data.dream === "string" &&
      Array.isArray(data.stages) &&
      data.stages.length > 0
    ) {
      console.log(
        `[RoadmapBackend] ✅ Got roadmap from local backend (${data.stages.length} stages, source: ${data._source || "fresh"})`,
      );
      // Strip internal metadata fields before returning to the app
      const { _source, _crawled_sources, _generation_time_s, ...roadmap } = data;
      return roadmap as CareerRoadmap;
    }

    console.warn("[RoadmapBackend] Invalid response shape:", data);
    return null;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn("[RoadmapBackend] Request timed out after 3 minutes");
    } else {
      console.warn("[RoadmapBackend] Backend unreachable:", err?.message || err);
    }
    return null;
  }
}

/**
 * generateRoadmap — Tries local backend first, falls back to Gemini.
 *
 * Flow:
 *   1. Local FastAPI backend (Crawl4AI + Gemma4) → real-data backed roadmap
 *   2. Gemini API fallback → generic but always-available roadmap
 */
export const generateRoadmap = async (
  profile: UserProfile,
): Promise<CareerRoadmap> => {
  // Always use backend (Gemma4)
  console.log("[generateRoadmap] Using local AI backend (Gemma4)...");
  const backendResult = await generateRoadmapFromBackend(profile);
  if (backendResult) {
    return backendResult;
  }
  throw new Error("Backend unavailable. Please check FastAPI server.");
};

export const discoverDream = async (interests: string[], personality: string[]): Promise<any[]> => {
  try {
    const params = new URLSearchParams({
      interests: interests.join(", "),
      personality: personality.join(" | "),
      language: localStorage.getItem('kalam_spark_lang') || 'en'
    });
    const res = await fetch(`${BACKEND_URL}/api/discover_dream?${params}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error("discoverDream API error", err);
  }
  // Fallback if backend fails
  return [
    { dream: 'Software Engineer', subjects: ['Computer Science', 'Logic', 'Mathematics'] },
    { dream: 'Data Scientist', subjects: ['Statistics', 'Python', 'Analysis'] },
    { dream: 'UI/UX Designer', subjects: ['Design', 'Psychology', 'Prototyping'] },
    { dream: 'Product Manager', subjects: ['Business', 'Leadership', 'Communication'] },
    { dream: 'Cybersecurity Specialist', subjects: ['Networking', 'Security', 'Problem Solving'] },
    { dream: 'Digital Marketer', subjects: ['SEO', 'Content', 'Analytics'] },
    { dream: 'Cloud Architect', subjects: ['Infrastructure', 'DevOps', 'Cloud Computing'] },
    { dream: 'Research Scientist', subjects: ['Physics', 'Methods', 'Documentation'] },
    { dream: 'AI Engineer', subjects: ['Machine Learning', 'AI', 'Neural Networks'] },
    { dream: 'Business Analyst', subjects: ['Data', 'Finance', 'Strategy'] },
    { dream: 'Content Creator', subjects: ['Storytelling', 'Video Editing', 'Social Media'] },
    { dream: 'Financial Analyst', subjects: ['Accounting', 'Investment', 'Excel'] }
  ];
};

export const getHeroStory = async (dream: string): Promise<HeroStory> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Tell a very short, exciting story of a real person who became a successful ${dream}. Use simple English for kids. Return JSON with name, role, achievement, summary.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING },
            achievement: { type: Type.STRING },
            summary: { type: Type.STRING },
          },
          required: ["name", "role", "achievement", "summary"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  } catch (e) {
    return {
      name: "A Big Dreamer",
      role: dream,
      achievement: "Success",
      summary: "They worked hard and reached their goal!",
    };
  }
};

export const getDynamicResources = async (
  profile: UserProfile,
  stage: any,
): Promise<any> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `You are Dream Mentor AI. Your task is to recommend REAL educational resources.
  
  USER PROFILE:
  - Dream: ${profile.dream}
  - Current Topic: ${stage.title}
  - Focus Skills: ${(stage.skills || []).join(", ")}
  - Level: ${profile.year}

  STRICT REQUIREMENTS:
  1. VIDEOS: Recommend real, popular YouTube videos/channels for this topic. Use realistic YouTube links (https://www.youtube.com/watch?v=...).
  2. BOOKS: Recommend real books available on Google Books (https://books.google.com/books?id=...) or Open Library. Use real book titles.
  3. NEWS: Recommend recent industry news articles with realistic URLs from major publications.
  
  Return at least 2-3 items per category. Use real resource titles and descriptions.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Recommend high-quality YouTube lectures, Google Books, and recent industry news for a ${profile.year} student learning "${stage.title}" to become a ${profile.dream}. Focus on: ${(stage.subjects || []).join(", ")}.`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            books: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  category: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  link: { type: Type.STRING },
                },
                required: ["title", "link", "summary"],
              },
            },
            videos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  category: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  link: { type: Type.STRING },
                },
                required: ["title", "link", "summary"],
              },
            },
            news: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  link: { type: Type.STRING },
                },
                required: ["title", "link", "summary"],
              },
            },
          },
        },
      },
    });

    const text = response.text?.trim();
    if (!text) return { books: [], videos: [], news: [] };

    const data = JSON.parse(text);
    return data;
  } catch (e) {
    console.error("Resource fetch error:", e);
    return { books: [], videos: [], news: [] };
  }
};

export const getMotivationalQuote = async (dream: string): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `A simple, 1-line quote for a student who wants to be a ${dream}. Use very easy words.`,
    });
    return (
      response.text?.trim() || "You can do it! Just take one step at a time."
    );
  } catch (e) {
    return "Dream big and work hard!";
  }
};

export const getCareerNews = async (dream: string): Promise<any[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Exciting news about ${dream} in simple words for kids.`,
      config: { tools: [{ googleSearch: {} }] },
    });
    return (
      response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    ).map((c) => ({
      title: c.web?.title || "Latest Update",
      link: c.web?.uri || "#",
      summary: "Cool things happening in the world of " + dream,
    }));
  } catch (e) {
    return [];
  }
};

export const generateMicroQuiz = async (
  subject: string,
  tasks: string[] = [],
  stageDetails?: { description?: string; concepts?: string[] }
): Promise<QuizQuestion[]> => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        subject, 
        tasks,
        stage_description: stageDetails?.description || "",
        stage_concepts: stageDetails?.concepts || []
      })
    });
    
    if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (e) {
    console.error("Local Gemma4 quiz generation failed, returning fallback:", e);
  }
  
  // Smart Fallback using Gemini
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `You are a Lead Expert in ${subject}. Create a high-quality 10-question multiple choice quiz.
        
        CONTEXT:
        - Career Field: ${subject}
        - Current Training Focus: ${stageDetails?.description || "General industry standards"}
        - Concepts to Test: ${(stageDetails?.concepts || []).join(", ") || subject}
        - Practical Experience: ${tasks.join(", ")}
        
        REQUIREMENTS:
        1. 10 unique, professional-grade questions.
        2. Scenario-based: Ask how a ${subject} should handle specific situations.
        3. NO generic questions.
        4. Include 4 distinct options and a professional explanation for each.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.NUMBER },
                explanation: { type: Type.STRING },
              },
              required: ["question", "options", "correctAnswer", "explanation"],
            },
          },
        },
      });
      const parsed = JSON.parse(response.text || "[]");
      if (parsed.length > 0) return parsed.slice(0, 10);
    } catch (e) {
      console.error("Gemini fallback quiz generation failed:", e);
    }
  }

  // Final static fallback - made slightly more relevant
  return [
    {
      question: `As a future ${subject}, what is the most effective way to build professional expertise?`,
      options: ["Consistent daily practice", "Reading only once", "Avoiding challenges", "Watching without doing"],
      correctAnswer: 0,
      explanation: "Mastery in any field, especially one like " + subject + ", requires consistent, hands-on application of concepts."
    },
    {
      question: `How should a ${subject} student handle complex new concepts?`,
      options: ["Break them into smaller parts", "Skip them entirely", "Ignore the basics", "Give up immediately"],
      correctAnswer: 0,
      explanation: "Deconstructing complex topics into smaller, manageable chunks is the most efficient way to learn."
    }
  ];
};

export const generateDreamSummary = async (dream: string, branch: string, year: string): Promise<string> => {
  const language = localStorage.getItem('kalam_spark_lang') || 'en';
  
  // Try backend first for consistency
  try {
    const params = new URLSearchParams({ dream, branch, year, language });
    const res = await fetch(`${BACKEND_URL}/api/career_summary?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (data.summary) return data.summary;
    }
  } catch (err) {
    console.warn("Backend summary failed, trying Gemini...");
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Write an inspiring career overview for a ${dream} (focusing on ${branch} for a ${year} student).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentence1: { type: Type.STRING, description: "Exactly what they do (their unique role in society)" },
              sentence2: { type: Type.STRING, description: "Their specific day-to-day work environment or tools" },
              sentence3: { type: Type.STRING, description: "Their 2-3 most critical unique responsibilities" }
            },
            required: ["sentence1", "sentence2", "sentence3"]
          }
        }
      });
      let text = response.text?.trim();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.sentence1 && parsed.sentence2 && parsed.sentence3) {
            let s1 = parsed.sentence1.trim();
            let s2 = parsed.sentence2.trim();
            let s3 = parsed.sentence3.trim();
            if (!s1.match(/[.!?]$/)) s1 += '.';
            if (!s2.match(/[.!?]$/)) s2 += '.';
            if (!s3.match(/[.!?]$/)) s3 += '.';
            return `${s1} ${s2} ${s3}`;
          }
        } catch(e) {}
        
        text = text.replace(/[\*\-\#]/g, '').replace(/Constraint \d+:/gi, '').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return text;
      }
    } catch (e: any) {
      console.error('generateDreamSummary Gemini failed:', e?.message || e);
    }
  }

  // Improved local fallback logic
  const dreamLower = dream.toLowerCase();
  if (dreamLower.includes('engineer') || dreamLower.includes('developer')) {
    return `A ${dream} designs and builds technical solutions that solve complex real-world problems through code and logic. You will spend your days writing high-quality code, debugging systems, and collaborating with teams on platforms like GitHub. Your main duties include architecting software features, optimizing performance, and ensuring system reliability.`;
  } else if (dreamLower.includes('doctor') || dreamLower.includes('health')) {
    return `A ${dream} is a dedicated healthcare provider who diagnoses illnesses and promotes wellness in their community. Your daily work involves clinical examinations, analyzing patient data, and coordinating care with other medical professionals. Your core responsibilities are accurate diagnosis, treatment planning, and patient education.`;
  } else if (dreamLower.includes('teacher') || dreamLower.includes('educator')) {
    return `A ${dream} shapes young minds by making complex subjects accessible, engaging, and deeply meaningful for students. Each day involves lesson planning, delivering dynamic classes, grading assignments, and providing individualized support. Their core responsibilities include curriculum design, student assessment, and fostering a positive classroom environment.`;
  } else {
    return `A ${dream} is a specialized professional who applies expert knowledge in ${branch} to drive innovation and impact every single day. Their daily work involves using industry-standard tools to solve unique challenges and collaborating with diverse teams to achieve project goals. Their core responsibilities include strategic planning, execution of critical tasks, and delivering high-quality, professional results.`;
  }
};
