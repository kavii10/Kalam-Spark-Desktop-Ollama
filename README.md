# Kalam Spark 🚀

> **A Submission for the Gemma 4 Hackathon**
> 
> **Kalam Spark** is a comprehensive, AI-powered career mentoring platform designed to democratize career guidance for students. It offers personalized roadmaps, an interactive AI mentor chat, document intelligence, and scientifically-backed learning tools—all driven by the power of **Gemma 4**.

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

---

## 🌟 Overall Summary

Navigating career choices can be overwhelming. Kalam Spark acts as a personal AI career architect. It starts by helping students discover their ideal career path through an intelligent personality quiz. Once a dream career is chosen, the platform uses a hybrid pipeline of **web crawling** (to fetch real-time industry data) and **Gemma 4** to generate a highly detailed, 4-stage learning roadmap.

Beyond just a roadmap, Kalam Spark is a full educational ecosystem:
- **Daily Planner & Spaced Repetition:** AI-generated daily tasks managed with a Pomodoro timer, backed by FSRS v5 and Ebisu algorithms for long-term knowledge retention.
- **AI Mentor Chat:** A persistent, multimodal AI mentor available 24/7 to answer questions, analyze uploaded images, and provide career advice.
- **Document Intelligence (File Speaker):** Upload study materials (PDF/DOCX) or paste URLs to chat with your documents using RAG (Retrieval-Augmented Generation), create flashcards, or even generate AI-hosted podcasts using Edge-TTS.
- **Opportunity Radar:** Real-time curation of internships, hackathons, and jobs matched to the student's exact roadmap stage.
- **Career Pivot Analysis:** Evaluates the difficulty of switching careers and generates an actionable bridge plan.

---

## 🧠 Powered by Gemma 4

Kalam Spark heavily leverages the **Gemma 4** model family for its reasoning, summarization, and conversational capabilities. To ensure maximum reliability and accessibility, the application features a **3-tier Multi-LLM failover routing system**:

1. **Tier 1 (Primary Cloud):** OpenRouter API (Gemma 4 31B / 26B)
2. **Tier 2 (Secondary Cloud):** Google AI Studio API (Gemma 4 31B)
3. **Tier 3 (Local Fallback):** Local Ollama daemon (`gemma4:e4b`)

This architecture guarantees that the platform remains functional even if cloud APIs face rate limits or network issues, allowing users to run the entire AI pipeline entirely locally.

---

## 🏗️ Project Structure & Tech Stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS (Glassmorphism UI)
**Backend:** FastAPI (Python 3.11+)
**Database & Auth:** Supabase (PostgreSQL)
**AI / RAG:** Gemma 4, ChromaDB (Vector Store), `text-embedding-004`
**Web Scraping:** Crawl4AI, Playwright, BeautifulSoup
**Audio Synthesis:** Edge-TTS (Microsoft Neural voices, supporting 8 Indian languages)

---

## 🚀 How to Run the Project

You can run Kalam Spark in two modes: **Cloud API Mode** (faster, requires API keys) or **Local LLM Mode** (runs completely offline using your hardware).

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.11 or higher)
- **Supabase Account** (for database setup)

### 1. Database Setup (Supabase)
1. Create a new project on [Supabase](https://supabase.com/).
2. Navigate to the SQL Editor and run the SQL script found in `database/schema.sql` to create the necessary tables.
3. Get your Project URL and Anon Key from the Project Settings -> API.

### 2. Frontend Setup
```bash
cd frontend
npm install

# Setup environment variables
cp .env.example .env
```
Edit `frontend/.env` and add your Supabase credentials:
```env
VITE_SUPABASE_URL="your-supabase-url"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
VITE_API_URL="http://localhost:8000"
```
Start the frontend development server:
```bash
npm run dev
# The app will run on http://localhost:5173 (or 3000 depending on Vite config)
```

### 3. Backend Setup
```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browser for web crawling
playwright install chromium

# Setup environment variables
cp .env.example .env
```

---

### 🌐 Option A: Running with Cloud APIs (Recommended)
Edit `backend/.env` and add your API keys. You only need one, but providing both enables failover.
```env
OPENROUTER_API_KEY="your-openrouter-key"
GEMINI_API_KEY="your-google-ai-studio-key"
```

Start the FastAPI server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

### 💻 Option B: Running with Local LLM (Offline Mode via Ollama)
Kalam Spark can run entirely offline using Ollama as a fallback when API keys are absent or requests fail.

1. Install [Ollama](https://ollama.com/).
2. Open a new terminal and start the Ollama daemon:
   ```bash
   ollama serve
   ```
3. Pull the quantized Gemma 4 model:
   ```bash
   ollama pull gemma4:e4b
   ```
4. Ensure your `backend/.env` has the Ollama configuration (this is usually the default):
   ```env
   OLLAMA_BASE_URL="http://localhost:11434"
   OLLAMA_MODEL="gemma4:e4b"
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
*Note: If no cloud API keys are provided in `.env`, the backend will automatically route all AI requests to your local Ollama instance.*

---

## 📜 License

This project is released under the **Apache License 2.0**. 

You may obtain a copy of the License at:
http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
