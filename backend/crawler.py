"""
crawler.py - Web crawler using BeautifulSoup for Kalam Spark
Crawls real career sites to get accurate, up-to-date roadmap data.
"""

import asyncio
import httpx
try:
    from crawl4ai import AsyncWebCrawler
    CRAWL4AI_AVAILABLE = True
except ImportError:
    CRAWL4AI_AVAILABLE = False

from bs4 import BeautifulSoup
from typing import Optional

# ──────────────────────────────────────────────
# roadmap.sh slug mapper (tech careers)
# ──────────────────────────────────────────────
ROADMAP_SH_SLUGS: dict[str, str] = {
    # Frontend
    "frontend developer": "frontend",
    "frontend engineer": "frontend",
    "web developer": "frontend",
    "ui developer": "frontend",
    # Backend
    "backend developer": "backend",
    "backend engineer": "backend",
    "server side developer": "backend",
    # Full Stack
    "full stack developer": "full-stack",
    "full stack engineer": "full-stack",
    "fullstack developer": "full-stack",
    # DevOps / Cloud
    "devops engineer": "devops",
    "devops": "devops",
    "cloud engineer": "devops",
    "site reliability engineer": "devops",
    "sre": "devops",
    # AI / ML
    "machine learning engineer": "mlops",
    "ml engineer": "mlops",
    "ai engineer": "ai-data-scientist",
    "data scientist": "ai-data-scientist",
    "data analyst": "data-analyst",
    # Mobile
    "android developer": "android",
    "android engineer": "android",
    "ios developer": "ios",
    "ios engineer": "ios",
    "mobile developer": "android",
    # Game
    "game developer": "game-developer",
    "game designer": "game-developer",
    # Security
    "cybersecurity engineer": "cyber-security",
    "security engineer": "cyber-security",
    "ethical hacker": "cyber-security",
    "penetration tester": "cyber-security",
    # Blockchain
    "blockchain developer": "blockchain",
    "web3 developer": "blockchain",
    "smart contract developer": "blockchain",
    # Languages / Frameworks
    "react developer": "react",
    "react engineer": "react",
    "vue developer": "vue",
    "angular developer": "angular",
    "node.js developer": "nodejs",
    "python developer": "python",
    "java developer": "java",
    "javascript developer": "javascript",
    "typescript developer": "typescript",
    "rust developer": "rust",
    "go developer": "golang",
    # Design
    "ux designer": "ux-design",
    "ui designer": "ux-design",
    "product designer": "ux-design",
    # Database
    "database administrator": "postgresql-dba",
    "dba": "postgresql-dba",
    # QA
    "qa engineer": "qa",
    "software tester": "qa",
    # System Design
    "software architect": "system-design",
    "solution architect": "system-design",
    "solution designer": "system-design",
}


def get_roadmapsh_slug(dream: str) -> Optional[str]:
    """Find roadmap.sh slug for a given dream career."""
    dream_lower = dream.lower().strip()
    # Exact match first
    if dream_lower in ROADMAP_SH_SLUGS:
        return ROADMAP_SH_SLUGS[dream_lower]
    # Partial match
    for key, slug in ROADMAP_SH_SLUGS.items():
        if key in dream_lower or dream_lower in key:
            return slug
    return None


def get_crawl_urls(dream: str, branch: str) -> list[str]:
    """Build a prioritized list of URLs to crawl for a given dream career."""
    urls: list[str] = []

    # 1. roadmap.sh — best structured career content
    slug = get_roadmapsh_slug(dream)
    if slug:
        urls.append(f"https://roadmap.sh/{slug}")

    # 2. Wikipedia — reliable career descriptions & skills
    wiki_title = dream.strip().replace(" ", "_")
    urls.append(f"https://en.wikipedia.org/wiki/{wiki_title}")

    # 3. GeeksForGeeks "How to become" article (great for tech)
    gfg_title = dream.strip().lower().replace(" ", "-")
    urls.append(f"https://www.geeksforgeeks.org/how-to-become-a-{gfg_title}/")

    # Limit to first 3 best sources (quality > quantity)
    return urls[:3]


async def _crawl_single_bs4(client: httpx.AsyncClient, url: str, timeout: int = 20) -> str:
    """Fallback crawler using BeautifulSoup if crawl4ai is not available."""
    try:
        resp = await client.get(url, timeout=timeout, follow_redirects=True)
        if resp.status_code != 200:
            return ""

        soup = BeautifulSoup(resp.text, 'html.parser')

        # Remove noise
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()

        # Extract text
        text = soup.get_text(separator='\n')
        # Clean whitespace
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        clean_text = '\n'.join(lines)
        
        return clean_text
    except Exception as e:
        print(f"[Crawler] Error on {url} (bs4 fallback): {e}")
    return ""


async def crawl_career_data(dream: str, branch: str, max_chars_per_source: int = 5000) -> str:
    """
    Crawl multiple career sources for a given dream.
    Uses crawl4ai if available, otherwise falls back to BeautifulSoup.
    """
    urls = get_crawl_urls(dream, branch)
    print(f"[Crawler] Crawling {len(urls)} sources for '{dream}': {urls}")

    collected: list[str] = []

    if CRAWL4AI_AVAILABLE:
        print("[Crawler] Using crawl4ai for rich content extraction...")
        def run_crawl4ai_sync(urls_to_crawl, max_chars):
            import asyncio
            import sys
            # Force ProactorEventLoop for Playwright subprocess compatibility on Windows
            if sys.platform == "win32":
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
            
            async def _do_crawl():
                col = []
                async with AsyncWebCrawler() as crawler:
                    for u in urls_to_crawl:
                        try:
                            result = await crawler.arun(url=u)
                            if result and result.markdown:
                                trimmed = result.markdown[:max_chars]
                                col.append(f"### Source: {u}\\n\\n{trimmed}")
                                print(f"[Crawler] Got {len(result.markdown)} chars from {u} via crawl4ai")
                            else:
                                print(f"[Crawler] No markdown extracted from {u} via crawl4ai")
                        except Exception as inner_e:
                            print(f"[Crawler] crawl4ai error on {u}: {inner_e}")
                return col
                
            return asyncio.run(_do_crawl())

        try:
            collected = await asyncio.to_thread(run_crawl4ai_sync, urls, max_chars_per_source)
        except Exception as e:
            print(f"[Crawler] AsyncWebCrawler failed entirely: {e}. Attempting fallback...")
    
    # Fallback to bs4 if crawl4ai wasn't available or failed to collect anything
    if not collected:
        if not CRAWL4AI_AVAILABLE:
            print("[Crawler] crawl4ai not installed. Using BeautifulSoup fallback...")
        async with httpx.AsyncClient(
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"},
            follow_redirects=True
        ) as client:
            tasks = [_crawl_single_bs4(client, url) for url in urls]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for url, content in zip(urls, results):
            if isinstance(content, Exception) or not content:
                print(f"[Crawler] No content from {url} (bs4)")
                continue
            trimmed = content[:max_chars_per_source]
            collected.append(f"### Source: {url}\\n\\n{trimmed}")
            print(f"[Crawler] Got {len(content)} chars from {url} (bs4)")

    if not collected:
        print("[Crawler] All sources failed — returning empty context")
        return ""

    combined = "\\n\\n---\\n\\n".join(collected)
    print(f"[Crawler] Total context: {len(combined)} chars from {len(collected)} sources")
    return combined
