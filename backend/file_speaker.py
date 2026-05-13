"""
file_speaker.py — Kalam Spark File Speaker Engine

Features:
  1. Source ingestion — PDF, DOCX, TXT, MD, web URL, plain text paste
  2. RAG-powered "Chat with Documents" (ChromaDB + sentence-transformers + Cloud LLM)
  3. Transformations — Summary, Key Concepts, Takeaways, Questions, Flashcard Export
  4. Podcast generation — Gemma4 (cloud) multilingual dialogue + edge-tts audio
  5. Auto language detection
"""

import json
import uuid
import time
import os
import re
import tempfile
import asyncio
from pathlib import Path
from typing import Optional, Any
from io import BytesIO

# Try to import google-generativeai as genai
try:
    import google.generativeai as genai
except ImportError:
    genai = None

import httpx
from bs4 import BeautifulSoup

# ── Optional heavy deps — imported lazily so startup is fast
def _import_google_generativeai():
    import google.generativeai as genai
    return genai

# ── Storage paths
UPLOAD_DIR = Path(__file__).parent / "filespeaker_uploads"
AUDIO_DIR  = Path(__file__).parent / "filespeaker_audio"
UPLOAD_DIR.mkdir(exist_ok=True)
AUDIO_DIR.mkdir(exist_ok=True)

# Cloud LLM helpers (OpenRouter → Groq → Gemini failover)
from llm_service import _call_llm, _call_llm_chat

# ─────────────────────────────────────────────────────────
# MULTILINGUAL VOICE MAP (language code → edge-tts voices)
# ─────────────────────────────────────────────────────────
LANGUAGE_VOICES: dict[str, dict] = {
    "en": {
        "host1": "en-US-ChristopherNeural",
        "host2": "en-US-JennyNeural",
        "name": "English",
        "rec_lang": "en-US",
    },
    "ta": {
        "host1": "ta-IN-ValluvarNeural",
        "host2": "ta-IN-PallaviNeural",
        "name": "Tamil",
        "rec_lang": "ta-IN",
    },
    "hi": {
        "host1": "hi-IN-MadhurNeural",
        "host2": "hi-IN-SwaraNeural",
        "name": "Hindi",
        "rec_lang": "hi-IN",
    },
    "te": {
        "host1": "te-IN-MohanNeural",
        "host2": "te-IN-ShrutiNeural",
        "name": "Telugu",
        "rec_lang": "te-IN",
    },
    "kn": {
        "host1": "kn-IN-GaganNeural",
        "host2": "kn-IN-SapnaNeural",
        "name": "Kannada",
        "rec_lang": "kn-IN",
    },
    "ml": {
        "host1": "ml-IN-MidhunNeural",
        "host2": "ml-IN-SobhanaNeural",
        "name": "Malayalam",
        "rec_lang": "ml-IN",
    },
    "bn": {
        "host1": "bn-IN-BashkarNeural",
        "host2": "bn-IN-TanishaaNeural",
        "name": "Bengali",
        "rec_lang": "bn-IN",
    },
    "mr": {
        "host1": "mr-IN-ManoharNeural",
        "host2": "mr-IN-AarohiNeural",
        "name": "Marathi",
        "rec_lang": "mr-IN",
    },
}

LANGUAGE_NAMES = {
    "en": "English", "ta": "Tamil", "hi": "Hindi",
    "te": "Telugu", "kn": "Kannada", "ml": "Malayalam",
    "bn": "Bengali", "mr": "Marathi",
}

# ─────────────────────────────────────────────────────────
# 1. TEXT EXTRACTION UTILITIES
# ─────────────────────────────────────────────────────────
def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(file_bytes))
        pages_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            pages_text.append(f"[Page {i+1}]\n{text}")
        return "\n\n".join(pages_text)
    except ImportError:
        raise RuntimeError("pypdf not installed. Run: pip install pypdf")


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        import docx
        from io import BytesIO
        doc = docx.Document(BytesIO(file_bytes))
        return "\n".join(para.text for para in doc.paragraphs)
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")


async def extract_text_from_url(url: str, deep: bool = False) -> str:
    """Fetch a URL and return clean text using BeautifulSoup."""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                return f"Error: Could not fetch URL {url} (Status {resp.status_code})"
            
            soup = BeautifulSoup(resp.text, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                tag.decompose()
            
            text = soup.get_text(separator='\n')
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            clean_text = '\n'.join(lines)
            
            base_text = f"[Source: {url}]\n" + clean_text[:40000]
            
            if deep:
                # Basic deep crawl implementation using BeautifulSoup to find links
                domain = url.split("/")[2] if "//" in url else url.split("/")[0]
                links = []
                for a in soup.find_all('a', href=True):
                    href = a['href']
                    if href.startswith('http') and domain in href:
                        links.append(href)
                    elif href.startswith('/'):
                        links.append(f"https://{domain}{href}")
                
                internal_links = list(set([l for l in links if l != url]))[:2]
                for link in internal_links:
                    try:
                        sub_resp = await client.get(link)
                        sub_soup = BeautifulSoup(sub_resp.text, 'html.parser')
                        for tag in sub_soup(['script', 'style', 'nav', 'footer']):
                            tag.decompose()
                        sub_text = sub_soup.get_text(separator=' ')
                        base_text += f"\n\n[Source: {link}]\n{sub_text[:10000]}"
                    except:
                        pass
            return base_text
    except Exception as e:
        return f"Error crawling {url}: {str(e)}"




async def detect_language(text: str) -> dict:
    """Uses cloud Gemma4 to detect the primary language of the text."""
    try:
        sample = text[:3000]
        system_prompt = "You are a professional language detection engine."
        user_prompt = f"Analyze the following text and determine its primary language.\nReturn ONLY a valid JSON object: {{\"language_code\": \"ISO\", \"language_name\": \"Name\"}}\n\nText:\n{sample}"
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        response = await _call_llm_chat(messages, max_tokens=50, temperature=0.0, json_mode=True)
        clean_res = response.strip()
        if "```" in clean_res:
            clean_res = clean_res.split("```")[1].split("```")[0].strip()

        data = json.loads(clean_res)
        lang_code = data.get("language_code", "en").lower()

        preset = LANGUAGE_VOICES.get(lang_code)
        if not preset:
            lang_code = "en"
            preset = LANGUAGE_VOICES["en"]
            data["language_name"] = "English (Defaulted)"

        return {
            "language": lang_code,
            "language_name": data.get("language_name", "English"),
            "host1_voice": preset["host1"],
            "host2_voice": preset["host2"]
        }
    except Exception as e:
        print(f"Language detection error: {e}")
        return {
            "language": "en",
            "language_name": "English",
            "host1_voice": "en-US-ChristopherNeural",
            "host2_voice": "en-US-JennyNeural"
        }

def extract_text_from_file(filename: str, file_bytes: bytes) -> str:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return extract_text_from_pdf(file_bytes)
    if ext in ("docx", "doc"):
        return extract_text_from_docx(file_bytes)
    if ext in ("txt", "md", "html", "htm"):
        return file_bytes.decode("utf-8", errors="ignore")
    raise ValueError(f"Unsupported file type: .{ext}")


# ─────────────────────────────────────────────────────────
# 2. CHUNK & EMBED (for RAG chat)
# ─────────────────────────────────────────────────────────
def _chunk_text(text: str, chunk_size: int = 600, overlap: int = 80) -> list[str]:
    if not text or len(text.strip()) == 0:
        return []
    
    words = text.split()
    # Fallback for texts without spaces (e.g., certain Asian languages or poorly extracted text)
    if not words and len(text) > 0:
        # Split by character chunks as fallback
        char_chunk_size = chunk_size * 5 # heuristic: 1 word ~ 5 chars
        return [text[i : i + char_chunk_size] for i in range(0, len(text), char_chunk_size - overlap * 5)]

    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


_embed_model = None

def _get_embed_model():
    """Returns a wrapper around Google Generative AI embeddings to match the model.encode interface"""
    global _embed_model
    if _embed_model is None:
        genai = _import_google_generativeai()
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment. Required for cloud embeddings.")
        genai.configure(api_key=api_key)
        
        class GeminiEmbedder:
            def encode(self, texts: list[str]):
                # Google allows batch embedding
                # We try several model names to avoid 404s in different environments
                models_to_try = [
                    "models/gemini-embedding-001",
                    "models/text-embedding-004", 
                    "text-embedding-004",
                    "models/embedding-001",
                    "embedding-001"
                ]
                
                last_err = None
                for mname in models_to_try:
                    try:
                        res = genai.embed_content(
                            model=mname,
                            content=texts,
                            task_type="retrieval_document"
                        )
                        print(f"[FileSpeaker] Embedding success with model: {mname}")
                        return res['embeddings']
                    except Exception as e:
                        print(f"[FileSpeaker] Embedding failed with {mname}: {e}")
                        last_err = e
                
                # If Google fails, try OpenRouter if key is available
                or_key = os.getenv("OPENROUTER_API_KEY")
                if or_key:
                    try:
                        from openai import OpenAI
                        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=or_key)
                        # OpenRouter uses different names sometimes, but gemini-embedding-001 is common
                        res = client.embeddings.create(
                            model="google/gemini-embedding-001",
                            input=texts
                        )
                        print("[FileSpeaker] Embedding success via OpenRouter")
                        return [item.embedding for item in res.data]
                    except Exception as or_e:
                        print(f"[FileSpeaker] OpenRouter embedding failed: {or_e}")
                
                raise last_err
        
        _embed_model = GeminiEmbedder()
    return _embed_model


# ── Lightweight Vector Store (Replaces ChromaDB)
VDB_PATH = Path(__file__).parent / "vector_db"
VDB_PATH.mkdir(exist_ok=True)

def _get_vdb_file(source_id: str):
    return VDB_PATH / f"src_{source_id}.json"

def index_source(source_id: str, text: str) -> int:
    """Chunk text and store embeddings in a simple JSON file. Returns number of chunks."""
    try:
        chunks = _chunk_text(text)
        if not chunks:
            print(f"[FileSpeaker] No chunks generated for source {source_id} (text length: {len(text)})")
            return 0

        model = _get_embed_model()
        embeddings = model.encode(chunks)
        
        data = {
            "chunks": chunks,
            "embeddings": embeddings
        }
        
        with open(_get_vdb_file(source_id), "w", encoding="utf-8") as f:
            json.dump(data, f)
        
        print(f"[FileSpeaker] Successfully indexed source {source_id} with {len(chunks)} chunks")
        return len(chunks)
    except Exception as e:
        print(f"[FileSpeaker] Indexing failed for source {source_id}: {e}")
        raise e


def get_full_source_text(source_id: str) -> str:
    """Retrieve all chunks from the local JSON store and reconstruct text."""
    vfile = _get_vdb_file(source_id)
    if not vfile.exists():
        return ""
    try:
        with open(vfile, "r", encoding="utf-8") as f:
            data = json.load(f)
            return " ".join(data.get("chunks", []))
    except Exception as e:
        print(f"Failed to read source {source_id}: {e}")
    return ""


def retrieve_context(source_ids: list[str], query: str, top_k: int = 5) -> str:
    # Use global genai or import it
    import google.generativeai as g
    
    models_to_try = [
        "models/gemini-embedding-001",
        "models/text-embedding-004", 
        "text-embedding-004",
        "models/embedding-001",
        "embedding-001"
    ]
    
    q_embed = None
    for mname in models_to_try:
        try:
            res = g.embed_content(
                model=mname,
                content=query,
                task_type="retrieval_query"
            )
            q_embed = res['embedding']
            break
        except:
            continue
            
    if q_embed is None:
        # Try OpenRouter
        or_key = os.getenv("OPENROUTER_API_KEY")
        if or_key:
            try:
                from openai import OpenAI
                client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=or_key)
                res = client.embeddings.create(
                    model="google/gemini-embedding-001",
                    input=query
                )
                q_embed = res.data[0].embedding
            except:
                pass

    if q_embed is None:
        print("[FileSpeaker] All embedding models failed for query")
        return ""

    results = []

    for sid in source_ids:
        vfile = _get_vdb_file(sid)
        if not vfile.exists(): continue
        
        try:
            with open(vfile, "r", encoding="utf-8") as f:
                data = json.load(f)
                chunks = data.get("chunks", [])
                embeddings = data.get("embeddings", [])
                
                for chunk, c_embed in zip(chunks, embeddings):
                    # Manual dot product (since Google embeddings are normalized, dot product = cosine similarity)
                    score = sum(a * b for a, b in zip(q_embed, c_embed))
                    results.append((score, chunk))
        except:
            continue

    # Sort by score descending and take top_k
    results.sort(key=lambda x: x[0], reverse=True)
    top_chunks = [r[1] for r in results[:top_k]]
    
    return "\n\n---\n\n".join(top_chunks)


# ─────────────────────────────────────────────────────────
# 3. CHAT WITH DOCUMENT (RAG)
# ─────────────────────────────────────────────────────────
async def chat_with_source(source_ids: list[str], source_titles: list[str], history: list[dict], question: str) -> str:
    context = retrieve_context(source_ids, question)

    if not context:
        context_note = "No document context available. Answer from general knowledge and say so."
    else:
        titles_str = ", ".join(source_titles)
        context_note = f"SOURCE DOCUMENTS (from: {titles_str}):\n\n{context}"

    system_prompt = (
        "You are a helpful AI tutor. A student has uploaded documents and is asking questions about them. "
        "Answer ONLY from the provided source documents. If the answer is not there, say so clearly. "
        "Be concise and cite page numbers like [Page 3] when you use content from a specific page."
        f"\n\n{context_note}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-8:]:
        role = "assistant" if msg.get("role") == "ai" else "user"
        messages.append({"role": role, "content": msg.get("text", "")})
    messages.append({"role": "user", "content": question})

    return await _call_llm_chat(messages, max_tokens=1500, temperature=0.3)


# ─────────────────────────────────────────────────────────
# 4. TRANSFORMATIONS
# ─────────────────────────────────────────────────────────
TRANSFORMATION_PROMPTS = {
    "summary": (
        "Create a clear, well-structured 250-300 word summary of this document. "
        "Include: main topic, key arguments, and conclusions. Use plain paragraphs."
    ),
    "key_concepts": (
        "Extract the 8-12 most important concepts, terms, or ideas from this document. "
        "For each, provide: **Concept Name**: 1-2 sentence explanation. "
        "Format as a numbered list."
    ),
    "takeaways": (
        "Extract 5-8 key actionable takeaways or lessons from this document. "
        "What should a student DO or REMEMBER after reading this? "
        "Format as a numbered list with bold action statements."
    ),
    "questions": (
        "Generate 6 thought-provoking questions this document raises. "
        "Mix: 2 comprehension questions, 2 critical thinking questions, 2 open-ended discussion questions. "
        "Format as a numbered list."
    ),
    "flashcards": (
        "Generate exactly 8 educational flashcards from the most important facts in this document. "
        "For each card, provide a clear **Question** and a concise **Answer**. "
        "Format as a list of cards using Markdown, for example: \n"
        "### 📇 Flashcard 1\n"
        "**Question**: ...\n"
        "**Answer**: ...\n\n"
    ),
    "methodology": (
        "Extract the research methodology or approach from this document: "
        "1. Study design/approach, 2. Data/materials used, 3. Methods applied, "
        "4. Analysis techniques, 5. Limitations mentioned. "
        "If this is not a research paper, describe the author's structured approach instead."
    ),
}


async def run_transformation(source_text: str, transformation_type: str) -> str:
    prompt_instruction = TRANSFORMATION_PROMPTS.get(transformation_type)
    if not prompt_instruction:
        raise ValueError(f"Unknown transformation: {transformation_type}")

    # Use only first 12000 chars of text for transform to avoid token overflow
    truncated_text = source_text[:12000]

    # Use system+user split so the model doesn't echo the instruction constraints
    messages = [
        {
            "role": "system",
            "content": (
                "You are an AI study assistant. You will receive a document and a task. "
                "Complete the task using ONLY information from the document. "
                "Cite page numbers like [Page 3] when referencing specific content. "
                "Output ONLY the requested result — no preamble, no meta-commentary, no repeating the task."
            )
        },
        {
            "role": "user",
            "content": f"DOCUMENT:\n---\n{truncated_text}\n---\n\nTASK: {prompt_instruction}"
        }
    ]

    return await _call_llm_chat(messages, max_tokens=1500, temperature=0.2)


# ─────────────────────────────────────────────────────────
# 5. PODCAST GENERATION
# ─────────────────────────────────────────────────────────
async def detect_document_language(source_text: str) -> str:
    """Detect the primary language of the source document using Gemma4. Returns lang code."""
    sample = source_text[:2000]
    try:
        system_prompt = "You are a language detection engine. Respond with ONLY a 2-letter ISO code."
        user_prompt = f"Detect the primary language of this text. Respond with ONLY the 2-letter code from: en, ta, hi, te, kn, ml, bn, mr.\n\nTEXT SAMPLE:\n{sample}"
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        result = await _call_llm_chat(messages, max_tokens=5, temperature=0.0)
        code = result.strip().lower()[:2]
        if code in LANGUAGE_VOICES:
            return code
    except Exception as e:
        print(f"[FileSpeaker] Language detection failed: {e}")
    return "en"


async def generate_podcast_script(
    source_text: str,
    topic: str,
    host1_name: str = "Alex",
    host2_name: str = "Sam",
    tone: str = "educational and engaging",
    length: str = "medium",
    language: str = "en",
) -> str:
    """Generate a 2-host conversational podcast script using Gemma4 in the specified language."""
    min_exchanges = {"short": 6, "medium": 12, "long": 20}.get(length, 12)
    truncated_text = source_text[:10000]
    lang_name = LANGUAGE_NAMES.get(language, "English")

    # Enhanced language instruction with explicit direction for all supported languages
    if language != "en":
        language_instruction = f"""CRITICAL REQUIREMENT: You MUST write the ENTIRE script in {lang_name} ({language}). 
Every single line of dialogue MUST be written in {lang_name} script ONLY.
Do NOT use any English words. Translate all technical concepts completely into {lang_name}.
Example format:
{host1_name}: [Greeting and introduction in {lang_name}]
{host2_name}: [Enthusiastic response and curiosity in {lang_name}]
"""
    else:
        language_instruction = ""

    system_content = (
        f"You are a world-class educational podcast scriptwriter. "
        f"You write engaging, conversational dialogue between two hosts: {host1_name} (the expert) and {host2_name} (the curious learner). "
        f"You write ONLY in {lang_name}. "
        f"Every fact must come strictly from the source document provided by the user. "
        f"Output ONLY the script in '{host1_name}: ...' / '{host2_name}: ...' dialogue format — "
        f"no titles, no headers, no stage directions, no commentary outside the dialogue."
    )
    if language_instruction:
        system_content += f"\n\n{language_instruction}"

    user_content = (
        f"SOURCE DOCUMENT:\n---\n{truncated_text}\n---\n\n"
        f"Write a {tone} podcast script about '{topic}' with exactly {min_exchanges} dialogue exchanges. "
        f"Start immediately with '{host1_name}:' — do not add any intro text."
    )

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user",   "content": user_content}
    ]

    return await _call_llm_chat(messages, max_tokens=3000, temperature=0.6)


def _parse_script_lines(script: str, host1: str, host2: str) -> list[dict]:
    """Parse the generated script into {speaker, text} pairs using robust regex."""
    import re
    lines = []
    # Match "[Speaker]: Text" or "**[Speaker]**: Text" with variations in spacing/markdown
    # Handles: "Alex: hello", "**Alex**: hello", "Alex : hello", "Sam: hello"
    pattern = rf"^\*?\*?({re.escape(host1)}|{re.escape(host2)})\*?\*?\s*:\s*(.*)$"
    
    def clean_text_for_speech(t: str) -> str:
        # Remove asterisks, underscores, and tildes
        t = re.sub(r'[*_~]', '', t)
        # Remove bracketed actions like [laughs] or (sighs)
        t = re.sub(r'\[.*?\]', '', t)
        t = re.sub(r'\(.*?\)', '', t)
        return t.strip()
    
    for raw_line in script.splitlines():
        raw_line = raw_line.strip()
        if not raw_line:
            continue
            
        match = re.match(pattern, raw_line, re.IGNORECASE)
        if match:
            speaker_found = match.group(1)
            # Normalize to the original host names passed in
            normalized_speaker = host1 if speaker_found.lower() == host1.lower() else host2
            text = match.group(2).strip()
            text = clean_text_for_speech(text)
            if text:
                lines.append({"speaker": normalized_speaker, "text": text})
    
    # If no lines found, try a more aggressive split (some LLMs use "Host 1: ...")
    if not lines:
        for raw_line in script.splitlines():
            if ":" in raw_line:
                parts = raw_line.split(":", 1)
                speaker_part = parts[0].lower()
                if host1.lower() in speaker_part:
                    text = clean_text_for_speech(parts[1].strip())
                    if text:
                        lines.append({"speaker": host1, "text": text})
                elif host2.lower() in speaker_part:
                    text = clean_text_for_speech(parts[1].strip())
                    if text:
                        lines.append({"speaker": host2, "text": text})
                    
    return lines


async def synthesize_audio(
    script_lines: list[dict],
    host1: str, host1_voice: str,
    host2: str, host2_voice: str,
    output_file: str,
    language: str = "en" # Added language for fallback gTTS
) -> bool:
    """Convert script lines to audio using edge-tts and merge with pydub."""
    try:
        import edge_tts
        from pydub import AudioSegment
        from gtts import gTTS
    except ImportError:
        raise RuntimeError(
            "Audio dependencies missing. Run: pip install edge-tts pydub gTTS"
        )

    segments: list[AudioSegment] = []
    silence_short  = AudioSegment.silent(duration=400)
    silence_medium = AudioSegment.silent(duration=700)

    for i, line in enumerate(script_lines):
        voice   = host1_voice if line["speaker"] == host1 else host2_voice
        tmp_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp_mp3.close()

        success_line = False
        
        # 1. Primary: Microsoft Edge TTS (Free, High Quality)
        try:
            communicate = edge_tts.Communicate(line["text"], voice)
            await communicate.save(tmp_mp3.name)
            success_line = True
        except Exception as e:
            print(f"[FileSpeaker] edge-tts failed for line {i} (voice: {voice}): {e}. Trying OpenAI...")

        # 2. Secondary Fallback: OpenAI TTS (Paid, Fast, Multilingual)
        if not success_line:
            openai_key = os.getenv("OPENAI_API_KEY")
            if openai_key:
                try:
                    from openai import OpenAI
                    client = OpenAI(api_key=openai_key)
                    v_map = {"host1": "onyx", "host2": "shimmer"}
                    v_name = v_map.get("host1" if line["speaker"] == host1 else "host2", "alloy")
                    
                    response = client.audio.speech.create(
                        model="tts-1",
                        voice=v_name,
                        input=line["text"]
                    )
                    response.stream_to_file(tmp_mp3.name)
                    success_line = True
                    print(f"[FileSpeaker] OpenAI TTS success for line {i} (Fallback)")
                except Exception as oe:
                    print(f"[FileSpeaker] OpenAI TTS also failed for line {i}: {oe}")

        # 3. Final Fallback: gTTS (Free, Most Resilient)
        if not success_line:
            try:
                g_lang = language if language else "en"
                tts = gTTS(text=line["text"], lang=g_lang)
                tts.save(tmp_mp3.name)
                success_line = True
                print(f"[FileSpeaker] gTTS final fallback used for line {i}")
            except Exception as ge:
                print(f"[FileSpeaker] All TTS engines failed for line {i}: {ge}")
                os.unlink(tmp_mp3.name)
                continue

        try:
            seg = AudioSegment.from_mp3(tmp_mp3.name)
            segments.append(seg)
            # Short pause between same speaker, medium pause between different speakers
            if i < len(script_lines) - 1:
                next_speaker = script_lines[i + 1]["speaker"]
                segments.append(silence_medium if next_speaker != line["speaker"] else silence_short)
        except Exception as e_seg:
            print(f"[FileSpeaker] Error processing audio segment for line {i}: {e_seg}")
        finally:
            if os.path.exists(tmp_mp3.name):
                os.unlink(tmp_mp3.name)

    if not segments:
        return False

    try:
        combined = segments[0]
        for s in segments[1:]:
            combined += s

        combined.export(output_file, format="mp3", bitrate="128k")
        return True
    except Exception as e_final:
        print(f"[FileSpeaker] Final audio merge failed: {e_final}")
        return False


async def generate_full_podcast(
    source_id: str,
    source_text: str,
    topic: str,
    host1_name: str = "Alex",
    host2_name: str = "Sam",
    host1_voice: str = "en-US-ChristopherNeural",  # Male
    host2_voice: str = "en-US-JennyNeural",         # Female
    tone: str = "educational and engaging",
    length: str = "medium",
    language: str = "en",
) -> dict:
    """Full pipeline: script → parse → TTS → merge. Returns {audio_url, script, duration_est, language}"""

    print(f"[FileSpeaker] Generating podcast script for '{topic}' in language '{language}'...")
    script = await generate_podcast_script(
        source_text, topic, host1_name, host2_name, tone, length, language
    )

    lines = _parse_script_lines(script, host1_name, host2_name)
    if not lines:
        raise RuntimeError("Script parsing failed — no dialogue lines detected.")

    podcast_id  = str(uuid.uuid4())[:8]
    audio_path  = AUDIO_DIR / f"podcast_{podcast_id}.mp3"

    print(f"[FileSpeaker] Synthesizing {len(lines)} dialogue lines to audio...")
    success = await synthesize_audio(lines, host1_name, host1_voice, host2_name, host2_voice, str(audio_path), language)

    if not success:
        raise RuntimeError("Audio synthesis failed.")

    word_count = sum(len(l["text"].split()) for l in lines)
    # Adjust WPM for different languages (scripts tend to be shorter in Indian langs)
    wpm = 130 if language == "en" else 100
    duration_min = max(1, round(word_count / wpm))

    return {
        "podcast_id": podcast_id,
        "audio_filename": audio_path.name,
        "script": script,
        "lines": lines,
        "duration_estimate": f"~{duration_min} min",
        "host1": host1_name,
        "host2": host2_name,
        "language": language,
        "language_name": LANGUAGE_NAMES.get(language, "English"),
        "created_at": str(uuid.uuid4()),  # unique timestamp marker
    }

async def generate_podcast_interact(
    podcast_script: str, question: str,
    host_name: str = "Alex", host_voice: str = "en-US-ChristopherNeural",
    language: str = "en",
) -> dict:
    lang_name = LANGUAGE_NAMES.get(language, "English")
    
    # Enhanced language instruction for interactions matching the script language
    if language == "ta":
        language_instruction = f"Answer ONLY in Tamil (தமிழ்). Every word must be in Tamil. No English allowed."
    elif language != "en":
        language_instruction = f"Answer ONLY in {lang_name}. Translate everything to {lang_name}. Do NOT use English."
    else:
        language_instruction = ""

    system_prompt = f"You are {host_name}, a friendly podcast host speaking in {lang_name}. {language_instruction}"
    user_prompt = f"A listener just paused the podcast and asked a question.\n\nSCRIPT CONTEXT:\n{podcast_script[-2000:]}\n\nQUESTION: \"{question}\"\n\nAnswer briefly (1-3 sentences) in {lang_name}. Provide ONLY dialogue text. Do NOT include your name or quotes."
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    ans_text = await _call_llm_chat(messages, max_tokens=300, temperature=0.5)
    print(f"[FileSpeaker] Raw interact LLM response: {repr(ans_text)}")

    import re
    # Robustly strip the host name if it appears at the beginning
    ans_text = re.sub(rf"^\*?\*?{host_name}\*?\*?\s*:\s*", "", ans_text, flags=re.IGNORECASE).strip()

    # BUG FIX 4: Validate that we have actual text before calling TTS
    if not ans_text:
        print("[FileSpeaker] LLM returned an empty response for podcast interaction.")
        ans_text = "I'm sorry, I didn't quite catch that. Could you ask again?"

    podcast_id = str(uuid.uuid4())[:8]
    audio_path = AUDIO_DIR / f"interact_{podcast_id}.mp3"

    # BUG FIX 2: Pass host_voice for BOTH speakers to avoid 'Nobody' voice crash.
    # Only host_name lines exist in this list so host2 voice is never actually used.
    lines = [{"speaker": host_name, "text": ans_text}]
    success = await synthesize_audio(
        lines, host_name, host_voice, host_name, host_voice, str(audio_path), language
    )

    if not success:
        raise RuntimeError("Audio synthesis failed.")

    return {
        "text": ans_text,
        "audio_url": audio_path.name,
    }
