from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

async def find_hook(
    research: str,
    scenario: str
) -> str:
    """scenario is now the system-detected scenario (from classifier.py), not a user-picked value."""

    edge_case_instruction = ""

    if scenario == "no_news":
        edge_case_instruction = """
        Since there is limited news, base the hook on:
        - Their job postings (reveals priorities)
        - Their product/service positioning
        Do NOT fabricate news."""

    elif scenario == "bad_news":
        edge_case_instruction = """
        Company is going through challenges.
        Hook should be empathetic, not opportunistic.
        Focus on how we can help during this time.
        Avoid mentioning layoffs directly."""

    elif scenario == "job_change":
        edge_case_instruction = """
        Prospect recently joined this company.
        Hook should reference the opportunity
        a new leader has to make impact."""

    elif scenario == "competitor":
        edge_case_instruction = """
        Company uses a competitor product.
        Do NOT trash the competitor.
        Focus on what we do differently."""

    prompt = f"""Based on this research:
{research}

{edge_case_instruction}

Identify the SINGLE most compelling hook 
for a cold outreach email.

Return in this exact format:
HOOK: [one sentence — the specific angle]
REASONING: [why this hook is relevant]
CONFIDENCE: [High / Medium / Low]"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system", 
                "content": """You are an expert B2B sales strategist.
                
                STRICT RULES:
                - Only identify POSITIVE hooks — growth, launches, 
                expansion, innovation, milestones
                - Never use negative news as a hook
                - Never reference controversies or legal issues"""
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.3,
        max_tokens=300
    )

    return response.choices[0].message.content