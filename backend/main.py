"""
main.py — Kalam Spark AI Backend (FastAPI)

Endpoints:
  GET  /health                          — liveness probe
  GET  /api/roadmap                     — generate career roadmap
  WS   /ws/roadmap                      — roadmap with live progress
  POST /api/tasks                       — generate daily tasks
  POST /api/quiz                        — generate quiz
  POST /api/chat                        — AI mentor chat
  POST /api/pivot                       — career pivot analysis
  POST /api/opportunities               — opportunity radar
  DEL  /api/cache                       — clear roadmap cache
  POST /api/filespeaker/upload          — upload document
  POST /api/filespeaker/url             — add URL source
  POST /api/filespeaker/text            — add pasted text
  POST /api/filespeaker/chat            — RAG chat with documents
  POST /api/filespeaker/transform       — AI transformation
  POST /api/filespeaker/podcast         — generate podcast
  POST /api/filespeaker/podcast/interact — podcast interaction
  GET  /api/filespeaker/audio/{file}    — serve audio

Run with: uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import os
import sys
import time
import uuid
from dotenv import load_dotenv
load_dotenv()  # Load .env from backend directory

# Windows asyncio fix — must be before any async imports
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, HTTPException, Query, WebSocket, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager
import subprocess

# ──────────────────────────────────────────────
# Lifespan Events (Auto-start Ollama)
# ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Try to start Ollama automatically if it's not running
    import httpx
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            await client.get("http://localhost:11434/")
        print("[System] Ollama is already running on port 11434.")
    except Exception:
        print("[System] Ollama not detected. Starting 'ollama serve' in background...")
        try:
            creationflags = 0
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NO_WINDOW
            subprocess.Popen(
                ["ollama", "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags
            )
            print("[System] Started 'ollama serve' successfully. It will be ready in a moment.")
        except Exception as e:
            print(f"[System] Failed to start Ollama automatically: {e}. You may need to run 'ollama serve' manually.")
    
    yield
    # We do not kill Ollama on shutdown, leaving it available for subsequent runs.

# (Imports moved inside functions for Lazy Loading/Fast Startup)


# ──────────────────────────────────────────────
# App Setup
# ──────────────────────────────────────────────
app = FastAPI(
    title="Kalam Spark AI Backend",
    description="Career roadmap generation using Crawl4AI + Cloud Gemma4 (OpenRouter/Groq/Gemini)",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS: read from ALLOWED_ORIGINS env var (comma-separated).
# Falls back to permissive local defaults when not set.
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:4173"
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Health Check & Root
# ──────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "ok", "message": "Kalam Spark AI Backend is running"}


@app.get("/health")
async def health_check():
    """Quick health check — verifies backend + Ollama status."""
    from llm_service import check_ollama
    ollama_status = await check_ollama()
    return {
        "status": "ok",
        "backend": "running",
        "ollama": ollama_status,
        "timestamp": time.time(),
    }


# ──────────────────────────────────────────────
# Main Roadmap Endpoint
# ──────────────────────────────────────────────
@app.get("/api/discover_dream")
async def api_discover_dream(interests: str, personality: str, language: str = "en"):
    """Suggest 12 career paths based on interests and personality."""
    try:
        from llm_service import discover_dream_careers
        careers = await discover_dream_careers(interests, personality, language)
        return careers
    except Exception as e:
        print(f"Error in discover_dream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/career_summary")
async def get_career_summary(dream: str, branch: str, year: str, language: str = "en"):
    """Generate a detailed 3-sentence career summary."""
    try:
        from llm_service import generate_career_summary
        summary = await generate_career_summary(dream, branch, year, language)
        return {"summary": summary}
    except Exception as e:
        print(f"Error in get_career_summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/roadmap")
async def get_roadmap(
    dream: str = Query(..., min_length=2, max_length=200, description="The dream career (e.g. 'Machine Learning Engineer')"),
    year: str  = Query("College Student", max_length=100, description="Education level (e.g. '10th Grade', 'College Student')"),
    branch: str = Query("Computer Science", max_length=200, description="Subject/branch of study"),
    force_refresh: bool = Query(False, description="Set true to ignore cache and re-generate"),
):
    """
    Generate a career roadmap for a given dream.
    
    Pipeline:
    1. Check cache (skip if force_refresh=true)
    2. Crawl real career websites using Crawl4AI
    3. Feed crawled data to Ollama Gemma4 (gemma4:e4b)
    4. Return structured CareerRoadmap JSON
    5. Cache result for 7 days
    """
    dream = dream.strip()
    year = year.strip()
    branch = branch.strip()

    from llm_service import generate_roadmap
    from crawler import crawl_career_data
    from cache import get_cached, save_cache

    # ── Step 1: Cache check ──
    if not force_refresh:
        cached = get_cached(dream, year, branch)
        if cached:
            cached["_source"] = "cache"
            return cached

    # ── Step 2: Crawl real career websites ──
    print(f"\n[API] Generating roadmap for: '{dream}' | {year} | {branch}")
    t0 = time.time()

    try:
        crawled_content = await crawl_career_data(dream, branch)
    except Exception as e:
        print(f"[API] Crawl failed: {e}. Continuing with empty context.")
        crawled_content = ""  # LLM can still generate from its own knowledge

    t1 = time.time()
    print(f"[API] Crawl completed in {t1 - t0:.1f}s, content: {len(crawled_content)} chars")

    # ── Step 3: Generate structured roadmap with LLM ──
    try:
        roadmap = await generate_roadmap(dream, year, branch, crawled_content)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Roadmap generation failed: {e}")

    t2 = time.time()
    print(f"[API] LLM generation completed in {t2 - t1:.1f}s")
    print(f"[API] Total time: {t2 - t0:.1f}s")

    # ── Step 4: Save to cache ──
    save_cache(dream, year, branch, roadmap)

    # Add metadata for debugging (frontend ignores unknown fields)
    roadmap["_source"] = "fresh"
    roadmap["_crawled_sources"] = len([l for l in crawled_content.split("### Source:") if l.strip()])
    roadmap["_generation_time_s"] = round(t2 - t0, 1)

    return roadmap


# ──────────────────────────────────────────────
# WebSocket Roadmap Endpoint
# ──────────────────────────────────────────────
@app.websocket("/ws/roadmap")
async def websocket_roadmap(websocket: WebSocket, dream: str, year: str, branch: str, force_refresh: bool = False):
    """
    Generate a career roadmap using WebSockets to stream progress updates to the UI.
    """
    await websocket.accept()
    try:
        from llm_service import generate_roadmap
        from crawler import crawl_career_data
        from cache import get_cached, save_cache
        
        dream = dream.strip()
        year = year.strip()
        branch = branch.strip()

        if not force_refresh:
            cached = get_cached(dream, year, branch)
            if cached:
                cached["_source"] = "cache"
                await websocket.send_json({"type": "progress", "msg": "^ Loaded custom roadmap from cache"})
                await asyncio.sleep(0.5)
                await websocket.send_json({"type": "result", "data": cached})
                return

        await websocket.send_json({"type": "progress", "msg": "⠋ Crawling real career websites for latest trends..."})
        t0 = time.time()
        
        try:
            crawled_content = await crawl_career_data(dream, branch)
        except Exception as e:
            crawled_content = ""

        num_sources = len([l for l in crawled_content.split("### Source:") if l.strip()])
        await websocket.send_json({"type": "progress", "msg": f"✓ Found data from {num_sources} sources. Initializing Gemma4 AI..."})
        await asyncio.sleep(0.5)

        await websocket.send_json({"type": "progress", "msg": "⠋ Architecting 4-stage roadmap..."})
        t1 = time.time()

        roadmap = await generate_roadmap(dream, year, branch, crawled_content)
        save_cache(dream, year, branch, roadmap)

        t2 = time.time()
        roadmap["_source"] = "fresh"
        roadmap["_generation_time_s"] = round(t2 - t0, 1)

        await websocket.send_json({"type": "progress", "msg": "✓ Roadmap generated successfully!"})
        await asyncio.sleep(0.5)
        await websocket.send_json({"type": "result", "data": roadmap})

    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "data": str(e)})
        except RuntimeError:
            pass # Connection already closed by client


# ──────────────────────────────────────────────
# Smart Tasks Endpoint
# ──────────────────────────────────────────────

class TasksRequest(BaseModel):
    dream: str
    current_stage: str
    subjects: list[str]
    count: Optional[int] = 5

@app.post("/api/tasks")
async def get_tasks(req: TasksRequest):
    """Generate 5 actionable daily tasks based on current roadmap stage subjects"""
    from llm_service import generate_tasks
    try:
        tasks = await generate_tasks(req.dream, req.current_stage, req.subjects)
        
        if not isinstance(tasks, list):
            tasks = []
        
        # Post-generation filter for non-tech careers
        tech_terms = ["python", "machine learning", "java", "c++", "javascript", "react", "programming", "coding", "software", "developer", "api"]
        is_tech_dream = any(t in req.dream.lower() for t in ["engineer", "developer", "data", "software", "tech", "computer", "it "])
        
        valid_tasks = []
        for t in tasks:
            if "title" in t and "type" in t:
                title_lower = str(t["title"]).lower()
                if not is_tech_dream and any(term in title_lower for term in tech_terms):
                    continue  # skip irrelevant tech task
                valid_tasks.append({
                    "title": str(t["title"]),
                    "type": str(t["type"]).lower() if t["type"] in ["theory", "hands-on", "review"] else "theory"
                })
        
        # Ensure we have at least the requested count
        target_count = req.count or 5
        while len(valid_tasks) < target_count:
            # Fallback tasks if generation failed or returned too few
            fallback_titles = [
                f"Review core concepts in {req.subjects[0] if req.subjects else req.dream}",
                f"Practice foundational skills for {req.dream}",
                f"Watch a tutorial on {req.subjects[0] if req.subjects else 'your field'}",
                "Create a summary of what you've learned so far",
                "Apply your knowledge to a small practical scenario"
            ]
            idx = len(valid_tasks) % len(fallback_titles)
            valid_tasks.append({"title": fallback_titles[idx], "type": ["review", "hands-on", "theory"][idx % 3]})
        
        return valid_tasks[:target_count]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class QuizRequest(BaseModel):
    subject: str
    tasks: list[str]
    stage_description: Optional[str] = ""
    stage_concepts: Optional[list[str]] = []

@app.post("/api/quiz")
async def get_quiz(req: QuizRequest):
    from llm_service import generate_quiz
    try:
        quiz = await generate_quiz(req.subject, req.tasks, req.stage_description, req.stage_concepts)
        return quiz
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# AI Mentor Chat Endpoint
# ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    user: dict           # user profile details
    messages: list       # previous messages
    new_message: str     # the new question
    attachment_base64: Optional[str] = None  # base64-encoded image/document for multimodal
    attachment_type: str = ""  # MIME type e.g. "image/png", "image/jpeg", "text" for docs
    language: str = "en"  # UI language code for mentor language mode

@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Chat with the AI Mentor powered by Gemma4 — supports text, images, videos, documents, and multilingual responses"""
    from llm_service import chat_mentor
    try:
        reply = await chat_mentor(
            req.user, req.messages, req.new_message,
            req.attachment_base64 or "",
            req.attachment_type or "",
            req.language or "en",
        )
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Career Pivot Endpoint
# ──────────────────────────────────────────────
class PivotRequest(BaseModel):
    current_dream: str
    new_dream: str
    branch: str = ""
    year: str = ""
    current_skills: str = ""

@app.post("/api/pivot")
async def analyze_pivot(req: PivotRequest):
    """Analyze career transition potential using local Gemma4 LLM"""
    from llm_service import analyze_career_pivot
    try:
        result = await analyze_career_pivot(
            req.current_dream, req.new_dream,
            req.branch, req.year, req.current_skills
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Opportunity Radar Endpoint
# ──────────────────────────────────────────────
class OpportunityRequest(BaseModel):
    dream: str
    branch: str = ""
    year: str = ""
    current_skills: str = ""
    stage_index: int = 0

@app.post("/api/opportunities")
async def scan_opportunities(req: OpportunityRequest):
    """Generate relevant career opportunities using local Gemma4 LLM"""
    from llm_service import generate_opportunities
    try:
        result = await generate_opportunities(
            req.dream, req.branch, req.year,
            req.current_skills, req.stage_index
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Cache Management
# ──────────────────────────────────────────────
@app.delete("/api/cache")
async def clear_roadmap_cache(
    dream: str = Query(None),
    year: str = Query(None),
    branch: str = Query(None),
):
    """Clear cached roadmaps. Pass dream+year+branch to clear a specific entry, or nothing to clear all."""
    from cache import clear_cache
    if dream and year and branch:
        count = clear_cache(dream, year, branch)
        return {"cleared": count, "message": f"Cleared cache for '{dream}'"}
    else:
        count = clear_cache()
        return {"cleared": count, "message": "Cleared all cached roadmaps"}


# ══════════════════════════════════════════════
# FILE SPEAKER ENDPOINTS
# ══════════════════════════════════════════════

class FSChatRequest(BaseModel):
    source_ids: List[str] = []
    source_id: Optional[str] = None  # backward compat
    source_titles: List[str] = []
    source_title: Optional[str] = None # backward compat
    history: List[dict] = []
    question: str

class FSTransformRequest(BaseModel):
    source_id: str
    source_text: str
    transformation: str  # summary | key_concepts | takeaways | questions | flashcards | methodology

class FSPodcastRequest(BaseModel):
    source_id: str
    source_text: str
    topic: str
    host1_name: str = "Alex"
    host2_name: str = "Sam"
    host1_voice: str = "en-US-ChristopherNeural"
    host2_voice: str = "en-US-JennyNeural"
    tone: str = "educational and engaging"
    length: str = "medium"   # short | medium | long
    language: str = "en"     # language code: en, ta, hi, te, kn, ml, bn, mr

class FSUrlRequest(BaseModel):
    url: str
    deep: bool = False

class FSDetectLangRequest(BaseModel):
    source_text: str

class FSPodcastInteractRequest(BaseModel):
    podcast_script: str
    question: str
    host_name: str = "Alex"
    host_voice: str = "en-US-ChristopherNeural"
    language: str = "en"

# In-memory source store (source_id → {title, text, chunks})
_source_store: dict[str, dict] = {}


def _resolve_source_text(source_id: str, provided_text: str) -> str:
    """Retrieve text from memory or Chroma to prevent using truncated preview text."""
    full_text = ""
    if source_id in _source_store:
        full_text = _source_store[source_id].get("text", "")
    
    if not full_text:
        try:
            from file_speaker import get_full_source_text
            full_text = get_full_source_text(source_id)
        except Exception:
            pass
            
    if full_text and len(full_text) > len(provided_text or ""):
        return full_text
    return provided_text or full_text


@app.post("/api/filespeaker/upload")
async def fs_upload_file(
    file: UploadFile = File(...),
    source_id: str   = Form(default=""),
):
    """Upload a file (PDF, DOCX, TXT, MD) and extract + index its text."""
    from file_speaker import extract_text_from_file, index_source
    file_bytes = await file.read()
    try:
        text = extract_text_from_file(file.filename or "file.txt", file_bytes)
    except Exception as e:
        raise HTTPException(400, f"Text extraction failed: {e}")

    sid = source_id or str(uuid.uuid4())[:8]
    title = file.filename or "Uploaded File"

    # Index into local VDB for RAG
    print(f"[FileSpeaker] Processing upload: {file.filename}, length: {len(text)}")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[FileSpeaker] WARNING: GEMINI_API_KEY is not set. Indexing will fail.")
    else:
        print(f"[FileSpeaker] GEMINI_API_KEY is present (prefix: {api_key[:5]}...)")

    try:
        chunk_count = index_source(sid, text)
    except Exception as e:
        print(f"[FileSpeaker] Indexing failed for {sid}: {e}")
        chunk_count = 0

    _source_store[sid] = {"title": title, "text": text, "chunks": chunk_count}
    return {
        "source_id": sid,
        "title": title,
        "char_count": len(text),
        "chunk_count": chunk_count,
        "preview": text[:500],
    }


@app.post("/api/filespeaker/url")
async def fs_add_url(req: FSUrlRequest):
    """Crawl a URL and index its content."""
    from file_speaker import extract_text_from_url, index_source
    try:
        text = await extract_text_from_url(req.url, req.deep)
    except Exception as e:
        raise HTTPException(400, f"URL extraction failed: {e}")

    if not text or len(text) < 100:
        raise HTTPException(400, "Extracted too little text from this URL.")

    sid   = str(uuid.uuid4())[:8]
    title = req.url.split("/")[2][:50]  # use domain as title

    try:
        chunk_count = index_source(sid, text)
    except Exception:
        chunk_count = 0

    _source_store[sid] = {"title": title, "text": text, "chunks": chunk_count}
    return {"source_id": sid, "title": title, "char_count": len(text), "chunk_count": chunk_count, "preview": text[:500]}


@app.post("/api/filespeaker/detect-language")
async def fs_detect_language(req: FSDetectLangRequest):
    """Detect language of the text using Gemma4."""
    from file_speaker import detect_language
    try:
        res = await detect_language(req.source_text)
        return res
    except Exception as e:
        raise HTTPException(400, f"Language detection failed: {e}")

@app.post("/api/filespeaker/text")
async def fs_add_text(payload: dict):
    """Add raw pasted text as a source."""
    from file_speaker import index_source
    text  = payload.get("text", "").strip()
    title = payload.get("title", "Pasted Text")
    if not text or len(text) < 20:
        raise HTTPException(400, "Text is too short.")

    sid = str(uuid.uuid4())[:8]
    try:
        chunk_count = index_source(sid, text)
    except Exception:
        chunk_count = 0

    _source_store[sid] = {"title": title, "text": text, "chunks": chunk_count}
    return {"source_id": sid, "title": title, "char_count": len(text), "chunk_count": chunk_count}


@app.post("/api/filespeaker/chat")
async def fs_chat(req: FSChatRequest):
    """Chat with one or more previously uploaded documents via RAG."""
    from file_speaker import chat_with_source
    # Handle single or multiple
    sids = req.source_ids if req.source_ids else [req.source_id] if req.source_id else []
    titles = req.source_titles if req.source_titles else [req.source_title] if req.source_title else []

    if not sids:
        raise HTTPException(400, "No source_ids provided.")

    try:
        reply = await chat_with_source(sids, titles, req.history, req.question)
    except Exception as e:
        raise HTTPException(500, f"Chat failed: {e}")
    return {"reply": reply}


@app.post("/api/filespeaker/transform")
async def fs_transform(req: FSTransformRequest):
    """Apply an AI transformation to a source (summary, key concepts, etc)."""
    from file_speaker import run_transformation
    try:
        resolved_text = _resolve_source_text(req.source_id, req.source_text)
        if not resolved_text:
            raise ValueError("No source text available to transform.")
        result = await run_transformation(resolved_text, req.transformation)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Transformation failed: {e}")
    return {"result": result, "transformation": req.transformation}


@app.post("/api/filespeaker/podcast")
async def fs_podcast(req: FSPodcastRequest):
    """Generate a full AI podcast from a source document in the selected language."""
    from file_speaker import generate_full_podcast
    try:
        resolved_text = _resolve_source_text(req.source_id, req.source_text)
        if not resolved_text:
            raise RuntimeError("No source text available to generate podcast.")
        result = await generate_full_podcast(
            req.source_id, resolved_text, req.topic,
            req.host1_name, req.host2_name,
            req.host1_voice, req.host2_voice,
            req.tone, req.length, req.language,
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    return result

@app.post("/api/filespeaker/podcast/interact")
async def fs_podcast_interact(req: FSPodcastInteractRequest):
    """Generate an on-demand podcast response back from the host."""
    from file_speaker import generate_podcast_interact
    try:
        result = await generate_podcast_interact(
            req.podcast_script, req.question, req.host_name, req.host_voice, req.language
        )
    except Exception as e:
        raise HTTPException(500, str(e))
    return result


@app.post("/api/filespeaker/detect-language")
async def fs_detect_language(req: FSDetectLangRequest):
    """Detect the language of a source document and return suggested podcast voices."""
    from file_speaker import detect_document_language, LANGUAGE_VOICES
    try:
        lang_code = await detect_document_language(req.source_text)
        voices = LANGUAGE_VOICES.get(lang_code, LANGUAGE_VOICES["en"])
        return {
            "language": lang_code,
            "language_name": voices["name"],
            "host1_voice": voices["host1"],
            "host2_voice": voices["host2"],
            "rec_lang": voices["rec_lang"],
        }
    except Exception as e:
        raise HTTPException(500, f"Language detection failed: {e}")


@app.get("/api/filespeaker/audio/{filename}")
async def fs_serve_audio(filename: str):
    """Serve a generated podcast MP3 file."""
    from file_speaker import AUDIO_DIR
    audio_path = AUDIO_DIR / filename
    if not audio_path.exists():
        raise HTTPException(404, "Audio file not found.")
    return FileResponse(str(audio_path), media_type="audio/mpeg", filename=filename)


# ──────────────────────────────────────────────
# Warmup & Health
# ──────────────────────────────────────────────
@app.get("/api/warmup")
async def warmup():
    """Endpoint for cron-jobs to keep the service awake and warm up caches."""
    return {"status": "ok", "timestamp": time.time(), "message": "Kalam Spark is warm and ready!"}

# ──────────────────────────────────────────────
# Dev entry point
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
