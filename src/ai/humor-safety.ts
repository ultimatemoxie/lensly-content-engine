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
}
