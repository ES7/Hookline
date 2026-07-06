import os

from dotenv import load_dotenv
from groq import Groq
from tavily import TavilyClient

from agents.classifier import classify_scenario
from agents.entity_verifier import any_source_mentions_person, filter_verified_sources

load_dotenv()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

SCENARIO_QUERY = {
    "no_news": "{company} job postings products services 2026",
    "job_change": "{prospect} new role {company} previous company 2025 2026",
    "bad_news": "{company} challenges layoffs controversy response 2025 2026",
    "competitor": "{company} tech stack tools software platforms used",
    "standard": "{prospect} {company} news announcements 2026",
}

SCENARIO_INSTRUCTION = {
    "no_news": "Limited news available. Focus on job postings and product positioning. Use only provided data.",
    "job_change": "Prospect recently changed roles. Focus on when they joined, previous role, what they are building. Use only provided data.",
    "bad_news": "Company facing challenges. Focus on how they are responding constructively. Be factual, not opportunistic.",
    "competitor": "Company uses a competitor product. Focus on their tech stack and any visible gaps. Use only provided data.",
    "standard": "Find the most compelling recent facts. Focus on news, launches, funding, prospect statements. Use only provided data.",
}


class ProspectVerificationError(ValueError):
    pass


def _run_search(query: str, company_name: str = None):
    results = tavily_client.search(query=query, max_results=5, search_depth="advanced")
    raw_results = results.get("results", [])

    if company_name:
        verified = filter_verified_sources(raw_results, company_name)
        rejected = [r for r in raw_results if r not in verified]
    else:
        verified, rejected = raw_results, []

    text, sources = "", []
    for result in verified:
        url = result.get("url", "")
        content = result.get("content", "")
        text += f"SOURCE: {url}\nCONTENT: {content}\n\n"
        if url:
            sources.append(url)

    rejected_urls = [r.get("url", "") for r in rejected]
    return text, sources, rejected_urls, verified


async def research_prospect(prospect_name: str, company_name: str, manual_override: str = "none"):
    """
    Two-pass research with a hard verification gate:
    1. Search for the prospect and company.
    2. Require verified company sources and a verified prospect mention.
    3. Only then classify, run targeted research, and summarize with the LLM.
    """
    broad_text, broad_sources, broad_rejected, broad_verified = _run_search(
        f"{prospect_name} {company_name} news announcements 2026",
        company_name,
    )

    if not broad_verified:
        raise ProspectVerificationError(
            "No verified sources matched that company. Check the company name before running again."
        )

    if not any_source_mentions_person(broad_verified, prospect_name):
        raise ProspectVerificationError(
            "No verified sources connected that prospect to the company. Use a full real name and company."
        )

    if manual_override and manual_override != "none":
        scenario_info = {
            "scenario": manual_override,
            "confidence": "manual",
            "reasoning": "manually overridden by caller",
        }
    else:
        scenario_info = await classify_scenario(prospect_name, company_name, broad_text)

    scenario = scenario_info["scenario"]
    targeted_query = SCENARIO_QUERY[scenario].format(prospect=prospect_name, company=company_name)

    all_rejected = list(broad_rejected)
    if scenario == "standard":
        web_context, sources = broad_text, broad_sources
    else:
        targeted_text, targeted_sources, targeted_rejected, _targeted_verified = _run_search(
            targeted_query,
            company_name,
        )
        web_context = broad_text + targeted_text
        sources = list(dict.fromkeys(broad_sources + targeted_sources))
        all_rejected += targeted_rejected

    if not web_context.strip() or not sources:
        raise ProspectVerificationError(
            "No verified research sources were available. The system will not draft from unsupported data."
        )

    instruction = SCENARIO_INSTRUCTION[scenario]

    prompt = f"""You are a B2B sales researcher.

Based ONLY on the following real web search results, research {prospect_name} at {company_name}.

{instruction}

WEB SEARCH RESULTS:
{web_context}

Provide a concise research summary with:
- 3-4 specific factual findings
- Dates where available
- No hallucination: only use what is in the search results"""

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "You are an expert B2B sales researcher. Only use the provided web search data. Never hallucinate or make up facts.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_tokens=800,
    )

    return response.choices[0].message.content, sources, scenario_info, all_rejected
