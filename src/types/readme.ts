/**
 * README Generator Type Definitions
 */

export type ReadmeStyle = 'minimal' | 'detailed' | 'creative';

export type ReadmeGoal =
  | 'get-hired'
  | 'open-source'
  | 'freelance'
  | 'indie-hacker'
  | 'student'
  | 'founder'
  | 'personal-brand';

export type ReadmeStructure =
  | 'portfolio'
  | 'hiring'
  | 'open-source'
  | 'founder'
  | 'minimal'
  | 'visual'
  | 'technical';

export type ReadmeTone =
  | 'concise'
  | 'confident'
  | 'friendly'
  | 'senior'
  | 'founder'
  | 'playful'
  | 'recruiter';

export type ReadmeMotionStyle = 'none' | 'subtle' | 'animated' | 'playful';
export type ReadmePreset = 'terminal-identity' | 'system-scan' | 'terminal-portfolio' | 'showcase' | 'neon-circuit';
export type ReadmeAnimatedSection =
  | 'hero'
  | 'about'
  | 'stats'
  | 'stack'
  | 'projects'
  | 'highlights'
  | 'heatmap'
  | 'social'
  | 'wordmark'
  | 'portrait'
  | 'chess';

export type ReadmeSectionType =
  | 'header'
  | 'about'
  | 'skills'
  | 'stats'
  | 'languages'
  | 'projects'
  | 'highlights'
  | 'heatmap'
  | 'streak'
  | 'connect'
  | 'custom';

export interface ReadmeSection {
  id: string;
  type: ReadmeSectionType;
  enabled: boolean;
  title?: string;
  content?: string;
}

export interface ReadmeConfig {
  username: string;
  sections: ReadmeSectionType[];
  style: ReadmeStyle;
  theme: string;
  includeGitSkins: boolean;
  preset?: ReadmePreset;
  aiProfileScan?: boolean;
  goal?: ReadmeGoal;
  structure?: ReadmeStructure;
  tone?: ReadmeTone;
  motionStyle?: ReadmeMotionStyle;
  typingHeadline?: boolean;
  typingLines?: string[];
  animatedDivider?: boolean;
  contributionSnake?: boolean;
  spaceShooter?: boolean;
  spaceShooterStrategy?: 'random' | 'row' | 'column';
  /** Render the heatmap section as the jet shooter variant (`style=jet`). */
  jetHeatmap?: boolean;
  /** Native animated contribution visualization used by the heatmap section. */
  heatmapStyle?: 'aura' | 'jet' | 'erased' | 'snake';
  skillBadges?: boolean;
  languageLogos?: string[];
  visitorCounter?: boolean;
  githubTrophies?: boolean;
  avatarBlock?: boolean;
  socialWebsite?: string;
  socialX?: string;
  socialLinkedIn?: string;
  socialEmail?: string;
  professionalRole?: string;
  experienceSummary?: string;
  education?: string;
  achievements?: string[];
  currentFocus?: string[];
  openTo?: string;
  sectionAssets?: Partial<Record<ReadmeSectionType, ReadmeAnimatedSection[]>>;
}

export interface GeneratedReadme {
  markdown: string;
  sections: {
    id: string;
    type: ReadmeSectionType;
    content: string;
  }[];
  metadata: {
    username: string;
    generatedAt: string;
    languages: string[];
    repoCount: number;
    totalStars: number;
    score?: ReadmeScore;
    strategy?: ReadmeStrategy;
  };
}

export interface ReadmeStrategy {
  primaryRole: string;
  strongestSignals: string[];
  weakSignals: string[];
  suggestedTone: string;
  profileGoal: string;
}

export interface ReadmeScore {
  overall: number;
  profileClarity: number;
  projectProof: number;
  visualConsistency: number;
  recruiterScanability: number;
  suggestions: string[];
}

export interface ReadmeSetupFile {
  path: string;
  content: string;
}

export interface ReadmeSetupInstructions {
  title: string;
  description: string;
  files: ReadmeSetupFile[];
}

export interface ReadmeAnimationBlocks {
  typingSvg?: string;
  divider?: string;
  snake?: string;
  spaceShooter?: string;
  visitorCounter?: string;
  trophies?: string;
}

export interface ReadmeGeneratorRequest {
  username: string;
  sections?: ReadmeSectionType[];
  style?: ReadmeStyle;
  theme?: string;
  preset?: ReadmePreset;
  useAI?: boolean;
  aiProfileScan?: boolean;
  careerMode?: boolean;
  careerRole?: string;
  agentLoop?: boolean;
  goal?: ReadmeGoal;
  structure?: ReadmeStructure;
  tone?: ReadmeTone;
  motionStyle?: ReadmeMotionStyle;
  typingHeadline?: boolean;
  typingLines?: string[];
  animatedDivider?: boolean;
  contributionSnake?: boolean;
  spaceShooter?: boolean;
  spaceShooterStrategy?: 'random' | 'row' | 'column';
  /** Render the heatmap section as the jet shooter variant (`style=jet`). */
  jetHeatmap?: boolean;
  /** Native animated contribution visualization used by the heatmap section. */
  heatmapStyle?: 'aura' | 'jet' | 'erased' | 'snake';
  skillBadges?: boolean;
  languageLogos?: string[];
  visitorCounter?: boolean;
  githubTrophies?: boolean;
  avatarBlock?: boolean;
  socialWebsite?: string;
  socialX?: string;
  socialLinkedIn?: string;
  socialEmail?: string;
  professionalRole?: string;
  experienceSummary?: string;
  education?: string;
  achievements?: string[];
  currentFocus?: string[];
  openTo?: string;
  sectionAssets?: Partial<Record<ReadmeSectionType, ReadmeAnimatedSection[]>>;
}

export interface ExtendedProfileData {
  name: string | null;
  bio: string | null;
  avatarUrl: string;
  location?: string | null;
  company?: string | null;
  websiteUrl?: string | null;
  twitterUsername?: string | null;
  followers: number;
  following: number;
  totalContributions: number;
  totalStars: number;
  totalRepos: number;
  languages: {
    name: string;
    color: string;
    percentage: number;
  }[];
  pinnedRepos: {
    name: string;
    description: string | null;
    stars: number;
    forks: number;
    language: string | null;
    url: string;
  }[];
  streak: {
    current: number;
    longest: number;
    totalDays: number;
  };
}
