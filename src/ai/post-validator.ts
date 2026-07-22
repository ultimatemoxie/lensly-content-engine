export interface PostValidationResult {
  valid: boolean;
  characterCount: number;
  issues: string[];
  notes: string[];
}

const TYPE_MAPPING: Record<string, string> = {
  model_update: 'breaking_news',
  product_update: 'breaking_news',
  business_update: 'industry_observation',
  workflow: 'practical_tip',
  opinion: 'founder_take',
  question: 'thoughtful_question',
  humor: 'light_humor',
  meme: 'meme_caption',
  news: 'breaking_news',
};

const SUPPORTED_TYPES = new Set([
  'breaking_news', 'creator_insight', 'tool_spotlight', 'practical_tip',
  'founder_take', 'research_insight', 'thoughtful_question', 'light_humor',
  'comparison', 'industry_observation', 'trend_reaction', 'meme_caption'
]);

export class PostValidator {
  static normalizePostType(rawType: string): string {
    const normalized = rawType.toLowerCase().trim();
    if (SUPPORTED_TYPES.has(normalized)) {
      return normalized;
    }
    return TYPE_MAPPING[normalized] || 'industry_observation';
  }

  static validate(text: string, type: string, existingTexts: string[] = []): PostValidationResult {
    const issues: string[] = [];
    const notes: string[] = [];
    const normalizedText = text.trim();
    const characterCount = normalizedText.length;
    const normalizedType = PostValidator.normalizePostType(type);

    if (!normalizedText) {
      issues.push('Empty post text');
      return { valid: false, characterCount: 0, issues, notes: ['Rejected: empty text'] };
    }

    if (characterCount > 280) {
      issues.push(`Post exceeds 280 characters (${characterCount})`);
    }

    const isHumorType = normalizedType === 'light_humor' || normalizedType === 'meme_caption';
    const minLength = isHumorType ? 60 : 100;
    if (characterCount < minLength && !isHumorType) {
      issues.push(`Post below minimum length (${characterCount} < ${minLength})`);
    } else if (characterCount < minLength && isHumorType) {
      notes.push(`Accepted short humor post (${characterCount} chars) as deliberate brevity`);
    }

    const nearDuplicate = existingTexts.some(existing => {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const na = normalize(normalizedText);
      const nb = normalize(existing);
      if (!na || !nb) return false;
      const wordsA = na.split(' ');
      const wordsB = nb.split(' ');
      let matches = 0;
      for (const w of wordsA) {
        if (wordsB.includes(w)) matches++;
      }
      return matches / Math.max(wordsA.length, wordsB.length) > 0.75;
    });

    if (nearDuplicate) {
      issues.push('Near-duplicate of existing post');
    }

    const fillerPatterns = [
      /game-changing/gi, /revolutionary/gi, /insane/gi, /Here is a post/gi,
      /read more/gi, /click here/gi, /subscribe now/gi, /follow us/gi
    ];
    for (const pattern of fillerPatterns) {
      if (pattern.test(normalizedText)) {
        issues.push('Contains corporate filler or banned phrase');
        break;
      }
    }

    const hashtagCount = (normalizedText.match(/#/g) || []).length;
    if (hashtagCount > 2) {
      issues.push('Excessive hashtags');
    }

    const emojiCount = (normalizedText.match(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > 1) {
      issues.push('Excessive emojis');
    }

    const quoteCount = (normalizedText.match(/["""]/g) || []).length;
    if (quoteCount % 2 !== 0) {
      issues.push('Broken quotation marks');
    }

    return {
      valid: issues.length === 0,
      characterCount,
      issues,
      notes,
    };
  }
}

