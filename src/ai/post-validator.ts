export interface PostValidationResult {
  valid: boolean;
  characterCount: number;
  issues: string[];
  notes: string[];
}

export class PostValidator {
  static validate(text: string, type: string, existingTexts: string[] = []): PostValidationResult {
    const issues: string[] = [];
    const notes: string[] = [];
    const normalized = text.trim();
    const characterCount = normalized.length;

    if (!normalized) {
      issues.push('Empty post text');
      return { valid: false, characterCount: 0, issues, notes: ['Rejected: empty text'] };
    }

    if (characterCount > 280) {
      issues.push(`Post exceeds 280 characters (${characterCount})`);
    }

    const isHumorType = type === 'light_humor' || type === 'meme_caption';
    const minLength = isHumorType ? 60 : 100;
    if (characterCount < minLength && !isHumorType) {
      issues.push(`Post below minimum length (${characterCount} < ${minLength})`);
    } else if (characterCount < minLength && isHumorType) {
      notes.push(`Accepted short humor post (${characterCount} chars) as deliberate brevity`);
    }

    const supportedTypes = [
      'breaking_news', 'creator_insight', 'tool_spotlight', 'practical_tip',
      'founder_take', 'research_insight', 'thoughtful_question', 'light_humor',
      'comparison', 'industry_observation', 'trend_reaction', 'meme_caption'
    ];
    if (!supportedTypes.includes(type)) {
      issues.push(`Unsupported post type: ${type}`);
    }

    const nearDuplicate = existingTexts.some(existing => {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const na = normalize(normalized);
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
      if (pattern.test(normalized)) {
        issues.push('Contains corporate filler or banned phrase');
        break;
      }
    }

    const hashtagCount = (normalized.match(/#/g) || []).length;
    if (hashtagCount > 2) {
      issues.push('Excessive hashtags');
    }

    const emojiCount = (normalized.match(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > 1) {
      issues.push('Excessive emojis');
    }

    const quoteCount = (normalized.match(/["""]/g) || []).length;
    if (quoteCount % 2 !== 0) {
      issues.push('Broken quotation marks');
    }

    const hasSupportedFactualClaim = /launched|released|raised|partnered|acquired|introduced|updated|announced|published|shipped|built|opened|joined/i.test(normalized) ||
      /\d+%|\$\d+|\d+ million|\d+ billion|\d+M|\d+B/.test(normalized) ||
      normalized.includes('OpenAI') || normalized.includes('Google') || normalized.includes('Anthropic') || normalized.includes('Meta') || normalized.includes('Groq');

    if (!hasSupportedFactualClaim && !isHumorType && !existingTexts.includes(normalized)) {
      notes.push('Post lacks explicit factual anchor; review for precision');
    }

    return {
      valid: issues.length === 0,
      characterCount,
      issues,
      notes,
    };
  }
}
