import re


def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace/punctuation so 'Voke AI' and 'voke-ai' match consistently."""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _word_present(word: str, text: str) -> bool:
    """
    Word-boundary match, NOT plain substring match. This is the fix for the
    exact bug that caused the Voke AI / Voker mixup: plain 'voke' in 'voker'
    returns True with substring matching because 'voke' is literally inside
    the letters of 'voker'. \b ensures 'voke' only matches the whole word
    'voke', not as a prefix of 'voker'.
    """
    return re.search(r"\b" + re.escape(word) + r"\b", text) is not None


def is_source_about_company(content: str, url: str, company_name: str) -> bool:
    """
    Deterministic check, not an LLM judgment call: does this source actually
    mention the exact company name?

    This is what catches the 'Voke AI' vs 'Voker' bug. Word-boundary matching
    means 'voke' as a standalone word must appear — 'voker' does not contain
    the standalone word 'voke', so that source gets rejected automatically.
    No model is asked to "decide" whether they're the same company, because
    that's exactly the judgment call that failed last time.
    """
    norm_company = _normalize(company_name)
    norm_content = _normalize(content)
    norm_url = _normalize(url)

    company_words = [w for w in norm_company.split() if len(w) > 1]
    if not company_words:
        return False

    # Full phrase match (word-boundary on the whole phrase) in content or URL
    phrase_pattern = r"\b" + r"\s+".join(re.escape(w) for w in company_words) + r"\b"
    if re.search(phrase_pattern, norm_content) or re.search(phrase_pattern, norm_url):
        return True

    # Fallback: ALL significant words (len > 2, so "AI"/"Co" alone don't count)
    # must appear as standalone words — not substrings — somewhere in the content.
    significant_words = [w for w in company_words if len(w) > 2]
    if significant_words and all(_word_present(w, norm_content) for w in significant_words):
        return True

    return False


def filter_verified_sources(search_results: list, company_name: str) -> list:
    """
    Takes raw Tavily result dicts, returns only the ones that pass the
    entity check above. Anything that fails is dropped before it ever
    reaches the LLM — the model never even sees the wrong-company data,
    so it can't accidentally cite it.
    """
    verified = []
    for r in search_results:
        content = r.get("content", "")
        url = r.get("url", "")
        if is_source_about_company(content, url, company_name):
            verified.append(r)
    return verified


def is_text_about_person(content: str, url: str, prospect_name: str) -> bool:
    """
    Require the prospect's name to appear as a name, not as a loose character
    match. This blocks fake one-letter names and invented people at real
    companies before LLM tokens are spent.
    """
    norm_name = _normalize(prospect_name)
    norm_content = _normalize(content)
    norm_url = _normalize(url)
    name_words = [w for w in norm_name.split() if len(w) > 1]
    if len(name_words) < 2:
        return False

    phrase_pattern = r"\b" + r"\s+".join(re.escape(w) for w in name_words) + r"\b"
    if re.search(phrase_pattern, norm_content) or re.search(phrase_pattern, norm_url):
        return True

    significant_words = [w for w in name_words if len(w) > 2]
    return len(significant_words) >= 2 and all(_word_present(w, norm_content) for w in significant_words)


def any_source_mentions_person(search_results: list, prospect_name: str) -> bool:
    return any(
        is_text_about_person(r.get("content", ""), r.get("url", ""), prospect_name)
        for r in search_results
    )
