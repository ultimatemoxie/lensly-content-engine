const WEAK_PHRASES = [
  "this blog post explores",
  "discussing latest research and trends",
  "is a notable shift",
  "helps organizations",
  "leverages cutting-edge",
  "game-changing",
  "revolutionary",
  "insane",
  "here is a post",
  "read more",
  "click here",
  "subscribe now",
  "follow us"
];

const HOOK_INDICATORS = [
  "why ", "how ", "what ", "watch ", "breaking ", "new ", "first ", "only ",
  "now ", "today ", "here's why", "the real", "surprising", "shift",
  "cannot", "won't", "will", "just ", "still ", "already ", "need to"
];

const GENERIC_INDICATORS = [
  "in today's world",
  "in recent years",
  "it is important to note",
  "it is worth noting",
  "as we all know",
  "needless to say",
  "obviously",
  "clearly",
  "in this post",
  "this article",
  "we believe",
  "our team",
  "we are excited",
  "we are proud",
  "we are thrilled"
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'it',
  'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she',
  'they', 'them', 'his', 'her', 'their', 'what', 'which', 'who', 'whom'
]);

export class PostGrader {
  static stripUnsupportedClaims(text: string, unsupportedClaims: string[]): string {
    if (unsupportedClaims.length === 0) return text;
    let cleaned = text;
    for (const claim of unsupportedClaims) {
      if (!claim) continue;
      const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/[,.!?;:]\s*[,.!?;:]/g, (m) => m.trim());
    if (cleaned.length > 0 && /[.!?]$/.test(cleaned)) {
      return cleaned;
    }
    if (cleaned.length > 0) {
      return cleaned;
    }
    return text;
  }

  static gradePost(
    text: string,
    type: string,
    sourceText: string,
    claims: Array<{ claim: string; sourceEvidence: string }>
  ): {
    hookStrength: number;
    clarity: number;
    usefulness: number;
    originality: number;
    factualGrounding: number;
    naturalVoice: number;
    overallPostQuality: number;
    unsupportedClaims: string[];
    evidenceCount: number;
  } {
    const normalizedText = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = text.split(/[.!?]+/).filter(Boolean);

    const hookStrength = this.scoreHook(text, words, sentences);
    const clarity = this.scoreClarity(sentences, words);
    const usefulness = this.scoreUsefulness(text, words);
    const originality = this.scoreOriginality(text, words, sentences);
    const factualGrounding = this.scoreFactualGrounding(text, claims, sourceText);
    const naturalVoice = this.scoreNaturalVoice(normalizedText, words);

    const sum = hookStrength + clarity + usefulness + originality + factualGrounding + naturalVoice;
    const overallPostQuality = Math.round(sum / 6);

    const unsupportedClaims = claims
      .filter(c => !sourceText.toLowerCase().includes(c.sourceEvidence.toLowerCase()))
      .map(c => c.claim);

    return {
      hookStrength,
      clarity,
      usefulness,
      originality,
      factualGrounding,
      naturalVoice,
      overallPostQuality,
      unsupportedClaims,
      evidenceCount: claims.filter(c => sourceText.toLowerCase().includes(c.sourceEvidence.toLowerCase())).length,
    };
  }

  private static scoreHook(text: string, words: string[], sentences: string[]): number {
    if (sentences.length === 0) return 0;
    const firstSentence = sentences[0].toLowerCase();
    const startMatches = HOOK_INDICATORS.filter(h => firstSentence.includes(h)).length;
    const textLower = text.toLowerCase();
    const totalHookMatches = HOOK_INDICATORS.filter(h => textLower.includes(h)).length;

    let score = 40;
    if (text.length >= 100 && text.length <= 240) score += 20;
    if (startMatches > 0) score += 20;
    if (totalHookMatches > 1) score += 10;
    if (!firstSentence.includes("this blog post") && !firstSentence.includes("in this article")) score += 10;
    return Math.min(100, score);
  }

  private static scoreClarity(sentences: string[], words: string[]): number {
    if (sentences.length === 0) return 20;
    const avgLength = words.length / sentences.length;
    let score = 60;
    if (avgLength >= 8 && avgLength <= 22) score += 20;
    if (avgLength > 0 && avgLength < 35) score += 10;
    if (words.length >= 15) score += 10;
    return Math.min(100, score);
  }

  private static scoreUsefulness(text: string, words: string[]): number {
    const actionable = ["use ", "try ", "build ", "create ", "deploy ", "launch ", "learn ", "apply ", "step ", "guide ", "tool ", "workflow ", "tip ", "insight "];
    const audience = ["creators", "founders", "designers", "developers", "marketers", "builders", "makers", "teams", "engineers"];
    const lower = text.toLowerCase();
    let score = 40;
    if (actionable.some(a => lower.includes(a))) score += 20;
    if (audience.some(a => lower.includes(a))) score += 20;
    if (words.length >= 20) score += 10;
    if (!lower.includes("help") || lower.includes("help you") || lower.includes("help builders")) score += 10;
    return Math.min(100, score);
  }

  private static scoreOriginality(text: string, words: string[], sentences: string[]): number {
    if (sentences.length === 0) return 20;
    const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'what', 'which', 'who', 'whom']);
    const titleLike = sentences.some(s => {
      const lower = s.trim().toLowerCase();
      const titleWords = words.slice(0, 8).map(w => w.toLowerCase()).filter(w => !STOP_WORDS.has(w));
      const overlap = titleWords.filter(w => lower.includes(w)).length;
      return overlap >= Math.min(4, titleWords.length);
    });

    let score = 60;
    if (!titleLike) score += 20;
    const lower = text.toLowerCase();
    if (!GENERIC_INDICATORS.some(g => lower.includes(g))) score += 10;
    if (words.length >= 20) score += 10;
    return Math.min(100, score);
  }

  private static scoreFactualGrounding(text: string, claims: Array<{ claim: string; sourceEvidence: string }>, sourceText: string): number {
    if (claims.length === 0) return 30;
    const lowerSource = sourceText.toLowerCase();
    const matched = claims.filter(c => lowerSource.includes(c.sourceEvidence.toLowerCase())).length;
    const ratio = matched / claims.length;
    let score = Math.round(ratio * 80);
    if (matched >= 1) score += 20;
    return Math.min(100, score);
  }

  private static scoreNaturalVoice(text: string, words: string[]): number {
    const lower = text.toLowerCase();
    let score = 70;
    if (WEAK_PHRASES.some(p => lower.includes(p))) score -= 40;
    if (GENERIC_INDICATORS.some(g => lower.includes(g))) score -= 20;
    if (words.length >= 12 && words.length <= 50) score += 10;
    if (/\b[a-z]\.\s[a-z]\.\s[a-z]\./.test(lower)) score -= 10;
    return Math.max(0, Math.min(100, score));
  }

  static isWeakOrGeneric(text: string, claims: Array<{ claim: string; sourceEvidence: string }>, sourceText: string, type: string = ''): boolean {
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);

    if (text.length >= 100) {
      const substantiveFacts = claims.filter(c => c.sourceEvidence.length >= 20).length;
      if (substantiveFacts === 0) return true;
    }

    const sentences = text.split(/[.!?]+/).filter(Boolean);
    if (sentences.length > 0 && text.length < 120) {
      const first = sentences[0].toLowerCase();
      const titleWords = text.slice(0, 80).toLowerCase().split(/\s+/).filter(w => !STOP_WORDS.has(w));
      const minOverlap = type === 'light_humor' || type === 'meme_caption' || type === 'trend_reaction' ? 8 : 5;
      const overlap = titleWords.filter(w => first.includes(w)).length;
      if (overlap >= Math.min(minOverlap, titleWords.length)) return true;
    }

    if (GENERIC_INDICATORS.some(g => lower.includes(g))) return true;
    if (WEAK_PHRASES.some(w => lower.includes(w))) return true;

    if (text.length >= 100) {
      const substantiveFacts = claims.filter(c => c.sourceEvidence.length >= 20).length;
      if (substantiveFacts === 0 && words.length >= 15) return true;
    }

    if (lower.includes("helps organizations") && !lower.includes("how")) return true;

    return false;
  }

  static isQueueReady(
    storyScore: number,
    grades: { overallPostQuality: number; factualGrounding: number },
    factualValidationStatus: string,
    characterCount: number
  ): boolean {
    return (
      storyScore >= 65 &&
      grades.overallPostQuality >= 70 &&
      grades.factualGrounding >= 90 &&
      factualValidationStatus === 'passed' &&
      characterCount <= 280
    );
  }
}
