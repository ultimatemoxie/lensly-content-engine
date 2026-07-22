const SERIOUS_CATEGORIES = ['safety_ethics', 'breaking_ai_news'];
const SERIOUS_KEYWORDS = [
  'tragedy', 'death', 'fatal', 'injured', 'explosion', 'disaster',
  'legal dispute', 'lawsuit', 'arrest', 'charged', 'murder', 'violence',
  'political conflict', 'election', 'war', 'military', 'terror',
  'children', 'teenager', 'minor', 'school', 'student safety',
  'health emergency', 'pandemic', 'outbreak', 'cancer', 'disease',
  'layoff', 'job loss', 'unemployment', 'strike',
  'ethical harm', 'bias', 'discrimination', 'harassment', 'abuse',
  'suicide', 'mental health crisis'
];

const HUMOR_FRIENDLY_SIGNALS = [
  'browser', 'tool', 'workflow', 'startup', 'launch', 'model', 'naming',
  'competition', 'marketing', 'side hustle', 'tips', 'hustle', 'app',
  'trend', 'alternatives', 'comparison'
];

const HUMOR_ANGLES: Record<string, string> = {
  light_humor: 'light_humor',
  meme_caption: 'meme_caption',
  trend_reaction: 'trend_reaction'
};

const UNSUPPORTED_HUMOR_PATTERNS = [
  /\b(goes? rogue|take over the world|destroy humanity|end of the world|apocalypse|doomsday)\b/gi,
  /\b(fake|fabricated|invented)\s+(quote|statement|claim|fact)\b/gi,
  /\b(probably|likely|surely|definitely)\s+(will|going to|cause|trigger|lead to)\b/gi,
  /\b(will|going to)\s+(kill|destroy|end|collapse|wipe out|eliminate)\b/gi,
  /\b(unless|if we don't|or else)\b/gi,
  /\b(fear|scary|terrifying|horrifying|alarming)\b/gi,
  /\b(catastrophic|disastrous|devastating)\b/gi,
  /\b(who knows what|what if|imagine if)\b/gi,
  /\b(risk is real|risks are real|danger is real)\b/gi,
];

export class HumorSafety {
  static isHumorAppropriate(storyTitle: string, category: string): boolean {
    const title = storyTitle.toLowerCase();
    const categoryLower = category.toLowerCase();

    if (SERIOUS_CATEGORIES.some(c => categoryLower.includes(c))) {
      return false;
    }

    if (SERIOUS_KEYWORDS.some(keyword => title.includes(keyword))) {
      return false;
    }

    return true;
  }

  static validateHumorText(text: string): { valid: boolean; reason: string } {
    const lower = text.toLowerCase();
    for (const pattern of UNSUPPORTED_HUMOR_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(lower)) {
        return { valid: false, reason: 'Humor introduces unsupported implication or speculative fear' };
      }
    }
    return { valid: true, reason: '' };
  }

  static getHumorOpportunity(story: { title: string; category?: string; summary?: string; rssSummary?: string }): { allowed: boolean; reason: string; suggestedAngle: string } {
    const title = story.title.toLowerCase();
    const summary = ((story.rssSummary || story.summary || '') + ' ' + story.title).toLowerCase();

    if (SERIOUS_CATEGORIES.some(c => (story.category || '').toLowerCase().includes(c))) {
      return { allowed: false, reason: 'Serious category detected', suggestedAngle: '' };
    }

    if (SERIOUS_KEYWORDS.some(k => title.includes(k))) {
      return { allowed: false, reason: 'Serious topic detected in title', suggestedAngle: '' };
    }

    const friendlySignals = HUMOR_FRIENDLY_SIGNALS.filter(s => summary.includes(s));
    if (friendlySignals.length === 0) {
      return { allowed: false, reason: 'No appropriate humor angle detected', suggestedAngle: '' };
    }

    const angle = friendlySignals[0];
    let suggestedAngle = '';
    if (angle === 'browser' || angle === 'alternatives') {
      suggestedAngle = 'picking a browser used to be easy';
    } else if (angle === 'tool' || angle === 'workflow') {
      suggestedAngle = 'another tool, another workflow reset';
    } else if (angle === 'model' || angle === 'naming') {
      suggestedAngle = 'keeping up with model names is a full-time job';
    } else if (angle === 'startup' || angle === 'launch') {
      suggestedAngle = 'another startup, another "we built X for Y"';
    } else if (angle === 'marketing') {
      suggestedAngle = 'AI marketing is reaching peak adjective density';
    } else if (angle === 'competition') {
      suggestedAngle = 'tech rivalry never changes, only the players';
    } else if (angle === 'tips' || angle === 'side hustle') {
      suggestedAngle = 'another listicle, another side hustle pitch';
    } else if (angle === 'trend') {
      suggestedAngle = 'following the trend treadmill';
    } else {
      suggestedAngle = 'light observation about the topic';
    }

    return { allowed: true, reason: `Humor-friendly signal: ${angle}`, suggestedAngle };
  }
}
