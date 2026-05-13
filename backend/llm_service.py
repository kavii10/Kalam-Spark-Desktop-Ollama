"""
llm_service.py - Cloud LLM integration for Kalam Spark
Uses Gemma 4 (April 2026 release) across all platforms with auto-failover.
Platform priority: OpenRouter -> Groq -> Gemini AI Studio
"""

import json
import os
import re
import httpx
from typing import Optional

# ── Cloud API Keys (from environment variables)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
GEMINI_API_KEY     = os.getenv("GEMINI_API_KEY", "")  # Google AI Studio key

# ── Local LLM via Ollama (fallback when cloud providers fail)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "gemma4:e4b")  # gemma 4 e4b via Ollama

# ── Gemma 4 model IDs — STRICT ENFORCEMENT (no other models allowed)
OPENROUTER_MODEL    = "google/gemma-4-31b-it:free"    # Gemma 4 31B via OpenRouter
OPENROUTER_FALLBACK = "google/gemma-4-26b-it:free"    # Gemma 4 26B via OpenRouter
GEMINI_GEMMA_MODEL  = "gemma-4-31b-it"               # Gemma 4 31B via Google AI Studio

# Language name map
LANGUAGE_NAMES = {
    "en": "English", "ta": "Tamil", "hi": "Hindi",
    "te": "Telugu", "kn": "Kannada", "ml": "Malayalam",
    "bn": "Bengali", "mr": "Marathi",
}


# ──────────────────────────────────────────────
# Core: Call cloud LLM with auto-failover
#    raise RuntimeError("All AI providers failed. Please check your API keys in the .env file.")


async def _call_ollama(prompt: str, max_tokens: int = 3000, temperature: float = 0.3, json_mode: bool = False) -> str:
    """
    Call the local Ollama Gemma4 model as a last-resort fallback.
    Requires: Ollama installed + 'ollama serve' running + gemma4:e4b pulled.
    """
    print(f"[LLM] ⚠️ All cloud providers failed. Trying local Ollama ({OLLAMA_MODEL})...")
    try:
        body: dict = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "top_p": 0.85,
                "repeat_penalty": 1.15,
                "num_gpu": 32,
            },
        }
        if json_mode:
            body["format"] = "json"  # Forces Gemma4 to output valid JSON

        async with httpx.AsyncClient(timeout=300.0) as client:  # Long timeout — local model can be slow
            resp = await client.post(f"{OLLAMA_BASE_URL}/api/generate", json=body)
            resp.raise_for_status()
            text = resp.json().get("response", "").strip()
            print(f"[LLM] Ollama (local) ✓ ({len(text)} chars)")
            return text
    except httpx.ConnectError:
        raise RuntimeError(
            "All cloud AI providers and local Ollama have failed. "
            "Start Ollama with 'ollama serve' and pull gemma4:e4b, or add API keys to .env."
        )
    except Exception as e:
        raise RuntimeError(f"[LLM] Ollama (local) failed: {e}")


async def _call_llm(prompt: str, max_tokens: int = 3000, temperature: float = 0.3, json_mode: bool = False) -> str:
    """Legacy wrapper for flat prompt calls. Enforces role separation to prevent instruction leakage."""
    messages = [
        {"role": "system", "content": "You are a professional assistant. Return only the requested content."},
        {"role": "user", "content": prompt}
    ]
    return await _call_llm_chat(messages, max_tokens=max_tokens, temperature=temperature, json_mode=json_mode)


async def _call_llm_chat(messages: list[dict], max_tokens: int = 1500, temperature: float = 0.7, 
                        attachment_b64: str = "", attachment_type: str = "", json_mode: bool = False) -> str:
    """Chat variant: accepts a list of {role, content} messages. Supports multimodal image attachments."""

    # ── 1. OpenRouter
    if OPENROUTER_API_KEY:
        try:
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://kalam-spark.onrender.com",
                "X-Title": "Kalam Spark",
            }
            
            # Prepare messages, injecting image into the last user message if present
            processed_messages = []
            for i, m in enumerate(messages):
                if i == len(messages) - 1 and m["role"] == "user" and attachment_b64 and attachment_type.startswith("image/"):
                    processed_messages.append({
                        "role": "user",
                        "content": [
                            {"type": "text", "text": m["content"]},
                            {"type": "image_url", "image_url": {"url": f"data:{attachment_type};base64,{attachment_b64}"}}
                        ]
                    })
                else:
                    processed_messages.append(m)

            body = {
                "model": OPENROUTER_MODEL,
                "messages": processed_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if json_mode:
                body["response_format"] = {"type": "json_object"}
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
                resp.raise_for_status()
                text = resp.json()["choices"][0]["message"]["content"].strip()
                print(f"[LLM] OpenRouter chat ✓ ({len(text)} chars)")
                return text
        except Exception as e:
            print(f"[LLM] OpenRouter chat (27B) failed: {e} — trying fallback (9B)...")
            try:
                # Fallback doesn't support images usually on free tier, but we'll try
                body["model"] = OPENROUTER_FALLBACK
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
                    resp.raise_for_status()
                    text = resp.json()["choices"][0]["message"]["content"].strip()
                    print(f"[LLM] OpenRouter chat fallback ✓ ({len(text)} chars)")
                    return text
            except Exception as fallback_e:
                print(f"[LLM] OpenRouter chat fallback failed: {fallback_e} — trying Google AI Studio (Gemma 4)...")

    # ── 2. Google AI Studio — gemma-4-31b-it (Strictly Gemma 4, multimodal)
    if GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_GEMMA_MODEL}:generateContent?key={GEMINI_API_KEY}"
            # Separate system messages for Gemini's systemInstruction
            system_message = None
            contents = []
            for i, m in enumerate(messages):
                role = m.get("role")
                if role == "system":
                    # Only one system message is expected; capture its content
                    system_message = m.get("content", "")
                else:
                    # role for Gemini must be "user" or "model"
                    gemma_role = "user" if role == "user" else "model"
                    parts = [{"text": m.get("content", "")}] if isinstance(m.get("content"), str) else []
                    # Inject image into last user message if present
                    if i == len(messages) - 1 and role == "user" and attachment_b64 and attachment_type.startswith("image/"):
                        parts.append({"inlineData": {"mimeType": attachment_type, "data": attachment_b64}})
                    contents.append({"role": gemma_role, "parts": parts})
            gen_config = {"maxOutputTokens": max_tokens, "temperature": temperature}
            if json_mode:
                # Some Gemma versions on Gemini AI Studio support JSON mode via responseMimeType
                gen_config["responseMimeType"] = "application/json"
                
            body = {
                "contents": contents,
                "generationConfig": gen_config,
            }
            if system_message:
                body["systemInstruction"] = {"role": "system", "parts": [{"text": system_message}]}
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                print(f"[LLM] Google AI Studio chat (Gemma 4 31B) ✓ ({len(text)} chars)")
                return text
        except Exception as e:
            print(f"[LLM] Google AI Studio chat failed: {e} — trying local Ollama...")

    # ── 3. Ollama (local Gemma 4 e4b — last resort)
    # Build flat prompt for /api/generate fallback
    flat_prompt = "\n\n".join(
        f"{'ASSISTANT' if m['role'] == 'assistant' else m['role'].upper()}: {m['content']}"
        for m in messages if 'content' in m
    ) + "\n\nASSISTANT:"

    print(f"[LLM] ⚠️ All cloud chat providers failed. Trying local Ollama ({OLLAMA_MODEL})...")


    try:
        ollama_chat_body: dict = {
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "top_p": 0.9,
                "num_gpu": 32,
                "num_predict": max_tokens,   # ← CRITICAL: was missing, caused 149-char truncation
            }
        }
        if json_mode:
            ollama_chat_body["format"] = "json"
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=ollama_chat_body,
            )
            resp.raise_for_status()
            text = resp.json().get("message", {}).get("content", "").strip()
            if text:
                print(f"[LLM] Ollama /api/chat ✓ ({len(text)} chars)")
                return text
            raise ValueError("Empty response from /api/chat")
    except httpx.ConnectError:
        raise RuntimeError(
            "All cloud AI providers and local Ollama have failed. "
            "Start Ollama with 'ollama serve' and pull gemma4:e4b, or add API keys to .env."
        )
    except Exception as chat_err:
        print(f"[LLM] Ollama /api/chat failed ({chat_err}). Trying /api/generate fallback...")
        try:
            ollama_gen_body: dict = {
                "model": OLLAMA_MODEL,
                "prompt": flat_prompt,
                "stream": False,
                "options": {"temperature": temperature, "top_p": 0.9, "num_gpu": 32, "num_predict": max_tokens}
            }
            if json_mode:
                ollama_gen_body["format"] = "json"
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json=ollama_gen_body,
                )
                resp.raise_for_status()
                text = resp.json().get("response", "").strip()
                if text:
                    print(f"[LLM] Ollama /api/generate ✓ ({len(text)} chars)")
                    return text
                raise ValueError("Empty response from /api/generate")
        except httpx.ConnectError:
            raise RuntimeError(
                "All cloud AI providers and local Ollama have failed. "
                "Start Ollama with 'ollama serve' and pull gemma4:e4b, or add API keys to .env."
            )
        except Exception as gen_err:
            raise RuntimeError(f"All AI providers failed. Last Ollama error: {gen_err}")



# ──────────────────────────────────────────────
# JSON Schema for the roadmap
# ──────────────────────────────────────────────
ROADMAP_SCHEMA = """
{
  "dream": "Career title",
  "summary": "3-4 sentence inspiring and detailed roadmap summary",
  "stages": [
    {
      "id": "stage-1",
      "title": "Stage 1 Title (specific to career)",
      "description": "Comprehensive explanation of what to learn and why in this stage.",
      "duration": "X-Y weeks",
      "subjects": ["Topic 1", "Tool 2", "Concept 3", "Topic 4", "Topic 5", "Tool 6", "Topic 7", "Concept 8"],
      "skills": ["Specific Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5", "Skill 6"],
      "projects": ["Detailed project idea 1", "Detailed project idea 2", "Project 3"],
      "resources": []
    },
    {
      "id": "stage-2",
      "title": "Stage 2 Title",
      "description": "...",
      "duration": "...",
      "subjects": [],
      "skills": [],
      "projects": [],
      "resources": []
    },
    {
      "id": "stage-3",
      "title": "Stage 3 Title",
      "description": "...",
      "duration": "...",
      "subjects": [],
      "skills": [],
      "projects": [],
      "resources": []
    },
    {
      "id": "stage-4",
      "title": "Stage 4 Title",
      "description": "...",
      "duration": "...",
      "subjects": [],
      "skills": [],
      "projects": [],
      "resources": []
    }
  ]
}
"""


def _build_prompt(dream: str, year: str, branch: str, crawled_content: str, language: str = "en") -> str:
    context_section = ""
    if crawled_content and len(crawled_content) > 50:
        context_section = f"\nREAL DATA FROM CAREER WEBSITES:\n---\n{crawled_content[:12000]}\n---\n"
    else:
        context_section = "(No web data — use your extensive knowledge to create an accurate roadmap.)"

    lang_name = LANGUAGE_NAMES.get(language, "English")
    language_instruction = (
        f"\nIMPORTANT: Write ALL roadmap content in {lang_name}. Keep JSON keys in English but all values in {lang_name}."
        if language != "en" else ""
    )

    return f"""You are an elite career mentor. Create a HIGHLY SPECIFIC, DETAILED 4-stage career roadmap.{language_instruction}

STUDENT PROFILE:
- Dream Career: {dream}
- Education Level: {year}
- Current Field: {branch}

{context_section}

INSTRUCTIONS:
1. You MUST generate EXACTLY 4 progressive stages from beginner to hirable professional.
2. Each of the 4 stages must have: 8-10 subjects, 6 skills, 3 projects, detailed description.
3. Use REAL technology names, tools, frameworks specific to {dream}.
4. Durations realistic for a {year} student working part-time.

Return ONLY a raw JSON object matching this EXACT schema. Do NOT wrap in markdown blocks, do NOT include any other text:
{ROADMAP_SCHEMA}"""


def _parse_roadmap_json(raw: str, dream: str) -> Optional[dict]:
    if not raw or len(raw.strip()) < 10:
        return None
        
    text = raw.strip()
    # 1. Try to extract from markdown blocks
    if "```json" in text:
        matches = re.findall(r'```json\s*(.*?)\s*```', text, re.DOTALL | re.IGNORECASE)
        if matches:
            text = matches[0]
    elif "```" in text:
        matches = re.findall(r'```\s*(.*?)\s*```', text, re.DOTALL)
        if matches:
            text = matches[0]

    try:
        parsed = json.loads(text.strip())
        if isinstance(parsed, dict) and "stages" in parsed and len(parsed["stages"]) > 0:
            return parsed
    except json.JSONDecodeError:
        pass
        
    # 2. Fallback: try to find the outermost JSON object
    try:
        # Find first { and last }
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_str = text[start_idx:end_idx + 1]
            parsed = json.loads(json_str)
            if isinstance(parsed, dict) and "stages" in parsed:
                return parsed
    except json.JSONDecodeError:
        pass
        
    print(f"[LLM] Failed to parse JSON. Raw (first 300): {raw[:300]}")
    return None


def _normalize_stage(stage: dict, index: int) -> dict:
    def to_list(val) -> list:
        if not val: return []
        if isinstance(val, list): return [str(v).strip() for v in val if v]
        if isinstance(val, str): return [v.strip() for v in re.split(r'[,;|\n]', val) if v.strip()]
        return []
    return {
        "id": stage.get("id") or f"stage-{index + 1}",
        "title": stage.get("title") or f"Stage {index + 1}",
        "description": stage.get("description") or "",
        "duration": stage.get("duration") or "8-12 weeks",
        "subjects": to_list(stage.get("subjects")),
        "skills": to_list(stage.get("skills")),
        "projects": to_list(stage.get("projects")),
        "resources": stage.get("resources") if isinstance(stage.get("resources"), list) else [],
    }


async def generate_roadmap(dream: str, year: str, branch: str, crawled_content: str, language: str = "en") -> dict:
    """Generate a career roadmap using cloud Gemma4 (OpenRouter → Groq → Gemini)."""
    user_prompt = _build_prompt(dream, year, branch, crawled_content, language)
    print(f"[LLM] Sending roadmap prompt ({len(user_prompt)} chars)...")
    # Keep system instruction separate to prevent instruction echo
    system_prompt = f"You are an elite career mentor. Return ONLY a raw JSON object matching this exact schema. Do NOT wrap in markdown. {ROADMAP_SCHEMA}"
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    raw_response = await _call_llm_chat(messages, max_tokens=3500, temperature=0.15, json_mode=True)
    parsed = _parse_roadmap_json(raw_response, dream)

    if not parsed:
        raise RuntimeError("LLM returned invalid JSON. Please try again.")

    roadmap = {
        "dream": parsed.get("dream") or dream,
        "summary": parsed.get("summary") or f"Your personalized roadmap to become a {dream}.",
        "stages": [_normalize_stage(s, i) for i, s in enumerate(parsed.get("stages", []))],
    }
    if not roadmap["stages"]:
        raise RuntimeError("LLM returned roadmap with no stages.")

    print(f"[LLM] Successfully generated roadmap with {len(roadmap['stages'])} stages")
    return roadmap


# ──────────────────────────────────────────────
# Smart Task Generation
# ──────────────────────────────────────────────
async def generate_tasks(dream: str, current_stage: str, subjects: list[str], count: int = 5) -> list[dict]:
    subjects_str = ", ".join(subjects) if subjects else dream
    try:
        system_prompt = "You are an expert educator tasked with generating daily tasks."
        user_prompt = f"Create exactly {count} actionable daily tasks for a student studying to become a {dream}, currently at stage: '{current_stage}'.\nTheir current topics: {subjects_str}.\n\nTasks must be balanced: theory, hands-on, and review.\nReturn ONLY valid JSON array with exactly {count} objects:\n[{{\"title\": \"Specific actionable task\", \"type\": \"theory|hands-on|review\"}}]"
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        raw = await _call_llm_chat(messages, max_tokens=800, temperature=0.2, json_mode=True)
        try:
            parsed = json.loads(raw.strip())
        except json.JSONDecodeError:
            match = re.search(r'\[[\s\S]*\]', raw)
            parsed = json.loads(match.group(0)) if match else []
        if isinstance(parsed, list) and len(parsed) > 0:
            print(f"[LLM] Generated {len(parsed)} smart tasks")
            return parsed
    except Exception as e:
        print(f"[LLM] Failed to generate smart tasks: {e}")
    return []


# ──────────────────────────────────────────────
# Smart Quiz Generation
# ──────────────────────────────────────────────
async def generate_quiz(subject: str, tasks: list[str], stage_desc: str = "", stage_concepts: list[str] = []) -> list[dict]:
    tasks_str = ", ".join(tasks) if tasks else ""
    concepts_str = ", ".join(stage_concepts) if stage_concepts else ""
    try:
        system_prompt = "You are an expert academic examiner and technical lead tasked with creating a professional quiz."
        user_prompt = f"Create a 10-question MCQ quiz for {subject} at stage: {stage_desc[:500]}.\nConcepts: {concepts_str}\nTasks: {tasks_str}\n\nReturn ONLY a JSON array of 10 objects: [{{'question': '...', 'options': ['...'], 'correctAnswer': 0, 'explanation': '...'}}]"
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        raw = await _call_llm_chat(messages, max_tokens=2500, temperature=0.7, json_mode=True)
        raw = raw.strip()
        if raw.startswith('```'):
            raw = re.sub(r'^```[a-zA-Z]*\n', '', raw)
            raw = re.sub(r'\n```$', '', raw).strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\[[\s\S]*\]', raw)
            parsed = json.loads(match.group(0)) if match else []
        if isinstance(parsed, list) and len(parsed) >= 1:
            print(f"[LLM] Generated {len(parsed)} quiz questions")
            return parsed[:10]
    except Exception as e:
        print(f"[LLM] Failed to generate quiz: {e}")
    raise RuntimeError("Failed to generate quiz.")


# ──────────────────────────────────────────────
# AI Mentor Chat
# ──────────────────────────────────────────────
async def chat_mentor(user_profile: dict, messages: list[dict], new_message: str,
                      attachment_base64: str = "", attachment_type: str = "", language: str = "en") -> str:
    dream = user_profile.get("dream", "a great career")
    year = user_profile.get("year", "student")
    branch = user_profile.get("branch", "general studies")
    stage_idx = user_profile.get("currentStageIndex", 0) + 1
    lang_name = LANGUAGE_NAMES.get(language, "English")

    language_instruction = (
        f"\nIMPORTANT: Always respond in {lang_name} language."
        if language != "en" else ""
    )

    system_prompt = f"""You are Kalam Spark, a friendly and encouraging AI career mentor.
Student: {user_profile.get('name', 'Student')}, Dream: {dream}, Education: {year}, Branch: {branch}, Stage: {stage_idx}.{language_instruction}

- Be warm and supportive. 
- Respond NATURALLY to simple greetings (say hello back — do NOT generate a huge roadmap).
- Keep responses focused and practical (2-3 paragraphs max).
- Never use markdown headers. Use **bold** for emphasis."""

    chat_messages = [{"role": "system", "content": system_prompt}]

    for msg in messages:
        if "role" in msg and "text" in msg:
            role = "assistant" if msg["role"] == "ai" else "user"
            chat_messages.append({"role": role, "content": msg["text"]})

    content = new_message
    att_b64 = ""
    att_type = ""

    if attachment_base64:
        if attachment_type == "text":
            content = f"[Attached document]:\n{attachment_base64[:6000]}\n\n---\nUser: {new_message}"
        elif attachment_type.startswith("image/") or attachment_type.startswith("video/"):
            # video frames are sent as image/jpeg from frontend
            att_b64 = attachment_base64
            att_type = attachment_type
            if not content: content = "Please analyze this image."

    chat_messages.append({"role": "user", "content": content})

    try:
        reply = await _call_llm_chat(chat_messages, max_tokens=1500, temperature=0.7, 
                                     attachment_b64=att_b64, attachment_type=att_type)
        print(f"[LLM] Chat mentor response: {len(reply)} chars")
        return reply
    except Exception as e:
        print(f"[LLM] Chat mentor failed: {e}")
        raise


# ──────────────────────────────────────────────
# Career Pivot Analysis
# ──────────────────────────────────────────────
async def analyze_career_pivot(current_dream: str, new_dream: str, branch: str, year: str, current_skills: str) -> dict:
    try:
        system_prompt = "You are a Career Transition Architect with deep knowledge of the Indian job market."
        user_prompt = f"A student wants to pivot from {current_dream} to {new_dream}. Branch: {branch}, Skills: {current_skills}.\nReturn ONLY valid JSON with transferPercentage, transferableSkills, biggestGap, marketDemand, timeToTransition, and bridgePlan."
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        raw = await _call_llm_chat(messages, max_tokens=1200, temperature=0.25, json_mode=True)
        if raw.startswith('```'):
            raw = re.sub(r'^```[a-zA-Z]*\n', '', raw)
            raw = re.sub(r'\n```$', '', raw).strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{[\s\S]*\}', raw)
            parsed = json.loads(match.group(0)) if match else None
        required = ["transferPercentage", "transferableSkills", "bridgePlan"]
        if parsed and isinstance(parsed, dict) and all(k in parsed for k in required):
            print(f"[LLM] Career pivot: {parsed.get('transferPercentage')}% transfer")
            return parsed
    except Exception as e:
        print(f"[LLM] Career pivot failed: {e}")

    return {
        "transferPercentage": 45,
        "transferableSkills": ["Problem Solving", "Research Skills", "Self-Learning"],
        "biggestGap": f"Transitioning from {current_dream} to {new_dream} requires specialized domain knowledge.",
        "marketDemand": f"{new_dream} roles are growing in India with increasing demand.",
        "timeToTransition": "6-12 months with consistent effort",
        "bridgePlan": [
            {"title": "Foundation Learning", "action": f"Start with free courses on NPTEL or Coursera covering core concepts of {new_dream}."},
            {"title": "Build Projects", "action": f"Create 2-3 portfolio projects demonstrating {new_dream} skills. Share on GitHub and LinkedIn."},
            {"title": "Network & Apply", "action": f"Join {new_dream} communities on LinkedIn, attend meetups, and apply on Internshala."}
        ]
    }


# ──────────────────────────────────────────────
# Opportunity Scanner
# ──────────────────────────────────────────────
async def generate_opportunities(dream: str, branch: str, year: str, current_skills: str, stage_index: int) -> list:
    PLATFORM_URLS = {
        "linkedin": f"https://www.linkedin.com/jobs/search/?keywords={dream.replace(' ', '+')}&location=India&f_E=1",
        "internshala": f"https://internshala.com/internships/{dream.lower().replace(' ', '-')}-internship",
        "naukri": f"https://www.naukri.com/{dream.lower().replace(' ', '-')}-jobs",
        "unstop": f"https://unstop.com/hackathons?search={dream.replace(' ', '+')}",
        "devpost": f"https://devpost.com/hackathons?search={dream.replace(' ', '+')}",
        "sih": "https://www.sih.gov.in/",
        "freelancer": f"https://www.freelancer.in/jobs/{dream.lower().replace(' ', '-')}/",
        "google": f"https://www.google.com/search?q={dream.replace(' ', '+')}+internship+OR+hackathon+India+2025",
    }
    try:
        system_prompt = "You are an Opportunity Scanner AI for Indian students in 2025."
        user_prompt = f"Find 6 realistic opportunities for a student with dream career '{dream}'. Branch: {branch}, Stage: {stage_index+1}.\nReturn ONLY a JSON array of objects with: type, title, company, location, requiredSkills, matchPercentage, actionText, platform."
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        raw = await _call_llm_chat(messages, max_tokens=1800, temperature=0.4, json_mode=True)
        raw = raw.strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\[[\s\S]*\]', raw)
            parsed = json.loads(match.group(0)) if match else None
        if isinstance(parsed, list) and len(parsed) > 0:
            for opp in parsed:
                platform = opp.get("platform", "google").lower()
                opp["searchUrl"] = PLATFORM_URLS.get(platform, PLATFORM_URLS["google"])
            print(f"[LLM] Generated {len(parsed)} opportunities")
            return parsed
        elif isinstance(parsed, dict):
            items = parsed.get("items", parsed.get("opportunities", []))
            if items:
                for opp in items:
                    opp["searchUrl"] = PLATFORM_URLS.get(opp.get("platform", "google"), PLATFORM_URLS["google"])
                return items
    except Exception as e:
        print(f"[LLM] Opportunity scan failed: {e}")

    return [
        {"type": "Internship", "title": f"{dream} Intern", "company": "Internshala Partner Companies", "location": "Remote / Pan India", "requiredSkills": [branch or "Communication", "Eagerness to Learn", "Domain Knowledge"], "matchPercentage": 85, "actionText": "Apply on Internshala", "platform": "internshala", "searchUrl": PLATFORM_URLS["internshala"]},
        {"type": "Hackathon", "title": "Smart India Hackathon 2025", "company": "Ministry of Education, Govt. of India", "location": "Pan India", "requiredSkills": ["Teamwork", "Innovation", "Problem Solving"], "matchPercentage": 90, "actionText": "Register on SIH Portal", "platform": "sih", "searchUrl": PLATFORM_URLS["sih"]},
        {"type": "Hackathon", "title": f"{dream} Innovation Challenge", "company": "Unstop Community", "location": "Online", "requiredSkills": ["Creativity", branch or "Research", "Presentation"], "matchPercentage": 88, "actionText": "Browse on Unstop", "platform": "unstop", "searchUrl": PLATFORM_URLS["unstop"]},
        {"type": "Job", "title": f"Entry-Level {dream}", "company": "Naukri Listed Startups", "location": "Bangalore / Delhi / Remote", "requiredSkills": ["Domain Knowledge", "Communication", "Problem Solving"], "matchPercentage": 78, "actionText": "Search on Naukri", "platform": "naukri", "searchUrl": PLATFORM_URLS["naukri"]},
        {"type": "Internship", "title": f"Junior {dream} Trainee", "company": "LinkedIn Partner Companies", "location": "India (Multiple Cities)", "requiredSkills": ["Fresher Friendly", "Domain Basics", "Communication"], "matchPercentage": 82, "actionText": "Apply on LinkedIn", "platform": "linkedin", "searchUrl": PLATFORM_URLS["linkedin"]},
        {"type": "Freelance", "title": f"Freelance {dream} Projects", "company": "Freelancer.in", "location": "Online", "requiredSkills": ["Portfolio", "Self-Management", "Communication"], "matchPercentage": 74, "actionText": "Browse Projects", "platform": "freelancer", "searchUrl": PLATFORM_URLS["freelancer"]},
    ]


# ──────────────────────────────────────────────
# Health check (no longer needs Ollama)
# ──────────────────────────────────────────────
async def check_ollama() -> dict:
    """Returns cloud AI status + checks if local Ollama is available."""
    providers = []
    if OPENROUTER_API_KEY:
        providers.append("OpenRouter (Gemma 4 31B / 26B)")
    if GEMINI_API_KEY:
        providers.append("Google AI Studio (Gemma 4 31B)")

    # Check local Ollama availability
    ollama_local = {"running": False, "model_available": False}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                model_names = [m.get("name", "") for m in models]
                has_gemma4 = any("gemma4" in n.lower() or "gemma" in n.lower() for n in model_names)
                ollama_local = {"running": True, "model_available": has_gemma4, "models": model_names}
                if has_gemma4:
                    providers.append(f"Ollama (local: {OLLAMA_MODEL})")
    except Exception:
        pass  # Ollama not running locally — that's fine

    return {
        "running": len(providers) > 0,
        "model_available": len(providers) > 0,
        "model_name": "Gemma4 (Cloud + Local fallback)",
        "providers": providers,
        "mode": "cloud+local",
        "ollama_local": ollama_local,
    }


# ──────────────────────────────────────────────
# Dream Discovery
# ──────────────────────────────────────────────
async def discover_dream_careers(interests: str, personality: str, language: str = "en") -> list:
    """Uses the AI model to suggest 12 career paths based on user answers."""
    try:
        system_prompt = "You are an expert career counselor. Return only valid JSON. Use exactly the field names 'dream' and 'subjects'."
        user_prompt = (
            f"Suggest exactly 12 ideal career paths for this student.\n"
            f"Interests: {interests}\n"
            f"Personality: {personality}\n\n"
            f"Return ONLY a JSON array of exactly 12 objects. Each object MUST have:\n"
            f"  'dream': career title (string)\n"
            f"  'subjects': array of exactly 3 key skills/subjects (strings)\n\n"
            f"Example:\n"
            f'[{{"dream": "Software Engineer", "subjects": ["Python", "Data Structures", "System Design"]}}, ...]\n\n'
            f"No markdown, no explanation — only the raw JSON array."
        )
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        response = await _call_llm_chat(messages, max_tokens=2000, temperature=0.7, json_mode=True)

        # ── Parse JSON ──
        parsed = None
        # Try direct array match first
        arr_match = re.search(r'\[\s*\{.*\}\s*\]', response, re.DOTALL)
        if arr_match:
            parsed = json.loads(arr_match.group(0))
        else:
            parsed = json.loads(response)

        # Unwrap if model returned {"careers": [...]} or similar
        if isinstance(parsed, dict):
            for val in parsed.values():
                if isinstance(val, list) and len(val) > 0:
                    parsed = val
                    break

        # ── Normalize field names ──
        # Some models use title/name/career instead of dream, or skills/tags instead of subjects
        def _normalize_career(item: dict) -> dict:
            dream_val = (
                item.get("dream") or item.get("title") or item.get("name") or
                item.get("career") or item.get("career_title") or ""
            )
            subjects_val = (
                item.get("subjects") or item.get("skills") or item.get("tags") or
                item.get("key_subjects") or []
            )
            if isinstance(subjects_val, str):
                subjects_val = [s.strip() for s in subjects_val.split(",") if s.strip()]
            return {"dream": str(dream_val).strip(), "subjects": list(subjects_val)[:3]}

        if isinstance(parsed, list) and len(parsed) > 0:
            normalized = [_normalize_career(c) for c in parsed if isinstance(c, dict)]
            valid = [c for c in normalized if c["dream"]]  # drop empty dream fields
            if valid:
                print(f"[LLM] Dream discovery: {len(valid)} careers returned")
                return valid

        raise ValueError(f"LLM returned valid JSON but not a usable list of careers (len={len(parsed) if isinstance(parsed, list) else 'N/A'})")

    except Exception as e:
        print(f"[LLM] discover_dream_careers failed: {e}")
        # 12-item fallback so UI always has something to show
        return [
            {"dream": "Software Engineer",      "subjects": ["Computer Science", "Logic", "Math"]},
            {"dream": "Data Scientist",          "subjects": ["Statistics", "Programming", "Analysis"]},
            {"dream": "Product Manager",         "subjects": ["Leadership", "Design", "Business"]},
            {"dream": "UI/UX Designer",          "subjects": ["Visual Design", "User Research", "Prototyping"]},
            {"dream": "Digital Marketer",        "subjects": ["SEO", "Content Strategy", "Analytics"]},
            {"dream": "Cybersecurity Analyst",   "subjects": ["Network Security", "Cryptography", "Risk Assessment"]},
            {"dream": "Cloud Architect",         "subjects": ["AWS/Azure", "DevOps", "Infrastructure"]},
            {"dream": "Business Analyst",        "subjects": ["Data Modeling", "Requirements", "Communication"]},
            {"dream": "Full Stack Developer",    "subjects": ["Frontend", "Backend", "Database"]},
            {"dream": "AI Engineer",             "subjects": ["Machine Learning", "Neural Networks", "Python"]},
            {"dream": "Content Creator",         "subjects": ["Storytelling", "Video Editing", "Marketing"]},
            {"dream": "Financial Analyst",       "subjects": ["Accounting", "Investment", "Reporting"]},
        ]


async def generate_career_summary(dream: str, branch: str, year: str, language: str = "en") -> str:
    """Generate a highly specific 3-sentence career summary."""
    lang_name = LANGUAGE_NAMES.get(language, "English")
    try:
        system_prompt = "You are a concise career summary writer."
        user_prompt = f"Write an inspiring career overview for a {dream} (focusing on {branch} for a {year} student) in {lang_name}.\nOutput ONLY a JSON object with keys 'sentence1', 'sentence2', 'sentence3'."
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        response = await _call_llm_chat(messages, max_tokens=600, temperature=0.3, json_mode=True)
        raw = response.strip()
        try:
            if raw.startswith('```'):
                raw = re.sub(r'^```[a-zA-Z]*\n', '', raw)
                raw = re.sub(r'\n```$', '', raw).strip()
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and "sentence1" in parsed and "sentence2" in parsed and "sentence3" in parsed:
                s1 = str(parsed["sentence1"]).strip()
                s2 = str(parsed["sentence2"]).strip()
                s3 = str(parsed["sentence3"]).strip()
                s1 = s1 if s1.endswith(('.', '!', '?')) else s1 + '.'
                s2 = s2 if s2.endswith(('.', '!', '?')) else s2 + '.'
                s3 = s3 if s3.endswith(('.', '!', '?')) else s3 + '.'
                return f"{s1} {s2} {s3}"
        except Exception:
            pass
        # fallback plain text handling
        text = response.strip()
        text = re.sub(r'[\*\-\#]', '', text)
        text = re.sub(r'(?i)constraint \d+:', '', text)
        text = re.sub(r'\n+', ' ', text)
        text = re.sub(r'\s{2,}', ' ', text)
        return text.strip()
    except Exception as e:
        print(f"Error in generate_career_summary: {e}")
        # Career-specific fallbacks
        d = dream.lower()
        if "engineer" in d or "developer" in d:
            return f"A {dream} designs and builds technical solutions that solve complex real-world problems through code and logic. You will spend your days writing high-quality code, debugging systems, and collaborating with teams on platforms like GitHub. Your main duties include architecting software features, optimizing performance, and ensuring system reliability."
        if "doctor" in d or "health" in d:
            return f"A {dream} is a dedicated healthcare provider who diagnoses illnesses and promotes wellness in their community. Your daily work involves clinical examinations, analyzing patient data, and coordinating care with other medical professionals. Your core responsibilities are accurate diagnosis, treatment planning, and patient education."
        if "designer" in d or "artist" in d:
            return f"A {dream} transforms abstract ideas into compelling visual experiences that communicate meaning and inspire action. You will work daily with tools like Figma or Adobe Creative Cloud, conducting user research and iterating on design prototypes. Your key roles are creating intuitive interfaces, maintaining brand consistency, and solving visual problems."
        
        return f"A {dream} is a specialized professional who applies expert knowledge in {branch} to drive innovation and impact. Daily work involves using industry-specific tools to solve unique challenges and collaborating with peers to reach project goals. Your critical responsibilities include strategic planning, execution of core tasks, and delivering high-quality results."

