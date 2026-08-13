'use client';

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Reorder, useDragControls } from 'framer-motion';
import type { DragControls } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { FREE_THEMES } from '@/config/subscription';
import { ThinkingProgress } from '@/components/ThinkingProgress';
import { useThinkingProgress } from '@/hooks/useThinkingProgress';
import { useCheckoutSync } from '@/hooks/useCheckoutSync';
import { invalidateUserPlanCache, useUserPlan } from '@/hooks/useUserPlan';
import { ErasedCanvas } from '@/components/ErasedCanvas';
import { toDisplayText } from '@/lib/ai-text';
import { analytics } from '@/components/AnalyticsProvider';
import { ProfileRefreshPanel } from '@/components/readme/ProfileRefreshPanel';
import { PriceUpdateBanner } from '@/components/PriceUpdateBanner';
import { animatedFallbackUrl, modernizeReadmeVisuals } from '@/lib/readme-visuals';
import { ONE_TIME_EXPORT_PRICE_USD_LABEL } from '@/config/pricing';

type ReadmeStyle = 'minimal' | 'detailed' | 'creative';
type SectionType = 'header' | 'about' | 'skills' | 'stats' | 'projects' | 'highlights' | 'heatmap' | 'streak' | 'connect';
type CareerRole = 'frontend' | 'backend' | 'fullstack' | 'data' | 'mobile' | 'devops' | 'product';
type ReadmeGoal = 'get-hired' | 'open-source' | 'freelance' | 'indie-hacker' | 'student' | 'founder' | 'personal-brand';
type ReadmeStructure = 'portfolio' | 'hiring' | 'open-source' | 'founder' | 'minimal' | 'visual' | 'technical';
type ReadmeTone = 'concise' | 'confident' | 'friendly' | 'senior' | 'founder' | 'playful' | 'recruiter';
type MotionStyle = 'none' | 'subtle' | 'animated' | 'playful';
type AnimatedSection = 'hero' | 'about' | 'stats' | 'stack' | 'projects' | 'highlights' | 'heatmap' | 'social' | 'wordmark' | 'portrait' | 'chess';
type InspectorTab = 'content' | 'style' | 'agent';
type MediaBinTab = 'profile' | 'visuals' | 'links';
type CanvasView = 'preview' | 'github' | 'markdown';
type PublishReadiness = {
  state: 'idle' | 'checking' | 'ready' | 'blocked';
  code?: string;
  message?: string;
  actionUrl?: string;
  login?: string;
  repository?: string;
};
/** Every way the markdown can leave the Studio. All of them cost the same. */
type ExportIntent = 'copy' | 'download' | 'view' | 'visual' | 'publish';
type ExportPanelState = {
  intent: ExportIntent;
  reasons: string[];
  target?: AnimatedSection | 'all';
  decideCredit?: (choice: 'spend' | 'cancel') => void;
};
/**
 * Mirrors `premiumAssetsIn` on the server, and exists only to decide whether to
 * warn before spending a paid export credit. `proExportReasons` cannot answer that: it is
 * derived from the Studio's config, so it flags drafts whose rendered markdown
 * contains nothing premium, and the user would be told an export costs them
 * a credit when the server would have waved it through for free.
 *
 * The server stays authoritative — this only picks the wording.
 */
const PREMIUM_MARKDOWN_ASSETS = ['highlights', 'heatmap', 'wordmark', 'portrait', 'system-scan'] as const;
const markdownHasPremiumAssets = (markdown: string) =>
  PREMIUM_MARKDOWN_ASSETS.some((asset) => new RegExp(`/api/section/${asset}\\b`).test(markdown));

const EXPORT_INTENT_LABEL: Record<ExportIntent, string> = {
  copy: 'copy this README',
  download: 'download this README',
  view: 'view this Markdown',
  visual: 'copy this premium visual',
  publish: 'publish this README',
};
const EXPORT_INTENT_ACTION: Record<ExportIntent, string> = {
  copy: 'copy premium Markdown',
  download: 'download README.md',
  view: 'open premium Markdown',
  visual: 'copy this premium visual',
  publish: 'open the GitHub pull request',
};
const isExportIntent = (value: string | null): value is ExportIntent =>
  value !== null && Object.prototype.hasOwnProperty.call(EXPORT_INTENT_ACTION, value);
type WorkspaceMode = 'quick' | 'studio';
type QuickVisual = 'showcase' | 'space-shooter' | 'terminal-identity' | 'system-scan' | 'terminal-portfolio' | 'neon-circuit' | 'minimal' | 'polished' | 'expressive';
type QuickPreviewSection = 'portrait' | 'wordmark' | 'heatmap' | 'system-scan' | 'stack' | 'projects' | 'hero' | 'stats' | 'about' | 'social' | 'highlights' | 'chess';
type QuickPreviewProfile = {
  name: string | null;
  bio: string | null;
  avatarUrl?: string | null;
  stats?: {
    totalStars?: number;
    totalContributions?: number;
    totalRepos?: number;
    followers?: number;
  } | null;
  totalContributions?: number;
  totalStars?: number;
  contributionCalendar?: {
    weeks?: Array<{
      contributionDays?: Array<{ contributionCount?: number; date?: string }>;
    }>;
  };
  languages?: Array<{ name: string; color?: string | null; percentage?: number }>;
};
const formatPreviewNumber = (value: number) =>
  Number.isFinite(value) && value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
    : String(Number.isFinite(value) ? value : 0);
type SkillDensity = 'compact' | 'balanced' | 'expanded';
type ProjectEmphasis = 'impact' | 'technical' | 'visual';
type ConnectLayout = 'social-row' | 'contact-card' | 'minimal';
type HeatmapStyle = 'aura' | 'jet' | 'erased' | 'snake';
type SectionAssets = Partial<Record<SectionType, AnimatedSection[]>>;

/**
 * Only ever used when someone explicitly asks for the demo profile. It used to
 * double as the fallback for an empty username field, which meant a signed-in
 * user who never typed anything could build — and publish — a README entirely
 * about Linus Torvalds.
 */
const DEMO_PROFILE_USERNAME = 'torvalds';
/** Shown in previews before a username is known. Deliberately not a real account. */
const PLACEHOLDER_USERNAME = 'your-username';

type StudioConfig = {
  quickVisual?: QuickVisual;
  sections: SectionType[];
  selectedSection: SectionType;
  sectionStyle: 'aura' | 'terminal';
  sectionAssets: SectionAssets;
  /**
   * Visuals the user deleted from the preview. Needed because
   * `defaultSectionAssets` are merged in on every read — without an explicit
   * suppression list there is no way to express "not this one".
   * Optional: configs saved before preview editing shipped do not carry it.
   */
  hiddenAssets?: SectionAssets;
  careerMode: boolean;
  careerRole: CareerRole;
  agentLoop: boolean;
  useAI: boolean;
  aiProfileScan: boolean;
  goal: ReadmeGoal;
  structure: ReadmeStructure;
  tone: ReadmeTone;
  style: ReadmeStyle;
  theme: string;
  motionStyle: MotionStyle;
  typingHeadline: boolean;
  typingLines: string;
  animatedDivider: boolean;
  contributionSnake: boolean;
  spaceShooter?: boolean;
  spaceShooterStrategy?: 'random' | 'row' | 'column';
  /** Optional: configs saved before the jet variant shipped do not carry it. */
  jetHeatmap?: boolean;
  /** Optional: configs saved before contribution style presets shipped do not carry it. */
  heatmapStyle?: HeatmapStyle;
  visitorCounter: boolean;
  githubTrophies: boolean;
  avatarBlock: boolean;
  skillDensity: SkillDensity;
  languageLogos?: string[];
  projectCount: number;
  projectEmphasis: ProjectEmphasis;
  connectLayout: ConnectLayout;
  connectCta: string;
  socialWebsite: string;
  socialX: string;
  socialLinkedIn: string;
  socialEmail: string;
  professionalRole?: string;
  experienceSummary?: string;
  education?: string;
  achievementsText?: string;
  currentFocusText?: string;
  openTo?: string;
};
type PreviewVisual = {
  id: string;
  label: string;
  url: string;
  alt: string;
};
type PreviewSection = {
  key: string;
  id: SectionType;
  label: string;
  description: string;
  assets: PreviewVisual[];
  markdown: string;
  isGenerated: boolean;
  /**
   * Index into the parsed document's blocks, so preview edits can rewrite the
   * exported markdown. -1 marks the lead block, which has no `##` heading and
   * therefore cannot be moved out of first position.
   */
  blockIndex?: number;
};
type SavedReadmeProject = {
  id: string;
  username: string;
  title: string;
  goal: string | null;
  structure: string | null;
  tone: string | null;
  style: string | null;
  theme: string | null;
  score: number | null;
  markdown: string;
  studioConfig: StudioConfig | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function applyProfilePrompt(
  prompt: string,
  setters: {
    goal: (value: ReadmeGoal) => void;
    structure: (value: ReadmeStructure) => void;
    tone: (value: ReadmeTone) => void;
    style: (value: ReadmeStyle) => void;
  }
) {
  const value = prompt.toLowerCase();
  if (!value || value === 'enter your github username to start') return;

  if (/open[ -]?source|maintainer|community/.test(value)) {
    setters.goal('open-source');
    setters.structure('open-source');
  } else if (/founder|startup|product/.test(value)) {
    setters.goal('founder');
    setters.structure('founder');
    setters.tone('founder');
  } else if (/hire|hiring|recruiter|job|senior/.test(value)) {
    setters.goal('get-hired');
    setters.structure('hiring');
    setters.tone(/senior/.test(value) ? 'senior' : 'recruiter');
  } else if (/freelance|client|consult/.test(value)) {
    setters.goal('freelance');
    setters.structure('portfolio');
  }

  if (/minimal|concise|simple|clean/.test(value)) {
    setters.structure('minimal');
    setters.tone('concise');
    setters.style('minimal');
  } else if (/creative|playful|colorful/.test(value)) {
    setters.structure('visual');
    setters.tone('playful');
    setters.style('creative');
  }
}

const themes = [
  { id: 'satan', name: 'Satan', color: '#ff4500', free: true },
  { id: 'neon', name: 'Neon', color: '#00ffff', free: true },
  { id: 'zen', name: 'Zen', color: '#00ff88', free: true },
  { id: 'github-dark', name: 'GitHub', color: '#238636', free: true },
  { id: 'dracula', name: 'Dracula', color: '#ff79c6', free: false },
  { id: 'aurora', name: 'Aurora', color: '#2dd4bf', free: false },
];

/** One-click starting points that pre-fill the whole Studio. */
interface StudioPreset {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  pro: boolean;
  sections: SectionType[];
  sectionAssets?: SectionAssets;
  theme: string;
  sectionStyle: 'aura' | 'terminal';
  style: ReadmeStyle;
  goal: ReadmeGoal;
  structure: ReadmeStructure;
  tone: ReadmeTone;
  motionStyle: MotionStyle;
}

const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'showcase', name: 'Showcase', tagline: 'The whole profile, one click', accent: '#41d8c5', pro: true,
    sections: ['header', 'highlights', 'heatmap', 'stats', 'projects', 'connect'],
    sectionAssets: { header: ['wordmark'], connect: ['portrait'] },
    theme: 'aurora', sectionStyle: 'aura',
    style: 'creative', goal: 'personal-brand', structure: 'visual', tone: 'confident', motionStyle: 'animated',
  },
  {
    id: 'recruiter', name: 'Recruiter-ready', tagline: 'Hiring-optimized, fast scan', accent: '#58a6ff', pro: false,
    sections: ['header', 'about', 'skills', 'stats', 'projects', 'connect'], theme: 'github-dark', sectionStyle: 'aura',
    style: 'detailed', goal: 'get-hired', structure: 'hiring', tone: 'recruiter', motionStyle: 'subtle',
  },
  {
    id: 'oss', name: 'Open-source', tagline: 'Maintainer credibility', accent: '#22d3ee', pro: false,
    sections: ['header', 'about', 'skills', 'stats', 'projects', 'connect'], theme: 'neon', sectionStyle: 'aura',
    style: 'detailed', goal: 'open-source', structure: 'open-source', tone: 'friendly', motionStyle: 'subtle',
  },
  {
    id: 'terminal', name: 'Terminal', tagline: 'The viral neofetch look', accent: '#3fb950', pro: true,
    sections: ['header', 'about', 'skills', 'stats', 'projects', 'connect'], theme: 'github-dark', sectionStyle: 'terminal',
    style: 'creative', goal: 'personal-brand', structure: 'technical', tone: 'concise', motionStyle: 'animated',
  },
  {
    id: 'aura', name: 'Cinematic', tagline: 'Animated widgets, full motion', accent: '#2dd4bf', pro: true,
    sections: ['header', 'about', 'skills', 'stats', 'projects', 'highlights', 'heatmap', 'connect'], theme: 'aurora', sectionStyle: 'aura',
    style: 'creative', goal: 'personal-brand', structure: 'visual', tone: 'confident', motionStyle: 'playful',
  },
  {
    id: 'wow', name: 'Wow profile', tagline: '3D wordmark + ASCII portrait', accent: '#34d17d', pro: true,
    sections: ['header', 'about', 'skills', 'stats', 'projects', 'highlights', 'heatmap', 'connect'],
    sectionAssets: { header: ['wordmark', 'portrait'] },
    theme: 'aurora', sectionStyle: 'terminal',
    style: 'creative', goal: 'personal-brand', structure: 'visual', tone: 'confident', motionStyle: 'playful',
  },
  {
    id: 'space-shooter', name: 'Space Shooter', tagline: 'Your contributions become a game', accent: '#58a6ff', pro: true,
    sections: ['header', 'about', 'skills', 'projects', 'heatmap', 'stats', 'connect'],
    theme: 'github-dark', sectionStyle: 'terminal',
    style: 'creative', goal: 'personal-brand', structure: 'visual', tone: 'confident', motionStyle: 'animated',
  },
  {
    id: 'neon-circuit', name: 'Signature profile', tagline: 'The full reference-style README', accent: '#7b5cff', pro: false,
    sections: ['header', 'about', 'skills', 'stats', 'projects', 'heatmap', 'connect'], theme: 'neon', sectionStyle: 'terminal',
    style: 'creative', goal: 'personal-brand', structure: 'visual', tone: 'confident', motionStyle: 'subtle',
  },
];
const DEFAULT_STUDIO_PRESET: StudioPreset = STUDIO_PRESETS.find((preset) => preset.id === 'wow') ?? STUDIO_PRESETS[0]!;

/** Pro is reserved for premium polish, not normal README structure. */
const PRO_SECTIONS: SectionType[] = ['highlights'];
const PRO_ASSETS: AnimatedSection[] = ['highlights', 'heatmap', 'wordmark', 'portrait', 'chess'];
const SECTION_TYPES: SectionType[] = ['header', 'about', 'skills', 'stats', 'projects', 'highlights', 'heatmap', 'streak', 'connect'];
const ANIMATED_ASSET_LABELS: Record<AnimatedSection, string> = {
  hero: 'README hero',
  about: 'About visual',
  stats: 'Stats widget',
  stack: 'Stack visual',
  projects: 'Project cards',
  highlights: 'Highlights animation',
  heatmap: 'Contribution heatmap',
  social: 'Social row',
  wordmark: '3D wordmark',
  portrait: 'ASCII portrait',
  chess: 'Chess replay',
};

const availableSections: { id: SectionType; label: string; description: string }[] = [
  { id: 'header', label: 'Header', description: 'Intro with name and avatar' },
  { id: 'about', label: 'About Me', description: 'Bio and personal info' },
  { id: 'skills', label: 'Skills', description: 'Languages & tech badges' },
  { id: 'stats', label: 'GitHub Stats', description: 'GitSkins stat widgets' },
  { id: 'streak', label: 'Streak', description: 'Contribution streak widget' },
  { id: 'projects', label: 'Projects', description: 'Pinned repositories' },
  { id: 'highlights', label: 'Highlights', description: 'Value-prop feature cards' },
  { id: 'heatmap', label: 'Heatmap', description: 'Animated contribution calendar' },
  { id: 'connect', label: 'Connect', description: 'Social links & contact' },
];

const styleOptions: { id: ReadmeStyle; label: string; description: string }[] = [
  { id: 'minimal', label: 'Minimal', description: 'Clean and simple' },
  { id: 'detailed', label: 'Detailed', description: 'Professional & comprehensive' },
  { id: 'creative', label: 'Creative', description: 'Fun with animations' },
];

const quickVisualLabels: Record<QuickVisual, string> = {
  showcase: 'Showcase',
  'space-shooter': 'Space Shooter',
  'terminal-identity': 'Terminal Identity',
  'system-scan': 'System Scan',
  'terminal-portfolio': 'Terminal Portfolio',
  'neon-circuit': 'Signature profile',
  minimal: 'Minimal',
  polished: 'Polished',
  expressive: 'Expressive',
};

const quickVisualForPresetId = (presetId: string): QuickVisual => {
  if (presetId === 'showcase') return 'showcase';
  if (presetId === 'space-shooter') return 'space-shooter';
  if (presetId === 'terminal') return 'terminal-portfolio';
  if (presetId === 'aura') return 'expressive';
  if (presetId === 'wow') return 'terminal-identity';
  if (presetId === 'oss') return 'polished';
  if (presetId === 'neon-circuit') return 'neon-circuit';
  return 'polished';
};



const goalOptions: { id: ReadmeGoal; label: string; description: string }[] = [
  { id: 'get-hired', label: 'Get Hired', description: 'Recruiter-friendly proof and contact path' },
  { id: 'open-source', label: 'Open Source', description: 'Maintainer credibility and contributor clarity' },
  { id: 'freelance', label: 'Freelance', description: 'Services, outcomes, and conversion' },
  { id: 'indie-hacker', label: 'Indie Hacker', description: 'Products, launches, and builder momentum' },
  { id: 'student', label: 'Student', description: 'Learning velocity and project potential' },
  { id: 'founder', label: 'Founder', description: 'Product vision and technical ownership' },
  { id: 'personal-brand', label: 'Personal Brand', description: 'Memorable developer positioning' },
];

type StudioGuideStepId = 'profile' | 'goal' | 'structure' | 'visual' | 'signin' | 'upgrade' | 'export';

const STUDIO_GUIDE_STORAGE_KEY = 'gitskins_studio_guide_v2';

const STUDIO_GUIDE_TARGET: Record<StudioGuideStepId, string> = {
  profile: '[data-guide-target="profile"]',
  goal: '[data-guide-spotlight="goal"]',
  structure: '[data-guide-region="structure"] .readme-track article.selected, [data-guide-region="structure"] .readme-track article:first-child',
  visual: '[data-guide-region="visual"] button:not(:disabled), [data-guide-region="visual"] button',
  signin: '[data-guide-target="signin"]',
  upgrade: '[data-guide-target="upgrade"]',
  export: '[data-guide-target="export"]',
};

type GuideArrowGeometry = {
  d: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function buildGuideArrowGeometry(
  shellRect: DOMRect,
  coachRect: DOMRect,
  targetRect: DOMRect
): GuideArrowGeometry | null {
  const sx = shellRect.left;
  const sy = shellRect.top;
  const coachCx = coachRect.left + coachRect.width / 2 - sx;
  const coachCy = coachRect.top + coachRect.height / 2 - sy;
  const targetCx = targetRect.left + targetRect.width / 2 - sx;
  const targetCy = targetRect.top + targetRect.height / 2 - sy;
  const dx = targetCx - coachCx;
  const dy = targetCy - coachCy;
  const dist = Math.hypot(dx, dy);
  if (dist < 24) return null;

  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;

  if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
    const pointingLeft = dx < 0;
    x1 = pointingLeft ? coachRect.left - sx - 2 : coachRect.right - sx + 2;
    y1 = coachRect.top + coachRect.height * 0.38 - sy;
    x2 = pointingLeft ? targetRect.right - sx + 16 : targetRect.left - sx - 16;
    y2 = targetRect.top + targetRect.height * 0.5 - sy;
  } else {
    const pointingUp = dy < 0;
    x1 = coachRect.left + coachRect.width * 0.5 - sx;
    y1 = pointingUp ? coachRect.top - sy - 2 : coachRect.bottom - sy + 2;
    x2 = targetRect.left + targetRect.width * 0.5 - sx;
    y2 = pointingUp ? targetRect.bottom - sy + 16 : targetRect.top - sy - 16;
  }

  const span = Math.hypot(x2 - x1, y2 - y1);
  const bow = Math.min(110, Math.max(48, span * 0.28));
  const px = -(y2 - y1) / (span || 1);
  const py = (x2 - x1) / (span || 1);
  // Prefer an upward arc so the line feels drawn, not rigid
  const bowSign = py > 0 ? -1 : 1;
  const c1x = x1 + (x2 - x1) * 0.28 + px * bow * bowSign * 0.55;
  const c1y = y1 + (y2 - y1) * 0.12 + py * bow * bowSign * 0.55;
  const c2x = x1 + (x2 - x1) * 0.72 + px * bow * bowSign * 0.25;
  const c2y = y1 + (y2 - y1) * 0.88 + py * bow * bowSign * 0.25;

  return {
    d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    x1,
    y1,
    x2,
    y2,
  };
}

type StudioGuideStep = {
  id: StudioGuideStepId;
  title: string;
  body: string;
  nextLabel: string;
};

const STUDIO_GUIDE_STEP_CATALOG: Record<StudioGuideStepId, StudioGuideStep> = {
  profile: {
    id: 'profile',
    title: 'Enter a GitHub username',
    body: 'Scan a public profile. Your draft appears in the preview.',
    nextLabel: 'Continue',
  },
  goal: {
    id: 'goal',
    title: 'Pick one README goal',
    body: 'Hiring, portfolio, or OSS: this steers structure and tone.',
    nextLabel: 'Continue',
  },
  structure: {
    id: 'structure',
    title: 'Trim the section timeline',
    body: 'Keep about 5–7 sections. Toggle ones you do not need.',
    nextLabel: 'Continue',
  },
  visual: {
    id: 'visual',
    title: 'Add one visual',
    body: 'Drop a wordmark, portrait, or hero into the selected section.',
    nextLabel: 'Continue',
  },
  signin: {
    id: 'signin',
    title: 'Sign in to generate & save',
    body: 'GitHub sign-in unlocks free generations, saved drafts, and one-click PRs.',
    nextLabel: 'Sign in with GitHub',
  },
  upgrade: {
    id: 'upgrade',
    title: 'Unlock Pro for the full kit',
    body: 'Pro adds Terminal/3D visuals, premium themes, AI volume, and no watermark.',
    nextLabel: 'Unlock Pro',
  },
  export: {
    id: 'export',
    title: 'Export when it looks right',
    body: 'Copy markdown, download, or open a pull request on GitHub.',
    nextLabel: 'Finish guide',
  },
};

function buildStudioGuideSteps(authenticated: boolean, userIsPro: boolean): StudioGuideStep[] {
  const ids: StudioGuideStepId[] = ['profile', 'goal', 'structure', 'visual'];
  if (!authenticated) ids.push('signin');
  if (!userIsPro) ids.push('upgrade');
  ids.push('export');
  return ids.map((id) => STUDIO_GUIDE_STEP_CATALOG[id]);
}

const structureOptions: { id: ReadmeStructure; label: string; description: string }[] = [
  { id: 'visual', label: 'Visual Kit', description: 'GitSkins card, widgets, and polished sections' },
  { id: 'portfolio', label: 'Portfolio', description: 'Featured work and clear project proof' },
  { id: 'hiring', label: 'Hiring', description: 'Fast scan for recruiters and teams' },
  { id: 'open-source', label: 'OSS', description: 'Community and contributor oriented' },
  { id: 'founder', label: 'Founder', description: 'Products, direction, and outcomes' },
  { id: 'minimal', label: 'Minimal', description: 'Short, clean, low-badge layout' },
  { id: 'technical', label: 'Technical', description: 'Systems, stack, and deeper proof' },
];

const toneOptions: { id: ReadmeTone; label: string }[] = [
  { id: 'confident', label: 'Confident' },
  { id: 'concise', label: 'Concise' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'senior', label: 'Senior' },
  { id: 'founder', label: 'Founder' },
  { id: 'playful', label: 'Playful' },
  { id: 'recruiter', label: 'Recruiter' },
];

const motionOptions: { id: MotionStyle; label: string; description: string }[] = [
  { id: 'none', label: 'None', description: 'Static, professional README' },
  { id: 'subtle', label: 'Subtle', description: 'Typing headline and clean motion' },
  { id: 'animated', label: 'Animated', description: 'Typing, divider, and live widgets' },
  { id: 'playful', label: 'Playful', description: 'More personality and GitHub flair' },
];

const animatedSections: { id: AnimatedSection; label: string }[] = [
  { id: 'hero', label: 'Hero' },
  { id: 'about', label: 'About' },
  { id: 'stats', label: 'Stats' },
  { id: 'stack', label: 'Stack' },
  { id: 'projects', label: 'Projects' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'wordmark', label: '3D Wordmark' },
  { id: 'portrait', label: 'ASCII Portrait' },
  { id: 'chess', label: 'Chess replay' },
  { id: 'social', label: 'Social' },
];

const animatedSectionDescriptions: Record<AnimatedSection, string> = {
  hero: 'Cinematic profile hero',
  about: 'Animated bio panel',
  stats: 'GitHub metrics block',
  stack: 'Language stack visual',
  projects: 'Featured project cards',
  highlights: 'Value-prop cards',
  heatmap: 'Contribution calendar',
  wordmark: '3D ASCII name slab',
  portrait: 'Avatar-to-ASCII portrait',
  chess: 'Decorative auto-play board',
  social: 'Contact button row',
};

const animatedAssetLibrary = [
  { id: 'chess', label: 'Chess replay', description: 'An auto-playing board that sits inside your profile.', kind: 'asset' as const, asset: 'chess' as AnimatedSection, target: 'header' as SectionType },
  { id: 'space-shooter', label: 'Space Shooter', description: 'Turn contribution activity into a playable visual.', kind: 'space' as const, target: 'heatmap' as SectionType },
  { id: 'snake', label: 'Snake Trail', description: 'A contribution trail that animates across the calendar.', kind: 'heatmap' as const, heatmapStyle: 'snake' as HeatmapStyle, target: 'heatmap' as SectionType },
  { id: 'jet', label: 'Jet Runner', description: 'A faster, arcade-style contribution replay.', kind: 'heatmap' as const, heatmapStyle: 'jet' as HeatmapStyle, target: 'heatmap' as SectionType },
  { id: 'erased', label: 'Erased', description: 'A contribution canvas with a tactile reveal effect.', kind: 'heatmap' as const, heatmapStyle: 'erased' as HeatmapStyle, target: 'heatmap' as SectionType },
  { id: 'wordmark', label: '3D Wordmark', description: 'A dimensional name treatment for the opening section.', kind: 'asset' as const, asset: 'wordmark' as AnimatedSection, target: 'header' as SectionType },
  { id: 'portrait', label: 'ASCII Portrait', description: 'A profile portrait rendered as a terminal-style visual.', kind: 'asset' as const, asset: 'portrait' as AnimatedSection, target: 'connect' as SectionType },
] as const;

const defaultSectionAssets: Partial<Record<SectionType, AnimatedSection[]>> = {
  header: ['hero'],
  about: ['about'],
  skills: ['stack'],
  stats: ['stats'],
  projects: ['projects'],
  highlights: ['highlights'],
  heatmap: ['heatmap'],
  connect: ['social'],
};

const sectionInspectorCopy: Record<SectionType, { title: string; description: string; controls: string[] }> = {
  header: {
    title: 'Header',
    description: 'Sets the first impression: identity, role, and visual intro.',
    controls: ['Username', 'Theme', 'Typing headline'],
  },
  about: {
    title: 'About Me',
    description: 'Shapes the short profile story and positioning.',
    controls: ['Goal', 'Tone', 'Career role'],
  },
  skills: {
    title: 'Skills',
    description: 'Controls the stack badges and technical signal.',
    controls: ['Structure', 'Style', 'Visual density'],
  },
  stats: {
    title: 'GitHub Stats',
    description: 'Adds GitSkins stat cards and profile metrics.',
    controls: ['Theme', 'Animated section', 'Widget style'],
  },
  projects: {
    title: 'Projects',
    description: 'Highlights repositories as proof of work.',
    controls: ['Goal', 'Project proof', 'Layout'],
  },
  highlights: {
    title: 'Highlights',
    description: 'Value-prop feature cards drawn from the profile.',
    controls: ['Theme', 'Custom items', 'Animated section'],
  },
  heatmap: {
    title: 'Heatmap',
    description: 'Animated year-long contribution calendar.',
    controls: ['Theme', 'GitHub data', 'Animated section'],
  },
  streak: {
    title: 'Streak',
    description: 'Adds contribution consistency signals.',
    controls: ['Motion', 'Widget theme', 'GitHub data'],
  },
  connect: {
    title: 'Connect',
    description: 'Adds contact links and social calls to action.',
    controls: ['Website', 'X', 'LinkedIn', 'Email'],
  },
};

const sectionWorkflowCopy: Record<SectionType, { focus: string; ai: string; output: string }> = {
  header: {
    focus: 'Identity, role, avatar, and opening visual.',
    ai: 'Uses profile name, bio, avatar, and selected goal to draft the first impression.',
    output: 'Hero card, short intro, and optional typing headline.',
  },
  about: {
    focus: 'Positioning, credibility, and human profile story.',
    ai: 'Turns public profile signals into a concise narrative without inventing history.',
    output: 'About section tuned to the selected role and tone.',
  },
  skills: {
    focus: 'Tech stack, skill badges, and language confidence.',
    ai: 'Prioritizes languages and stack signals that match profile/project evidence.',
    output: 'Stack section with badges and GitSkins visual stack.',
  },
  stats: {
    focus: 'Profile metrics, contribution proof, and GitHub activity.',
    ai: 'Pairs stats widgets with the selected visual theme and avoids overexplaining metrics.',
    output: 'Stats card layout using the active GitSkins theme.',
  },
  projects: {
    focus: 'Pinned repositories and project proof.',
    ai: 'Reads repo descriptions, languages, and stars to write specific project blurbs.',
    output: 'Featured project cards with outcome-oriented copy.',
  },
  highlights: {
    focus: 'Concise value props that frame the developer at a glance.',
    ai: 'Distills the profile into three short feature cards drawn from real signals.',
    output: 'Highlights band with three animated value-prop cards.',
  },
  heatmap: {
    focus: 'Year-long contribution rhythm and consistency at a glance.',
    ai: 'Renders real contribution data; no invented activity.',
    output: 'Animated contribution calendar in the active theme.',
  },
  streak: {
    focus: 'Contribution consistency and long-term activity.',
    ai: 'Uses streak/activity as support, not as a substitute for project proof.',
    output: 'Contribution streak block and optional motion widgets.',
  },
  connect: {
    focus: 'Contact path and social conversion.',
    ai: 'Uses only provided or public profile links, and never invents social URLs.',
    output: 'Social row, links, and call to connect.',
  },
};

const careerRoles: { id: CareerRole; label: string; description: string }[] = [
  { id: 'frontend', label: 'Frontend Engineer', description: 'UI/UX, performance, design systems' },
  { id: 'backend', label: 'Backend Engineer', description: 'APIs, scalability, data reliability' },
  { id: 'fullstack', label: 'Full-Stack Engineer', description: 'End-to-end delivery and ownership' },
  { id: 'data', label: 'Data/ML Engineer', description: 'Pipelines, analytics, ML systems' },
  { id: 'mobile', label: 'Mobile Engineer', description: 'iOS/Android and cross-platform' },
  { id: 'devops', label: 'DevOps/SRE', description: 'Infra, CI/CD, reliability' },
  { id: 'product', label: 'Product Engineer', description: 'Impact, experiments, growth' },
];

const sectionIdFromHeading = (heading: string): SectionType => {
  const normalized = heading.toLowerCase();
  if (normalized.includes('about')) return 'about';
  if (normalized.includes('skill') || normalized.includes('language') || normalized.includes('stack') || normalized.includes('tool')) return 'skills';
  if (normalized.includes('stat') || normalized.includes('metric')) return 'stats';
  if (normalized.includes('streak') || normalized.includes('contribution')) return 'streak';
  if (normalized.includes('highlight')) return 'highlights';
  if (normalized.includes('heatmap') || normalized.includes('calendar') || normalized.includes('activity')) return 'heatmap';
  if (normalized.includes('project') || normalized.includes('repo') || normalized.includes('work')) return 'projects';
  if (normalized.includes('connect') || normalized.includes('contact') || normalized.includes('social')) return 'connect';
  return 'header';
};

const labelForSectionId = (sectionId: SectionType) =>
  availableSections.find((section) => section.id === sectionId)?.label ?? sectionInspectorCopy[sectionId].title;

const visualLabelFromUrl = (url: string, fallback: string) => {
  const sectionMatch = url.match(/\/api\/section\/(hero|stats|stack|social)/);
  if (sectionMatch) {
    const visual = animatedSections.find((item) => item.id === sectionMatch[1]);
    return visual?.label ?? fallback;
  }
  if (url.includes('/api/streak')) return 'Streak';
  if (url.includes('/api/languages')) return 'Languages';
  if (url.includes('/api/stats')) return 'Stats';
  if (url.includes('/api/premium-card')) return 'Profile Card';
  return fallback;
};

const extractPreviewVisuals = (markdown: string): PreviewVisual[] => {
  const visuals: PreviewVisual[] = [];
  const htmlImagePattern = /<img\b([^>]*?)>/gi;
  const markdownImagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlImagePattern.exec(markdown)) !== null) {
    const attrs = htmlMatch[1];
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const alt = attrs.match(/\balt=["']([^"']*)["']/i)?.[1] ?? 'GitSkins visual';
    const label = visualLabelFromUrl(src, alt || 'Visual');
    visuals.push({ id: `${src}-${visuals.length}`, label, url: src, alt });
  }

  let markdownMatch: RegExpExecArray | null;
  while ((markdownMatch = markdownImagePattern.exec(markdown)) !== null) {
    const alt = markdownMatch[1] || 'GitSkins visual';
    const src = markdownMatch[2];
    const label = visualLabelFromUrl(src, alt || 'Visual');
    visuals.push({ id: `${src}-${visuals.length}`, label, url: src, alt });
  }

  return visuals.filter((visual, index, list) => list.findIndex((item) => item.url === visual.url) === index);
};

const cleanPreviewMarkdown = (markdown: string) =>
  markdown
    .replace(/<p[^>]*>\s*<img\b[^>]*>\s*<\/p>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/<p\s+align=["']center["']>\s*<\/p>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * A generated README split into the pieces the preview can move around, with
 * every original character preserved. `preamble` holds the `# Title` line and
 * anything before the first `##`; each block keeps its own heading line inside
 * `raw`, so reordering is a pure permutation of the blocks.
 */
type ReadmeBlock = {
  /** Heading text with decoration stripped, for labelling. Empty on the lead block. */
  label: string;
  /** The exact source lines for this block, heading included. */
  raw: string;
};

type ReadmeDocument = {
  title?: string;
  /** Everything above the first `##` heading, verbatim. */
  preamble: string;
  blocks: ReadmeBlock[];
};

const splitReadmeBlocks = (markdown: string): ReadmeDocument => {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const lines = markdown.split('\n');
  const preambleLines: string[] = [];
  const blocks: { label: string; lines: string[] }[] = [];

  lines.forEach((line) => {
    const headingMatch = line.match(/^##+\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        label: headingMatch[1].replace(/[^\w\s&/-]/g, '').trim() || 'Section',
        lines: [line],
      });
      return;
    }
    if (blocks.length === 0) {
      preambleLines.push(line);
      return;
    }
    blocks[blocks.length - 1].lines.push(line);
  });

  return {
    title,
    preamble: preambleLines.join('\n'),
    blocks: blocks.map((block) => ({ label: block.label, raw: block.lines.join('\n') })),
  };
};

/** Inverse of {@link splitReadmeBlocks}. Round-trips untouched input unchanged. */
const joinReadmeBlocks = (doc: ReadmeDocument): string => {
  const body = doc.blocks.map((block) => block.raw.replace(/\s+$/, '')).join('\n\n');
  const preamble = doc.preamble.replace(/\s+$/, '');
  if (!body) return preamble;
  if (!preamble) return body;
  return `${preamble}\n\n${body}`;
};

/** Strips the heading line so the block body can be previewed on its own. */
const blockBody = (raw: string) => raw.replace(/^##+\s+.*(?:\n|$)/, '');

const parseReadmePreview = (markdown: string) => {
  const doc = splitReadmeBlocks(markdown);
  const leadBody = doc.preamble.replace(/^#\s+.+$/m, '').trim();
  const chunks: { label: string; body: string; blockIndex: number }[] = [
    { label: 'Header', body: leadBody, blockIndex: -1 },
    ...doc.blocks.map((block, index) => ({
      label: block.label,
      body: blockBody(block.raw).trim(),
      blockIndex: index,
    })),
  ];

  // Keys have to survive reordering, so they are derived from the heading
  // rather than the position — a positional key would change identity mid-drag.
  const seenKeys = new Map<string, number>();

  const sections = chunks
    .map((chunk, index): PreviewSection | null => {
      const visuals = extractPreviewVisuals(chunk.body);
      const cleanMarkdown = cleanPreviewMarkdown(chunk.body);
      if (!cleanMarkdown && visuals.length === 0) return null;
      const id = index === 0 ? 'header' : sectionIdFromHeading(chunk.label);
      const slug = `${id}-${chunk.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const occurrence = (seenKeys.get(slug) ?? 0) + 1;
      seenKeys.set(slug, occurrence);
      return {
        key: `generated-${slug}-${occurrence}`,
        id,
        label: index === 0 ? labelForSectionId('header') : chunk.label,
        description: sectionInspectorCopy[id].description,
        assets: visuals,
        markdown: cleanMarkdown,
        isGenerated: true,
        blockIndex: chunk.blockIndex,
      };
    })
    .filter((section): section is PreviewSection => Boolean(section));

  const summary = cleanPreviewMarkdown(leadBody)
    .split('\n')
    .map((line) => line.replace(/^>\s*/, '').trim())
    .find(Boolean);

  return {
    title: doc.title,
    summary,
    sections,
  };
};

/**
 * Removes a single image from markdown by its src, leaving the rest byte-identical.
 * Handles the `<p align="center"><img …></p>` wrapper the generator emits.
 */
const removeVisualFromMarkdown = (markdown: string, url: string) => {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown
    .replace(new RegExp(`<p[^>]*>\\s*(?:<a\\b[^>]*>\\s*)?<img\\b[^>]*src=["']${escaped}["'][^>]*>\\s*(?:</a>\\s*)?</p>\\n?`, 'gi'), '')
    .replace(new RegExp(`<img\\b[^>]*src=["']${escaped}["'][^>]*>\\n?`, 'gi'), '')
    .replace(new RegExp(`!\\[[^\\]]*\\]\\(${escaped}(?:\\s+"[^"]*")?\\)\\n?`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n');
};

/**
 * One draggable card in the preview. It exists as its own component purely so
 * each row can own a `useDragControls` instance — dragging is started by the
 * handle rather than the card body, which stays clickable for selecting.
 */
function DraggablePreviewSection({
  sectionKey,
  sectionId,
  selected,
  onSelect,
  onSelectKey,
  children,
}: {
  sectionKey: string;
  sectionId: SectionType;
  selected: boolean;
  onSelect: () => void;
  onSelectKey: (event: ReactKeyboardEvent) => void;
  children: (controls: DragControls) => ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="section"
      value={sectionKey}
      dragListener={false}
      dragControls={controls}
      className={`readme-preview-section draggable ${selected ? 'selected' : ''}`}
      data-section={sectionId}
      data-readme-section={sectionId}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onSelectKey}
    >
      {children(controls)}
    </Reorder.Item>
  );
}

function QuickPreviewFallback({
  section,
  username,
  profile,
}: {
  section: QuickPreviewSection;
  username: string;
  profile: QuickPreviewProfile | null;
}) {
  const displayName = profile?.name?.trim() || username || 'GitHub profile';
  const avatarUrl = profile?.avatarUrl;
  const [avatarError, setAvatarError] = useState(false);
  const stats: Array<[string, number]> = [
    ['Stars', profile?.stats?.totalStars ?? profile?.totalStars ?? 0],
    ['Contributions', profile?.stats?.totalContributions ?? profile?.totalContributions ?? 0],
    ['Repos', profile?.stats?.totalRepos ?? 0],
    ['Followers', profile?.stats?.followers ?? 0],
  ];
  const contributionDays = profile?.contributionCalendar?.weeks
    ?.flatMap((week) => week.contributionDays ?? [])
    .slice(-84) ?? [];
  const avatar = avatarUrl && !avatarError ? (
    <img src={avatarUrl} alt="" onError={() => setAvatarError(true)} />
  ) : (
    <b>{displayName.slice(0, 1).toUpperCase()}</b>
  );

  if (section === 'portrait') {
    return (
      <div className="readme-preview-fallback is-profile-fallback is-profile-portrait" aria-hidden="true">
        <div className="readme-preview-fallback-avatar">{avatar}</div>
        <strong>{displayName}</strong>
        <span>@{username}</span>
      </div>
    );
  }

  if (section === 'wordmark') {
    return (
      <div className="readme-preview-fallback is-profile-fallback is-profile-wordmark" aria-hidden="true">
        <strong>{displayName}</strong>
        <span>@{username} / PROFILE IDENTITY</span>
      </div>
    );
  }

  if (section === 'heatmap') {
    return (
      <div className="readme-preview-fallback is-profile-fallback is-profile-heatmap" aria-hidden="true">
        <div className="readme-preview-fallback-heatmap-heading">
          <strong>Contribution activity</strong>
          <span>{formatPreviewNumber(profile?.totalContributions ?? 0)} contributions</span>
        </div>
        <div className="readme-preview-fallback-heatmap-grid">
          {Array.from({ length: 84 }, (_, index) => {
            const day = contributionDays[index];
            const count = day?.contributionCount ?? 0;
            return (
              <span
                key={`${day?.date ?? 'day'}-${index}`}
                style={{ opacity: count === 0 ? 0.18 : Math.min(0.92, 0.3 + count / 10) }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="readme-preview-fallback is-profile-fallback is-profile-default" aria-hidden="true">
      <div className="readme-preview-fallback-header">
        <div className="readme-preview-fallback-avatar">{avatar}</div>
        <div className="readme-preview-fallback-identity">
          <strong>{displayName}</strong>
          <span>@{username}</span>
        </div>
      </div>
      <p className="readme-preview-fallback-copy">{profile?.bio || 'GitHub profile visual preview'}</p>
      <div className="readme-preview-fallback-stats">
        {stats.map(([label, value]) => (
          <div className="readme-preview-fallback-stat" key={label}>
            <strong>{formatPreviewNumber(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickTemplateMiniPreview({ presetId, username }: { presetId: string; username: string }) {
  const label = username.trim().replace(/^@/, '') || 'your-username';
  const initials = label.slice(0, 2).toUpperCase();

  if (presetId === 'space-shooter') {
    return <div className="readme-template-mini is-mini-space"><span className="mini-planet" /><span className="mini-ship" /><i /><i /><i /><i /></div>;
  }
  if (presetId === 'wow') {
    return <div className="readme-template-mini is-mini-wow"><div><strong>{initials}</strong><small>ASCII</small></div><b>{label}</b></div>;
  }
  if (presetId === 'showcase') {
    return <div className="readme-template-mini is-mini-showcase"><div className="mini-hero"><span>{initials}</span><b>{label}</b></div><div className="mini-cards"><i /><i /><i /></div></div>;
  }
  if (presetId === 'terminal') {
    return <div className="readme-template-mini is-mini-terminal"><span>$ whoami</span><b>{label}</b><small>projects · stats · stack</small></div>;
  }
  if (presetId === 'aura') {
    return <div className="readme-template-mini is-mini-aura"><b>activity</b><div>{Array.from({ length: 28 }, (_, index) => <i key={index} />)}</div></div>;
  }
  if (presetId === 'oss') {
    return <div className="readme-template-mini is-mini-oss"><div className="mini-repo"><b>open source</b><small>maintainer profile</small></div><div className="mini-bars"><i /><i /><i /></div></div>;
  }
  if (presetId === 'neon-circuit') {
    return <div className="readme-template-mini is-mini-neon-circuit"><span className="mini-signal">// WHOAMI</span><b>{label}</b><small>focus · arsenal · projects · stats</small><div className="mini-neon-grid">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div></div>;
  }
  return <div className="readme-template-mini is-mini-recruiter"><b>{label}</b><small>role · skills · projects</small><div><i /><i /><i /></div></div>;
}

function PreviewSectionPicture({
  section,
  username,
  theme,
  alt,
  style = 'terminal',
  forceDark = false,
  profile = null,
}: {
  section: QuickPreviewSection;
  username: string;
  theme: string;
  alt: string;
  style?: 'terminal' | 'aura';
  forceDark?: boolean;
  profile?: QuickPreviewProfile | null;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Bump when section SVG motion/content changes so the browser doesn't keep a stale cached image.
  const params = new URLSearchParams({
    username,
    theme,
    v: 'profile-preview-2',
  });
  if (style === 'terminal') params.set('style', 'terminal');
  const sectionPreviewOrigin = '';
  const base = `${sectionPreviewOrigin}/api/section/${section}?${params.toString()}`;
  const darkSrc = `${base}&mode=dark`;
  const lightSrc = `${base}&mode=light`;

  useEffect(() => {
    let cancelled = false;

    const markLoadedIfReady = () => {
      const img = imgRef.current;
      if (!cancelled && img?.complete && img.naturalWidth > 0) {
        setStatus('loaded');
      }
    };

    // After paint so the ref reflects the new src (handles browser-cached SVGs).
    const raf = window.requestAnimationFrame(() => {
      if (!cancelled) setStatus('loading');
      markLoadedIfReady();
      window.requestAnimationFrame(markLoadedIfReady);
    });

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setStatus((current) => (current === 'loading' ? 'error' : current));
      }
    }, 12000);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [base]);

  return (
    <div className={`readme-preview-asset is-${status} is-${section}`}>
      {status === 'loading' && <span className="readme-preview-asset-status">Composing…</span>}
      {status !== 'loaded' && (
        <QuickPreviewFallback section={section} username={username} profile={profile} />
      )}
      <picture>
      {!forceDark && <source media="(prefers-color-scheme: light)" srcSet={lightSrc} />}
        <img
          ref={imgRef}
          src={darkSrc}
          alt={alt}
          loading="eager"
          decoding="async"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      </picture>
    </div>
  );
}

function QuickPresetPreview({
  preset,
  username,
  theme,
  profile = null,
}: {
  preset: QuickVisual;
  username: string;
  theme: string;
  profile?: QuickPreviewProfile | null;
}) {
  const safeUsername = username.trim().replace(/^@/, '') || DEMO_PROFILE_USERNAME;

  if (preset === 'showcase') {
    return (
      <div className="readme-quick-preset-preview is-showcase">
        <PreviewSectionPicture section="hero" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} profile hero preview`} />
        <div className="readme-showcase-preview-row">
          <PreviewSectionPicture section="stats" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} GitHub stats preview`} />
          <PreviewSectionPicture section="projects" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} project cards preview`} />
        </div>
      </div>
    );
  }

  if (preset === 'system-scan') {
    return (
      <div className="readme-quick-preset-preview is-system-scan">
        <PreviewSectionPicture section="system-scan" username={safeUsername} theme={theme} profile={profile} alt={`${safeUsername} System Scan preview`} />
      </div>
    );
  }

  if (preset === 'space-shooter') {
    return (
      <div className="readme-quick-preset-preview is-space-shooter">
        <PreviewSectionPicture section="hero" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} profile hero preview`} />
        <div className="readme-space-shooter-preview">
          <img src="/showcase/space-shooter.gif" alt={`${safeUsername} contribution Space Shooter preview`} />
          <span>Generated from the contribution graph and published from GitHub Actions</span>
        </div>
      </div>
    );
  }

  if (preset === 'terminal-portfolio') {
    return (
      <div className="readme-quick-preset-preview is-terminal-portfolio">
        <PreviewSectionPicture section="wordmark" username={safeUsername} theme={theme} profile={profile} alt={`${safeUsername} wordmark preview`} />
        <PreviewSectionPicture section="stack" username={safeUsername} theme={theme} profile={profile} alt={`${safeUsername} technology stack preview`} />
      </div>
    );
  }

  if (preset === 'minimal') {
    return (
      <div className="readme-quick-preset-preview is-minimal">
        <PreviewSectionPicture section="hero" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} minimal hero preview`} />
        <PreviewSectionPicture section="social" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} social links preview`} />
      </div>
    );
  }

  if (preset === 'polished') {
    return (
      <div className="readme-quick-preset-preview is-polished">
        <PreviewSectionPicture section="hero" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} polished hero preview`} />
        <PreviewSectionPicture section="stats" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} stats preview`} />
      </div>
    );
  }

  if (preset === 'expressive') {
    return (
      <div className="readme-quick-preset-preview is-expressive">
        <PreviewSectionPicture section="hero" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} expressive hero preview`} />
        <PreviewSectionPicture section="heatmap" username={safeUsername} theme={theme} style="aura" profile={profile} alt={`${safeUsername} contribution heatmap preview`} />
      </div>
    );
  }

  if (preset === 'neon-circuit') {
    return (
      <div className="readme-quick-preset-preview is-neon-circuit is-reference-readme-preview">
        <img src={`/api/readme-reference/hero?username=${encodeURIComponent(safeUsername)}&theme=${encodeURIComponent(theme)}`} alt={`${safeUsername} reference-style hero preview`} />
        <img src={`/api/readme-reference/focus?username=${encodeURIComponent(safeUsername)}&theme=${encodeURIComponent(theme)}`} alt={`${safeUsername} reference-style focus preview`} />
        <img src={`/api/readme-reference/divider?username=${encodeURIComponent(safeUsername)}&theme=${encodeURIComponent(theme)}`} alt="Reference-style divider preview" />
      </div>
    );
  }

  return (
    <div className="readme-quick-preset-preview is-terminal-identity">
      <div className="readme-terminal-identity-pair">
        <PreviewSectionPicture section="portrait" username={safeUsername} theme={theme} profile={profile} alt={`${safeUsername} ASCII portrait preview`} />
        <PreviewSectionPicture section="wordmark" username={safeUsername} theme={theme} profile={profile} alt={`${safeUsername} wordmark preview`} />
      </div>
      <PreviewSectionPicture section="heatmap" username={safeUsername} theme={theme} profile={profile} alt={`${safeUsername} contribution heatmap preview`} />
    </div>
  );
}

function QuickTemplatePreview({
  presetId,
  username,
  theme,
  profile = null,
}: {
  presetId: string;
  username: string;
  theme: string;
  profile?: QuickPreviewProfile | null;
}) {
  return (
    <div className={`readme-template-live is-${presetId}`} aria-hidden="true">
      <QuickTemplateMiniPreview presetId={presetId} username={username} />
    </div>
  );
}

export default function ReadmeGeneratorPage() {
  const searchParams = useSearchParams();
  const requestedUsername = searchParams.get('username')?.trim().replace(/^@/, '') || null;
  const requestedTheme = searchParams.get('theme');
  const requestedStudio = searchParams.get('mode') === 'studio' || Boolean(searchParams.get('project'));
  const spaceShooterRequested = ['1', 'true'].includes(searchParams.get('spaceShooter') ?? '');
  const upgraded = searchParams.get('upgrade') === 'success';
  const checkoutSync = useCheckoutSync();
  const resumedExportIntentRef = useRef<ExportIntent | null>(null);
  const checkoutResumeHandledRef = useRef(false);
  const checkoutCancellationHandledRef = useRef(false);
  const resumedExportActionRef = useRef<(intent: ExportIntent, target?: AnimatedSection | 'all') => Promise<void>>(async () => {});
  // Keep direct studio links in the safe Quick workspace until Auth.js has
  // confirmed the session. This prevents a signed-out visitor from seeing
  // the Advanced Studio during the first client render.
  const requestedStudioRef = useRef(requestedStudio);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('quick');
  const [quickVisual, setQuickVisual] = useState<QuickVisual>(() => spaceShooterRequested ? 'space-shooter' : 'terminal-identity');
  const { data: session, status: sessionStatus } = useSession();
  const sessionUsername = ((session?.user as { username?: string } | undefined)?.username ?? '')
    .trim()
    .replace(/^@/, '');
  // null means the field is untouched, so it shows the signed-in login until
  // the user edits it. An empty string is a deliberate clear and is respected.
  const [usernameOverride, setUsernameOverride] = useState<string | null>(requestedUsername);
  const username = usernameOverride ?? sessionUsername;
  const setUsername = setUsernameOverride;
  const [previewUsername, setPreviewUsername] = useState(DEMO_PROFILE_USERNAME);
  const [previewProfile, setPreviewProfile] = useState<QuickPreviewProfile | null>(null);
  const [previewProfileState, setPreviewProfileState] = useState<'idle' | 'loading' | 'valid' | 'error'>('idle');
  const [pendingAutoGenerate, setPendingAutoGenerate] = useState(false);
  const autoGenerateLockRef = useRef(false);
  const [style, setStyle] = useState<ReadmeStyle>(DEFAULT_STUDIO_PRESET.style);
  const [sectionStyle, setSectionStyle] = useState<'aura' | 'terminal'>(DEFAULT_STUDIO_PRESET.sectionStyle);
  const [theme, setTheme] = useState(() => requestedTheme && themes.some((option) => option.id === requestedTheme)
    ? requestedTheme
    : DEFAULT_STUDIO_PRESET.theme);
  const [sections, setSections] = useState<SectionType[]>([...DEFAULT_STUDIO_PRESET.sections]);
  const [selectedSection, setSelectedSection] = useState<SectionType>('header');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content');
  const [mediaBinTab, setMediaBinTab] = useState<MediaBinTab>('profile');
  const [sectionAssets, setSectionAssets] = useState<SectionAssets>({ ...(DEFAULT_STUDIO_PRESET.sectionAssets ?? {}) });
  const [hiddenAssets, setHiddenAssets] = useState<SectionAssets>({});
  const [careerMode, setCareerMode] = useState(true);
  const [careerRole, setCareerRole] = useState<CareerRole>('fullstack');
  const [agentLoop, setAgentLoop] = useState(true);
  const [useAI, setUseAI] = useState(true);
  const [aiProfileScan, setAiProfileScan] = useState(true);
  const [goal, setGoal] = useState<ReadmeGoal>(DEFAULT_STUDIO_PRESET.goal);
  const [structure, setStructure] = useState<ReadmeStructure>(DEFAULT_STUDIO_PRESET.structure);
  const [tone, setTone] = useState<ReadmeTone>(DEFAULT_STUDIO_PRESET.tone);
  const [motionStyle, setMotionStyle] = useState<MotionStyle>(DEFAULT_STUDIO_PRESET.motionStyle);
  const [typingHeadline, setTypingHeadline] = useState(false);
  const [typingLines, setTypingLines] = useState('Building developer tools\nFull-stack product engineer\nOpen-source enthusiast');
  const [animatedDivider, setAnimatedDivider] = useState(false);
  const [contributionSnake, setContributionSnake] = useState(false);
  const [spaceShooter, setSpaceShooter] = useState(spaceShooterRequested);
  const [spaceShooterStrategy, setSpaceShooterStrategy] = useState<'random' | 'row' | 'column'>('random');
  const [jetHeatmap, setJetHeatmap] = useState(false);
  const [heatmapStyle, setHeatmapStyle] = useState<HeatmapStyle>('aura');
  const [visitorCounter, setVisitorCounter] = useState(false);
  const [githubTrophies, setGithubTrophies] = useState(false);
  const [avatarBlock, setAvatarBlock] = useState(false);
  const [skillDensity, setSkillDensity] = useState<SkillDensity>('balanced');
  const [languageLogos, setLanguageLogos] = useState<string[]>([]);
  const [projectCount, setProjectCount] = useState(2);
  const [projectEmphasis, setProjectEmphasis] = useState<ProjectEmphasis>('impact');
  const [connectLayout, setConnectLayout] = useState<ConnectLayout>('social-row');
  const [connectCta, setConnectCta] = useState('Let’s build something useful together.');
  const [socialWebsite, setSocialWebsite] = useState('');
  const [socialX, setSocialX] = useState('');
  const [socialLinkedIn, setSocialLinkedIn] = useState('');
  const [socialEmail, setSocialEmail] = useState('');
  const [professionalRole, setProfessionalRole] = useState('');
  const [experienceSummary, setExperienceSummary] = useState('');
  const [education, setEducation] = useState('');
  const [achievementsText, setAchievementsText] = useState('');
  const [currentFocusText, setCurrentFocusText] = useState('');
  const [openTo, setOpenTo] = useState('');
  const [copiedAnimatedSection, setCopiedAnimatedSection] = useState<AnimatedSection | 'all' | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(() => spaceShooterRequested ? 'space-shooter' : DEFAULT_STUDIO_PRESET.id);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [upgradeReasons, setUpgradeReasons] = useState<string[]>([]);
  const [styleAdvancedOpen, setStyleAdvancedOpen] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [studioGuideActive, setStudioGuideActive] = useState(false);
  const [studioGuideStep, setStudioGuideStep] = useState(0);
  const studioGuideRef = useRef({ active: false, step: 0 });
  const studioShellRef = useRef<HTMLDivElement | null>(null);
  const propertiesPanelRef = useRef<HTMLElement | null>(null);
  const [guideArrow, setGuideArrow] = useState<GuideArrowGeometry | null>(null);
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);

  const [showPublishGuide, setShowPublishGuide] = useState(false);
  const [publishingPr, setPublishingPr] = useState(false);
  const [publishPrUrl, setPublishPrUrl] = useState<string | null>(null);
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness>({ state: 'idle' });
  const [exportFeedbackState, setExportFeedbackState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [monthlyIntroAvailable, setMonthlyIntroAvailable] = useState(false);
  const [activeProject, setActiveProject] = useState<SavedReadmeProject | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const studioViewedRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/stripe/plans')
      .then((response) => (response.ok ? response.json() : null))
      .then((plans) => {
        if (active && plans) setMonthlyIntroAvailable(Boolean(plans.monthlyIntroAvailable));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const applyPreset = (preset: StudioPreset) => {
    analytics.trackFunnel('readme_preset_selected', {
      preset: preset.id,
      pro: preset.pro,
      workspace_mode: workspaceMode,
    });
    setSections(preset.sections);
    setSelectedSection('header');
    setTheme(preset.theme);
    setSectionAssets(preset.sectionAssets ?? {});
    setHiddenAssets({});
    setSectionStyle(preset.sectionStyle);
    setStyle(preset.style);
    setGoal(preset.goal);
    setStructure(preset.structure);
    setTone(preset.tone);
    setMotionStyle(preset.motionStyle);
    setQuickVisual(quickVisualForPresetId(preset.id));
    setContributionSnake(false);
    setSpaceShooter(preset.id === 'space-shooter');
    setJetHeatmap(preset.id === 'showcase');
    setHeatmapStyle(preset.id === 'showcase' ? 'jet' : 'aura');
    setActivePreset(preset.id);
  };


  const [isLoading, setIsLoading] = useState(false);
  const [generatedReadme, setGeneratedReadme] = useState<string | null>(null);
  const [generatedProjectId, setGeneratedProjectId] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'gemini_refined' | 'openai' | 'template' | null>(null);
  const [profileData, setProfileData] = useState<{
    name: string | null;
    avatarUrl: string;
    bio: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSetupPath, setCopiedSetupPath] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Optional one-shot action rendered inside the toast, used for undoing preview edits. */
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const showToast = (message: string, action?: { label: string; run: () => void }) => {
    setToast(message);
    setToastAction(action ?? null);
    // Deletions are destructive, so their toast lingers long enough to undo.
    const lifetime = action ? 7000 : 2600;
    setTimeout(() => setToast((current) => {
      if (current !== message) return current;
      setToastAction(null);
      return null;
    }), lifetime);
  };
  const quickVisualForPreset = useCallback((presetId: string): QuickVisual => {
    return quickVisualForPresetId(presetId);
  }, []);
  const applyStarterTemplate = useCallback((preset: StudioPreset) => {
    applyPreset(preset);
    setQuickVisual(quickVisualForPreset(preset.id));
    setSpaceShooter(preset.id === 'space-shooter');
    if (preset.id === 'showcase') {
      setJetHeatmap(true);
      setHeatmapStyle('jet');
    }
  }, [quickVisualForPreset]);
  const [viewMode, setViewMode] = useState<CanvasView>('preview');
  const [refinementNotes, setRefinementNotes] = useState<string[] | null>(null);
  const [agentReasoning, setAgentReasoning] = useState<string | null>(null);
  const [agentLogExpanded, setAgentLogExpanded] = useState(false);
  const [readmeScore, setReadmeScore] = useState<{
    overall: number;
    profileClarity: number;
    projectProof: number;
    visualConsistency: number;
    recruiterScanability: number;
    suggestions: string[];
  } | null>(null);
  const [strategy, setStrategy] = useState<{
    primaryRole: string;
    strongestSignals: string[];
    weakSignals: string[];
    suggestedTone: string;
    profileGoal: string;
  } | null>(null);
  const [setupInstructions, setSetupInstructions] = useState<{
    title: string;
    description: string;
    files: { path: string; content: string }[];
  } | null>(null);

  const [usageOverride, setUsageOverride] = useState<{ remaining: number; limit: number; plan: 'free' | 'pro'; creditsRemaining?: number } | null>(null);
  const userPlanData = useUserPlan();
  const effectivePlan = usageOverride?.plan ?? userPlanData.plan;
  const effectiveLimit = usageOverride?.limit ?? userPlanData.readmeGenerationsLimit;
  const effectiveRemaining = usageOverride?.remaining ?? userPlanData.readmeGenerationsRemaining;
  const effectiveUsed = Math.max(0, effectiveLimit - effectiveRemaining);
  const effectiveCreditsRemaining = usageOverride?.creditsRemaining ?? userPlanData.creditsRemaining;
  const { loading: planLoading, authenticated } = userPlanData;
  const userIsPro = effectivePlan === 'pro';
  const usageAllowed = authenticated && (userIsPro || effectiveRemaining > 0);
  const studioGuideSteps = useMemo(
    () => buildStudioGuideSteps(authenticated, userIsPro),
    [authenticated, userIsPro]
  );
  const studioGuideStepMeta = studioGuideSteps[studioGuideStep] ?? studioGuideSteps[0];
  const studioGuideStepId = studioGuideStepMeta?.id ?? 'profile';
  const isGuideConversionStep = studioGuideStepId === 'signin' || studioGuideStepId === 'upgrade';
  const previewUsernameRef = useRef(previewUsername);
  previewUsernameRef.current = previewUsername;

  useEffect(() => {
    if (!requestedStudioRef.current || planLoading || sessionStatus === 'loading') return;
    requestedStudioRef.current = false;
    if (!authenticated) {
      showToast('Sign in to use Advanced Studio.');
      return;
    }
    setWorkspaceMode('studio');
  }, [authenticated, planLoading, sessionStatus]);

  useEffect(() => {
    if (studioViewedRef.current) return;
    studioViewedRef.current = true;
    analytics.trackFunnel('readme_studio_viewed', {
      workspace_mode: workspaceMode,
      has_username: Boolean(searchParams.get('username')),
      has_project: Boolean(searchParams.get('project')),
      source_prompt: searchParams.get('prompt') || undefined,
    });
  }, [searchParams, workspaceMode]);

  useEffect(() => {
    document.body.classList.toggle('readme-studio-fullscreen', workspaceMode === 'studio');
    if (workspaceMode === 'studio') {
      window.scrollTo({ top: 0, left: 0 });
    }
    return () => {
      document.body.classList.remove('readme-studio-fullscreen');
    };
  }, [workspaceMode]);

  useEffect(() => {
    const cleanUsername = username.trim().replace(/^@/, '') || DEMO_PROFILE_USERNAME;
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(cleanUsername)) {
      setPreviewUsername(DEMO_PROFILE_USERNAME);
      setPreviewProfile(null);
      setPreviewProfileState('error');
      return;
    }

    // Avoid blanking an already-valid preview for the same username (style switches used to remount this).
    setPreviewProfileState((current) =>
      current === 'valid' && previewUsernameRef.current === cleanUsername ? 'valid' : 'loading'
    );

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/showcase-data?username=${encodeURIComponent(cleanUsername)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Profile unavailable');
        const profile = await response.json() as QuickPreviewProfile;
        setPreviewUsername(cleanUsername);
        setPreviewProfile(profile);
        if (profile.languages?.length) {
          setLanguageLogos((current) => current.length ? current : profile.languages!.slice(0, 12).map((language) => language.name));
        }
        setPreviewProfileState('valid');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPreviewProfileState('error');
        if (cleanUsername !== DEMO_PROFILE_USERNAME) setPreviewUsername(DEMO_PROFILE_USERNAME);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [username]);

  const selectedTheme = themes.find((item) => item.id === theme) ?? themes[0];
  const selectedGoal = goalOptions.find((item) => item.id === goal) ?? goalOptions[0];
  const selectedRole = careerRoles.find((item) => item.id === careerRole) ?? careerRoles[0];
  const selectedSectionInspector = sectionInspectorCopy[selectedSection];
  const selectedSectionWorkflow = sectionWorkflowCopy[selectedSection];
  const selectedSectionIndex = sections.indexOf(selectedSection);
  const selectedSectionIsIncluded = selectedSectionIndex >= 0;
  const selectedHiddenAssets = hiddenAssets[selectedSection] ?? [];
  const selectedDefaultAssets = (defaultSectionAssets[selectedSection] ?? [])
    .filter((asset) => !selectedHiddenAssets.includes(asset));
  const selectedManualAssets = (sectionAssets[selectedSection] ?? [])
    .filter((asset) => !selectedHiddenAssets.includes(asset));
  const selectedSectionAssets = [
    ...selectedDefaultAssets,
    ...selectedManualAssets,
  ].filter((asset, index, assets) => assets.indexOf(asset) === index);
  const sectionLabelOf = useCallback((sectionId: SectionType) =>
    availableSections.find((s) => s.id === sectionId)?.label ?? sectionId,
  []);
  const checkoutReturnTo = useMemo(() => {
    const params = new URLSearchParams();
    const cleanUsername = username.trim();
    if (cleanUsername) params.set('username', cleanUsername);
    if (activeProject?.id || generatedProjectId) params.set('project', activeProject?.id ?? generatedProjectId ?? '');
    params.set('section', selectedSection);
    const query = params.toString();
    return `/readme-generator${query ? `?${query}` : ''}`;
  }, [activeProject?.id, generatedProjectId, selectedSection, username]);
  // Accounts created through Google carry no GitHub login, and entitlement is
  // resolved from one — so the draft's profile travels to checkout and gets
  // attached on payment. Harmless when the account already has a username:
  // a claim never overwrites one.
  const checkoutProfile = sessionUsername || username.trim().replace(/^@/, '');
  const checkoutHref = `/checkout?returnTo=${encodeURIComponent(checkoutReturnTo)}`
    + (checkoutProfile ? `&profile=${encodeURIComponent(checkoutProfile)}` : '');
  const monthlyCheckoutHref = `${checkoutHref}&plan=monthly`;
  const exportCheckoutHrefFor = useCallback((intent: ExportIntent, target?: AnimatedSection | 'all') => {
    const separator = checkoutReturnTo.includes('?') ? '&' : '?';
    const targetParam = target ? `&exportTarget=${encodeURIComponent(target)}` : '';
    const resumeReturnTo = `${checkoutReturnTo}${separator}exportIntent=${encodeURIComponent(intent)}${targetParam}`;
    return `/checkout?plan=export&returnTo=${encodeURIComponent(resumeReturnTo)}`
      + (checkoutProfile ? `&profile=${encodeURIComponent(checkoutProfile)}` : '');
  }, [checkoutProfile, checkoutReturnTo]);
  const exportCheckoutHref = exportCheckoutHrefFor('copy');

  const readmeStepLabels = useMemo(
    () =>
      careerMode && agentLoop
        ? [aiProfileScan ? 'Scanning profile and projects' : 'Fetching GitHub profile', 'Drafting README', `Refining for ${careerRole}`]
        : [aiProfileScan ? 'Scanning profile and projects' : 'Fetching GitHub profile', 'Drafting README'],
    [careerMode, agentLoop, careerRole, aiProfileScan]
  );
  const readmeProgress = useThinkingProgress(readmeStepLabels, { intervalMs: 1200 });
  const animatedSectionPreview = useMemo(() => {
    const cleanUsername = username.trim() || DEMO_PROFILE_USERNAME;
    const buildParams = (section: AnimatedSection, absolute = false) => {
      const params = new URLSearchParams({ username: cleanUsername, theme });
      if (section === 'heatmap' && heatmapStyle !== 'aura') params.set('style', heatmapStyle);
      else if (sectionStyle === 'terminal') params.set('style', 'terminal');
      // Pro users' widgets are watermark-free via a signed token.
      if (userIsPro && userPlanData.widgetToken) params.set('nw', userPlanData.widgetToken);
      if (section === 'social') {
        if (socialWebsite.trim()) params.set('website', socialWebsite.trim());
        if (socialX.trim()) params.set('x', socialX.trim());
        if (socialLinkedIn.trim()) params.set('linkedin', socialLinkedIn.trim());
        if (socialEmail.trim()) params.set('email', socialEmail.trim());
      }
      const base = absolute ? `https://www.gitskins.com/api/section/${section}` : `/api/section/${section}`;
      return `${base}?${params.toString()}`;
    };
    return animatedSections.map((section) => {
      const url = buildParams(section.id);
      const absoluteUrl = buildParams(section.id, true);
      const lightUrl = `${absoluteUrl}&mode=light`;
      const alt = `${cleanUsername} ${section.label.toLowerCase()} section`;
      // Theme-aware <picture>: GitHub serves the light variant to viewers in
      // light mode and the dark (img fallback) to everyone else.
      return {
        ...section,
        url,
        markdown: `<p align="center">\n  <picture>\n    <source media="(prefers-color-scheme: light)" srcset="${lightUrl}" />\n    <img src="${absoluteUrl}" alt="${alt}" />\n  </picture>\n</p>`,
      };
    });
  }, [username, theme, sectionStyle, heatmapStyle, socialWebsite, socialX, socialLinkedIn, socialEmail, userIsPro, userPlanData.widgetToken]);

  const getSectionPreviewAssets = useCallback((section: SectionType) => {
    const hidden = hiddenAssets[section] ?? [];
    const assets = [
      ...(defaultSectionAssets[section] ?? []),
      ...(sectionAssets[section] ?? []),
    ].filter((asset, index, values) => values.indexOf(asset) === index && !hidden.includes(asset));

    return assets
      .map((asset) => animatedSectionPreview.find((item) => item.id === asset))
      .filter((asset): asset is (typeof animatedSectionPreview)[number] => Boolean(asset));
  }, [animatedSectionPreview, hiddenAssets, sectionAssets]);

  const liveDraftReadme = useMemo(() => {
    const cleanUsername = username.trim() || DEMO_PROFILE_USERNAME;
    const selectedLabels = sections
      .map((section) => availableSections.find((item) => item.id === section)?.label)
      .filter(Boolean);
    const lines = [
      `# ${cleanUsername}`,
      '',
      `> ${selectedGoal.description}.`,
      '',
      `**Theme:** ${selectedTheme.name} · **Style:** ${styleOptions.find((item) => item.id === style)?.label ?? style} · **Agent:** ${careerMode ? selectedRole.label : 'Off'}`,
      '',
      ...sections.flatMap((section) => {
        const label = availableSections.find((item) => item.id === section)?.label ?? section;
        const editingLine = section === selectedSection ? ['> Editing this section in the inspector.'] : [];
        const assetLines = getSectionPreviewAssets(section).flatMap((asset) => ['', asset.markdown]);
        if (section === 'header') {
          return [`## ${label}`, '', ...editingLine, editingLine.length ? '' : null, `Hi, I'm **${cleanUsername}**. This README is tuned for **${selectedGoal.label.toLowerCase()}** with a ${selectedTheme.name} visual system.`, ...assetLines].filter(Boolean) as string[];
        }
        if (section === 'skills') {
          return [`## ${label}`, '', ...editingLine, editingLine.length ? '' : null, `Selected stack and skill badges will be generated from the GitHub profile and README strategy.`, ...assetLines].filter(Boolean) as string[];
        }
        if (section === 'stats') {
          return [`## ${label}`, '', ...editingLine, editingLine.length ? '' : null, `GitSkins stat widgets will use the **${selectedTheme.name}** theme.`, ...assetLines].filter(Boolean) as string[];
        }
        if (section === 'connect') {
          const links = [socialWebsite && `Website: ${socialWebsite}`, socialX && `X: ${socialX}`, socialLinkedIn && `LinkedIn: ${socialLinkedIn}`, socialEmail && `Email: ${socialEmail}`].filter(Boolean);
          return [`## ${label}`, '', ...editingLine, editingLine.length ? '' : null, links.length ? links.join(' · ') : 'Contact and social links will appear here.', ...assetLines].filter(Boolean) as string[];
        }
        return [`## ${label}`, '', ...editingLine, editingLine.length ? '' : null, sectionInspectorCopy[section].description, ...assetLines].filter(Boolean) as string[];
      }),
      '',
      `<!-- Sections: ${selectedLabels.join(', ')} -->`,
    ];
    return lines.join('\n');
  }, [username, sections, selectedSection, selectedGoal, selectedTheme, selectedRole, style, careerMode, socialWebsite, socialX, socialLinkedIn, socialEmail, getSectionPreviewAssets]);

  const livePreviewSections = useMemo<PreviewSection[]>(() => sections.map((section) => ({
    key: `live-${section}`,
    id: section,
    label: availableSections.find((item) => item.id === section)?.label ?? section,
    description: sectionInspectorCopy[section].description,
    assets: [
      ...getSectionPreviewAssets(section).map((asset) => ({
        id: asset.id,
        label: asset.label,
        url: asset.url,
        alt: `${username.trim() || DEMO_PROFILE_USERNAME} ${asset.label.toLowerCase()} GitSkins section`,
      })),
      ...(section === 'heatmap' && spaceShooter
        ? [{
            id: 'space-shooter',
            label: 'Space Shooter',
            url: '/showcase/space-shooter.gif',
            alt: `${username.trim() || DEMO_PROFILE_USERNAME} contribution Space Shooter game`,
          }]
        : []),
    ],
    markdown: '',
    isGenerated: false,
  })), [sections, username, spaceShooter, getSectionPreviewAssets]);

  useEffect(() => {
    setGeneratedReadme((current) => {
      if (!current) return current;
      const modernized = modernizeReadmeVisuals(current, {
        username: username.trim() || DEMO_PROFILE_USERNAME,
        theme,
      });
      return modernized === current ? current : modernized;
    });
  }, [theme, username]);

  const generatedPreview = useMemo(
    () => (generatedReadme ? parseReadmePreview(generatedReadme) : null),
    [generatedReadme]
  );
  const generationSectionAssets = useMemo(() => sections.reduce<SectionAssets>((acc, section) => {
    const hidden = hiddenAssets[section] ?? [];
    const assets = [
      ...(defaultSectionAssets[section] ?? []),
      ...(sectionAssets[section] ?? []),
    ].filter((asset, index, values) => values.indexOf(asset) === index && !hidden.includes(asset));
    if (assets.length) acc[section] = assets;
    return acc;
  }, {}), [hiddenAssets, sections, sectionAssets]);
  const readmePreviewSections = generatedPreview?.sections.length ? generatedPreview.sections : livePreviewSections;
  const previewDocumentTitle = generatedPreview?.title || profileData?.name || username.trim() || PLACEHOLDER_USERNAME;
  const previewDocumentSummary = generatedPreview?.summary || `${selectedGoal.description}. Built with the ${selectedTheme.name} GitSkins visual system.`;
  const previewDocumentMode = generatedPreview?.sections.length ? 'Generated README' : 'Live GitSkins draft';
  const proExportReasons = useMemo(() => {
    if (userIsPro) return [];
    const reasons = new Set<string>();
    if (!FREE_THEMES.includes(theme as typeof FREE_THEMES[number])) reasons.add(`${selectedTheme.name} theme`);
    if (sectionStyle === 'terminal') reasons.add('Terminal design style');
    sections.forEach((section) => {
      if (PRO_SECTIONS.includes(section)) reasons.add(`${sectionLabelOf(section)} section`);
    });
    Object.values(generationSectionAssets).flat().forEach((asset) => {
      if (PRO_ASSETS.includes(asset)) reasons.add(ANIMATED_ASSET_LABELS[asset]);
    });
    return Array.from(reasons);
  }, [generationSectionAssets, sectionLabelOf, sectionStyle, sections, selectedTheme.name, theme, userIsPro]);
  const draftRequiresProExport = proExportReasons.length > 0;
  const activeQuickPreset = activePreset
    ? STUDIO_PRESETS.find((preset) => preset.id === activePreset)
    : undefined;
  const quickDraftMeta = `@${username.trim().replace(/^@/, '') || PLACEHOLDER_USERNAME} · ${selectedGoal.label} · ${activeQuickPreset?.name ?? quickVisualLabels[quickVisual]}`;
  // Paid one-time export credits let Free users keep a premium draft without
  // subscribing. Until the credit is spent, export buttons behave like Pro.
  const premiumExportCredits = userPlanData.premiumExportCredits ?? 0;
  const premiumExportAvailable = premiumExportCredits > 0;
  const canExportPremium = userIsPro || premiumExportCredits > 0;
  const markdownLocked = !canExportPremium && draftRequiresProExport;
  const showExportCreditNotice = !userIsPro && draftRequiresProExport && authenticated;

  const openUpgradeGate = useCallback((feature: string, reasons: string[] = []) => {
    analytics.trackFunnel('readme_upgrade_gate_opened', {
      feature,
      reasons,
      reason_count: reasons.length,
      workspace_mode: workspaceMode,
      username: username.trim() || undefined,
      theme,
      section_style: sectionStyle,
    });
    setUpgradeReasons(reasons);
    setUpgradeFeature(feature);
  }, [sectionStyle, theme, username, workspaceMode]);

  const closeUpgradeGate = useCallback(() => {
    analytics.trackFunnel('readme_upgrade_gate_closed', {
      feature: upgradeFeature,
      reason_count: upgradeReasons.length,
      workspace_mode: workspaceMode,
    });
    setUpgradeFeature(null);
    setUpgradeReasons([]);
  }, [upgradeFeature, upgradeReasons.length, workspaceMode]);

  // A restored project can belong to a different account than the person
  // viewing it: the old demo-profile default, or a draft saved before that
  // changed. The server now refuses to publish those, so surface it here, where
  // it is still one click to fix, rather than as a 409 at the publish step.
  const draftUsername = username.trim().replace(/^@/, '');
  const draftForSomeoneElse = Boolean(
    authenticated && sessionUsername && draftUsername
    && draftUsername.toLowerCase() !== sessionUsername.toLowerCase()
  );

  const rePointDraftAtSelf = useCallback(() => {
    setUsername(sessionUsername);
    // The generated markdown still names the old account, so drop it and make
    // them regenerate rather than leaving a stale draft that looks adopted.
    setGeneratedReadme(null);
    setPublishPrUrl(null);
    setError(null);
  }, [sessionUsername]);

  const wrongOwnerNotice = draftForSomeoneElse ? (
    <div
      role="status"
      style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        margin: '0 0 12px', padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
        border: '1px solid rgba(240,176,85,0.4)', background: 'rgba(240,176,85,0.09)', color: '#f0c78a',
      }}
    >
      <span>
        This draft is built for <b>@{draftUsername}</b>, so it cannot be published to your profile.
      </span>
      <button
        type="button"
        onClick={rePointDraftAtSelf}
        style={{
          background: '#f0b055', color: '#2a1c02', border: 0, borderRadius: 8,
          padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Use @{sessionUsername}
      </button>
    </div>
  ) : null;

  const [exportPanel, setExportPanel] = useState<ExportPanelState | null>(null);

  const openExportPanel = useCallback((
    intent: ExportIntent,
    reasons = proExportReasons,
    target?: AnimatedSection | 'all',
  ) => {
    analytics.trackFunnel('readme_export_panel_opened', {
      intent,
      reasons,
      reason_count: reasons.length,
      workspace_mode: workspaceMode,
      username: username.trim() || undefined,
      has_export_credit: premiumExportAvailable,
      target,
    });
    setShowPublishGuide(false);
    setExportFeedbackState('idle');
    setExportPanel({ intent, reasons, target });
  }, [premiumExportAvailable, proExportReasons, username, workspaceMode]);

  const closeExportPanel = useCallback(() => {
    if (!exportPanel) return;
    exportPanel.decideCredit?.('cancel');
    analytics.trackFunnel('readme_export_panel_closed', {
      intent: exportPanel.intent,
      workspace_mode: workspaceMode,
      has_export_credit: premiumExportAvailable,
    });
    setExportPanel(null);
  }, [exportPanel, premiumExportAvailable, workspaceMode]);

  const submitExportFeedback = useCallback(async (reason: string) => {
    if (exportFeedbackState !== 'idle') return;
    setExportFeedbackState('sending');
    analytics.trackFunnel('readme_export_feedback_selected', {
      reason,
      workspace_mode: workspaceMode,
      has_export_credit: premiumExportAvailable,
    });
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'usability',
          message: `Premium export decision: ${reason}`,
          page: '/readme-generator',
          action: 'premium_export_declined',
          workspaceMode,
        }),
      });
      if (!response.ok) throw new Error('feedback_failed');
      setExportFeedbackState('sent');
      analytics.trackFunnel('readme_export_feedback_submitted', { reason, workspace_mode: workspaceMode });
    } catch {
      setExportFeedbackState('idle');
    }
  }, [exportFeedbackState, premiumExportAvailable, workspaceMode]);

  const resolveExportCredit = useCallback((choice: 'spend' | 'cancel') => {
    const pendingDecision = exportPanel?.decideCredit;
    if (!pendingDecision) return;
    analytics.trackFunnel(choice === 'spend' ? 'readme_export_credit_used' : 'readme_export_credit_deferred', {
      intent: exportPanel.intent,
      workspace_mode: workspaceMode,
    });
    setExportPanel(null);
    pendingDecision(choice);
  }, [exportPanel, workspaceMode]);

  const confirmExportCreditSpend = useCallback((intent: ExportIntent, target?: AnimatedSection | 'all') => {
    analytics.trackFunnel('readme_export_credit_ready', { intent, workspace_mode: workspaceMode });
    return new Promise<'spend' | 'cancel'>((resolve) => {
      setExportPanel({
        intent,
        reasons: proExportReasons,
        target,
        decideCredit: resolve,
      });
    });
  }, [proExportReasons, workspaceMode]);

  const guardExportAction = useCallback((
    intent: ExportIntent,
    reasons = proExportReasons,
    target?: AnimatedSection | 'all',
    bypass = false,
  ) => {
    if (bypass || canExportPremium || reasons.length === 0) return true;
    openExportPanel(intent, reasons, target);
    return false;
  }, [canExportPremium, openExportPanel, proExportReasons]);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'cancelled' || checkoutCancellationHandledRef.current) return;
    checkoutCancellationHandledRef.current = true;
    const intentParam = searchParams.get('exportIntent');
    const targetParam = searchParams.get('exportTarget');
    const target = targetParam === 'all' || animatedSections.some((section) => section.id === targetParam)
      ? targetParam as AnimatedSection | 'all'
      : undefined;
    showToast('Checkout cancelled. Your README is still here.');
    analytics.trackFunnel('readme_export_checkout_cancelled', {
      intent: isExportIntent(intentParam) ? intentParam : undefined,
      target,
      workspace_mode: workspaceMode,
    });
    if (isExportIntent(intentParam)) openExportPanel(intentParam, proExportReasons, target);
    const cleanUrl = new URL(window.location.href);
    ['checkout', 'plan', 'exportIntent', 'exportTarget'].forEach((key) => cleanUrl.searchParams.delete(key));
    window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, [openExportPanel, proExportReasons, searchParams, workspaceMode]);

  useEffect(() => {
    if (markdownLocked && viewMode === 'markdown') {
      setViewMode('preview');
    }
  }, [markdownLocked, viewMode]);

  const switchToFreeExport = useCallback(() => {
    analytics.trackFunnel('readme_free_export_selected', {
      reasons: proExportReasons,
      reason_count: proExportReasons.length,
      workspace_mode: workspaceMode,
      username: username.trim() || undefined,
    });
    setTheme((currentTheme) =>
      FREE_THEMES.includes(currentTheme as typeof FREE_THEMES[number]) ? currentTheme : 'github-dark'
    );
    setSectionStyle('aura');
    setSections((currentSections) => {
      const nextSections = currentSections.filter((section) => !PRO_SECTIONS.includes(section));
      return nextSections.length ? nextSections : ['header', 'about', 'skills', 'stats', 'projects', 'connect'];
    });
    setSectionAssets((currentAssets) => {
      const nextAssets: SectionAssets = {};
      Object.entries(currentAssets).forEach(([section, assets]) => {
        const safeAssets = (assets ?? []).filter((asset) => !PRO_ASSETS.includes(asset));
        if (safeAssets.length) nextAssets[section as SectionType] = safeAssets;
      });
      return nextAssets;
    });
    // Clearing sectionAssets is not enough: defaultSectionAssets is hardcoded
    // and merged back in on every read, so a section like Heatmap would keep
    // its premium widget and the server would still refuse the export. The user
    // would be stuck in a loop, told to switch to the free version by a button
    // that had already done all it could. Suppress the premium defaults too.
    setHiddenAssets((current) => {
      const next: SectionAssets = { ...current };
      (Object.keys(defaultSectionAssets) as SectionType[]).forEach((section) => {
        const premiumDefaults = (defaultSectionAssets[section] ?? []).filter((asset) => PRO_ASSETS.includes(asset));
        if (!premiumDefaults.length) return;
        const existing = next[section] ?? [];
        next[section] = [...existing, ...premiumDefaults.filter((asset) => !existing.includes(asset))];
      });
      return next;
    });
    setSelectedSection((currentSection) => PRO_SECTIONS.includes(currentSection) ? 'header' : currentSection);
    setActivePreset(null);
    setGeneratedReadme(null);
    setGeneratedProjectId(null);
    setSetupInstructions(null);
    setPublishPrUrl(null);
    closeUpgradeGate();
    closeExportPanel();
    showToast('Premium choices removed. Basic export is ready.');
  }, [closeExportPanel, closeUpgradeGate, proExportReasons, username, workspaceMode]);

  const previewSkills = useMemo(() => {
    const skillsByRole = {
      frontend: ['React', 'Next.js', 'TypeScript', 'Design Systems', 'Performance', 'Accessibility', 'UI Systems'],
      backend: ['Node.js', 'Postgres', 'API Design', 'Queues', 'Observability', 'Caching', 'Reliability'],
      data: ['Python', 'SQL', 'Pipelines', 'Analytics', 'ML Systems', 'Data Modeling', 'Dashboards'],
      mobile: ['React Native', 'Swift', 'Kotlin', 'Expo', 'App UX', 'Offline Sync', 'Release QA'],
      devops: ['Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Reliability', 'Monitoring', 'Incident Response'],
      product: ['Product Strategy', 'Experiments', 'UX', 'Analytics', 'Full-Stack', 'Growth', 'Customer Insight'],
      fullstack: ['TypeScript', 'Next.js', 'React', 'Node.js', 'Product Engineering', 'Databases', 'APIs'],
    } satisfies Record<CareerRole, string[]>;
    const limit = skillDensity === 'compact' ? 4 : skillDensity === 'expanded' ? 7 : 5;
    return skillsByRole[careerRole].slice(0, limit);
  }, [careerRole, skillDensity]);

  const previewProjects = useMemo(() => [
    {
      name: `${username.trim() || PLACEHOLDER_USERNAME}-studio`,
      copy: projectEmphasis === 'technical'
        ? `A ${selectedGoal.label.toLowerCase()} project focused on architecture, data flow, and maintainable delivery.`
        : projectEmphasis === 'visual'
          ? `A ${selectedGoal.label.toLowerCase()} project with a polished interface and memorable visual system.`
          : `A ${selectedGoal.label.toLowerCase()} project with clear outcomes and a polished product surface.`,
      stack: previewSkills.slice(0, 3),
    },
    {
      name: 'developer-tools',
      copy: projectEmphasis === 'technical'
        ? 'Reusable systems, automation, and GitHub-native workflow improvements with implementation detail.'
        : projectEmphasis === 'visual'
          ? 'Developer tooling presented with clean workflows, visible states, and product-grade UX.'
          : 'Reusable systems, automation, and GitHub-native workflow improvements.',
      stack: previewSkills.slice(2, 5),
    },
    {
      name: 'profile-lab',
      copy: projectEmphasis === 'technical'
        ? 'Experiments that turn profile data into structured, testable developer signals.'
        : projectEmphasis === 'visual'
          ? 'A visual exploration of GitHub identity, README sections, and animated profile widgets.'
          : 'A practical project showing momentum, taste, and repeatable delivery habits.',
      stack: previewSkills.slice(1, 4),
    },
  ].slice(0, projectCount), [previewSkills, projectCount, projectEmphasis, selectedGoal.label, username]);

  const timelineSections = useMemo(() => {
    const included = sections
      .map((id) => availableSections.find((section) => section.id === id))
      .filter((section): section is (typeof availableSections)[number] => Boolean(section));
    const inactive = availableSections.filter((section) => !sections.includes(section.id));
    return [...included, ...inactive];
  }, [sections]);

  const selectReadmeSection = useCallback((section: SectionType, tab: InspectorTab = 'content') => {
    setSelectedSection(section);
    setInspectorTab(tab);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-readme-section="${section}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const aiScanSignals = useMemo(() => {
    const enabled = useAI && aiProfileScan;
    const visuals = Object.values(generationSectionAssets).flat().length;
    return [
      { label: 'Profile source', value: enabled ? `${username.trim() || PLACEHOLDER_USERNAME} public GitHub profile` : 'Basic profile fields' },
      { label: 'Narrative target', value: selectedGoal.label },
      { label: 'Role inference', value: careerMode ? selectedRole.label : 'General developer profile' },
      { label: 'Project proof', value: enabled ? 'Pinned repos, stars, languages, descriptions' : 'Only explicit project data' },
      { label: 'Visual system', value: `${selectedTheme.name} with ${visuals || 'default'} visual cue${visuals === 1 ? '' : 's'}` },
    ];
  }, [aiProfileScan, careerMode, generationSectionAssets, selectedGoal.label, selectedRole.label, selectedTheme.name, useAI, username]);

  const studioConfig = useMemo<StudioConfig>(() => ({
    quickVisual,
    sections,
    selectedSection,
    sectionStyle,
    sectionAssets,
    hiddenAssets,
    careerMode,
    careerRole,
    agentLoop,
    useAI,
    aiProfileScan,
    goal,
    structure,
    tone,
    style,
    theme,
    motionStyle,
    typingHeadline,
    typingLines,
    animatedDivider,
    contributionSnake,
    spaceShooter,
    spaceShooterStrategy,
    jetHeatmap,
    heatmapStyle,
    visitorCounter,
    githubTrophies,
    avatarBlock,
    skillDensity,
    languageLogos,
    projectCount,
    projectEmphasis,
    connectLayout,
    connectCta,
    socialWebsite,
    socialX,
    socialLinkedIn,
    socialEmail,
    professionalRole,
    experienceSummary,
    education,
    achievementsText,
    currentFocusText,
    openTo,
  }), [
    quickVisual, sections, selectedSection, sectionStyle, sectionAssets, hiddenAssets, careerMode, careerRole,
    agentLoop, useAI, aiProfileScan, goal, structure, tone, style, theme, motionStyle,
    typingHeadline, typingLines, animatedDivider, contributionSnake, spaceShooter, spaceShooterStrategy, jetHeatmap, heatmapStyle, visitorCounter,
    githubTrophies, avatarBlock, skillDensity, languageLogos, projectCount, projectEmphasis,
    connectLayout, connectCta, socialWebsite, socialX, socialLinkedIn, socialEmail,
    professionalRole, experienceSummary, education, achievementsText, currentFocusText, openTo,
  ]);

  const restoreStudioConfig = useCallback((config: StudioConfig) => {
    const restoredQuickVisual = config.quickVisual
      ?? (config.style === 'minimal' ? 'minimal' : config.style === 'creative' ? 'expressive' : 'polished');
    setQuickVisual(restoredQuickVisual);
    setSections(config.sections);
    setSelectedSection(config.selectedSection);
    setSectionStyle(config.sectionStyle);
    setSectionAssets(config.sectionAssets);
    // Absent on projects saved before preview deletion shipped.
    setHiddenAssets(config.hiddenAssets ?? {});
    setCareerMode(config.careerMode);
    setCareerRole(config.careerRole);
    setAgentLoop(config.agentLoop);
    setUseAI(config.useAI);
    setAiProfileScan(config.aiProfileScan);
    setGoal(config.goal);
    setStructure(config.structure);
    setTone(config.tone);
    setStyle(config.style);
    if (themes.some((option) => option.id === config.theme)) setTheme(config.theme);
    setMotionStyle(config.motionStyle);
    setTypingHeadline(config.typingHeadline);
    setTypingLines(config.typingLines);
    setAnimatedDivider(config.animatedDivider);
    setContributionSnake(config.contributionSnake);
    setSpaceShooter(config.spaceShooter ?? false);
    setSpaceShooterStrategy(config.spaceShooterStrategy ?? 'random');
    // Saved projects and drafts predate this field, so it is absent on restore.
    setJetHeatmap(config.jetHeatmap ?? false);
    setHeatmapStyle(config.heatmapStyle ?? (config.jetHeatmap ? 'jet' : 'aura'));
    setVisitorCounter(config.visitorCounter);
    setGithubTrophies(config.githubTrophies);
    setAvatarBlock(config.avatarBlock);
    setSkillDensity(config.skillDensity);
    setLanguageLogos(config.languageLogos ?? []);
    setProjectCount(config.projectCount);
    setProjectEmphasis(config.projectEmphasis);
    setConnectLayout(config.connectLayout);
    setConnectCta(config.connectCta);
    setSocialWebsite(config.socialWebsite);
    setSocialX(config.socialX);
    setSocialLinkedIn(config.socialLinkedIn);
    setSocialEmail(config.socialEmail);
    setProfessionalRole(config.professionalRole ?? '');
    setExperienceSummary(config.experienceSummary ?? '');
    setEducation(config.education ?? '');
    setAchievementsText(config.achievementsText ?? '');
    setCurrentFocusText(config.currentFocusText ?? '');
    setOpenTo(config.openTo ?? '');
  }, []);


  useEffect(() => {
    const usernameParam = searchParams.get('username');
    const projectParam = searchParams.get('project');
    const themeParam = searchParams.get('theme');
    const promptParam = searchParams.get('prompt');
    const careerParam = searchParams.get('careerMode');
    const roleParam = searchParams.get('role') as CareerRole | null;
    const heatmapStyleParam = searchParams.get('heatmapStyle') as HeatmapStyle | null;
    const spaceShooterParam = searchParams.get('spaceShooter');
    const chessParam = searchParams.get('chess');
    if (usernameParam) {
      setUsername(usernameParam.trim().replace(/^@/, ''));
    }
    if (themeParam && themes.some((option) => option.id === themeParam)) {
      setTheme(themeParam);
    }
    if (promptParam) {
      applyProfilePrompt(promptParam, {
        goal: setGoal,
        structure: setStructure,
        tone: setTone,
        style: setStyle,
      });
      const normalizedPrompt = promptParam.toLowerCase();
      if (/minimal|concise|simple|clean/.test(normalizedPrompt)) setQuickVisual('minimal');
      if (/creative|playful|colorful/.test(normalizedPrompt)) setQuickVisual('expressive');
    }
    if (careerParam === '1') {
      setCareerMode(true);
      if (roleParam) {
        setCareerRole(roleParam);
      }
    }
    if (heatmapStyleParam && ['aura', 'jet', 'erased', 'snake'].includes(heatmapStyleParam)) {
      setHeatmapStyle(heatmapStyleParam);
      setJetHeatmap(heatmapStyleParam === 'jet');
      setSections((current) => current.includes('heatmap') ? current : [...current, 'heatmap']);
    }
    if (spaceShooterParam === '1' || spaceShooterParam === 'true') {
      setSpaceShooter(true);
      setQuickVisual('space-shooter');
      setActivePreset('space-shooter');
      setSections((current) => current.includes('heatmap') ? current : [...current, 'heatmap']);
      setMotionStyle((current) => current === 'none' ? 'animated' : current);
    }
    if (chessParam === '1' || chessParam === 'true') {
      setSectionAssets((current) => ({
        ...current,
        header: Array.from(new Set([...(current.header ?? []), 'chess'])),
      }));
      setSelectedSection('header');
      setMotionStyle((current) => current === 'none' ? 'animated' : current);
    }
    const sectionParam = searchParams.get('section') as SectionType | null;
    if (sectionParam && SECTION_TYPES.includes(sectionParam)) {
      setSelectedSection(sectionParam);
    }
    if (!projectParam) return;

    let cancelled = false;
    setProjectLoading(true);
    fetch(`/api/readme-history?id=${encodeURIComponent(projectParam)}`)
      .then((response) => {
        if (!response.ok) throw new Error('Saved README project not found');
        return response.json();
      })
      .then((data) => {
        if (cancelled || !data?.item) return;
        const item = data.item as SavedReadmeProject;
        setActiveProject(item);
        setGeneratedProjectId(item.id);
        setUsername(item.username);
        setGeneratedReadme(modernizeReadmeVisuals(item.markdown, {
          username: item.username,
          theme: item.theme || 'github-dark',
        }));
        setProfileData(null);
        setReadmeScore(item.score === null ? null : {
          overall: item.score,
          profileClarity: item.score,
          projectProof: item.score,
          visualConsistency: item.score,
          recruiterScanability: item.score,
          suggestions: ['Restored from your saved README projects. Regenerate when you want a fresh AI pass.'],
        });
        if (item.goal && goalOptions.some((option) => option.id === item.goal)) setGoal(item.goal as ReadmeGoal);
        if (item.structure && structureOptions.some((option) => option.id === item.structure)) setStructure(item.structure as ReadmeStructure);
        if (item.tone && toneOptions.some((option) => option.id === item.tone)) setTone(item.tone as ReadmeTone);
        if (item.style && styleOptions.some((option) => option.id === item.style)) setStyle(item.style as ReadmeStyle);
        if (item.theme && themes.some((option) => option.id === item.theme)) setTheme(item.theme);
        if (item.studioConfig) {
          restoreStudioConfig(item.studioConfig);
        }
        setWorkspaceMode('studio');
        setViewMode('preview');
        setSaveState('saved');
        showToast('Saved README project restored');
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not restore saved README project');
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restoreStudioConfig, searchParams]);

  useEffect(() => {
    if (!authenticated) return;
    try {
      if (searchParams.get('project')) {
        sessionStorage.removeItem('gitskins_readme_auth_draft');
        sessionStorage.removeItem('gitskins_readme_continue');
        return;
      }

      const rawDraft = sessionStorage.getItem('gitskins_readme_auth_draft')
        || sessionStorage.getItem('gitskins_readme_continue');
      if (!rawDraft) return;

      const fromAuthRedirect = Boolean(sessionStorage.getItem('gitskins_readme_auth_draft'));
      sessionStorage.removeItem('gitskins_readme_auth_draft');

      const draft = JSON.parse(rawDraft) as {
        username?: string;
        studioConfig?: StudioConfig;
        workspaceMode?: WorkspaceMode;
        autoGenerate?: boolean;
      };

      if (draft.username) setUsername(draft.username);
      if (draft.workspaceMode === 'quick' || draft.workspaceMode === 'studio') {
        setWorkspaceMode(draft.workspaceMode);
      }
      if (draft.studioConfig) {
        restoreStudioConfig(draft.studioConfig);
      }

      if (draft.autoGenerate) {
        sessionStorage.setItem('gitskins_readme_continue', rawDraft);
        setPendingAutoGenerate(true);
        if (fromAuthRedirect) showToast('Signed in, creating your README...');
      } else {
        sessionStorage.removeItem('gitskins_readme_continue');
        if (fromAuthRedirect && draft.studioConfig) {
          showToast('Your README draft was restored after sign-in');
        }
      }
    } catch {
      sessionStorage.removeItem('gitskins_readme_auth_draft');
      sessionStorage.removeItem('gitskins_readme_continue');
    }
  }, [authenticated, restoreStudioConfig, searchParams]);

  useEffect(() => {
    if (checkoutSync.status === 'synced') invalidateUserPlanCache();
  }, [checkoutSync.status]);

  useEffect(() => {
    if (!showPublishGuide) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPublishGuide(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPublishGuide]);

  useEffect(() => {
    const projectId = activeProject?.id ?? generatedProjectId;
    if (!authenticated || !projectId || projectLoading || !generatedReadme) return;

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      fetch('/api/readme-history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          action: 'save',
          markdown: generatedReadme,
          studioConfig,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error('Autosave failed');
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeProject?.id, authenticated, generatedProjectId, generatedReadme, projectLoading, studioConfig]);

  // Studio guide: resume incomplete guide, or start for first-time Studio users.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDIO_GUIDE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { completed?: boolean; step?: number };
        if (!parsed.completed) {
          setStudioGuideActive(true);
          setStudioGuideStep(Math.max(0, Number(parsed.step) || 0));
          setShowFirstRun(true);
        }
        return;
      }
      if (!localStorage.getItem('gs_studio_onboarded')) {
        setStudioGuideActive(true);
        setStudioGuideStep(0);
        setShowFirstRun(true);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!topbarMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (topbarMenuRef.current && !topbarMenuRef.current.contains(event.target as Node)) {
        setTopbarMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTopbarMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [topbarMenuOpen]);

  useEffect(() => {
    if (studioGuideActive && (studioGuideStepId === 'upgrade' || studioGuideStepId === 'export')) {
      setTopbarMenuOpen(false);
    }
  }, [studioGuideActive, studioGuideStepId]);

  useEffect(() => {
    setStudioGuideStep((current) => Math.min(current, Math.max(0, studioGuideSteps.length - 1)));
  }, [studioGuideSteps.length]);

  useEffect(() => {
    studioGuideRef.current = { active: studioGuideActive, step: studioGuideStep };
    if (!studioGuideActive) return;
    try {
      localStorage.setItem(
        STUDIO_GUIDE_STORAGE_KEY,
        JSON.stringify({ completed: false, step: studioGuideStep })
      );
    } catch {
      /* ignore */
    }
  }, [studioGuideActive, studioGuideStep]);

  useEffect(() => {
    if (!studioGuideActive || workspaceMode !== 'studio') return;
    if (studioGuideStepId === 'profile') {
      setMediaBinTab('profile');
      setShowFirstRun(true);
    } else if (studioGuideStepId === 'goal') {
      setInspectorTab('content');
      setShowFirstRun(false);
    } else if (studioGuideStepId === 'structure') {
      setShowFirstRun(false);
    } else if (studioGuideStepId === 'visual') {
      setMediaBinTab('visuals');
      setShowFirstRun(false);
    } else if (studioGuideStepId === 'signin' || studioGuideStepId === 'upgrade' || studioGuideStepId === 'export') {
      setViewMode('preview');
      setShowFirstRun(false);
    }
  }, [studioGuideActive, studioGuideStepId, workspaceMode]);

  useLayoutEffect(() => {
    if (!studioGuideActive || workspaceMode !== 'studio') {
      setGuideArrow(null);
      return;
    }

    const stepId = studioGuideStepId;
    if (!stepId) {
      setGuideArrow(null);
      return;
    }

    let frame = 0;
    const measure = () => {
      const shell = studioShellRef.current;
      if (!shell) return;
      const coach = shell.querySelector('.readme-studio-coach');
      const target = shell.querySelector(STUDIO_GUIDE_TARGET[stepId]);
      if (!(coach instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        setGuideArrow(null);
        return;
      }
      const next = buildGuideArrowGeometry(
        shell.getBoundingClientRect(),
        coach.getBoundingClientRect(),
        target.getBoundingClientRect()
      );
      setGuideArrow(next);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    const delayed = window.setTimeout(schedule, 80);
    const settled = window.setTimeout(schedule, 480);
    window.addEventListener('resize', schedule);
    const shell = studioShellRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && shell
      ? new ResizeObserver(schedule)
      : null;
    if (shell) observer?.observe(shell);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(delayed);
      window.clearTimeout(settled);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [studioGuideActive, studioGuideStepId, workspaceMode, showFirstRun, mediaBinTab, inspectorTab, authenticated, userIsPro]);

  const persistStudioGuideComplete = useCallback(() => {
    try {
      localStorage.setItem(STUDIO_GUIDE_STORAGE_KEY, JSON.stringify({ completed: true, step: studioGuideSteps.length - 1 }));
      localStorage.setItem('gs_studio_onboarded', '1');
    } catch {
      /* ignore */
    }
  }, [studioGuideSteps.length]);

  const dismissFirstRun = () => {
    setShowFirstRun(false);
  };

  const skipStudioGuide = useCallback(() => {
    setStudioGuideActive(false);
    setShowFirstRun(false);
    persistStudioGuideComplete();
    showToast('Studio guide skipped, explore freely');
  }, [persistStudioGuideComplete]);

  const restartStudioGuide = useCallback(() => {
    setWorkspaceMode('studio');
    setStudioGuideStep(0);
    setStudioGuideActive(true);
    setShowFirstRun(true);
    setMediaBinTab('profile');
    setInspectorTab('content');
    try {
      localStorage.setItem(STUDIO_GUIDE_STORAGE_KEY, JSON.stringify({ completed: false, step: 0 }));
    } catch {
      /* ignore */
    }
    showToast('Studio guide restarted');
  }, []);

  const advanceStudioGuide = useCallback(() => {
    setStudioGuideStep((current) => {
      if (current >= studioGuideSteps.length - 1) {
        setStudioGuideActive(false);
        setShowFirstRun(false);
        persistStudioGuideComplete();
        showToast('Guide complete, full Studio unlocked');
        return current;
      }
      return current + 1;
    });
  }, [persistStudioGuideComplete, studioGuideSteps.length]);

  const startGuideSignIn = useCallback(() => {
    try {
      sessionStorage.setItem('gitskins_readme_auth_draft', JSON.stringify({
        username: username.trim(),
        studioConfig,
        workspaceMode: 'studio',
        autoGenerate: false,
      }));
      localStorage.setItem(
        STUDIO_GUIDE_STORAGE_KEY,
        JSON.stringify({ completed: false, step: studioGuideStep })
      );
    } catch {
      /* best-effort */
    }
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/auth?callbackUrl=${encodeURIComponent(returnTo)}`;
  }, [username, studioConfig, studioGuideStep]);

  const startGuideUpgrade = useCallback(() => {
    try {
      localStorage.setItem(
        STUDIO_GUIDE_STORAGE_KEY,
        JSON.stringify({ completed: false, step: studioGuideStep })
      );
    } catch {
      /* best-effort */
    }
    window.location.href = checkoutHref;
  }, [checkoutHref, studioGuideStep]);

  const handleStudioGuidePrimary = useCallback(() => {
    if (studioGuideStepId === 'signin') {
      startGuideSignIn();
      return;
    }
    if (studioGuideStepId === 'upgrade') {
      startGuideUpgrade();
      return;
    }
    advanceStudioGuide();
  }, [advanceStudioGuide, startGuideSignIn, startGuideUpgrade, studioGuideStepId]);

  const retreatStudioGuide = useCallback(() => {
    setStudioGuideStep((current) => Math.max(0, current - 1));
  }, []);

  const switchWorkspaceMode = useCallback((mode: WorkspaceMode, source: string) => {
    if (mode === 'studio' && !authenticated) {
      analytics.trackFunnel('readme_studio_auth_required', {
        source,
        username: username.trim() || undefined,
      });
      startGuideSignIn();
      return;
    }

    analytics.trackFunnel('readme_workspace_mode_changed', {
      from: workspaceMode,
      to: mode,
      source,
      username: username.trim() || undefined,
    });
    setWorkspaceMode(mode);
  }, [authenticated, startGuideSignIn, username, workspaceMode]);

  const switchCanvasView = useCallback((mode: CanvasView, source: string) => {
    analytics.trackFunnel('readme_canvas_view_changed', {
      from: viewMode,
      to: mode,
      source,
      locked: mode === 'markdown' && markdownLocked,
      username: username.trim() || undefined,
    });
    setViewMode(mode);
  }, [markdownLocked, username, viewMode]);

  const toggleSection = (sectionId: SectionType) => {
    analytics.trackFunnel('readme_section_toggled', {
      section: sectionId,
      action: sections.includes(sectionId) ? 'remove' : 'add',
      pro_section: PRO_SECTIONS.includes(sectionId),
      workspace_mode: workspaceMode,
    });
    if (!sections.includes(sectionId) && PRO_SECTIONS.includes(sectionId) && !userIsPro) {
      showToast(`${sectionLabelOf(sectionId)} added. Upgrade only when you export.`);
    }
    selectReadmeSection(sectionId);
    setSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((s) => s !== sectionId)
        : [...prev, sectionId]
    );
  };

  const moveSelectedSection = (direction: -1 | 1) => {
    setSections((prev) => {
      const fromIndex = prev.indexOf(selectedSection);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const moveSectionById = (sectionId: SectionType, direction: -1 | 1) => {
    selectReadmeSection(sectionId);
    setSections((prev) => {
      const fromIndex = prev.indexOf(sectionId);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const toggleSectionFromTimeline = (sectionId: SectionType) => {
    if (!sections.includes(sectionId) && PRO_SECTIONS.includes(sectionId) && !userIsPro) {
      showToast(`${sectionLabelOf(sectionId)} added. Upgrade only when you export.`);
    }
    selectReadmeSection(sectionId);
    setSections((prev) => (
      prev.includes(sectionId)
        ? prev.filter((section) => section !== sectionId)
        : [...prev, sectionId]
    ));
  };

  const insertAssetIntoSection = (asset: AnimatedSection, section: SectionType) => {
    if (PRO_ASSETS.includes(asset) && !userIsPro) {
      showToast(`${ANIMATED_ASSET_LABELS[asset]} added. Upgrade only when you export.`);
    }
    setInspectorTab('content');
    setSelectedSection(section);
    setSections((prev) => (prev.includes(section) ? prev : [...prev, section]));
    // Re-adding something that was deleted from the preview has to lift the
    // suppression, or the merge in getSectionPreviewAssets keeps filtering it.
    setHiddenAssets((prev) => {
      const current = prev[section] ?? [];
      if (!current.includes(asset)) return prev;
      return { ...prev, [section]: current.filter((item) => item !== asset) };
    });
    setSectionAssets((prev) => {
      const current = prev[section] ?? [];
      if (current.includes(asset)) return prev;
      return {
        ...prev,
        [section]: [...current, asset],
      };
    });
  };

  const insertAssetIntoSelectedSection = (asset: AnimatedSection) => {
    insertAssetIntoSection(asset, selectedSection);
  };

  const addHeatmapStyleToReadme = (nextStyle: HeatmapStyle) => {
    setHeatmapStyle(nextStyle);
    setJetHeatmap(nextStyle === 'jet');
    setSelectedSection('heatmap');
    setSections((prev) => (prev.includes('heatmap') ? prev : [...prev, 'heatmap']));
    setInspectorTab('content');
    showToast(`${nextStyle === 'snake' ? 'Snake Trail' : nextStyle === 'jet' ? 'Jet Runner' : 'Erased'} added to Heatmap.`);
  };

  const addSpaceShooterToReadme = () => {
    setSpaceShooter(true);
    setQuickVisual('space-shooter');
    setSelectedSection('heatmap');
    setSections((prev) => (prev.includes('heatmap') ? prev : [...prev, 'heatmap']));
    setMotionStyle((current) => current === 'none' ? 'animated' : current);
    setInspectorTab('content');
    showToast('Space Shooter added to Heatmap.');
  };

  /**
   * Drops a visual from a section. Manually added visuals leave `sectionAssets`;
   * ones that come from `defaultSectionAssets` can only be suppressed, since the
   * defaults are hardcoded and merged in on every read.
   */
  const removeAssetFromSection = useCallback((section: SectionType, asset: AnimatedSection) => {
    setSectionAssets((prev) => {
      const current = prev[section] ?? [];
      if (!current.includes(asset)) return prev;
      return { ...prev, [section]: current.filter((item) => item !== asset) };
    });
    if ((defaultSectionAssets[section] ?? []).includes(asset)) {
      setHiddenAssets((prev) => {
        const current = prev[section] ?? [];
        if (current.includes(asset)) return prev;
        return { ...prev, [section]: [...current, asset] };
      });
    }
  }, []);

  const removeAssetFromSelectedSection = (asset: AnimatedSection) => {
    removeAssetFromSection(selectedSection, asset);
  };

  // --- Direct preview editing -------------------------------------------------
  // The preview renders one of two sources: the live draft, which is derived
  // from `sections` state, or a generated README, which is a frozen markdown
  // string. Edits made in the preview have to land on whichever is showing, so
  // every handler below branches on `previewIsGenerated`.

  const previewIsGenerated = Boolean(generatedPreview?.sections.length);

  const capturePreviewSnapshot = useCallback(() => ({
    generatedReadme,
    sections,
    sectionAssets,
    hiddenAssets,
  }), [generatedReadme, hiddenAssets, sectionAssets, sections]);

  const restorePreviewSnapshot = useCallback((snapshot: ReturnType<typeof capturePreviewSnapshot>) => {
    setGeneratedReadme(snapshot.generatedReadme);
    setSections(snapshot.sections);
    setSectionAssets(snapshot.sectionAssets);
    setHiddenAssets(snapshot.hiddenAssets);
  }, []);

  /** Rewrites the generated markdown through the lossless block model. */
  const editGeneratedDocument = useCallback((edit: (doc: ReadmeDocument) => ReadmeDocument) => {
    setGeneratedReadme((current) => (current ? joinReadmeBlocks(edit(splitReadmeBlocks(current))) : current));
  }, []);

  /**
   * Applies a new preview order. `nextKeys` is the full list of preview keys in
   * their new order, as reported by the drag layer.
   */
  const reorderPreviewSections = useCallback((nextKeys: string[], previewSections: PreviewSection[]) => {
    const byKey = new Map(previewSections.map((section) => [section.key, section]));
    const ordered = nextKeys.map((key) => byKey.get(key)).filter((section): section is PreviewSection => Boolean(section));
    if (ordered.length !== previewSections.length) return;

    analytics.trackFunnel('readme_section_reordered', {
      source: 'preview',
      generated: previewIsGenerated,
      workspace_mode: workspaceMode,
    });

    if (!previewIsGenerated) {
      const nextOrder = ordered.map((section) => section.id);
      setSections((prev) => {
        // Sections that are off (not in the preview) keep their relative place
        // at the end so toggling one back on does not surprise the user.
        const untouched = prev.filter((section) => !nextOrder.includes(section));
        return [...nextOrder, ...untouched];
      });
      return;
    }

    editGeneratedDocument((doc) => {
      // The lead block has no `##` heading and is pinned first, so only the
      // heading-backed blocks take part. Blocks with no preview row (empty ones
      // that parseReadmePreview drops) stay exactly where they are.
      const movedSlots = ordered
        .map((section) => section.blockIndex ?? -1)
        .filter((index) => index >= 0);
      const targetSlots = [...movedSlots].sort((a, b) => a - b);
      const nextBlocks = [...doc.blocks];
      targetSlots.forEach((slot, position) => {
        nextBlocks[slot] = doc.blocks[movedSlots[position]];
      });
      return { ...doc, blocks: nextBlocks };
    });
  }, [editGeneratedDocument, previewIsGenerated, workspaceMode]);

  /** Deletes a whole section straight from the preview, with an undo toast. */
  const removePreviewSection = useCallback((section: PreviewSection) => {
    const snapshot = capturePreviewSnapshot();
    analytics.trackFunnel('readme_element_removed', {
      source: 'preview',
      element: 'section',
      section: section.id,
      generated: previewIsGenerated,
      workspace_mode: workspaceMode,
    });

    if (!previewIsGenerated) {
      setSections((prev) => prev.filter((item) => item !== section.id));
    } else {
      const blockIndex = section.blockIndex ?? -1;
      editGeneratedDocument((doc) => (
        blockIndex < 0
          // The lead block carries the `# Title`, so only its body goes.
          ? { ...doc, preamble: doc.preamble.match(/^#\s+.+$/m)?.[0] ?? '' }
          : { ...doc, blocks: doc.blocks.filter((_, index) => index !== blockIndex) }
      ));
    }

    showToast(`${section.label} removed`, { label: 'Undo', run: () => restorePreviewSnapshot(snapshot) });
  }, [capturePreviewSnapshot, editGeneratedDocument, previewIsGenerated, restorePreviewSnapshot, workspaceMode]);

  /** Deletes a single visual from a section, with an undo toast. */
  const removePreviewVisual = useCallback((section: PreviewSection, visual: PreviewVisual) => {
    const snapshot = capturePreviewSnapshot();
    analytics.trackFunnel('readme_element_removed', {
      source: 'preview',
      element: 'visual',
      section: section.id,
      generated: previewIsGenerated,
      workspace_mode: workspaceMode,
    });

    if (!previewIsGenerated) {
      // Live rows carry the AnimatedSection id straight through as the visual id.
      removeAssetFromSection(section.id, visual.id as AnimatedSection);
    } else {
      const blockIndex = section.blockIndex ?? -1;
      editGeneratedDocument((doc) => (
        blockIndex < 0
          ? { ...doc, preamble: removeVisualFromMarkdown(doc.preamble, visual.url) }
          : {
            ...doc,
            blocks: doc.blocks.map((block, index) => (
              index === blockIndex ? { ...block, raw: removeVisualFromMarkdown(block.raw, visual.url) } : block
            )),
          }
      ));
    }

    showToast(`${visual.label} removed`, { label: 'Undo', run: () => restorePreviewSnapshot(snapshot) });
  }, [capturePreviewSnapshot, editGeneratedDocument, previewIsGenerated, removeAssetFromSection, restorePreviewSnapshot, workspaceMode]);

  // A generated README's lead block sits above the first `##` and holds the
  // title, so it stays pinned at the top and out of the drag group.
  const previewPinnedSection = previewIsGenerated && readmePreviewSections[0]?.blockIndex === -1
    ? readmePreviewSections[0]
    : null;
  const previewDraggableSections = previewPinnedSection ? readmePreviewSections.slice(1) : readmePreviewSections;
  const previewDraggableKeys = useMemo(
    () => previewDraggableSections.map((section) => section.key),
    [previewDraggableSections]
  );

  /** Keyboard equivalent of dragging, bound to the arrow keys on the handle. */
  const movePreviewSectionByStep = useCallback((section: PreviewSection, direction: -1 | 1) => {
    const keys = previewDraggableSections.map((item) => item.key);
    const fromIndex = keys.indexOf(section.key);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= keys.length) return;
    const next = [...keys];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    reorderPreviewSections(next, previewDraggableSections);
  }, [previewDraggableSections, reorderPreviewSections]);

  const isThemeLocked = (themeId: string): boolean => {
    if (userIsPro) return false;
    return !FREE_THEMES.includes(themeId as typeof FREE_THEMES[number]);
  };

  const generateReadme = useCallback(async () => {
    const enteredUsername = username.trim().replace(/^@/, '');
    const demoUsername = previewUsername.trim().replace(/^@/, '') || DEMO_PROFILE_USERNAME;
    const resolvedUsername = enteredUsername || demoUsername;
    const usingDemoUsername = !enteredUsername;

    // The quick-start page can preview and generate a demo draft while the
    // field is empty. Publishing still verifies ownership on the server before
    // anything can be written to GitHub.
    if (!resolvedUsername) {
      setError('Enter a valid GitHub username, or use the demo profile to explore.');
      return;
    }

    if (usingDemoUsername) {
      setPreviewUsername(resolvedUsername);
    }

    if (!authenticated) {
      analytics.trackFunnel('readme_generate_auth_required', {
        username: resolvedUsername,
        using_demo_username: usingDemoUsername,
        workspace_mode: workspaceMode,
        quick_visual: quickVisual,
        theme,
        use_ai: useAI,
      });
      try {
        sessionStorage.setItem('gitskins_readme_auth_draft', JSON.stringify({
          username: resolvedUsername,
          studioConfig,
          workspaceMode,
          autoGenerate: true,
        }));
      } catch {
        /* URL callback still preserves the initial homepage context. */
      }
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/auth?callbackUrl=${encodeURIComponent(returnTo)}`;
      return;
    }

    analytics.trackFunnel('readme_generate_started', {
      username: resolvedUsername,
      using_demo_username: usingDemoUsername,
      workspace_mode: workspaceMode,
      quick_visual: workspaceMode === 'quick' ? quickVisual : undefined,
      theme,
      section_style: sectionStyle,
      goal,
      structure,
      tone,
      style,
      section_count: sections.length,
      use_ai: useAI,
      pro_export_reason_count: proExportReasons.length,
    });
    setIsLoading(true);
    setUsageOverride(null);
    setError(null);
    setAiProvider(null);
    setRefinementNotes(null);
    setAgentReasoning(null);
    setReadmeScore(null);
    setStrategy(null);
    setSetupInstructions(null);
    setPublishPrUrl(null);
    readmeProgress.start();

    try {
      const response = await fetch('/api/generate-readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: resolvedUsername,
          sections,
          style,
          preset: activePreset === 'neon-circuit'
            ? 'neon-circuit'
            : quickVisual === 'showcase'
            ? 'showcase'
            : workspaceMode === 'quick'
              ? quickVisual === 'terminal-identity'
                ? 'terminal-identity'
                : quickVisual === 'system-scan'
                  ? 'system-scan'
                  : quickVisual === 'terminal-portfolio'
                    ? 'terminal-portfolio'
                    : quickVisual === 'neon-circuit'
                      ? 'neon-circuit'
                    : undefined
              : undefined,
          sectionStyle,
          theme,
          careerMode,
          careerRole,
          agentLoop,
          useAI,
          aiProfileScan,
          goal,
          structure,
          tone,
          motionStyle,
          typingHeadline: motionStyle !== 'none' && typingHeadline,
          typingLines: typingLines.split('\n').map((line) => line.trim()).filter(Boolean),
          animatedDivider: motionStyle !== 'none' && animatedDivider,
          contributionSnake: motionStyle !== 'none' && contributionSnake,
          spaceShooter,
          spaceShooterStrategy,
          jetHeatmap: motionStyle !== 'none' && jetHeatmap,
          heatmapStyle,
          skillBadges: true,
          languageLogos,
          visitorCounter: motionStyle !== 'none' && visitorCounter,
          githubTrophies: motionStyle === 'playful' && githubTrophies,
          avatarBlock: motionStyle !== 'none' && avatarBlock,
          socialWebsite,
          socialX,
          socialLinkedIn,
          socialEmail,
          professionalRole: professionalRole.trim(),
          experienceSummary: experienceSummary.trim(),
          education: education.trim(),
          achievements: achievementsText.split('\n').map((line) => line.trim()).filter(Boolean),
          currentFocus: currentFocusText.split('\n').map((line) => line.trim()).filter(Boolean),
          openTo: openTo.trim(),
          sectionAssets: generationSectionAssets,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate README');
      }

      setRefinementNotes(Array.isArray(data.refinementNotes) ? data.refinementNotes.map(toDisplayText) : null);
      setAgentReasoning(typeof data.reasoning === 'string' ? data.reasoning : null);
      setActiveProject(null);
      setGeneratedReadme(modernizeReadmeVisuals(data.readme, {
        username: resolvedUsername,
        theme,
      }));
      setGeneratedProjectId(typeof data.projectId === 'string' ? data.projectId : null);
      setAiProvider(data.aiProvider || null);
      setProfileData(data.profile);
      setReadmeScore(data.score ?? null);
      showToast('README draft created. Review it, then export or publish.');
      setStrategy(data.strategy ?? null);
      setSetupInstructions(data.setupInstructions ?? null);
      analytics.trackFunnel('readme_generate_completed', {
        username: resolvedUsername,
        using_demo_username: usingDemoUsername,
        workspace_mode: workspaceMode,
        theme,
        ai_provider: data.aiProvider || 'unknown',
        score: data.score?.overall ?? data.score ?? undefined,
        project_id: typeof data.projectId === 'string' ? data.projectId : undefined,
        pro_export_reason_count: proExportReasons.length,
      });
      if (data.usage && typeof data.usage.remaining === 'number') {
        setUsageOverride(data.usage);
        invalidateUserPlanCache();
      }
      readmeProgress.complete();
      if (studioGuideRef.current.active && studioGuideRef.current.step === 0) {
        setStudioGuideStep(1);
        setShowFirstRun(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      analytics.trackFunnel('readme_generate_failed', {
        username: resolvedUsername || undefined,
        using_demo_username: usingDemoUsername,
        workspace_mode: workspaceMode,
        theme,
        message,
      });
      readmeProgress.reset();
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, username, previewUsername, sections, style, workspaceMode, quickVisual, activePreset, sectionStyle, theme, careerMode, careerRole, agentLoop, useAI, aiProfileScan, goal, structure, tone, motionStyle, typingHeadline, typingLines, animatedDivider, contributionSnake, spaceShooter, spaceShooterStrategy, jetHeatmap, heatmapStyle, visitorCounter, githubTrophies, avatarBlock, languageLogos, socialWebsite, socialX, socialLinkedIn, socialEmail, professionalRole, experienceSummary, education, achievementsText, currentFocusText, openTo, generationSectionAssets, studioConfig, readmeProgress.start, readmeProgress.complete, readmeProgress.reset, proExportReasons.length]);

  useEffect(() => {
    if (!pendingAutoGenerate || !authenticated || planLoading || autoGenerateLockRef.current) return;
    if (!usageAllowed) {
      setPendingAutoGenerate(false);
      sessionStorage.removeItem('gitskins_readme_continue');
      setError("You've used your free README draft. Upgrade to Pro to continue.");
      return;
    }

    autoGenerateLockRef.current = true;
    setPendingAutoGenerate(false);
    sessionStorage.removeItem('gitskins_readme_continue');
    void generateReadme().finally(() => {
      autoGenerateLockRef.current = false;
    });
  }, [pendingAutoGenerate, authenticated, planLoading, username, usageAllowed, generateReadme]);

  /**
   * Server-side authorisation for taking a README out of the Studio.
   * Copy, download, the raw Markdown tab, publish, and per-widget copy all
   * spend the same paid export credit when premium assets are present.
   */
  const authorizeExport = useCallback(async (
    intent: ExportIntent,
    markdownOverride?: string,
    target?: AnimatedSection | 'all',
  ): Promise<boolean> => {
    const markdown = markdownOverride ?? generatedReadme ?? liveDraftReadme;
    const resumedAfterCheckout = resumedExportIntentRef.current === intent;
    if (resumedAfterCheckout) resumedExportIntentRef.current = null;
    // Pro spends nothing, and a signed-out visitor has no credit to claim — the
    // client-side guard is the whole story for both, so skip the round trip.
    if (userIsPro || !authenticated || !markdown) {
      return guardExportAction(intent, proExportReasons, target, resumedAfterCheckout);
    }

    // The export credit is strictly one shot, so it must never be spent by a stray
    // click. Ask first — which is also the moment upgrading makes most sense.
    // Keyed off what is actually in the markdown, so a draft that merely looks
    // premium in the config does not trigger a warning about a free export.
    if (!resumedAfterCheckout && premiumExportAvailable && markdownHasPremiumAssets(markdown)) {
      const choice = await confirmExportCreditSpend(intent, target);
      if (choice !== 'spend') return false;
    }

    try {
      const response = await fetch('/api/readme-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, intent }),
      });

      if (response.status === 402) {
        const data = await response.json().catch(() => ({}));
        // The credit is gone server-side; refresh so the UI stops offering it.
        invalidateUserPlanCache();
        window.dispatchEvent(new Event('gitskins:user-plan-refresh'));
        openExportPanel(intent, proExportReasons, target);
        analytics.trackFunnel('readme_export_blocked_by_credit', {
          intent,
          premium_assets: data.premiumAssets ?? [],
          workspace_mode: workspaceMode,
        });
        return false;
      }

      if (!response.ok) {
        // A failing endpoint should not block someone copying a README that
        // costs nothing. Degrade to the client-side guard, which still refuses
        // premium drafts for anyone without an available export credit.
        return guardExportAction(intent, proExportReasons, target, resumedAfterCheckout);
      }

      const data = await response.json();
      if (data.premiumExportCreditConsumed || data.premiumTrialConsumed) {
        invalidateUserPlanCache();
        window.dispatchEvent(new Event('gitskins:user-plan-refresh'));
        setExportPanel(null);
        showToast(`Premium export unlocked. Ready to ${EXPORT_INTENT_ACTION[intent]}.`);
        analytics.trackFunnel('readme_premium_export_credit_consumed', {
          intent,
          premium_assets: data.premiumAssets ?? [],
          workspace_mode: workspaceMode,
        });
      }
      return true;
    } catch {
      return guardExportAction(intent, proExportReasons, target, resumedAfterCheckout);
    }
  }, [
    authenticated, confirmExportCreditSpend, generatedReadme, guardExportAction,
    liveDraftReadme, openExportPanel, premiumExportAvailable, proExportReasons, userIsPro, workspaceMode,
  ]);

  const copyToClipboard = async () => {
    const markdown = generatedReadme ?? liveDraftReadme;
    if (!markdown) return;
    analytics.trackFunnel('readme_copy_clicked', {
      username: username.trim() || undefined,
      workspace_mode: workspaceMode,
      generated: Boolean(generatedReadme),
      locked: markdownLocked,
      pro_export_reason_count: proExportReasons.length,
    });
    if (!await authorizeExport('copy')) {
      analytics.trackFunnel('readme_copy_blocked_by_upgrade', {
        username: username.trim() || undefined,
        workspace_mode: workspaceMode,
        reasons: proExportReasons,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      showToast(setupInstructions ? 'Markdown copied. Publish with GitSkins to install the contribution game workflow automatically.' : 'Markdown copied to clipboard');
      analytics.trackFunnel('readme_markdown_copied', {
        username: username.trim() || undefined,
        workspace_mode: workspaceMode,
        generated: Boolean(generatedReadme),
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = markdown;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      showToast(setupInstructions ? 'Markdown copied. Publish with GitSkins to install the contribution game workflow automatically.' : 'Markdown copied to clipboard');
      analytics.trackFunnel('readme_markdown_copied', {
        username: username.trim() || undefined,
        workspace_mode: workspaceMode,
        generated: Boolean(generatedReadme),
        fallback: true,
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copySetupFile = async (path: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedSetupPath(path);
    setTimeout(() => setCopiedSetupPath(null), 2000);
  };

  const copyAnimatedSection = async (section: AnimatedSection | 'all') => {
    const exportReasons = section === 'all'
      ? proExportReasons
      : PRO_ASSETS.includes(section)
        ? [ANIMATED_ASSET_LABELS[section]]
        : [];
    analytics.trackFunnel('readme_visual_copy_clicked', {
      visual: section,
      locked: exportReasons.length > 0 && !userIsPro,
      reasons: exportReasons,
      workspace_mode: workspaceMode,
    });
    const markdown = section === 'all'
      ? animatedSectionPreview.map((item) => item.markdown).join('\n\n')
      : animatedSectionPreview.find((item) => item.id === section)?.markdown;
    if (!markdown) return;
    // Authorised against the widget markdown itself rather than the whole
    // document: copying one premium asset is still taking a premium asset, and
    // this was the last path that never reached the server.
    if (!await authorizeExport('visual', markdown, section)) return;
    await navigator.clipboard.writeText(markdown);
    analytics.trackFunnel('readme_visual_copied', {
      visual: section,
      workspace_mode: workspaceMode,
    });
    setCopiedAnimatedSection(section);
    setTimeout(() => setCopiedAnimatedSection(null), 2000);
  };

  const downloadReadme = async () => {
    const markdown = generatedReadme ?? liveDraftReadme;
    if (!markdown) return false;
    analytics.trackFunnel('readme_download_clicked', {
      username: username.trim() || undefined,
      workspace_mode: workspaceMode,
      locked: markdownLocked,
      pro_export_reason_count: proExportReasons.length,
    });
    if (!await authorizeExport('download')) {
      analytics.trackFunnel('readme_download_blocked_by_upgrade', {
        username: username.trim() || undefined,
        workspace_mode: workspaceMode,
        reasons: proExportReasons,
      });
      return false;
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'README.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    analytics.trackFunnel('readme_downloaded', {
      username: username.trim() || undefined,
      workspace_mode: workspaceMode,
      generated: Boolean(generatedReadme),
    });
    return true;
  };

  const reconnectGitHubForPublish = useCallback(async () => {
    try {
      sessionStorage.setItem('gitskins_readme_auth_draft', JSON.stringify({
        username: username.trim(),
        studioConfig,
        workspaceMode,
        autoGenerate: false,
      }));
    } catch {
      /* best-effort draft preserve */
    }
    await signIn('github', {
      callbackUrl: `${window.location.pathname}${window.location.search}`,
    }, {
      scope: 'read:user user:email public_repo workflow',
      allow_signup: 'false',
    });
  }, [username, studioConfig, workspaceMode]);

  const checkPublishReadiness = useCallback(async () => {
    const cleanUsername = username.trim().replace(/^@/, '');
    if (!authenticated) {
      setPublishReadiness({
        state: 'blocked',
        code: 'AUTH_REQUIRED',
        message: 'Sign in and connect GitHub so GitSkins can verify your profile repository.',
      });
      return;
    }
    if (!cleanUsername) {
      setPublishReadiness({
        state: 'blocked',
        code: 'INVALID_USERNAME',
        message: 'Enter your GitHub username before checking publishing setup.',
      });
      return;
    }

    setPublishReadiness({ state: 'checking' });
    try {
      const response = await fetch(`/api/readme-publish-pr?username=${encodeURIComponent(cleanUsername)}`);
      const data = await response.json();
      if (response.ok && data.ready) {
        setPublishReadiness({
          state: 'ready',
          code: 'READY',
          login: typeof data.login === 'string' ? data.login : cleanUsername,
          repository: typeof data.repository === 'string' ? data.repository : `${cleanUsername}/${cleanUsername}`,
        });
        return;
      }
      setPublishReadiness({
        state: 'blocked',
        code: String(data.code || 'GITHUB_ERROR'),
        message: String(data.error || 'GitHub publishing setup could not be verified.'),
        actionUrl: typeof data.actionUrl === 'string' ? data.actionUrl : undefined,
      });
    } catch {
      setPublishReadiness({
        state: 'blocked',
        code: 'GITHUB_ERROR',
        message: 'GitHub publishing setup could not be checked. Try again in a moment.',
      });
    }
  }, [authenticated, username]);

  useEffect(() => {
    if (!showPublishGuide) return;
    void checkPublishReadiness();
  }, [showPublishGuide, checkPublishReadiness]);

  const publishReadmePullRequest = useCallback(async () => {
    const markdown = generatedReadme ?? liveDraftReadme;
    const cleanUsername = username.trim().replace(/^@/, '');
    const resumedAfterCheckout = resumedExportIntentRef.current === 'publish';
    if (resumedAfterCheckout) resumedExportIntentRef.current = null;
    if (!markdown || !cleanUsername) {
      setError('Create a README draft for your GitHub username first.');
      return;
    }
    analytics.trackFunnel('readme_publish_clicked', {
      username: cleanUsername || undefined,
      workspace_mode: workspaceMode,
      locked: markdownLocked,
      authenticated,
    });
    if (!guardExportAction('publish', proExportReasons, undefined, resumedAfterCheckout)) {
      setShowPublishGuide(false);
      analytics.trackFunnel('readme_publish_blocked_by_upgrade', {
        username: cleanUsername || undefined,
        workspace_mode: workspaceMode,
        reasons: proExportReasons,
      });
      return;
    }
    if (!authenticated) {
      analytics.trackFunnel('readme_publish_auth_required', {
        username: cleanUsername,
        workspace_mode: workspaceMode,
      });
      try {
        sessionStorage.setItem('gitskins_readme_auth_draft', JSON.stringify({
          username: cleanUsername,
          studioConfig,
          workspaceMode,
          autoGenerate: false,
        }));
      } catch {
        /* ignore */
      }
      window.location.href = `/auth?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
      return;
    }

    if (!resumedAfterCheckout && premiumExportAvailable && markdownHasPremiumAssets(markdown)) {
      const choice = await confirmExportCreditSpend('publish');
      if (choice !== 'spend') {
        return;
      }
    }

    let pendingPrWindow: Window | null = null;
    try {
      pendingPrWindow = window.open('about:blank', '_blank');
      if (pendingPrWindow) {
        pendingPrWindow.opener = null;
        pendingPrWindow.document.title = 'Opening GitHub pull request';
        pendingPrWindow.document.body.style.cssText = 'margin:0;font-family:Inter,system-ui,sans-serif;background:#f4f7f4;color:#12211a;display:grid;min-height:100vh;place-items:center;';
        const pendingBody = pendingPrWindow.document.body;
        const pendingPanel = pendingPrWindow.document.createElement('div');
        pendingPanel.style.cssText = 'text-align:center;max-width:360px;padding:32px';
        const pendingHeading = pendingPrWindow.document.createElement('strong');
        pendingHeading.style.fontSize = '22px';
        pendingHeading.textContent = 'Opening GitHub...';
        const pendingCopy = pendingPrWindow.document.createElement('p');
        pendingCopy.style.cssText = 'color:#4c5a52;line-height:1.5';
        pendingCopy.textContent = 'GitSkins is creating your profile README pull request.';
        pendingPanel.append(pendingHeading, pendingCopy);
        pendingBody.replaceChildren(pendingPanel);
      }
    } catch {
      pendingPrWindow = null;
    }

    setPublishingPr(true);
    setError(null);
    try {
      const response = await fetch('/api/readme-publish-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          username: cleanUsername,
          contributionSnake,
          spaceShooter,
          spaceShooterStrategy,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'REPO_SCOPE' || data.code === 'NO_TOKEN' || data.code === 'NO_GITHUB') {
          pendingPrWindow?.close();
          showToast('Reconnect GitHub to allow opening a pull request');
          await reconnectGitHubForPublish();
          return;
        }
        if (data.code === 'PROFILE_REPO_MISSING' || data.code === 'PROFILE_REPO_EMPTY' || data.code === 'PROFILE_REPO_PRIVATE') {
          const issue = {
            code: String(data.code),
            message: String(data.error || data.message || 'Set up your GitHub profile repository, then retry publishing.'),
            actionUrl: typeof data.actionUrl === 'string' ? data.actionUrl : undefined,
          };
          setPublishReadiness({
            state: 'blocked',
            code: issue.code,
            message: issue.message,
            actionUrl: issue.actionUrl,
          });
          setShowPublishGuide(true);
          setError(issue.message);
          showToast(data.code === 'PROFILE_REPO_MISSING'
            ? 'Create your GitHub profile repository, then retry'
            : 'Finish setting up your profile repository, then retry');
          if (pendingPrWindow && !pendingPrWindow.closed && issue.actionUrl) {
            pendingPrWindow.location.href = issue.actionUrl;
          } else {
            pendingPrWindow?.close();
          }
          analytics.trackFunnel('readme_publish_repository_setup_required', {
            username: cleanUsername,
            code: issue.code,
          });
          return;
        }
        if (data.code === 'DRAFT_USERNAME_MISMATCH') {
          pendingPrWindow?.close();
          setError(data.error || 'Regenerate this draft with your own username before publishing.');
          showToast(`This draft is for @${data.draftedFor}. Enter your own username and regenerate.`);
          return;
        }
        if (data.code === 'PREMIUM_EXPORT_REQUIRED' || data.code === 'PREMIUM_TRIAL_SPENT') {
          pendingPrWindow?.close();
          // The server is authoritative. This can fire even when the client
          // believed an export credit was available — a stale 30s usage cache, or a
          // publish from another tab that spent it first.
          invalidateUserPlanCache();
          window.dispatchEvent(new Event('gitskins:user-plan-refresh'));
          setShowPublishGuide(false);
          openExportPanel('publish', proExportReasons);
          return;
        }
        throw new Error(data.error || 'Unable to open pull request');
      }
      setPublishPrUrl(typeof data.prUrl === 'string' ? data.prUrl : null);
      setPublishReadiness({
        state: 'ready',
        code: 'READY',
        login: cleanUsername,
        repository: `${cleanUsername}/${cleanUsername}`,
      });
      if (data.premiumExportCreditConsumed || data.premiumTrialConsumed) {
        invalidateUserPlanCache();
        window.dispatchEvent(new Event('gitskins:user-plan-refresh'));
        setExportPanel(null);
        showToast('Premium export unlocked. Opening your GitHub pull request.');
      }
      showToast(data.createdRepo ? 'Profile repo created, pull request opened' : 'Pull request opened on GitHub');
      analytics.trackFunnel('readme_publish_pr_created', {
        username: cleanUsername,
        workspace_mode: workspaceMode,
        created_repo: Boolean(data.createdRepo),
      });
      if (typeof data.prUrl === 'string') {
        if (pendingPrWindow && !pendingPrWindow.closed) {
          pendingPrWindow.location.href = data.prUrl;
        } else {
          window.location.href = data.prUrl;
        }
      }
    } catch (err) {
      pendingPrWindow?.close();
      const message = err instanceof Error ? err.message : 'Unable to open pull request';
      setError(message);
      analytics.trackFunnel('readme_publish_failed', {
        username: cleanUsername,
        workspace_mode: workspaceMode,
        message,
      });
    } finally {
      setPublishingPr(false);
    }
  }, [
    generatedReadme,
    liveDraftReadme,
    username,
    authenticated,
    confirmExportCreditSpend,
    studioConfig,
    workspaceMode,
    reconnectGitHubForPublish,
    guardExportAction,
    markdownLocked,
    proExportReasons,
    openExportPanel,
    premiumExportAvailable,
    contributionSnake,
    spaceShooter,
    spaceShooterStrategy,
  ]);

  useEffect(() => {
    resumedExportActionRef.current = async (intent, target) => {
      if (intent === 'copy') {
        await copyToClipboard();
        return;
      }
      if (intent === 'download') {
        await downloadReadme();
        return;
      }
      if (intent === 'publish') {
        await publishReadmePullRequest();
        return;
      }
      if (intent === 'view') {
        if (await authorizeExport('view')) setViewMode('markdown');
        return;
      }
      const visualTarget = target === 'all' || animatedSections.some((section) => section.id === target)
        ? target as AnimatedSection | 'all'
        : 'all';
      await copyAnimatedSection(visualTarget);
    };
  });

  useEffect(() => {
    const intentParam = searchParams.get('exportIntent');
    if (
      checkoutSync.status !== 'synced'
      || checkoutResumeHandledRef.current
      || !isExportIntent(intentParam)
      || (intentParam !== 'visual' && !(generatedReadme ?? liveDraftReadme))
    ) return;

    const targetParam = searchParams.get('exportTarget');
    const target = targetParam === 'all' || animatedSections.some((section) => section.id === targetParam)
      ? targetParam as AnimatedSection | 'all'
      : undefined;
    checkoutResumeHandledRef.current = true;
    resumedExportIntentRef.current = intentParam;
    analytics.trackFunnel('readme_export_checkout_resumed', {
      intent: intentParam,
      target,
      workspace_mode: workspaceMode,
      username: username.trim() || undefined,
    });

    void resumedExportActionRef.current(intentParam, target).finally(() => {
      const cleanUrl = new URL(window.location.href);
      ['exportIntent', 'exportTarget', 'upgrade', 'onboarding', 'checkout_session_id'].forEach((key) => cleanUrl.searchParams.delete(key));
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    });
  }, [checkoutSync.status, generatedReadme, liveDraftReadme, searchParams, username, workspaceMode]);

  /**
   * The inside of a preview card. Shared so the pinned lead block and the
   * draggable blocks below it stay visually identical — only the drag handle
   * tells them apart.
   */
  const renderPreviewSectionBody = (section: PreviewSection, dragControls: DragControls | null) => (
    <>
      <div className="readme-preview-section-heading">
        {dragControls ? (
          <button
            type="button"
            className="readme-preview-drag-handle"
            aria-label={`Reorder ${section.label}. Use the arrow keys to move it.`}
            title="Drag to reorder"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              event.stopPropagation();
              dragControls.start(event);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                movePreviewSectionByStep(section, event.key === 'ArrowUp' ? -1 : 1);
              }
            }}
          >
            <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
              {[2, 8, 14].map((y) => [2, 8].map((x) => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />
              )))}
            </svg>
          </button>
        ) : null}
        <span>{section.label}</span>
        <small>{section.assets.length ? `${section.assets.length} visual${section.assets.length === 1 ? '' : 's'}` : 'Text block'}</small>
        {section.id === selectedSection ? <strong>{section.isGenerated ? 'Viewing' : 'Editing'}</strong> : null}
        <button
          type="button"
          className="readme-preview-remove"
          aria-label={`Remove ${section.label} section`}
          title={`Remove ${section.label}`}
          onClick={(event) => {
            event.stopPropagation();
            removePreviewSection(section);
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      {section.assets.length > 0 && (
        <div className="readme-preview-visual-stack">
          {section.assets.map((asset) => (
            <figure key={asset.id} className="readme-preview-visual">
              <img
                src={asset.url}
                alt={asset.alt}
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.dataset.animatedFallback === '1') return;
                  image.dataset.animatedFallback = '1';
                  image.src = animatedFallbackUrl(section.id, {
                    username: username.trim() || DEMO_PROFILE_USERNAME,
                    theme,
                  });
                }}
              />
              <button
                type="button"
                className="readme-preview-remove visual"
                aria-label={`Remove ${asset.label} visual from ${section.label}`}
                title={`Remove ${asset.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removePreviewVisual(section, asset);
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </figure>
          ))}
        </div>
      )}

      {section.isGenerated && section.markdown && (
        <div className="readme-preview-markdown">
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>
            {section.markdown}
          </ReactMarkdown>
        </div>
      )}

      {!section.isGenerated && section.id === 'header' && (
        <p>
          Hi, I&apos;m <strong>{profileData?.name || username.trim() || PLACEHOLDER_USERNAME}</strong>, a {selectedRole.label.toLowerCase()} focused on {selectedGoal.description.toLowerCase()}.
        </p>
      )}

      {!section.isGenerated && section.id === 'about' && (
        <div className="readme-preview-callout">
          <strong>{selectedRole.label}</strong>
          <p>{section.description} The copy is tuned for a {toneOptions.find((item) => item.id === tone)?.label.toLowerCase() ?? tone} tone and a {styleOptions.find((item) => item.id === style)?.label.toLowerCase() ?? style} README.</p>
        </div>
      )}

      {!section.isGenerated && section.id === 'skills' && (
        <div className="readme-preview-pills">
          {previewSkills.map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
      )}

      {!section.isGenerated && section.id === 'stats' && (
        <div className="readme-preview-metrics">
          <div>
            <strong>{selectedTheme.name}</strong>
            <span>Theme</span>
          </div>
          <div>
            <strong>{motionStyle}</strong>
            <span>Motion</span>
          </div>
          <div>
            <strong>{sections.length}</strong>
            <span>Sections</span>
          </div>
        </div>
      )}

      {!section.isGenerated && section.id === 'projects' && (
        <div className="readme-preview-projects">
          {previewProjects.map((project) => (
            <article key={project.name}>
              <strong>{project.name}</strong>
              <p>{project.copy}</p>
              <div>
                {project.stack.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {!section.isGenerated && section.id === 'streak' && (
        <div className="readme-preview-activity">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <p>Contribution consistency and momentum signals appear here when the section is enabled.</p>
        </div>
      )}

      {!section.isGenerated && section.id === 'connect' && (
        <div className={`readme-preview-links ${connectLayout}`}>
          {connectCta ? <p>{connectCta}</p> : null}
          {socialWebsite ? <span>Website: {socialWebsite}</span> : null}
          {socialX ? <span>X: {socialX}</span> : null}
          {socialLinkedIn ? <span>LinkedIn: {socialLinkedIn}</span> : null}
          {socialEmail ? <span>Email: {socialEmail}</span> : null}
          {!socialWebsite && !socialX && !socialLinkedIn && !socialEmail ? <span>Contact links will appear here.</span> : null}
        </div>
      )}
    </>
  );

  const selectSectionOnKey = (event: ReactKeyboardEvent, section: PreviewSection) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectReadmeSection(section.id);
    }
  };

  const publishConnectionReady = publishReadiness.state === 'ready'
    || (publishReadiness.state === 'blocked' && ['PROFILE_REPO_MISSING', 'PROFILE_REPO_PRIVATE', 'PROFILE_REPO_EMPTY'].includes(publishReadiness.code || ''));
  const publishRepositoryReady = publishReadiness.state === 'ready';
  const publishNeedsReconnect = publishReadiness.state === 'blocked'
    && ['NO_TOKEN', 'NO_GITHUB', 'REPO_SCOPE'].includes(publishReadiness.code || '');

  return (
    <div
      className={`mk ${workspaceMode === 'studio' ? 'is-studio' : 'is-quick'}`}
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse 90% 55% at 50% -10%, rgba(52,209,125,0.16), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 20%, rgba(18,33,26,0.05), transparent 50%), #f4f7f4',
        color: '#12211a',
      }}
    >

      <main
        style={{
          paddingTop: workspaceMode === 'studio' ? 0 : '86px',
          paddingBottom: workspaceMode === 'studio' ? 0 : '40px',
        }}
      >
        {upgraded && (
          <section style={{ maxWidth: 1180, margin: '0 auto 18px', padding: '0 16px' }}>
            <div className="mk-card-blue" style={{ borderRadius: 22, padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', boxShadow: 'var(--mk-shadow-sm)' }}>
              <div>
                <p style={{ margin: '0 0 5px', color: 'var(--mk-blue-ink)', fontSize: 11, fontWeight: 950, letterSpacing: 1, textTransform: 'uppercase' }}>Pro unlocked</p>
                <strong style={{ color: 'var(--mk-ink)', fontSize: 17 }}>Premium README visuals are ready in this Studio.</strong>
                {checkoutSync.status === 'syncing' || checkoutSync.status === 'pending' ? (
                  <p style={{ margin: '6px 0 0', color: 'var(--mk-ink-2)', fontSize: 13 }}>
                    {checkoutSync.status === 'syncing' ? 'Confirming your payment...' : 'Payment confirmed. Pro access is syncing.'}
                  </p>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => insertAssetIntoSelectedSection('wordmark')} className="mk-btn" style={{ border: 'none', cursor: 'pointer', padding: '10px 13px', fontSize: 13 }}>Use 3D Wordmark</button>
                <button type="button" onClick={() => insertAssetIntoSelectedSection('portrait')} className="mk-btn-ghost" style={{ cursor: 'pointer', padding: '10px 13px', fontSize: 13 }}>Use ASCII Portrait</button>
              </div>
            </div>
          </section>
        )}
        {/* Hero Section */}
        <section
          className="readme-hero-intro"
          style={{
            padding: workspaceMode === 'quick' ? '12px 24px 28px' : '20px 24px 48px',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: workspaceMode === 'quick' ? '820px' : '700px', margin: '0 auto' }}>
            {workspaceMode === 'quick' ? (
              <>
                <p className="mk-serif" style={{ margin: '0 0 10px', fontSize: 'clamp(34px, 5vw, 52px)', letterSpacing: '-0.05em', lineHeight: 0.95 }}>
                  GitSkins
                </p>
                <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 750, letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--mk-ink)' }}>
                  A profile README that feels finished.
                </h1>
                <p style={{ margin: '10px auto 0', maxWidth: 520, color: 'var(--mk-ink-2)', fontSize: 15, lineHeight: 1.55 }}>
                  Choose a style, preview live GitHub data, then publish with one pull request.
                </p>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '100px',
                    fontSize: '13px',
                    color: 'var(--mk-accent-deep)',
                    marginBottom: '24px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  AI profile writing studio
                </div>

                <h1
                  style={{
                    fontSize: 'clamp(38px, 6vw, 66px)',
                    fontWeight: 900,
                    margin: '0 0 16px',
                    letterSpacing: '-0.055em',
                    lineHeight: 0.96,
                  }}
                >
                  Build a README that reads like a product story.
                </h1>

                <p
                  style={{
                    fontSize: '17px',
                    color: 'var(--mk-ink-2)',
                    margin: '0 auto',
                    maxWidth: '620px',
                    lineHeight: 1.6,
                  }}
                >
                  Turn your repositories, skills, and profile signal into a polished GitHub README with themed cards, sections, and copy-ready Markdown.
                </p>
                <a
                  href="/readme-agent"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '16px',
                    padding: '8px 16px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '8px',
                    color: 'var(--mk-accent-deep)',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Open the Live README Agent
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </a>
              </>
            )}
          </div>
        </section>

        {/* Usage Banner */}
        {!planLoading && (
          <section className="readme-usage-banner" style={{ maxWidth: '1180px', margin: workspaceMode === 'quick' ? '0 auto 10px' : '0 auto 24px', padding: '0 20px' }}>
            <div
              style={{
                background: !authenticated ? 'rgba(34, 197, 94, 0.08)' : !usageAllowed ? 'rgba(239, 68, 68, 0.1)' : '#161616',
                border: `1px solid ${!authenticated ? 'rgba(34, 197, 94, 0.22)' : !usageAllowed ? 'rgba(239, 68, 68, 0.3)' : '#2a2a2a'}`,
                borderRadius: '12px',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {!authenticated ? (
                  <span style={{ fontSize: '14px', color: 'var(--mk-text-muted)' }}>
                    Sign in to use your 1 free README draft.
                  </span>
                ) : userIsPro ? (
                  <span style={{ fontSize: '14px', color: '#c3d0c8' }}>
                    Generations today:{' '}
                    <span style={{ color: effectiveRemaining > 0 ? '#5ee39a' : '#ff8f87', fontWeight: 600 }}>
                      {effectiveRemaining}/{effectiveLimit}
                    </span>
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: '14px', color: '#c3d0c8' }}>
                      Free draft:{' '}
                      <span style={{ color: effectiveRemaining > 0 ? '#5ee39a' : '#ff8f87', fontWeight: 600 }}>
                        {effectiveRemaining}/{effectiveLimit}
                      </span>
                      {effectiveCreditsRemaining ? (
                        <span style={{ color: '#58a6ff', marginLeft: 8 }}>
                          + {effectiveCreditsRemaining} paid credit{effectiveCreditsRemaining === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </span>
                    {/* Progress bar */}
                    <div style={{ width: '120px', height: '4px', background: '#2a2a2a', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${effectiveLimit > 0 ? Math.min(100, (effectiveUsed / effectiveLimit) * 100) : 0}%`,
                        background: effectiveRemaining > 0 ? '#34d17d' : '#ff8f87',
                        borderRadius: '2px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </>
                )}
                {!userIsPro && draftRequiresProExport ? (
                  <span style={{ color: '#15803d', fontSize: 13, fontWeight: 700 }}>
                    Pro visuals selected, upgrade when exporting
                  </span>
                ) : null}
              </div>

              <span
                style={{
                  padding: '6px 12px',
                  background: userIsPro || !authenticated ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: userIsPro || !authenticated ? (authenticated ? '#5ee39a' : 'var(--mk-accent-deep)') : '#c3d0c8',
                  fontWeight: 600,
                }}
              >
                {!authenticated ? 'Sign in required' : userIsPro ? 'Pro Plan' : 'Free Plan'}
              </span>
            </div>
          </section>
        )}

        {workspaceMode === 'quick' ? (
          <PriceUpdateBanner hidden={userIsPro || premiumExportAvailable} />
        ) : null}

        {searchParams.get('refresh') === '1' && workspaceMode === 'quick' ? (
          <ProfileRefreshPanel authenticated={authenticated} username={username} />
        ) : null}

        <section
          className="readme-mode-section"
          style={{
            maxWidth: workspaceMode === 'quick' ? 1180 : 1080,
            margin: '0 auto 24px',
            padding: '0 16px',
            display: workspaceMode === 'quick' ? 'block' : 'none',
          }}
        >
          <div className="readme-mode-switch">
            {([
              ['quick', 'Quick'],
              ['studio', 'Advanced Studio'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchWorkspaceMode(mode, 'mode_switch')}
                aria-pressed={workspaceMode === mode}
                className={workspaceMode === mode ? 'readme-mode-btn is-active' : 'readme-mode-btn'}
              >
                {label}
              </button>
            ))}
          </div>

          {workspaceMode === 'quick' && (
            <div className="readme-quick-stage">
              <div className="readme-quick-grid">
              <div className="readme-quick-form">
                <div style={{ marginBottom: 18 }}>
                  <h2 className="mk-serif" style={{ margin: '0 0 8px', color: 'var(--mk-ink)', fontSize: 'clamp(28px, 3.2vw, 38px)', lineHeight: 1 }}>
                    Create a tailored README draft before opening Studio.
                  </h2>
                  <p style={{ margin: 0, color: 'var(--mk-ink-2)', fontSize: 14, lineHeight: 1.55 }}>
                    Pick the profile you want, add your GitHub username, and GitSkins builds a saved draft you can refine, export, or publish.
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  <label className="readme-quick-field">
                    <span>1. GitHub username</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && void generateReadme()}
                      placeholder="Enter your GitHub username"
                      autoComplete="off"
                    />
                    <div className="readme-username-helper">
                      <span>{username.trim()
                        ? `Previewing public GitHub data for @${username.trim().replace(/^@/, '')}.`
                        : 'Preview uses torvalds until you type your username.'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setUsername(DEMO_PROFILE_USERNAME);
                          setPreviewUsername(DEMO_PROFILE_USERNAME);
                        }}
                      >
                        Use torvalds
                      </button>
                    </div>
                  </label>

                  <label className="readme-quick-field">
                    <span>2. What should this README accomplish?</span>
                    <select
                      value={goal}
                      onChange={(event) => setGoal(event.target.value as ReadmeGoal)}
                    >
                      <option value="get-hired">Get hired, lead with role fit and project proof</option>
                      <option value="open-source">Grow open source, show maintainer credibility</option>
                      <option value="personal-brand">Build my brand, create memorable positioning</option>
                    </select>
                  </label>

                  <div>
                    <div className="readme-quick-field-label">3. Choose a profile template</div>
                    <div className="readme-starter-template-grid">
                      {(spaceShooterRequested
                        ? [...STUDIO_PRESETS].sort((a, b) => Number(b.id === 'space-shooter') - Number(a.id === 'space-shooter'))
                        : STUDIO_PRESETS).map((preset) => {
                        const selected = activePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              applyStarterTemplate(preset);
                              if (preset.pro && !userIsPro) showToast(premiumExportCredits > 0
                                ? 'Premium visuals loaded. One paid export credit is ready.'
                                : `Premium visuals loaded. Export this README for ${ONE_TIME_EXPORT_PRICE_USD_LABEL}.`);
                            }}
                            className={`${selected ? 'readme-starter-template is-selected' : 'readme-starter-template'}${preset.pro && !userIsPro ? ' is-pro' : ''}`}
                            aria-pressed={selected}
                            style={{ '--starter-accent': preset.accent } as CSSProperties}
                          >
                            <QuickTemplatePreview presetId={preset.id} username={previewUsername} theme={preset.theme} profile={previewProfile} />
                            <div className="readme-template-copy">
                              <strong>{preset.name}</strong>
                              <span>{preset.tagline}</span>
                            </div>
                            <span className="readme-template-select-hint">Use this style</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="readme-template-hint">
                      Start free with a complete README. Premium visuals only matter when you export.
                    </p>
                    <div
                      style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        border: '1px solid rgba(22,163,74,0.20)',
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, rgba(238,249,241,0.92), rgba(247,244,255,0.82))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                        <strong style={{ display: 'block', color: 'var(--mk-ink)', fontSize: 12 }}>Want the animated README visuals?</strong>
                        <small style={{ display: 'block', color: 'var(--mk-ink-2)', fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>
                          Add Chess, Space Shooter, Snake Trail, Erased, 3D Wordmark, and ASCII Portrait in Advanced Studio.
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => switchWorkspaceMode('studio', 'quick-animated-library')}
                        className="mk-btn-ghost"
                        style={{ flex: '0 0 auto', padding: '8px 10px', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}
                      >
                        Open visual library
                      </button>
                    </div>
                    <label className="readme-quick-field" style={{ marginTop: 12 }}>
                      <span>Optional: add your language logos</span>
                      <input
                        value={languageLogos.join(', ')}
                        onChange={(event) => setLanguageLogos(event.target.value.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 24))}
                        placeholder="JavaScript, TypeScript, React, Docker"
                        aria-describedby="language-logo-help"
                      />
                      {languageLogos.length > 0 && (
                        <div className="readme-language-logo-chips" aria-label="Selected language logos">
                          {languageLogos.map((logo) => (
                            <span key={logo}>
                              {logo}
                              <button
                                type="button"
                                aria-label={`Remove ${logo}`}
                                onClick={() => setLanguageLogos((current) => current.filter((item) => item !== logo))}
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <small id="language-logo-help" style={{ color: 'var(--mk-ink-3)', fontSize: 11, lineHeight: 1.35 }}>
                        Leave blank to use the languages GitHub detects automatically.
                      </small>
                    </label>
                  </div>

                  {quickVisual === 'terminal-portfolio' && (
                    <details className="readme-career-details">
                      <summary>
                        Add career details <span>(optional)</span>
                      </summary>
                      <div className="readme-career-details-grid">
                        <label style={{ display: 'grid', gap: 5, color: 'var(--mk-ink-2)', fontSize: 11.5, fontWeight: 750 }}>
                          Professional role
                          <input value={professionalRole} onChange={(event) => setProfessionalRole(event.target.value)} placeholder="Senior backend engineer" maxLength={120} style={{ width: '100%', padding: '8px 9px', borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', color: 'var(--mk-ink)', fontSize: 12 }} />
                        </label>
                        <label style={{ display: 'grid', gap: 5, color: 'var(--mk-ink-2)', fontSize: 11.5, fontWeight: 750 }}>
                          Open to
                          <input value={openTo} onChange={(event) => setOpenTo(event.target.value)} placeholder="Senior engineering roles" maxLength={240} style={{ width: '100%', padding: '8px 9px', borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', color: 'var(--mk-ink)', fontSize: 12 }} />
                        </label>
                        <label style={{ display: 'grid', gap: 5, color: 'var(--mk-ink-2)', fontSize: 11.5, fontWeight: 750 }}>
                          Experience <span style={{ color: 'var(--mk-ink-3)', fontWeight: 600 }}>One achievement per line</span>
                          <textarea value={experienceSummary} onChange={(event) => setExperienceSummary(event.target.value)} placeholder={'Built secure APIs for financial systems\nLed a Java 17 modernization'} maxLength={1600} rows={3} style={{ width: '100%', padding: '8px 9px', borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', color: 'var(--mk-ink)', fontSize: 12, resize: 'vertical' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 5, color: 'var(--mk-ink-2)', fontSize: 11.5, fontWeight: 750 }}>
                          Achievements <span style={{ color: 'var(--mk-ink-3)', fontWeight: 600 }}>One per line</span>
                          <textarea value={achievementsText} onChange={(event) => setAchievementsText(event.target.value)} placeholder={'Shipped three production products\nMaintains an open-source library'} maxLength={1320} rows={3} style={{ width: '100%', padding: '8px 9px', borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', color: 'var(--mk-ink)', fontSize: 12, resize: 'vertical' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 5, color: 'var(--mk-ink-2)', fontSize: 11.5, fontWeight: 750 }}>
                          Education
                          <input value={education} onChange={(event) => setEducation(event.target.value)} placeholder="M.S. Computer Science, University" maxLength={400} style={{ width: '100%', padding: '8px 9px', borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', color: 'var(--mk-ink)', fontSize: 12 }} />
                        </label>
                        <label style={{ display: 'grid', gap: 5, color: 'var(--mk-ink-2)', fontSize: 11.5, fontWeight: 750 }}>
                          Current focus <span style={{ color: 'var(--mk-ink-3)', fontWeight: 600 }}>One per line</span>
                          <textarea value={currentFocusText} onChange={(event) => setCurrentFocusText(event.target.value)} placeholder={'Agentic AI systems\nDeveloper tooling'} maxLength={960} rows={2} style={{ width: '100%', padding: '8px 9px', borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', color: 'var(--mk-ink)', fontSize: 12, resize: 'vertical' }} />
                        </label>
                      </div>
                    </details>
                  )}

                  <button
                    type="button"
                    onClick={() => void generateReadme()}
                    disabled={isLoading || (authenticated && !usageAllowed)}
                    className="mk-btn readme-quick-cta"
                  >
                    {isLoading ? 'Creating draft...' : !authenticated ? 'Sign in to create draft' : generatedReadme ? 'Regenerate draft' : 'Create README draft'}
                  </button>

                  {!authenticated && (
                    <p className="readme-quick-note">
                      Sign in once. We keep your choices, create the draft, then bring you back here.
                    </p>
                  )}
                  <div className="readme-scan-strip" aria-label="GitSkins scan sources">
                    <span>Scans public repos</span>
                    <span>Finds strongest projects</span>
                    <span>Builds GitHub-safe Markdown</span>
                  </div>
                  {wrongOwnerNotice}
                  {error && <div role="alert" className="readme-quick-error">{error}</div>}
                </div>
              </div>

              <div className="readme-quick-result">
                <div className="readme-quick-result-head">
                  <div>
                    <div className="readme-quick-result-kicker">
                      {generatedReadme ? 'README DRAFT' : 'LIVE PREVIEW'}
                    </div>
                    <strong>{generatedReadme ? 'Your README draft is ready' : quickDraftMeta}</strong>
                    {generatedReadme && <span className="readme-quick-result-meta">{quickDraftMeta}</span>}
                  </div>
                  {generatedReadme && (
                    <div className="readme-quick-result-badges">
                      <span className="readme-quick-save-pill">
                        {saveState === 'saving' ? 'Saving...' : saveState === 'error' ? 'Save failed' : 'Saved automatically'}
                      </span>
                      <span className={`readme-quick-draft-badge${draftRequiresProExport ? ' is-premium' : ''}`}>
                        {draftRequiresProExport ? 'Premium preview' : 'Free draft'}
                      </span>
                    </div>
                  )}
                </div>

                {isLoading ? (
                  <div style={{ margin: 'auto 0' }}>
                    <ThinkingProgress steps={readmeProgress.steps} activeIndex={readmeProgress.activeIndex} variant="card" />
                  </div>
                ) : generatedReadme ? (
                  <>
                    <div className={`readme-quick-export-note${draftRequiresProExport ? ' is-premium' : ''}`}>
                      <strong>{draftRequiresProExport ? 'Premium visuals are ready to export' : 'Your free README is ready to publish'}</strong>
                      <span>
                        {draftRequiresProExport
                          ? `Keep editing for free. Export once for ${ONE_TIME_EXPORT_PRICE_USD_LABEL} or choose Pro when you want unlimited premium exports.`
                          : 'Copy, download, or publish this draft to your GitHub profile.'}
                      </span>
                    </div>
                    {readmeScore && (
                      <details className="readme-quick-improvement">
                        <summary>
                          <span>Improve this profile</span>
                          <strong>{readmeScore.overall}/100</strong>
                        </summary>
                        <p>{readmeScore.suggestions[0] || 'Your README has a strong structure. Keep project outcomes specific.'}</p>
                      </details>
                    )}
                    <div className="readme-quick-preview">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{generatedReadme}</ReactMarkdown>
                    </div>
                    <div className="readme-quick-actions">
                      <button
                        type="button"
                        onClick={() => setShowPublishGuide(true)}
                        disabled={publishingPr || !generatedReadme}
                        className="mk-btn"
                        style={{ border: 'none', padding: '11px 15px', cursor: publishingPr ? 'wait' : 'pointer', fontSize: 13 }}
                      >
                        {publishPrUrl ? 'Publish another update' : draftRequiresProExport ? `Export premium README for ${ONE_TIME_EXPORT_PRICE_USD_LABEL}` : 'Publish free version'}
                      </button>
                      <button type="button" onClick={copyToClipboard} className="mk-btn-ghost" style={{ padding: '11px 15px', cursor: 'pointer', fontSize: 13 }}>{copied ? 'Copied' : 'Copy Markdown'}</button>
                      <button type="button" onClick={() => void downloadReadme()} className="mk-btn-ghost" style={{ padding: '11px 15px', cursor: 'pointer', fontSize: 13 }}>Download README.md</button>
                      <button type="button" onClick={() => switchWorkspaceMode('studio', 'quick_result_customize')} className="mk-btn-ghost" style={{ padding: '11px 15px', cursor: 'pointer', fontSize: 13 }}>Customize in Studio</button>
                    </div>
                    {publishPrUrl && (
                      <p className="readme-quick-pr-link">
                        Pull request ready:{' '}
                        <a href={publishPrUrl} target="_blank" rel="noreferrer">
                          Review and merge on GitHub
                        </a>
                      </p>
                    )}
                  </>
                ) : (
                  <div className="readme-quick-live">
                    <div className="readme-quick-live-meta">
                      <strong>Preset preview</strong>
                      <span>
                        {!username.trim()
                          ? `Using @${DEMO_PROFILE_USERNAME} demo data`
                          : previewProfileState === 'loading'
                            ? `Checking @${username.trim().replace(/^@/, '')}...`
                            : previewProfileState === 'error'
                              ? 'Using demo data until the profile loads'
                              : `Uses @${username.trim().replace(/^@/, '') || previewUsername} data`}
                      </span>
                    </div>
                    <div className="readme-quick-device">
                      <div className="readme-quick-device-bar">
                        <span /><span /><span />
                        <em>{quickVisualLabels[quickVisual]}</em>
                      </div>
                      {previewProfileState === 'loading' ? (
                        <div className="readme-quick-preset-state" role="status">Composing live preview…</div>
                      ) : (
                        <QuickPresetPreview preset={quickVisual} username={previewUsername} theme={theme} profile={previewProfile} />
                      )}
                    </div>
                    <div className="readme-quick-actions">
                      <button
                        type="button"
                        onClick={() => void generateReadme()}
                        disabled={isLoading || (authenticated && !usageAllowed)}
                        className="mk-btn"
                        style={{ border: 'none', padding: '11px 15px', cursor: isLoading ? 'wait' : 'pointer', fontSize: 13 }}
                      >
                        {isLoading ? 'Creating draft...' : authenticated ? 'Create this draft' : 'Sign in to create draft'}
                      </button>
                      <button type="button" onClick={() => setShowPublishGuide(true)} className="mk-btn-ghost" style={{ padding: '11px 15px', cursor: 'pointer', fontSize: 13 }}>How publishing works</button>
                    </div>
                    <p className="readme-quick-footnote">
                      Exported READMEs use the same responsive SVG sections with automatic light and dark variants.
                    </p>
                  </div>
                )}
              </div>
              </div>
              <style>{`
                .readme-quick-stage {
                  position: relative;
                  margin-top: 12px;
                  padding: 18px;
                  border-radius: 28px;
                  border: 1px solid rgba(18, 33, 26, 0.08);
                  background:
                    radial-gradient(ellipse 80% 60% at 12% 0%, rgba(52, 209, 125, 0.18), transparent 55%),
                    radial-gradient(ellipse 70% 50% at 90% 10%, rgba(18, 33, 26, 0.06), transparent 50%),
                    linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,247,244,0.88));
                  box-shadow: 0 30px 80px -48px rgba(18, 40, 28, 0.55);
                  overflow: hidden;
                }
                .readme-quick-stage::before {
                  content: '';
                  position: absolute;
                  inset: 0;
                  background-image: linear-gradient(rgba(18,33,26,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(18,33,26,0.03) 1px, transparent 1px);
                  background-size: 28px 28px;
                  mask-image: radial-gradient(ellipse at center, black 30%, transparent 78%);
                  pointer-events: none;
                }
                .readme-quick-grid {
                  position: relative;
                  z-index: 1;
                  display: grid;
                  grid-template-columns: minmax(280px, 0.88fr) minmax(360px, 1.12fr);
                  gap: 18px;
                  align-items: stretch;
                }
                .readme-quick-form,
                .readme-quick-result {
                  border-radius: 22px;
                  border: 1px solid rgba(18, 33, 26, 0.08);
                  background: rgba(255,255,255,0.86);
                  backdrop-filter: blur(10px);
                }
                .readme-quick-form { padding: 22px; }
                .readme-quick-result {
                  padding: 18px;
                  display: flex;
                  flex-direction: column;
                  min-height: 460px;
                  height: auto;
                  overflow: hidden;
                }
                .readme-quick-field {
                  display: grid;
                  gap: 7px;
                  color: var(--mk-ink);
                  font-size: 12.5px;
                  font-weight: 800;
                }
                .readme-quick-field-label {
                  margin-bottom: 8px;
                  color: var(--mk-ink);
                  font-size: 12.5px;
                  font-weight: 800;
                }
                .readme-quick-field input,
                .readme-quick-field select {
                  width: 100%;
                  padding: 12px 13px;
                  border-radius: 12px;
                  border: 1px solid var(--mk-border);
                  background: #fff;
                  color: var(--mk-ink);
                  font-size: 14px;
                  font-weight: 650;
                  transition: border-color 0.16s ease, box-shadow 0.16s ease;
                }
                .readme-quick-field input:focus,
                .readme-quick-field select:focus {
                  outline: none;
                  border-color: rgba(22,163,74,0.45);
                  box-shadow: 0 0 0 4px rgba(22,163,74,0.12);
                }
                .readme-username-helper {
                  align-items: center;
                  display: flex;
                  gap: 10px;
                  justify-content: space-between;
                  margin-top: 2px;
                }
                .readme-username-helper span {
                  color: var(--mk-ink-3);
                  font-size: 11px;
                  font-weight: 650;
                  line-height: 1.35;
                }
                .readme-username-helper button {
                  background: #fff;
                  border: 1px solid var(--mk-border);
                  border-radius: 999px;
                  color: var(--mk-blue-ink);
                  cursor: pointer;
                  flex: 0 0 auto;
                  font-size: 11px;
                  font-weight: 850;
                  min-height: 28px;
                  padding: 0 10px;
                }
                .readme-username-helper button:hover {
                  border-color: rgba(22,163,74,0.3);
                  background: #f4fbf6;
                }
                .readme-style-grid,
                .readme-starter-template-grid {
                  display: grid;
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                  gap: 8px;
                  align-items: start;
                  grid-auto-rows: max-content;
                }
                .readme-style-tile,
                .readme-starter-template {
                  display: flex;
                  flex-direction: column;
                  gap: 9px;
                  min-height: 0;
                  height: auto !important;
                  max-height: none;
                  padding: 10px 11px 12px;
                  align-self: start;
                  text-align: left;
                  border-radius: 14px;
                  border: 1px solid var(--mk-border);
                  background: #fff;
                  color: var(--mk-ink-2);
                  cursor: pointer;
                  position: relative;
                  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
                }
                .readme-starter-template.is-pro {
                  padding-bottom: 12px;
                }
                .readme-style-tile strong,
                .readme-starter-template strong {
                  color: var(--mk-ink);
                  font-size: 12.5px;
                  font-weight: 850;
                  min-width: 0;
                  overflow-wrap: anywhere;
                }
                .readme-style-tile span,
                .readme-template-copy span {
                  color: var(--mk-ink-3);
                  font-size: 11px;
                  font-weight: 600;
                  line-height: 1.35;
                }
                .readme-template-copy {
                  display: grid;
                  gap: 2px;
                  min-width: 0;
                }
                .readme-template-select-hint {
                  align-self: flex-end;
                  margin-top: -2px;
                  color: var(--mk-blue-ink) !important;
                  font-size: 10px !important;
                  font-weight: 850 !important;
                  opacity: 0;
                  transform: translateY(3px);
                  transition: opacity 0.16s ease, transform 0.16s ease;
                }
                .readme-template-thumb {
                  background:
                    radial-gradient(120px 70px at 22% 14%, color-mix(in srgb, var(--starter-accent, var(--preset-accent, var(--mk-blue))) 24%, transparent), transparent 68%),
                    linear-gradient(180deg, #f8fbf8, #edf4ee);
                  border: 1px solid rgba(18,33,26,0.08);
                  border-radius: 10px;
                  box-shadow: 0 1px 0 rgba(255,255,255,0.8) inset;
                  display: block;
                  height: 68px;
                  overflow: hidden;
                  position: relative;
                  width: 100%;
                }
                .readme-template-thumb span {
                  background: color-mix(in srgb, var(--starter-accent, var(--preset-accent, var(--mk-blue))) 64%, #fff);
                  border-radius: 999px;
                  display: block;
                  opacity: 0.78;
                  position: absolute;
                }
                .readme-template-thumb span:nth-child(1) {
                  height: 24px;
                  left: 11px;
                  top: 12px;
                  width: 24px;
                }
                .readme-template-thumb span:nth-child(2) {
                  height: 7px;
                  left: 44px;
                  top: 14px;
                  width: 54px;
                }
                .readme-template-thumb span:nth-child(3) {
                  height: 6px;
                  left: 44px;
                  top: 27px;
                  width: 82px;
                  opacity: 0.42;
                }
                .readme-template-thumb span:nth-child(4) {
                  bottom: 12px;
                  height: 10px;
                  left: 12px;
                  width: 42px;
                }
                .readme-template-thumb span:nth-child(5) {
                  bottom: 12px;
                  height: 10px;
                  left: 62px;
                  width: 42px;
                  opacity: 0.42;
                }
                .readme-template-thumb.is-oss span:nth-child(1),
                .readme-template-thumb.is-oss span:nth-child(2),
                .readme-template-thumb.is-oss span:nth-child(3) {
                  height: 12px;
                  left: 12px;
                  width: calc(50% - 18px);
                }
                .readme-template-thumb.is-oss span:nth-child(1) { top: 12px; }
                .readme-template-thumb.is-oss span:nth-child(2) { top: 31px; opacity: 0.48; }
                .readme-template-thumb.is-oss span:nth-child(3) { left: calc(50% + 6px); top: 12px; opacity: 0.56; }
                .readme-template-thumb.is-oss span:nth-child(4) {
                  bottom: 12px;
                  height: 6px;
                  left: 12px;
                  width: 62%;
                }
                .readme-template-thumb.is-oss span:nth-child(5) {
                  bottom: 12px;
                  height: 18px;
                  left: auto;
                  right: 12px;
                  width: 18px;
                }
                .readme-template-thumb.is-terminal,
                /* Showcase leads the grid, so it needs a thumbnail of its own
                   rather than falling through to the plain base style. Reads as
                   a stacked profile: title bar, then a contribution grid. */
                .readme-template-thumb.is-showcase {
                  background:
                    radial-gradient(90px 60px at 78% 18%, rgba(65,216,197,0.28), transparent 70%),
                    linear-gradient(180deg, #101820, #0d1117);
                  border-color: rgba(65,216,197,0.22);
                }
                .readme-template-thumb.is-showcase span {
                  background: #41d8c5;
                  border-radius: 2px;
                }
                .readme-template-thumb.is-showcase span:nth-child(1) {
                  height: 7px; left: 12px; top: 12px; width: 52px; opacity: 0.95;
                }
                .readme-template-thumb.is-showcase span:nth-child(2) {
                  height: 4px; left: 12px; top: 24px; width: 92px; opacity: 0.45;
                }
                .readme-template-thumb.is-showcase span:nth-child(3) {
                  height: 5px; left: 12px; top: 38px; width: 116px; opacity: 0.8;
                }
                .readme-template-thumb.is-showcase span:nth-child(4) {
                  height: 5px; left: 12px; top: 47px; width: 100px; opacity: 0.55;
                }
                .readme-template-thumb.is-showcase span:nth-child(5) {
                  height: 5px; left: 12px; top: 56px; width: 124px; opacity: 0.35;
                }
                .readme-template-thumb.is-wow {
                  background:
                    linear-gradient(180deg, rgba(255,255,255,0.06), transparent),
                    #0d1117;
                  border-color: rgba(255,255,255,0.12);
                }
                .readme-template-thumb.is-terminal span,
                .readme-template-thumb.is-wow span {
                  background: #34d17d;
                  border-radius: 3px;
                }
                .readme-template-thumb.is-terminal span:nth-child(1),
                .readme-template-thumb.is-wow span:nth-child(1) {
                  height: 6px;
                  left: 12px;
                  top: 15px;
                  width: 86px;
                }
                .readme-template-thumb.is-terminal span:nth-child(2),
                .readme-template-thumb.is-wow span:nth-child(2) {
                  height: 6px;
                  left: 12px;
                  top: 29px;
                  width: 116px;
                  opacity: 0.5;
                }
                .readme-template-thumb.is-terminal span:nth-child(3),
                .readme-template-thumb.is-wow span:nth-child(3) {
                  height: 6px;
                  left: 12px;
                  top: 43px;
                  width: 72px;
                  opacity: 0.82;
                }
                .readme-template-thumb.is-terminal span:nth-child(4),
                .readme-template-thumb.is-wow span:nth-child(4) {
                  background: #58a6ff;
                  bottom: 13px;
                  height: 6px;
                  left: 96px;
                  width: 30px;
                }
                .readme-template-thumb.is-terminal span:nth-child(5),
                .readme-template-thumb.is-wow span:nth-child(5) {
                  background: #f0f6fc;
                  bottom: 13px;
                  height: 6px;
                  left: 132px;
                  opacity: 0.48;
                  width: 18px;
                }
                .readme-template-thumb.is-aura {
                  background:
                    radial-gradient(70px 48px at 28% 36%, rgba(52,209,125,0.36), transparent 72%),
                    radial-gradient(80px 58px at 74% 30%, rgba(123,69,242,0.26), transparent 72%),
                    radial-gradient(80px 58px at 58% 86%, rgba(45,212,191,0.22), transparent 72%),
                    #f8fbf8;
                }
                .readme-template-thumb.is-aura span:nth-child(1) {
                  background: rgba(255,255,255,0.82);
                  border: 1px solid rgba(18,33,26,0.08);
                  height: 34px;
                  left: 14px;
                  top: 17px;
                  width: 44px;
                }
                .readme-template-thumb.is-aura span:nth-child(2) {
                  height: 9px;
                  left: 72px;
                  top: 18px;
                  width: 58px;
                }
                .readme-template-thumb.is-aura span:nth-child(3) {
                  height: 9px;
                  left: 72px;
                  top: 34px;
                  opacity: 0.54;
                  width: 78px;
                }
                .readme-template-thumb.is-aura span:nth-child(4) {
                  bottom: 13px;
                  height: 7px;
                  left: 72px;
                  width: 46px;
                }
                .readme-template-thumb.is-aura span:nth-child(5) {
                  bottom: 13px;
                  height: 7px;
                  left: 124px;
                  opacity: 0.42;
                  width: 26px;
                }
                .readme-template-thumb.is-wow::after {
                  color: #f0f6fc;
                  content: 'ASCII';
                  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                  font-size: 11px;
                  font-weight: 900;
                  letter-spacing: 0.04em;
                  position: absolute;
                  right: 12px;
                  top: 14px;
                  text-shadow: 0 0 14px rgba(52,209,125,0.45);
                }
                .readme-template-thumb.is-space-shooter {
                  background: #070b10 url('/showcase/space-shooter.gif') center / cover no-repeat;
                  border-color: rgba(88,166,255,0.24);
                }
                .readme-template-thumb.is-space-shooter span {
                  display: none;
                }
                .readme-starter-template em {
                  position: absolute;
                  right: 10px;
                  bottom: 10px;
                  border-radius: 999px;
                  background: linear-gradient(180deg, #ffd67a, #f0a92e);
                  color: #2a1c02;
                  font-size: 8.5px;
                  font-style: normal;
                  font-weight: 950;
                  letter-spacing: 0.04em;
                  line-height: 1;
                  padding: 5px 7px;
                  text-transform: uppercase;
                  white-space: nowrap;
                }
                .readme-style-tile:hover,
                .readme-starter-template:hover {
                  transform: translateY(-2px);
                  border-color: rgba(18,33,26,0.16);
                }
                .readme-starter-template:hover .readme-template-select-hint,
                .readme-starter-template:focus-visible .readme-template-select-hint {
                  opacity: 1;
                  transform: translateY(0);
                }
                .readme-style-tile.is-selected,
                .readme-starter-template.is-selected {
                  border-color: rgba(22,163,74,0.42);
                  background: linear-gradient(180deg, #f3fbf6, #e9f8ef);
                  color: var(--mk-blue-ink);
                }
                .readme-style-tile.is-selected strong,
                .readme-starter-template.is-selected strong { color: var(--mk-blue-ink); }
                .readme-style-tile.is-selected span,
                .readme-starter-template.is-selected span { color: #3f6b4f; }
                .readme-template-hint {
                  margin: 8px 0 0;
                  color: var(--mk-ink-3);
                  font-size: 11px;
                  line-height: 1.45;
                }
                .readme-career-details {
                  border: 1px solid var(--mk-border);
                  border-radius: 14px;
                  background: var(--mk-bg-soft);
                  overflow: hidden;
                }
                .readme-career-details summary {
                  padding: 11px 13px;
                  color: var(--mk-ink);
                  font-size: 12.5px;
                  font-weight: 850;
                  cursor: pointer;
                }
                .readme-career-details summary span { color: var(--mk-ink-3); font-weight: 650; }
                .readme-career-details-grid {
                  display: grid;
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                  gap: 9px;
                  padding: 0 12px 12px;
                }
                .readme-quick-cta {
                  width: 100%;
                  justify-content: center;
                  padding: 13px 16px;
                  border: none;
                  cursor: pointer;
                  font-size: 14px;
                }
                .readme-quick-note {
                  margin: -6px 0 0;
                  color: var(--mk-ink-3);
                  font-size: 11.5px;
                  line-height: 1.45;
                  text-align: center;
                }
                .readme-scan-strip {
                  display: grid;
                  gap: 7px;
                  grid-template-columns: repeat(3, minmax(0, 1fr));
                  padding: 10px;
                  border: 1px solid rgba(22,163,74,0.12);
                  border-radius: 14px;
                  background: rgba(22,163,74,0.06);
                }
                .readme-scan-strip span {
                  color: var(--mk-ink-2);
                  font-size: 10.5px;
                  font-weight: 750;
                  line-height: 1.3;
                  text-align: center;
                }
                .readme-quick-error {
                  padding: 11px;
                  border-radius: 10px;
                  background: #fff1f1;
                  color: #b42318;
                  font-size: 12.5px;
                }
                .readme-language-logo-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 10px; }
                .readme-language-logo-chips span { align-items: center; border: 1px solid rgba(22,163,74,.18); border-radius: 999px; background: #eef8f1; color: #23613b; display: inline-flex; font-size: 10px; font-weight: 800; gap: 4px; padding: 4px 5px 4px 7px; }
                .readme-language-logo-chips button { border: 0; border-radius: 50%; background: transparent; color: #23613b; cursor: pointer; font-size: 14px; line-height: 12px; padding: 0 2px; }
                .readme-language-logo-chips button:hover { background: rgba(22,163,74,.14); }
                .readme-studio-logo-picker { display: grid; gap: 4px; margin: 14px 0 16px; padding: 10px; border: 1px solid rgba(22,163,74,.16); border-radius: 12px; background: #f3fbf6; }
                .readme-studio-logo-picker strong { color: var(--mk-ink); font-size: 12px; }
                .readme-studio-logo-picker > span { color: var(--mk-ink-3); font-size: 10px; line-height: 1.35; }
                .readme-language-logo-chips span.is-loading { color: var(--mk-ink-3); font-weight: 650; }
                .readme-quick-result-head {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 12px;
                  margin-bottom: 14px;
                }
                .readme-quick-result-kicker {
                  color: var(--mk-ink-3);
                  font-size: 11px;
                  font-weight: 850;
                  text-transform: uppercase;
                  letter-spacing: 0.08em;
                }
                .readme-quick-result-head strong {
                  display: block;
                  margin-top: 4px;
                  color: var(--mk-ink);
                  font-size: 15px;
                  letter-spacing: -0.02em;
                }
                .readme-quick-result-meta {
                  display: block;
                  margin-top: 4px;
                  color: var(--mk-ink-3);
                  font-size: 11px;
                  font-weight: 700;
                }
                .readme-quick-result-badges {
                  display: flex;
                  align-items: center;
                  justify-content: flex-end;
                  flex-wrap: wrap;
                  gap: 6px;
                }
                .readme-quick-save-pill {
                  padding: 6px 10px;
                  border-radius: 999px;
                  background: #e9f8ef;
                  color: var(--mk-blue-ink);
                  font-size: 11px;
                  font-weight: 850;
                }
                .readme-quick-draft-badge {
                  padding: 6px 10px;
                  border: 1px solid rgba(18,33,26,0.1);
                  border-radius: 999px;
                  background: rgba(255,255,255,0.8);
                  color: var(--mk-ink-2);
                  font-size: 11px;
                  font-weight: 850;
                }
                .readme-quick-draft-badge.is-premium {
                  border-color: rgba(123,69,242,0.2);
                  background: #f2edff;
                  color: #6939d7;
                }
                .readme-quick-export-note {
                  display: grid;
                  gap: 4px;
                  margin-bottom: 10px;
                  padding: 11px 13px;
                  border: 1px solid rgba(22,163,74,0.16);
                  border-radius: 13px;
                  background: #eef8f1;
                }
                .readme-quick-export-note.is-premium {
                  border-color: rgba(123,69,242,0.18);
                  background: #f5f1ff;
                }
                .readme-quick-export-note strong {
                  color: var(--mk-ink);
                  font-size: 12.5px;
                }
                .readme-quick-export-note.is-premium strong {
                  color: #6939d7;
                }
                .readme-quick-export-note span {
                  color: var(--mk-ink-2);
                  font-size: 11.5px;
                  line-height: 1.4;
                }
                .readme-quick-improvement {
                  margin-bottom: 10px;
                  padding: 0 11px;
                  border: 1px solid rgba(18,33,26,0.09);
                  border-radius: 12px;
                  background: rgba(255,255,255,0.78);
                }
                .readme-quick-improvement summary {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 10px;
                  min-height: 38px;
                  color: var(--mk-ink-2);
                  cursor: pointer;
                  font-size: 11.5px;
                  font-weight: 800;
                  list-style: none;
                }
                .readme-quick-improvement summary::-webkit-details-marker { display: none; }
                .readme-quick-improvement summary::after {
                  content: '+';
                  color: var(--mk-blue-ink);
                  font-size: 17px;
                  line-height: 1;
                }
                .readme-quick-improvement[open] summary::after { content: '−'; }
                .readme-quick-improvement summary strong {
                  margin-left: auto;
                  color: var(--mk-blue-ink);
                  font-size: 11.5px;
                }
                .readme-quick-improvement p {
                  margin: 0 0 10px;
                  color: var(--mk-ink-2);
                  font-size: 11.5px;
                  line-height: 1.4;
                }
                .readme-quick-score {
                  display: grid;
                  grid-template-columns: 46px minmax(0, 1fr);
                  gap: 10px;
                  align-items: center;
                  margin-bottom: 10px;
                  padding: 10px;
                  border-radius: 14px;
                  background: #eef8f1;
                  border: 1px solid rgba(22,163,74,0.16);
                }
                .readme-quick-score-value {
                  width: 46px;
                  height: 46px;
                  border-radius: 12px;
                  display: grid;
                  place-items: center;
                  background: #fff;
                  color: var(--mk-blue-ink);
                  font-size: 17px;
                  font-weight: 950;
                }
                .readme-quick-score strong {
                  display: block;
                  color: var(--mk-ink);
                  font-size: 12.5px;
                }
                .readme-quick-score p {
                  margin: 3px 0 0;
                  color: var(--mk-ink-2);
                  font-size: 11.5px;
                  line-height: 1.4;
                }
                .readme-quick-preview {
                  flex: 1;
                  min-height: 0;
                  overflow: auto;
                  padding: 16px;
                  border-radius: 16px;
                  border: 1px solid var(--mk-border);
                  background: #fff;
                  color: var(--mk-ink);
                }
                .readme-quick-actions {
                  display: flex;
                  gap: 8px;
                  flex-wrap: wrap;
                  margin-top: 14px;
                }
                .readme-quick-actions > .mk-btn {
                  flex: 1 1 100%;
                }
                .readme-quick-pr-link {
                  margin: 10px 0 0;
                  color: var(--mk-ink-2);
                  font-size: 12px;
                  line-height: 1.45;
                }
                .readme-quick-pr-link a {
                  color: var(--mk-blue-ink);
                  font-weight: 750;
                }
                .readme-quick-live {
                  flex: 0 0 auto;
                  min-height: 0;
                  display: grid;
                  grid-template-rows: auto minmax(320px, auto) auto;
                  align-content: start;
                  gap: 12px;
                }
                .readme-quick-live-meta {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  gap: 10px;
                }
                .readme-quick-live-meta strong {
                  color: var(--mk-ink);
                  font-size: 12.5px;
                }
                .readme-quick-live-meta span {
                  color: var(--mk-ink-3);
                  font-size: 10.5px;
                  font-weight: 750;
                }
                .readme-quick-device {
                  min-height: 320px;
                  border-radius: 16px;
                  border: 1px solid #243029;
                  background: linear-gradient(180deg, #151c18, #0c100e);
                  overflow: hidden;
                  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
                }
                .readme-quick-device-bar {
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  padding: 10px 12px;
                  border-bottom: 1px solid rgba(255,255,255,0.06);
                  background: rgba(255,255,255,0.03);
                }
                .readme-quick-device-bar span {
                  width: 8px;
                  height: 8px;
                  border-radius: 50%;
                  background: #3f4a43;
                }
                .readme-quick-device-bar span:nth-child(1) { background: #ff5f56; }
                .readme-quick-device-bar span:nth-child(2) { background: #ffbd2e; }
                .readme-quick-device-bar span:nth-child(3) { background: #27c93f; }
                .readme-quick-device-bar em {
                  margin-left: 8px;
                  color: #9aab9f;
                  font-style: normal;
                  font-size: 11px;
                  font-weight: 700;
                  letter-spacing: 0.02em;
                }
                .readme-quick-footnote {
                  margin: 0;
                  color: var(--mk-ink-3);
                  font-size: 10.5px;
                  line-height: 1.4;
                }
                .readme-quick-preview img { display: block; max-width: 100%; height: auto; }
                .readme-quick-preview table { width: 100%; table-layout: fixed; border-collapse: collapse; }
                .readme-quick-preview td { vertical-align: top; padding: 10px; }
                .readme-quick-preview h1,
                .readme-quick-preview h2,
                .readme-quick-preview h3 { color: var(--mk-ink); }
                .readme-quick-preview blockquote { border-left: 3px solid #2dd4bf; margin: 12px 0; padding: 8px 12px; background: #f1fbf8; }
                .readme-quick-preview pre { overflow: auto; white-space: pre-wrap; }
                .readme-quick-preview > :first-child { margin-top: 0; }
                .readme-quick-preview > :last-child { margin-bottom: 0; }
                .readme-quick-preset-preview {
                  min-height: 0;
                  overflow: hidden;
                  padding: 10px;
                  border: 0;
                  border-radius: 0;
                  background: transparent;
                  animation: readme-preview-in 0.45s ease both;
                }
                @keyframes readme-preview-in {
                  from { opacity: 0; transform: translateY(6px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .readme-quick-preset-preview picture {
                  display: flex;
                  width: 100%;
                  height: 100%;
                  min-width: 0;
                  align-items: center;
                  justify-content: center;
                  overflow: hidden;
                  border-radius: 8px;
                  background: transparent;
                }
                .readme-preview-asset {
                  position: relative;
                  display: flex;
                  min-width: 0;
                  min-height: 68px;
                  align-items: center;
                  justify-content: center;
                  overflow: hidden;
                  border-radius: 8px;
                  background: #111722;
                }
                .readme-preview-asset.is-loading::before {
                  content: '';
                  position: absolute;
                  inset: 0;
                  background: linear-gradient(110deg, transparent 20%, rgba(52,209,125,0.12) 45%, transparent 70%);
                  background-size: 200% 100%;
                  animation: readme-shimmer 1.2s ease-in-out infinite;
                }
                @keyframes readme-shimmer {
                  from { background-position: 120% 0; }
                  to { background-position: -40% 0; }
                }
                .readme-preview-asset.is-loading img,
                .readme-preview-asset.is-error img {
                  opacity: 0;
                }
                .readme-preview-fallback {
                  position: absolute;
                  inset: 10px;
                  z-index: 1;
                  overflow: hidden;
                  border-radius: 8px;
                  background:
                    radial-gradient(120px 72px at 20% 20%, rgba(52, 209, 125, 0.26), transparent 70%),
                    radial-gradient(150px 86px at 82% 38%, rgba(88, 166, 255, 0.16), transparent 72%),
                    linear-gradient(180deg, rgba(15, 23, 32, 0.96), rgba(9, 14, 20, 0.98));
                  border: 1px solid rgba(255,255,255,0.07);
                }
                .readme-preview-fallback span {
                  position: absolute;
                  display: block;
                  border-radius: 999px;
                  background: rgba(52, 209, 125, 0.78);
                  box-shadow: 0 0 18px rgba(52, 209, 125, 0.18);
                }
                .readme-preview-fallback span:nth-child(1) {
                  left: 8%;
                  top: 22%;
                  width: 42%;
                  height: 8px;
                }
                .readme-preview-fallback span:nth-child(2) {
                  left: 8%;
                  top: 40%;
                  width: 58%;
                  height: 7px;
                  opacity: 0.5;
                }
                .readme-preview-fallback span:nth-child(3) {
                  left: 8%;
                  top: 58%;
                  width: 34%;
                  height: 7px;
                  opacity: 0.72;
                }
                .readme-preview-fallback span:nth-child(4) {
                  right: 8%;
                  bottom: 18%;
                  width: 22%;
                  height: 7px;
                  background: rgba(88, 166, 255, 0.8);
                }
                .readme-preview-asset.is-portrait .readme-preview-fallback span:nth-child(1) {
                  left: 50%;
                  top: 16%;
                  width: 64px;
                  height: 64px;
                  border-radius: 24px;
                  transform: translateX(-50%);
                }
                .readme-preview-asset.is-portrait .readme-preview-fallback span:nth-child(2) {
                  left: 24%;
                  top: 66%;
                  width: 52%;
                }
                .readme-preview-asset.is-wordmark .readme-preview-fallback span:nth-child(1) {
                  left: 8%;
                  top: 38%;
                  width: 76%;
                  height: 14px;
                }
                .readme-preview-asset.is-wordmark .readme-preview-fallback span:nth-child(2) {
                  left: 16%;
                  top: 58%;
                  width: 58%;
                }
                .readme-preview-asset.is-heatmap .readme-preview-fallback {
                  background-image:
                    linear-gradient(90deg, rgba(52,209,125,0.34) 8px, transparent 8px),
                    linear-gradient(rgba(52,209,125,0.24) 8px, transparent 8px);
                  background-size: 15px 15px;
                  background-color: #0b1110;
                }
                .readme-preview-asset.is-heatmap .readme-preview-fallback span {
                  display: none;
                }
                .readme-preview-fallback.is-profile-fallback {
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: flex-start;
                  gap: 8px;
                  padding: 14px;
                  background:
                    radial-gradient(circle at 82% 15%, rgba(52,209,125,0.22), transparent 35%),
                    linear-gradient(145deg, #101924, #080d12);
                  color: #effff5;
                }
                .readme-preview-fallback.is-profile-fallback strong {
                  color: #f4fff7;
                  font-size: 18px;
                  letter-spacing: -0.03em;
                }
                .readme-preview-fallback.is-profile-fallback > span,
                .readme-preview-fallback-copy,
                .readme-preview-fallback-identity span,
                .readme-preview-fallback-heatmap-heading span {
                  color: rgba(222,241,229,0.68);
                  font-size: 10px;
                }
                .readme-preview-fallback-avatar {
                  width: 44px;
                  height: 44px;
                  flex: 0 0 auto;
                  overflow: hidden;
                  display: grid;
                  place-items: center;
                  border-radius: 50%;
                  background: #1b2d30;
                  border: 1px solid rgba(52,209,125,0.7);
                  color: #58dfa0;
                  font-weight: 800;
                }
                .readme-preview-fallback-avatar img {
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                  display: block;
                }
                .readme-preview-fallback-header {
                  display: flex;
                  align-items: center;
                  gap: 10px;
                }
                .readme-preview-fallback-identity {
                  display: grid;
                  gap: 2px;
                }
                .readme-preview-fallback-copy {
                  margin: 3px 0 0;
                  max-width: 65ch;
                  line-height: 1.4;
                }
                .readme-preview-fallback-stats {
                  display: grid;
                  grid-template-columns: repeat(4, minmax(0, 1fr));
                  gap: 6px;
                  width: 100%;
                }
                .readme-preview-fallback-stat {
                  display: grid;
                  gap: 2px;
                  min-width: 0;
                  padding: 8px;
                  border-radius: 8px;
                  background: rgba(255,255,255,0.06);
                  border: 1px solid rgba(255,255,255,0.09);
                }
                .readme-preview-fallback-stat strong {
                  font-size: 12px;
                  color: #58dfa0;
                }
                .readme-preview-fallback-stat span {
                  overflow: hidden;
                  color: rgba(222,241,229,0.6);
                  font-size: 8px;
                  text-overflow: ellipsis;
                  text-transform: uppercase;
                  letter-spacing: 0.08em;
                }
                .readme-preview-fallback.is-profile-wordmark {
                  align-items: center;
                  text-align: center;
                }
                .readme-preview-fallback.is-profile-wordmark strong {
                  color: #58dfa0;
                  font-size: 26px;
                }
                .readme-preview-fallback.is-profile-heatmap {
                  gap: 12px;
                }
                .readme-preview-fallback-heatmap-heading {
                  display: flex;
                  align-items: baseline;
                  justify-content: space-between;
                  gap: 10px;
                  width: 100%;
                }
                .readme-preview-fallback-heatmap-grid {
                  display: grid;
                  grid-template-columns: repeat(14, minmax(0, 1fr));
                  gap: 3px;
                  width: 100%;
                }
                .readme-preview-fallback-heatmap-grid span {
                  position: static;
                  width: auto;
                  height: auto;
                  aspect-ratio: 1;
                  border-radius: 2px;
                  background: #38c982;
                  box-shadow: none;
                }
                /* The profile-aware fallback contains real text and nested spans,
                   so keep the generic shimmer rules from changing its layout. */
                .readme-preview-fallback.is-profile-fallback span {
                  position: static;
                  left: auto;
                  top: auto;
                  right: auto;
                  bottom: auto;
                  width: auto;
                  height: auto;
                  transform: none;
                  border-radius: 0;
                  background: transparent;
                  box-shadow: none;
                }
                .readme-preview-fallback.is-profile-fallback .readme-preview-fallback-avatar {
                  width: 44px;
                  height: 44px;
                  border-radius: 50%;
                }
                .readme-preview-fallback.is-profile-fallback .readme-preview-fallback-heatmap-grid {
                  display: grid;
                  grid-template-columns: repeat(14, minmax(0, 1fr));
                  gap: 3px;
                  width: 100%;
                }
                .readme-preview-fallback.is-profile-fallback .readme-preview-fallback-heatmap-grid span {
                  display: block;
                  width: auto;
                  height: auto;
                  aspect-ratio: 1;
                  border-radius: 2px;
                  background: #38c982;
                }
                .readme-preview-fallback.is-profile-heatmap .readme-preview-fallback-heatmap-grid {
                  grid-template-rows: repeat(6, minmax(0, 1fr));
                  grid-auto-rows: minmax(0, 1fr);
                  max-height: 78px;
                  overflow: hidden;
                }
                .readme-preview-asset-status {
                  position: absolute;
                  z-index: 1;
                  color: #8b949e;
                  font-size: 10.5px;
                  font-weight: 750;
                }
                .readme-quick-preset-state {
                  min-height: 240px;
                  display: grid;
                  place-items: center;
                  padding: 20px;
                  color: #9aab9f;
                  font-size: 12px;
                  font-weight: 750;
                  text-align: center;
                }
                .readme-quick-preset-state.is-error {
                  color: #ff8f84;
                }
                .readme-quick-preset-preview img {
                  display: block;
                  width: 100%;
                  max-width: 100%;
                  height: auto;
                  border-radius: 8px;
                }
                .readme-quick-preset-preview.is-system-scan img {
                  max-height: 252px;
                  object-fit: contain;
                }
                .readme-quick-preset-preview.is-terminal-identity {
                  display: grid;
                  gap: 7px;
                }
                .readme-terminal-identity-pair {
                  display: grid;
                  grid-template-columns: minmax(0, 0.43fr) minmax(0, 0.57fr);
                  gap: 7px;
                }
                .readme-terminal-identity-pair .readme-preview-asset {
                  height: 178px;
                }
                .readme-terminal-identity-pair img {
                  width: 100%;
                  height: 178px;
                  object-fit: contain;
                }
                .readme-quick-preset-preview.is-terminal-identity > .readme-preview-asset:last-child {
                  min-height: 68px;
                }
                .readme-quick-preset-preview.is-terminal-identity > .readme-preview-asset:last-child img {
                  width: 100%;
                  height: 68px;
                  object-fit: contain;
                }
                .readme-quick-preset-preview.is-terminal-portfolio {
                  display: grid;
                  grid-template-columns: minmax(0, 0.42fr) minmax(0, 0.58fr);
                  align-items: center;
                  gap: 8px;
                }
                .readme-quick-preset-preview.is-terminal-portfolio img {
                  max-height: 232px;
                  object-fit: contain;
                }
                .readme-quick-preset-preview.is-minimal,
                .readme-quick-preset-preview.is-polished,
                .readme-quick-preset-preview.is-expressive,
                .readme-quick-preset-preview.is-space-shooter {
                  display: grid;
                  gap: 7px;
                }
                .readme-quick-preset-preview.is-showcase {
                  display: grid;
                  gap: 7px;
                }
                .readme-showcase-preview-row {
                  display: grid;
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                  gap: 7px;
                }
                .readme-showcase-preview-row .readme-preview-asset {
                  min-height: 68px;
                }
                .readme-quick-preset-preview.is-minimal img,
                .readme-quick-preset-preview.is-polished img,
                .readme-quick-preset-preview.is-expressive img {
                  max-height: 150px;
                  object-fit: contain;
                }
                .readme-quick-preset-preview.is-minimal .readme-preview-asset:last-child img {
                  max-height: 72px;
                }
                .readme-quick-preset-preview.is-polished .readme-preview-asset:last-child img,
                .readme-quick-preset-preview.is-expressive .readme-preview-asset:last-child img {
                  max-height: 110px;
                }
                .readme-quick-preset-preview.is-space-shooter > .readme-preview-asset img {
                  max-height: 116px;
                  object-fit: contain;
                }
                .readme-space-shooter-preview {
                  position: relative;
                  display: grid;
                  min-height: 142px;
                  place-items: center;
                  overflow: hidden;
                  border: 1px solid rgba(88,166,255,0.2);
                  border-radius: 9px;
                  background: #080d12;
                }
                .readme-space-shooter-preview img {
                  width: 100%;
                  height: auto;
                  max-height: 164px;
                  object-fit: contain;
                  border-radius: 0;
                }
                .readme-space-shooter-preview span {
                  position: absolute;
                  right: 8px;
                  bottom: 7px;
                  padding: 4px 7px;
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 999px;
                  background: rgba(8,13,18,0.82);
                  color: #aebbc6;
                  font-size: 8.5px;
                  font-weight: 700;
                }
                /* The chooser uses the same real visual compositions as the live
                   preview, scaled into a stable thumbnail so cards never jump. */
                .readme-template-live {
                  position: relative;
                  height: 84px !important;
                  min-height: 84px !important;
                  max-height: 84px;
                  min-width: 0;
                  overflow: hidden;
                  border: 1px solid rgba(18,33,26,0.08);
                  border-radius: 10px;
                  background: #0b1110;
                }
                /* Template cards are intentionally local miniatures. Live SVGs
                   belong in the large preview, where their aspect ratio is known. */
                .readme-template-mini {
                  position: relative;
                  display: flex;
                  width: 100%;
                  height: 100%;
                  min-width: 0;
                  overflow: hidden;
                  align-items: center;
                  justify-content: center;
                  gap: 5px;
                  padding: 8px;
                  color: #eafff1;
                  background: linear-gradient(135deg, #111b20, #0a1115);
                  font-size: 10px;
                }
                .readme-template-mini b,
                .readme-template-mini strong,
                .readme-template-mini small,
                .readme-template-mini span { position: relative; z-index: 1; }
                .readme-template-mini b,
                .readme-template-mini strong { color: #f2fff6; font-size: 12px; }
                .readme-template-mini small { color: #7f9a8a; font-size: 7px; }
                .readme-template-mini i { display: block; border-radius: 2px; background: #36c982; }
                .readme-template-mini.is-mini-recruiter { display: grid; justify-content: stretch; align-content: center; gap: 2px; }
                .readme-template-mini.is-mini-recruiter > div { display: flex; gap: 3px; margin-top: 4px; }
                .readme-template-mini.is-mini-recruiter i { flex: 1; height: 5px; opacity: .7; }
                .readme-template-mini.is-mini-oss { justify-content: space-between; }
                .readme-template-mini.is-mini-neon-circuit {
                  display: grid;
                  align-content: center;
                  gap: 3px;
                  color: #dffcff;
                  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                  background: linear-gradient(135deg, #07131b, #15102b);
                }
                .is-mini-neon-circuit .mini-signal { color: #67f5ff; font-size: 7px; letter-spacing: .04em; }
                .is-mini-neon-circuit b { color: #f6f4ff; font-size: 14px; }
                .mini-neon-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 2px; margin-top: 4px; }
                .mini-neon-grid i { height: 5px; background: #25d9e7; opacity: .3; }
                .mini-neon-grid i:nth-child(3n) { background: #a78bfa; opacity: .92; }
                .mini-neon-grid i:nth-child(5n) { opacity: .58; }
                .mini-repo { display: grid; gap: 2px; }
                .mini-repo b { font-size: 9px; }
                .mini-bars { display: grid; gap: 3px; width: 30%; }
                .mini-bars i { height: 5px; }
                .mini-bars i:nth-child(2) { width: 75%; background: #58a6ff; }
                .mini-bars i:nth-child(3) { width: 52%; background: #b96cff; }
                .readme-template-mini.is-mini-terminal { display: grid; justify-content: stretch; align-content: center; gap: 2px; color: #64e095; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
                .is-mini-terminal b { color: #f2fff6; }
                .is-mini-terminal small { color: #71977e; }
                .readme-template-mini.is-mini-aura { display: grid; align-content: center; justify-content: stretch; gap: 3px; }
                .is-mini-aura b { color: #6df0a5; font-size: 13px; }
                .is-mini-aura > div { display: grid; grid-template-columns: repeat(14, 1fr); gap: 2px; }
                .is-mini-aura i { width: auto; height: 4px; opacity: .35; }
                .is-mini-aura i:nth-child(3n) { opacity: .9; }
                .is-mini-showcase { display: grid; grid-template-columns: 1.1fr .9fr; gap: 5px; justify-content: stretch; }
                .mini-hero { display: grid; align-content: center; gap: 3px; min-width: 0; }
                .mini-hero span { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid #4bd68a; border-radius: 50%; color: #7df0ac; font-size: 8px; }
                .mini-hero b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }
                .mini-cards { display: grid; gap: 3px; align-content: center; }
                .mini-cards i { height: 10px; background: #1b3a2b; border: 1px solid #2c6847; }
                .readme-template-mini.is-mini-wow { display: grid; grid-template-columns: .8fr 1.2fr; gap: 5px; justify-content: stretch; }
                .is-mini-wow > div { display: grid; place-items: center; border: 1px solid #28583d; background: #10241d; }
                .is-mini-wow strong { color: #6ef0a6; font-size: 18px; }
                .is-mini-wow small { font-size: 6px; }
                .is-mini-wow > b { align-self: center; color: #7debb0; font-size: 14px; overflow: hidden; }
                .readme-template-mini.is-mini-space { background: #080d13; }
                .mini-planet { position: absolute; right: 18%; top: 22%; width: 15px; height: 15px; border-radius: 50%; background: #4a8bdf; box-shadow: 0 0 10px #4a8bdf; }
                .mini-ship { position: absolute; left: 18%; bottom: 25%; width: 18px; height: 5px; background: #e7f8ff; transform: skew(-25deg); }
                .is-mini-space i { position: absolute; width: 2px; height: 2px; border-radius: 50%; background: #c9e7ff; }
                .is-mini-space i:nth-of-type(1) { left: 12%; top: 20%; }.is-mini-space i:nth-of-type(2) { left: 62%; top: 18%; }.is-mini-space i:nth-of-type(3) { left: 78%; bottom: 18%; }.is-mini-space i:nth-of-type(4) { left: 42%; bottom: 25%; }
                .readme-template-live .readme-quick-preset-preview {
                  height: 100%;
                  min-height: 0;
                  gap: 4px;
                  padding: 3px;
                  animation: none;
                }
                .readme-template-live .readme-preview-asset,
                .readme-template-live .readme-terminal-identity-pair .readme-preview-asset {
                  min-height: 0;
                  height: 100% !important;
                  border-radius: 6px;
                }
                .readme-template-live .readme-preview-asset picture,
                .readme-template-live .readme-preview-asset img {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                }
                .readme-template-live .readme-terminal-identity-pair {
                  height: 100%;
                  gap: 4px;
                }
                .readme-template-live .readme-showcase-preview-row {
                  height: 100%;
                  gap: 4px;
                }
                .readme-template-live .readme-showcase-preview-row .readme-preview-asset {
                  min-height: 0;
                  height: 100%;
                }
                .readme-template-live .readme-space-shooter-preview {
                  min-height: 0;
                  height: 100%;
                  border: 0;
                  border-radius: 6px;
                }
                .readme-quick-preset-preview.is-neon-circuit {
                  display: grid;
                  grid-template-rows: auto minmax(0, 1fr) minmax(34px, .46fr);
                  gap: 6px;
                  padding: 13px;
                  color: #eefcff;
                  background:
                    radial-gradient(180px 100px at 88% 0%, rgba(139,92,246,.28), transparent 72%),
                    radial-gradient(180px 100px at 0% 30%, rgba(34,211,238,.17), transparent 72%),
                    #071019;
                }
                .readme-quick-preset-preview.is-reference-readme-preview {
                  display: block;
                  overflow: auto;
                  padding: 8px;
                  background: #0d1117;
                }
                .readme-quick-preset-preview.is-reference-readme-preview img {
                  display: block;
                  width: 100%;
                  height: auto;
                  margin: 0 auto 10px;
                }
                .readme-quick-preset-preview.is-reference-readme-preview img:last-child {
                  margin-bottom: 0;
                }
                .readme-neon-circuit-heading {
                  display: grid;
                  gap: 3px;
                  padding: 4px 3px 8px;
                  border-bottom: 1px solid rgba(103,245,255,.2);
                  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                }
                .readme-neon-circuit-heading span { color: #67f5ff; font-size: 9px; letter-spacing: .08em; }
                .readme-neon-circuit-heading strong { color: #fff; font-size: 20px; letter-spacing: -.03em; }
                .readme-neon-circuit-heading small { color: #9aa9c7; font-size: 9px; }
                .readme-neon-circuit-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; min-height: 0; }
                .readme-quick-preset-preview.is-neon-circuit .readme-preview-asset { min-height: 0; height: 100%; border: 1px solid rgba(103,245,255,.16); background: rgba(12,25,37,.85); }
                .readme-quick-preset-preview.is-neon-circuit .readme-preview-asset img { object-fit: contain; }
                .readme-template-live .readme-space-shooter-preview img {
                  width: 100%;
                  height: 100%;
                  max-height: none;
                  object-fit: cover;
                }
                .readme-template-live > .readme-preview-asset {
                  height: 100% !important;
                }
                .readme-template-live > .readme-preview-asset img {
                  object-fit: cover;
                }
                .readme-template-wow-pair {
                  display: grid;
                  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
                  gap: 4px;
                  height: 100%;
                }
                .readme-template-wow-pair .readme-preview-asset {
                  min-height: 0;
                  height: 100%;
                  border: 0;
                  border-radius: 6px;
                }
                .readme-template-wow-pair .readme-preview-asset picture,
                .readme-template-wow-pair .readme-preview-asset img {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                }
                .readme-template-live.is-space-shooter-card {
                  padding: 0;
                  background: #070b10;
                }
                .readme-template-live.is-space-shooter-card img {
                  display: block;
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                }
                .readme-template-live .readme-space-shooter-preview span {
                  display: none;
                }
                .readme-template-live.is-terminal > .readme-preview-asset img {
                  object-fit: contain;
                  padding: 3px 8px;
                }
                .readme-template-live.is-showcase-card .readme-quick-preset-preview {
                  grid-template-rows: minmax(0, 1.05fr) minmax(0, 0.95fr);
                  gap: 4px;
                }
                .readme-template-live.is-showcase-card .readme-showcase-preview-row {
                  min-height: 0;
                }
                @media (max-width: 1100px) {
                  .readme-quick-grid { grid-template-columns: 1fr !important; }
                  .readme-quick-stage { margin-top: 12px; padding: 14px; border-radius: 22px; }
                  .readme-quick-result { min-height: min(62svh, 520px) !important; }
                }
                @media (max-width: 820px) {
                  .readme-quick-stage { margin-top: 10px; }
                  .readme-quick-form { padding: 16px; }
                  .readme-quick-result { padding: 14px; min-height: min(58svh, 480px) !important; }
                  .readme-quick-live { grid-template-rows: auto minmax(260px, auto) auto; }
                  .readme-quick-device { min-height: 260px; }
                  .readme-career-details-grid { grid-template-columns: 1fr !important; }
                  .readme-quick-actions a,
                  .readme-quick-actions button {
                    flex: 1 1 calc(50% - 8px);
                    justify-content: center;
                    text-align: center;
                  }
                  .readme-quick-live-meta {
                    align-items: flex-start;
                    flex-direction: column;
                  }
                  .readme-terminal-identity-pair {
                    grid-template-columns: 1fr !important;
                  }
                  .readme-quick-preset-preview.is-terminal-portfolio {
                    grid-template-columns: 1fr !important;
                  }
                }
                @media (max-width: 520px) {
                  .readme-style-grid { grid-template-columns: 1fr !important; }
                  .readme-starter-template-grid { grid-template-columns: 1fr !important; }
                  .readme-scan-strip { grid-template-columns: 1fr !important; }
                  .readme-username-helper {
                    align-items: flex-start;
                    flex-direction: column;
                  }
                  .readme-quick-actions a,
                  .readme-quick-actions button {
                    flex: 1 1 100%;
                  }
                  .readme-quick-result-head {
                    align-items: flex-start;
                    flex-direction: column;
                  }
                }
              `}</style>
            </div>
          )}
        </section>

        <section className="readme-summary-section" style={{ maxWidth: '1180px', margin: '0 auto 24px', padding: '0 20px', display: 'none' }}>
          <div className="readme-summary-strip">
            {[
              ['Profile', username.trim() || PLACEHOLDER_USERNAME],
              ['Goal', selectedGoal.label],
              ['Theme', selectedTheme.name],
              ['Agent', careerMode ? selectedRole.label : 'Off'],
            ].map(([label, value]) => (
              <div key={label} className="readme-summary-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Generator Form */}
        <section
          className="readme-editor-section"
          style={{
            maxWidth: workspaceMode === 'studio' ? 'none' : '1440px',
            margin: workspaceMode === 'studio' ? 0 : '0 auto',
            padding: workspaceMode === 'studio' ? 0 : '0 16px',
            display: workspaceMode === 'studio' ? 'block' : 'none',
          }}
        >
          <div
            ref={studioShellRef}
            className={`readme-video-editor-shell${studioGuideActive ? ` is-guiding guide-${studioGuideStepId}` : ''}`}
            data-testid="readme-editor-shell"
          >
            <div className="readme-video-topbar" data-testid="readme-editor-topbar">
              <Link href="/" className="readme-studio-brand" aria-label="Back to GitSkins home">
                GitSkins
              </Link>
              <div className="readme-studio-context">
                <p className="readme-studio-context-line">
                  <strong>{projectLoading ? 'Restoring…' : username.trim() || PLACEHOLDER_USERNAME}</strong>
                  <span aria-hidden="true">·</span>
                  <span>{selectedGoal.label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedTheme.name}</span>
                </p>
                <span
                  className={`readme-draft-state${saveState === 'error' ? ' is-error' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  {generatedReadme
                    ? saveState === 'saving'
                      ? 'Saving'
                      : saveState === 'saved'
                        ? 'Saved'
                        : saveState === 'error'
                          ? 'Save failed'
                          : 'Saved draft'
                    : 'Live draft'}
                </span>
              </div>
              <div className="readme-topbar-actions" data-testid="readme-editor-actions" data-guide-region="export">
                {(generatedReadme || liveDraftReadme || (studioGuideActive && studioGuideStepId === 'export')) && (
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    data-testid="readme-copy-markdown"
                    data-guide-target="export"
                    className={`readme-topbar-secondary${copied ? ' is-copied' : ''}${markdownLocked ? ' is-locked' : ''}`}
                    title={markdownLocked ? 'Upgrade or switch to the basic export before copying Markdown.' : 'Copy the current README Markdown'}
                  >
                    {copied ? 'Copied' : markdownLocked ? 'Copy locked' : 'Copy Markdown'}
                  </button>
                )}

                {(generatedReadme || liveDraftReadme || (studioGuideActive && studioGuideStepId === 'export')) && (
                  <button
                    type="button"
                    onClick={() => setShowPublishGuide(true)}
                    disabled={publishingPr || (!generatedReadme && !liveDraftReadme)}
                    className="readme-topbar-publish"
                    title="Open a pull request on your GitHub profile README repository"
                    data-testid="readme-publish-action"
                  >
                    Publish PR
                  </button>
                )}

                {!userIsPro && draftRequiresProExport ? (
                  <div className="readme-export-state" title={proExportReasons.join(', ')}>
                    <span>{premiumExportCredits > 0 ? 'Export credit ready' : `${ONE_TIME_EXPORT_PRICE_USD_LABEL} to export`}</span>
                    {premiumExportCredits > 0 ? (
                      <strong className="readme-export-credit-pill">1 ready</strong>
                    ) : (
                      <button type="button" className="readme-export-review" onClick={() => openExportPanel('copy')}>Review export</button>
                    )}
                    <button type="button" onClick={switchToFreeExport}>
                      Basic export
                    </button>
                  </div>
                ) : null}

                {studioGuideActive && studioGuideStepId === 'upgrade' && !userIsPro ? (
                  <Link href={checkoutHref} className="readme-studio-upgrade-link" data-guide-target="upgrade" onClick={() => analytics.trackFunnel('readme_upgrade_clicked', { source: 'guide_topbar', username: username.trim() || undefined })}>
                    Unlock Pro
                  </Link>
                ) : null}

                <div className={`readme-topbar-menu${topbarMenuOpen ? ' is-open' : ''}`} ref={topbarMenuRef}>
                  <button
                    type="button"
                    className="readme-topbar-menu-trigger"
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={topbarMenuOpen}
                    onClick={() => setTopbarMenuOpen((open) => !open)}
                  >
                    <span />
                    <span />
                    <span />
                  </button>
                  {topbarMenuOpen && (
                    <div className="readme-topbar-menu-panel" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          void downloadReadme().then((done) => { if (done) setTopbarMenuOpen(false); });
                        }}
                        disabled={!generatedReadme && !liveDraftReadme}
                        data-testid="readme-export-action"
                      >
                        Download README.md
                      </button>
                      <Link href="/dashboard" role="menuitem" className="readme-dashboard-link" onClick={() => setTopbarMenuOpen(false)}>
                        Projects
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          switchWorkspaceMode('quick', 'topbar_menu');
                          setTopbarMenuOpen(false);
                        }}
                      >
                        Quick mode
                      </button>
                      {!planLoading && !userIsPro ? (
                        <Link
                          href={checkoutHref}
                          role="menuitem"
                          className="readme-studio-upgrade-link"
                          onClick={() => {
                            analytics.trackFunnel('readme_upgrade_clicked', { source: 'topbar_menu', username: username.trim() || undefined });
                            setTopbarMenuOpen(false);
                          }}
                        >
                          Unlock Pro
                        </Link>
                      ) : null}
                      {!userIsPro && draftRequiresProExport ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="readme-menu-free-export"
                          onClick={() => {
                            switchToFreeExport();
                            setTopbarMenuOpen(false);
                          }}
                        >
                          Basic export
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="readme-studio-guide-restart"
                        onClick={() => {
                          restartStudioGuide();
                          setTopbarMenuOpen(false);
                        }}
                      >
                        {studioGuideActive ? 'Restart guide' : 'Studio guide'}
                      </button>
                      <Link
                        href="/readme-studio-tutorial"
                        role="menuitem"
                        className="readme-studio-help-link"
                        onClick={() => setTopbarMenuOpen(false)}
                      >
                        Studio tutorial
                      </Link>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="readme-topbar-primary"
                  onClick={generateReadme}
                  disabled={isLoading || (authenticated && !usageAllowed)}
                  data-testid="readme-generate-action"
                  data-guide-target={!authenticated ? 'signin' : undefined}
                >
                  {isLoading ? 'Creating draft...' : !authenticated ? 'Sign in to draft' : generatedReadme ? 'Regenerate draft' : 'Create draft'}
                </button>
              </div>
            </div>

            <aside className="readme-media-bin" data-testid="readme-media-bin" data-guide-region="profile">
              <div className="readme-panel-tabs">
                {[
                  ['profile', 'Profile'],
                  ['visuals', 'Visuals'],
                  ['links', 'Links'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`${label} media bin`}
                    onClick={() => setMediaBinTab(id as MediaBinTab)}
                    className={mediaBinTab === id ? 'active' : ''}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mediaBinTab === 'profile' && (
                <div className="readme-media-tab-panel">
                  {showFirstRun && !generatedReadme ? (
                    <div className="readme-firstrun">
                      <button type="button" className="readme-firstrun-close" onClick={dismissFirstRun} aria-label="Dismiss">×</button>
                      <h2>Draft a polished profile README from one username.</h2>
                      <p className="readme-firstrun-copy">
                        GitSkins scans public profile signal, picks a clean structure, and fills the center preview with a README you can refine.
                      </p>
                      <label className="readme-editor-field readme-firstrun-field" data-guide-target="profile">
                        <span>GitHub username</span>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter your GitHub username"
                          onKeyDown={(e) => e.key === 'Enter' && generateReadme()}
                        />
                      </label>
                      <div className="readme-firstrun-actions">
                        <button
                          type="button"
                          className="readme-firstrun-cta"
                          data-guide-target="profile-cta"
                          onClick={() => {
                            void generateReadme();
                          }}
                          disabled={isLoading || (authenticated && !usageAllowed)}
                        >
                          {isLoading ? 'Scanning...' : 'Scan and draft'}
                        </button>
                        <button
                          type="button"
                          className="readme-firstrun-secondary"
                          onClick={() => {
                            setUsername(DEMO_PROFILE_USERNAME);
                            applyPreset(DEFAULT_STUDIO_PRESET);
                            setViewMode('preview');
                            if (studioGuideActive && studioGuideStepId === 'profile') {
                              advanceStudioGuide();
                            } else {
                              dismissFirstRun();
                            }
                          }}
                        >
                          Use demo profile
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="readme-editor-field" data-guide-target="profile">
                      <span>GitHub Username</span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your GitHub username"
                        onKeyDown={(e) => e.key === 'Enter' && generateReadme()}
                      />
                    </label>
                  )}
                  <div className="readme-studio-logo-picker">
                    <strong>Language logos</strong>
                    <span>Detected from GitHub. Remove any you don’t want.</span>
                    <div className="readme-language-logo-chips" aria-label="Selected language logos">
                      {(languageLogos.length ? languageLogos : ['Loading from GitHub…']).map((logo) => (
                        <span key={logo} className={logo === 'Loading from GitHub…' ? 'is-loading' : ''}>
                          {logo}
                          {logo !== 'Loading from GitHub…' && <button type="button" aria-label={`Remove ${logo}`} onClick={() => setLanguageLogos((current) => current.filter((item) => item !== logo))}>×</button>}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="readme-preset-block">
                    <span className="readme-preset-label">Quick start templates</span>
                    <div className="readme-preset-grid">
                      {STUDIO_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={`readme-preset-card${activePreset === preset.id ? ' active' : ''}${preset.pro && !userIsPro ? ' pro-export' : ''}`}
                          onClick={() => {
                            applyPreset(preset);
                            if (preset.pro && !userIsPro) showToast(premiumExportCredits > 0
                                ? 'Premium visuals loaded. One paid export credit is ready.'
                                : `Premium visuals loaded. Export this README for ${ONE_TIME_EXPORT_PRICE_USD_LABEL}.`);
                          }}
                          style={{ '--preset-accent': preset.accent } as React.CSSProperties}
                        >
                          {preset.pro && !userIsPro ? <em className="readme-pro-tag corner">Premium</em> : null}
                          <div className={`readme-template-thumb compact is-${preset.id}`} aria-hidden="true">
                            <span />
                            <span />
                            <span />
                            <span />
                            <span />
                          </div>
                          <strong>{preset.name}</strong>
                          <small>{preset.tagline}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="readme-mini-summary">
                    <span>Current target</span>
                    <strong>{username.trim() || PLACEHOLDER_USERNAME} / README.md</strong>
                    <p>{selectedGoal.description}</p>
                  </div>
                  <div className="readme-profile-scan-panel">
                    <span>AI scan sources</span>
                    {aiScanSignals.slice(0, 4).map((signal) => (
                      <div key={signal.label}>
                        <small>{signal.label}</small>
                        <strong>{signal.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      border: '1px solid rgba(52,209,125,0.24)',
                      borderRadius: 10,
                      background: 'rgba(52,209,125,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                      <strong style={{ display: 'block', color: 'var(--mk-ink)', fontSize: 11.5 }}>Add animated visuals in Advanced Studio</strong>
                      <small style={{ display: 'block', color: 'var(--mk-ink-2)', fontSize: 10.5, lineHeight: 1.4, marginTop: 2 }}>
                        Chess, Space Shooter, Snake Trail, Erased, 3D Wordmark, and ASCII Portrait are ready to add to your README.
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchWorkspaceMode('studio', 'quick-animated-library')}
                      style={{ flex: '0 0 auto', minHeight: 30, padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(52,209,125,0.42)', background: '#34d17d', color: '#07130d', cursor: 'pointer', fontSize: 10.5, fontWeight: 900 }}
                    >
                      Open visual library
                    </button>
                  </div>
                </div>
              )}

              {mediaBinTab === 'visuals' && (
                <div className="readme-media-tab-panel">
                  <div className="readme-bin-grid">
                    {themes.map((item) => {
                      const locked = isThemeLocked(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTheme(item.id);
                            if (locked) showToast('Premium theme selected. Upgrade only when you export.');
                          }}
                          className={`${theme === item.id ? 'active' : ''}${locked ? ' pro-export' : ''}`}
                          style={{ '--theme-color': item.color } as CSSProperties}
                        >
                          <span />
                          {item.name}
                          {locked ? <small>Premium</small> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="readme-asset-snippets" data-guide-region="visual">
                    <h3>Animated library</h3>
                    <p style={{ margin: 0, color: 'var(--mk-ink-2)', fontSize: 11, lineHeight: 1.45 }}>
                      Pick a visual, add it to the suggested section, and it will appear in your README preview immediately. You can keep editing before export.
                    </p>
                    <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                      {animatedAssetLibrary.map((item) => {
                        const targetAssets = [
                          ...(defaultSectionAssets[item.target] ?? []),
                          ...(sectionAssets[item.target] ?? []),
                        ];
                        const included = item.kind === 'asset'
                          ? targetAssets.includes(item.asset)
                          : item.kind === 'space'
                            ? spaceShooter
                            : heatmapStyle === item.heatmapStyle;
                        const preview = item.kind === 'space'
                          ? '/showcase/space-shooter.gif'
                          : item.kind === 'heatmap'
                            ? `/api/section/heatmap?username=${encodeURIComponent(username.trim().replace(/^@/, '') || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}&style=${item.heatmapStyle}`
                            : animatedSectionPreview.find((section) => section.id === item.asset)?.url;
                        return (
                          <div
                            key={item.id}
                            style={{
                              border: `1px solid ${included ? '#34d17d' : 'rgba(255,255,255,0.10)'}`,
                              background: included ? 'rgba(52,209,125,0.10)' : '#0f1117',
                              borderRadius: 9,
                              padding: 8,
                            }}
                          >
                            {preview ? (
                              <img
                                src={preview}
                                alt={`${item.label} animated README preview`}
                                loading="lazy"
                                style={{ width: '100%', aspectRatio: item.kind === 'space' ? '3.7 / 1' : '3.1 / 1', objectFit: 'cover', display: 'block', borderRadius: 6, background: '#080b10' }}
                              />
                            ) : null}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start', marginTop: 7 }}>
                              <div style={{ minWidth: 0 }}>
                                <strong style={{ display: 'block', color: 'var(--mk-ink)', fontSize: 12 }}>{item.label}</strong>
                                <small style={{ display: 'block', color: 'var(--mk-ink-2)', fontSize: 10.5, lineHeight: 1.35, marginTop: 2 }}>{item.description}</small>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.kind === 'space') addSpaceShooterToReadme();
                                  else if (item.kind === 'heatmap') addHeatmapStyleToReadme(item.heatmapStyle);
                                  else insertAssetIntoSection(item.asset, item.target);
                                }}
                                aria-pressed={included}
                                style={{ flex: '0 0 auto', minHeight: 28, padding: '5px 8px', borderRadius: 999, border: `1px solid ${included ? '#34d17d' : 'rgba(52,209,125,0.42)'}`, background: included ? '#34d17d' : 'transparent', color: included ? '#07130d' : '#6ee7b7', cursor: 'pointer', fontSize: 10.5, fontWeight: 900 }}
                              >
                                {included ? 'Added' : 'Add to README'}
                              </button>
                            </div>
                            <small style={{ display: 'block', color: 'var(--mk-ink-2)', fontSize: 9.5, marginTop: 6 }}>Goes to {labelForSectionId(item.target)}</small>
                          </div>
                        );
                      })}
                    </div>
                    <h3 style={{ marginTop: 8 }}>Section visuals</h3>
                    {animatedSectionPreview.map((section) => {
                      const isDefaultAsset = selectedDefaultAssets.includes(section.id);
                      const isManualAsset = selectedManualAssets.includes(section.id);
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => {
                            insertAssetIntoSelectedSection(section.id);
                            if (studioGuideActive && studioGuideStepId === 'visual') {
                              advanceStudioGuide();
                            }
                          }}
                          disabled={isDefaultAsset || isManualAsset}
                          className={isDefaultAsset ? 'default' : isManualAsset ? 'active' : ''}
                        >
                          <span>{section.label}</span>
                          <small>{isDefaultAsset ? 'Default visual' : isManualAsset ? 'Added' : animatedSectionDescriptions[section.id]}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {mediaBinTab === 'links' && (
                <div className="readme-media-tab-panel">
                  {[
                    ['Website', socialWebsite, setSocialWebsite, 'gitskins.com'],
                    ['X', socialX, setSocialX, 'octocat'],
                    ['LinkedIn', socialLinkedIn, setSocialLinkedIn, 'in/username'],
                    ['Email', socialEmail, setSocialEmail, 'hello@example.com'],
                  ].map(([label, value, setter, placeholder]) => (
                    <label key={label as string} className="readme-editor-field compact">
                      <span>{label as string}</span>
                      <input
                        type="text"
                        value={value as string}
                        onChange={(event) => (setter as (next: string) => void)(event.target.value)}
                        placeholder={placeholder as string}
                      />
                    </label>
                  ))}
                </div>
              )}
            </aside>

            <section className="readme-player-monitor" data-testid="readme-preview-monitor">
              <div className="readme-monitor-header">
                <span>README Preview</span>
                <strong>Editing: {selectedSectionInspector.title}</strong>
                <div className="readme-monitor-actions">
                  {[
                    ['preview', 'Preview'],
                    ['github', 'GitHub view'],
                    ['markdown', 'Markdown'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={`${label} canvas`}
                      onClick={() => {
                        if (id !== 'markdown') {
                          switchCanvasView(id as CanvasView, 'monitor_tabs');
                          return;
                        }
                        if (markdownLocked) {
                          openExportPanel('view', proExportReasons);
                          return;
                        }
                        // The raw tab hands over the whole document as
                        // selectable text, so reading it is copying it. It has
                        // to cost what the Copy button costs, or it is just an
                        // easier side door around the same gate.
                        void authorizeExport('view').then((allowed) => {
                          if (allowed) switchCanvasView(id as CanvasView, 'monitor_tabs');
                        });
                      }}
                      className={`${viewMode === id ? 'active' : ''}${id === 'markdown' && markdownLocked ? ' locked' : ''}`}
                      title={id === 'markdown' && markdownLocked ? 'Markdown export is available after upgrading or switching to the free export.' : undefined}
                    >
                      {label}
                      {id === 'markdown' && markdownLocked ? <small>Pro</small> : null}
                    </button>
                  ))}
                </div>
              </div>
              <div className="readme-document-frame">
                {viewMode !== 'markdown' ? (
                  <div
                    className={`readme-document-preview readme-gitskins-preview ${viewMode === 'github' ? 'github-mode' : ''}`}
                    data-testid="readme-generated-preview"
                  >
                    {activePreset === 'neon-circuit' && !generatedReadme ? (
                      <div className="readme-advanced-reference-preview">
                        <div className="readme-preview-sourcebar">
                          <span>Signature profile</span>
                          <strong>Reference-style README preview</strong>
                        </div>
                        <img src={`/api/readme-reference/hero?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}&role=${encodeURIComponent(professionalRole || 'FULL-STACK DEVELOPER · BUILDER')}`} alt="Reference-style README hero" />
                        <h2>⚡ whoami</h2>
                        <pre>{`const ${username.trim().replace(/[^a-zA-Z0-9_$]/g, '_') || 'developer'}: Developer = {
  name: "${profileData?.name || username.trim() || DEMO_PROFILE_USERNAME}",
  role: "${professionalRole || 'Full-Stack Developer · Builder'}",
  stack: ["JavaScript", "TypeScript", "React", "Node.js"],
  currently: "${currentFocusText || 'Building in public'}",
};`}</pre>
                        <blockquote>{profileData?.bio || 'A developer profile built from public GitHub data, projects, and activity.'}</blockquote>
                        <img src={`/api/readme-reference/divider?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}`} alt="Reference-style README divider" />
                        <h2>🛠️ What Keeps Me Busy</h2>
                        <img src={`/api/readme-reference/focus?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}&location=${encodeURIComponent(profileData?.bio || '')}&focus=${encodeURIComponent(currentFocusText || 'BUILDING IN PUBLIC|OPEN SOURCE|ALWAYS LEARNING')}`} alt="Reference-style README focus cards" />
                        <img src={`/api/readme-reference/divider?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}`} alt="Reference-style README divider" />
                        <h2>⚔️ Tech Arsenal</h2>
                        <img src={`/api/readme-reference/technology-stack?logos=${encodeURIComponent((languageLogos.length ? languageLogos : ['JavaScript', 'TypeScript', 'React']).join(','))}`} alt="Technology stack logos" />
                        <img src={`/api/readme-reference/divider?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}`} alt="Reference-style README divider" />
                        <h2>🌌 Featured Projects</h2>
                        <img src={`/api/section/projects?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=neon&style=terminal`} alt="Featured projects" />
                        <img src={`/api/readme-reference/divider?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}`} alt="Reference-style README divider" />
                        <h2>📊 GitHub Stats</h2>
                        <div className="readme-advanced-reference-stats">
                          <img src={`/api/section/stats?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=neon&style=terminal`} alt="GitHub stats" />
                          <img src={`/api/section/heatmap?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=neon`} alt="Contribution activity" />
                        </div>
                        <img src={`/api/readme-reference/divider?username=${encodeURIComponent(username.trim() || DEMO_PROFILE_USERNAME)}&theme=${encodeURIComponent(theme)}`} alt="Reference-style README divider" />
                        <h2>🤝 Let&apos;s Build Something Meaningful</h2>
                        <p>Open to meaningful collaborations, useful products, and ambitious ideas.</p>
                      </div>
                    ) : <>
                    <div className="readme-preview-sourcebar">
                      <span>{previewDocumentMode}</span>
                      <strong>{generatedReadme ? 'Rendering exported markdown' : 'Updates as you edit controls'}</strong>
                    </div>
                    <div className="readme-preview-profile">
                      <img
                        src={profileData?.avatarUrl || `https://github.com/${username.trim() || DEMO_PROFILE_USERNAME}.png`}
                        alt={`${username.trim() || DEMO_PROFILE_USERNAME} GitHub avatar`}
                      />
                      <div>
                        <span>{previewDocumentMode}</span>
                        <h1>{previewDocumentTitle}</h1>
                        <p>{previewDocumentSummary}</p>
                      </div>
                    </div>

                    {previewPinnedSection && (
                      <section
                        className={`readme-preview-section pinned ${previewPinnedSection.id === selectedSection ? 'selected' : ''}`}
                        data-section={previewPinnedSection.id}
                        data-readme-section={previewPinnedSection.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectReadmeSection(previewPinnedSection.id)}
                        onKeyDown={(event) => selectSectionOnKey(event, previewPinnedSection)}
                      >
                        {renderPreviewSectionBody(previewPinnedSection, null)}
                      </section>
                    )}

                    <Reorder.Group
                      as="div"
                      axis="y"
                      className="readme-preview-reorder-group"
                      values={previewDraggableKeys}
                      onReorder={(nextKeys) => reorderPreviewSections(nextKeys, previewDraggableSections)}
                    >
                      {previewDraggableSections.map((section) => (
                        <DraggablePreviewSection
                          key={section.key}
                          sectionKey={section.key}
                          sectionId={section.id}
                          selected={section.id === selectedSection}
                          onSelect={() => selectReadmeSection(section.id)}
                          onSelectKey={(event) => selectSectionOnKey(event, section)}
                        >
                          {(controls) => renderPreviewSectionBody(section, controls)}
                        </DraggablePreviewSection>
                      ))}
                    </Reorder.Group>
                    </>}
                  </div>
                ) : (
                  <pre className="readme-document-code">{generatedReadme ?? liveDraftReadme}</pre>
                )}
              </div>
            </section>

            <aside ref={propertiesPanelRef} className="readme-properties-panel" data-testid="readme-properties-panel" data-guide-region="goal">
              <div className="readme-panel-tabs">
                {[
                  ['content', 'Content'],
                  ['style', 'Style'],
                  ['agent', 'Agent'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`${label} inspector`}
                    onClick={() => {
                      analytics.trackFunnel('readme_inspector_tab_changed', {
                        from: inspectorTab,
                        to: id,
                        selected_section: selectedSection,
                      });
                      setInspectorTab(id as InspectorTab);
                    }}
                    className={inspectorTab === id ? 'active' : ''}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {!userIsPro && !draftRequiresProExport ? (
                <div className={`readme-pro-value-card${draftRequiresProExport ? ' has-pro-draft' : ''}`}>
                  <div className="readme-pro-value-head">
                    <div>
                      <span>{draftRequiresProExport ? 'Premium choices active' : 'Free draft mode'}</span>
                      <strong>{draftRequiresProExport ? `Export once for ${ONE_TIME_EXPORT_PRICE_USD_LABEL}.` : 'Your basic README is exportable.'}</strong>
                    </div>
                    <Link href={draftRequiresProExport ? exportCheckoutHref : checkoutHref} onClick={() => analytics.trackFunnel('readme_upgrade_clicked', { source: 'value_card', username: username.trim() || undefined, draft_requires_pro_export: draftRequiresProExport, plan: draftRequiresProExport ? 'export' : undefined })}>{draftRequiresProExport ? `Export ${ONE_TIME_EXPORT_PRICE_USD_LABEL}` : 'Upgrade'}</Link>
                  </div>
                  <div className="readme-pro-value-grid">
                    <div>
                      <span>Free</span>
                      <strong>1 account draft</strong>
                      <small>Complete README export with free themes and core sections</small>
                    </div>
                    <div>
                      <span>Pro</span>
                      <strong>Premium export</strong>
                      <small>AI refinement, premium visuals, all themes, no watermark</small>
                    </div>
                  </div>
                  {draftRequiresProExport ? (
                    <button type="button" className="readme-free-export-button" onClick={switchToFreeExport}>
                      Switch to free export
                    </button>
                  ) : null}
                </div>
              ) : null}

              {inspectorTab === 'content' && (
                <>
                  <div className="readme-selected-section">
                    <span>Selected Section</span>
                    <h3>{selectedSectionInspector.title}</h3>
                    <p>{selectedSectionInspector.description}</p>
                    <button
                      type="button"
                      onClick={() => toggleSection(selectedSection)}
                      className={sections.includes(selectedSection) ? 'active' : ''}
                    >
                      {sections.includes(selectedSection) ? 'Included in README' : 'Add to README'}
                    </button>
                    <details className="readme-section-details">
                      <summary>
                        <span>Fine tune this section</span>
                        <small>Order, controls, and visuals</small>
                      </summary>
                      <div className="readme-section-order-controls">
                        <button
                          type="button"
                          onClick={() => moveSelectedSection(-1)}
                          disabled={!selectedSectionIsIncluded || selectedSectionIndex <= 0}
                        >
                          Move earlier
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSelectedSection(1)}
                          disabled={!selectedSectionIsIncluded || selectedSectionIndex >= sections.length - 1}
                        >
                          Move later
                        </button>
                      </div>
                      <div>
                        {selectedSectionInspector.controls.map((control) => (
                          <strong key={control}>{control}</strong>
                        ))}
                      </div>
                      <div className="readme-section-brief">
                        <span>Section brief</span>
                        <div>
                          <small>Focus</small>
                          <p>{selectedSectionWorkflow.focus}</p>
                        </div>
                        <div>
                          <small>AI handling</small>
                          <p>{selectedSectionWorkflow.ai}</p>
                        </div>
                        <div>
                          <small>Output</small>
                          <p>{selectedSectionWorkflow.output}</p>
                        </div>
                      </div>
                      <div className="readme-context-controls">
                        <span>Section controls</span>
                      {selectedSection === 'header' && (
                        <>
                          <label className="readme-editor-check">
                            <span>Typing headline</span>
                            <input type="checkbox" checked={typingHeadline} onChange={(event) => setTypingHeadline(event.target.checked)} />
                          </label>
                          <label className="readme-editor-check">
                            <span>Avatar block</span>
                            <input type="checkbox" checked={avatarBlock} onChange={(event) => setAvatarBlock(event.target.checked)} />
                          </label>
                          <label className="readme-editor-field compact">
                            <span>Headline lines</span>
                            <textarea value={typingLines} onChange={(event) => setTypingLines(event.target.value)} rows={3} />
                          </label>
                        </>
                      )}

                      {selectedSection === 'about' && (
                        <>
                          <div className="readme-token-list">
                            {toneOptions.map((option) => (
                              <button key={option.id} type="button" onClick={() => setTone(option.id)} className={tone === option.id ? 'active' : ''}>
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <select value={careerRole} onChange={(event) => setCareerRole(event.target.value as CareerRole)}>
                            {careerRoles.map((role) => (
                              <option key={role.id} value={role.id}>{role.label}</option>
                            ))}
                          </select>
                        </>
                      )}

                      {selectedSection === 'skills' && (
                        <>
                          <div className="readme-segmented">
                            {[
                              ['compact', 'Compact'],
                              ['balanced', 'Balanced'],
                              ['expanded', 'Expanded'],
                            ].map(([id, label]) => (
                              <button key={id} type="button" onClick={() => setSkillDensity(id as SkillDensity)} className={skillDensity === id ? 'active' : ''}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <label className="readme-editor-check">
                            <span>Stack visual</span>
                            <input
                              type="checkbox"
                              checked={selectedSectionAssets.includes('stack')}
                              onChange={(event) => (event.target.checked ? insertAssetIntoSelectedSection('stack') : removeAssetFromSelectedSection('stack'))}
                            />
                          </label>
                        </>
                      )}

                      {selectedSection === 'projects' && (
                        <>
                          <div className="readme-stepper-control">
                            <span>Featured projects</span>
                            <div>
                              {[1, 2, 3].map((count) => (
                                <button
                                  key={count}
                                  type="button"
                                  onClick={() => setProjectCount(count)}
                                  className={projectCount === count ? 'active' : ''}
                                >
                                  {count}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="readme-segmented">
                            {[
                              ['impact', 'Impact'],
                              ['technical', 'Technical'],
                              ['visual', 'Visual'],
                            ].map(([id, label]) => (
                              <button key={id} type="button" onClick={() => setProjectEmphasis(id as ProjectEmphasis)} className={projectEmphasis === id ? 'active' : ''}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      {selectedSection === 'stats' && (
                        <>
                          <label className="readme-editor-check">
                            <span>Stats visual</span>
                            <input
                              type="checkbox"
                              checked={selectedSectionAssets.includes('stats')}
                              onChange={(event) => (event.target.checked ? insertAssetIntoSelectedSection('stats') : removeAssetFromSelectedSection('stats'))}
                            />
                          </label>
                          <label className="readme-editor-check">
                            <span>GitHub trophies</span>
                            <input type="checkbox" checked={githubTrophies} onChange={(event) => setGithubTrophies(event.target.checked)} />
                          </label>
                        </>
                      )}

                      {selectedSection === 'heatmap' && (
                        <>
                          <div>
                            <div className="readme-quick-field-label" style={{ marginBottom: 9 }}>Contribution animation</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                              {([
                                ['aura', 'Classic'],
                                ['jet', 'Jet Runner'],
                                ['erased', 'Erased'],
                                ['snake', 'Snake Trail'],
                              ] as const).map(([id, label]) => {
                                const previewParams = new URLSearchParams({
                                  username: username.trim().replace(/^@/, '') || DEMO_PROFILE_USERNAME,
                                  theme,
                                });
                                if (id !== 'aura') previewParams.set('style', id);
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => {
                                      setHeatmapStyle(id);
                                      setJetHeatmap(id === 'jet');
                                    }}
                                    aria-pressed={heatmapStyle === id}
                                    style={{
                                      minWidth: 0,
                                      padding: 7,
                                      borderRadius: 8,
                                      border: `1px solid ${heatmapStyle === id ? '#16a34a' : 'rgba(18,33,26,0.14)'}`,
                                      background: heatmapStyle === id ? '#eef9f1' : '#fff',
                                      color: '#12211a',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <img
                                      src={`/api/section/heatmap?${previewParams.toString()}`}
                                      alt=""
                                      loading="lazy"
                                      style={{ width: '100%', aspectRatio: '3.25 / 1', objectFit: 'cover', display: 'block', borderRadius: 5, background: '#080b10' }}
                                    />
                                    <strong style={{ display: 'block', marginTop: 7, fontSize: 11 }}>{label}</strong>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div style={{ marginTop: 12, padding: 10, border: `1px solid ${spaceShooter ? '#16a34a' : 'rgba(18,33,26,0.14)'}`, borderRadius: 8, background: spaceShooter ? '#eef9f1' : '#fff' }}>
                            <button
                              type="button"
                              onClick={() => setSpaceShooter((enabled) => !enabled)}
                              aria-pressed={spaceShooter}
                              style={{ width: '100%', padding: 0, border: 0, background: 'transparent', color: '#12211a', cursor: 'pointer', textAlign: 'left' }}
                            >
                              <img
                                src="/showcase/space-shooter.gif"
                                alt="Animated contribution Space Shooter preview"
                                loading="lazy"
                                style={{ width: '100%', aspectRatio: '3.7 / 1', objectFit: 'cover', display: 'block', borderRadius: 5, background: '#080b10' }}
                              />
                              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, alignItems: 'center' }}>
                                <strong style={{ fontSize: 11 }}>Space Shooter</strong>
                                <small style={{ color: spaceShooter ? 'var(--mk-accent-deep)' : 'var(--mk-text-muted)', fontWeight: 800 }}>{spaceShooter ? 'Included' : 'Add game'}</small>
                              </span>
                            </button>
                            {spaceShooter && (
                              <>
                                <div className="readme-segmented" style={{ marginTop: 9 }}>
                                  {(['random', 'row', 'column'] as const).map((strategy) => (
                                    <button key={strategy} type="button" onClick={() => setSpaceShooterStrategy(strategy)} className={spaceShooterStrategy === strategy ? 'active' : ''}>
                                      {strategy[0].toUpperCase() + strategy.slice(1)}
                                    </button>
                                  ))}
                                </div>
                                <p style={{ margin: '9px 2px 0', color: '#4c5a52', fontSize: 10.5, lineHeight: 1.45 }}>
                                  Publish PR installs the daily workflow automatically.
                                </p>
                                {setupInstructions?.files.map((file) => (
                                  <button
                                    key={file.path}
                                    type="button"
                                    className="mk-btn-ghost"
                                    onClick={() => void copySetupFile(file.path, file.content)}
                                    style={{ width: '100%', marginTop: 8, minHeight: 32, cursor: 'pointer', fontSize: 10.5 }}
                                  >
                                    {copiedSetupPath === file.path ? 'Workflow copied' : 'Copy workflow manually'}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                          {heatmapStyle === 'erased' && (
                          <div style={{ marginTop: 14 }}>
                            <div
                              className="readme-quick-field-label"
                              style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}
                            >
                              <span>Try it, drag across your graph</span>
                              {/* The panel here is narrow; the full page has room
                                  for the graph at full size plus the recorder. */}
                              <a
                                href={`/erased${username.trim() ? `?u=${encodeURIComponent(username.trim().replace(/^@/, ''))}` : ''}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: '#41d8c5', fontWeight: 600, textDecoration: 'none', fontSize: 12 }}
                              >
                                Open full playground
                              </a>
                            </div>
                            <ErasedCanvas
                              username={username}
                              accent={selectedTheme.color}
                              compact
                              emptyHint="Enter your GitHub username above to load your real contribution graph."
                            />
                          </div>
                          )}
                        </>
                      )}

                      {selectedSection === 'streak' && (
                        <>
                          <label className="readme-editor-check">
                            <span>Contribution snake</span>
                            <input type="checkbox" checked={contributionSnake} onChange={(event) => setContributionSnake(event.target.checked)} />
                          </label>
                          <label className="readme-editor-check">
                            <span>Visitor counter</span>
                            <input type="checkbox" checked={visitorCounter} onChange={(event) => setVisitorCounter(event.target.checked)} />
                          </label>
                        </>
                      )}

                      {selectedSection === 'connect' && (
                        <>
                          <div className="readme-segmented">
                            {[
                              ['social-row', 'Social row'],
                              ['contact-card', 'Card'],
                              ['minimal', 'Minimal'],
                            ].map(([id, label]) => (
                              <button key={id} type="button" onClick={() => setConnectLayout(id as ConnectLayout)} className={connectLayout === id ? 'active' : ''}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <label className="readme-editor-field compact">
                            <span>CTA text</span>
                            <textarea value={connectCta} onChange={(event) => setConnectCta(event.target.value)} rows={2} />
                          </label>
                        </>
                      )}
                      </div>
                      <div className="readme-inserted-assets">
                        <span>Visuals in this section</span>
                        {selectedSectionAssets.length ? (
                          selectedSectionAssets.map((asset) => {
                            const assetLabel = animatedSections.find((item) => item.id === asset)?.label ?? asset;
                            const isDefaultAsset = selectedDefaultAssets.includes(asset);
                            return (
                              <button
                                key={asset}
                                type="button"
                                onClick={() => removeAssetFromSelectedSection(asset)}
                                className={isDefaultAsset ? 'default' : ''}
                              >
                                {assetLabel}
                                <small>{isDefaultAsset ? 'Default · Remove' : 'Remove'}</small>
                              </button>
                            );
                          })
                        ) : (
                          <p>No visuals in this section.</p>
                        )}
                      </div>
                    </details>
                  </div>

                  <div className="readme-property-group" data-guide-spotlight="goal">
                    <h3>README Goal</h3>
                    <div className="readme-option-stack">
                      {goalOptions.map((option) => {
                        const isActive = goal === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => {
                              setGoal(option.id);
                              if (studioGuideActive && studioGuideStepId === 'goal') {
                                advanceStudioGuide();
                              }
                            }}
                            className={isActive ? 'active' : ''}
                          >
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedSection === 'connect' && (
                    <div className="readme-property-group">
                      <h3>Social Links</h3>
                      {[
                        ['Website', socialWebsite, setSocialWebsite, 'gitskins.com'],
                        ['X', socialX, setSocialX, 'octocat'],
                        ['LinkedIn', socialLinkedIn, setSocialLinkedIn, 'in/username'],
                        ['Email', socialEmail, setSocialEmail, 'hello@example.com'],
                      ].map(([label, value, setter, placeholder]) => (
                        <label key={label as string} className="readme-editor-field compact">
                          <span>{label as string}</span>
                          <input
                            type="text"
                            value={value as string}
                            onChange={(event) => (setter as (next: string) => void)(event.target.value)}
                            placeholder={placeholder as string}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}

              {inspectorTab === 'style' && (
                <>
                  <div className="readme-property-group">
                    <h3>Style</h3>
                    <div className="readme-segmented">
                      {styleOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setStyle(option.id)}
                          className={style === option.id ? 'active' : ''}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="readme-property-group">
                    <h3>Design</h3>
                    <div className="readme-segmented">
                      <button
                        type="button"
                        onClick={() => setSectionStyle('aura')}
                        className={sectionStyle === 'aura' ? 'active' : ''}
                      >
                        Aura
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSectionStyle('terminal');
                          if (!userIsPro) showToast('Terminal design selected. Upgrade only when you export.');
                        }}
                        className={`${sectionStyle === 'terminal' ? 'active' : ''}${!userIsPro ? ' pro-export' : ''}`}
                      >
                        Terminal{!userIsPro ? <small className="readme-pro-tag">Premium</small> : null}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="readme-disclosure-toggle"
                    onClick={() => setStyleAdvancedOpen((v) => !v)}
                    aria-expanded={styleAdvancedOpen}
                  >
                    <span>Advanced options</span>
                    <em>{styleAdvancedOpen ? '–' : '+'}</em>
                  </button>

                  {styleAdvancedOpen && (
                  <div className="readme-property-group">
                    <h3>Structure</h3>
                    <div className="readme-token-list">
                      {structureOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setStructure(option.id)}
                          className={structure === option.id ? 'active' : ''}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  )}

                  {styleAdvancedOpen && (
                  <div className="readme-property-group">
                    <h3>Motion</h3>
                    <div className="readme-option-stack compact">
                      {motionOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setMotionStyle(option.id)}
                          className={motionStyle === option.id ? 'active' : ''}
                        >
                          <strong>{option.label}</strong>
                          <span>{option.description}</span>
                        </button>
                      ))}
                    </div>
                    {motionStyle !== 'none' && (
                      <div className="readme-toggle-stack">
                        {[
                          ['Typing headline', typingHeadline, setTypingHeadline],
                          ['Animated divider', animatedDivider, setAnimatedDivider],
                          ['Avatar block', avatarBlock, setAvatarBlock],
                          ['Visitor counter', visitorCounter, setVisitorCounter],
                          ['Workflow-generated snake', contributionSnake, setContributionSnake],
                          ['Space Shooter game', spaceShooter, setSpaceShooter],
                        ].map(([label, checked, setter]) => (
                          <label key={label as string} className="readme-editor-check">
                            <span>{label as string}</span>
                            <input type="checkbox" checked={checked as boolean} onChange={(event) => (setter as (next: boolean) => void)(event.target.checked)} />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  )}
                </>
              )}

              {inspectorTab === 'agent' && (
                <>
                  {!userIsPro && (
                    <button
                      type="button"
                      className="readme-ai-pro-notice"
                      onClick={() => openUpgradeGate('AI README generation')}
                    >
                      <strong>AI generation is a Pro feature.</strong>
                      <span>Free plans use the template generator. Upgrade for AI-written, refined READMEs.</span>
                    </button>
                  )}
                  <div className="readme-property-group">
                    <h3>Career Agent</h3>
                    <label className="readme-editor-check">
                      <span>Career mode</span>
                      <input type="checkbox" checked={careerMode} onChange={(e) => setCareerMode(e.target.checked)} />
                    </label>
                    <label className="readme-editor-check">
                      <span>Agent refinement</span>
                      <input type="checkbox" checked={agentLoop} onChange={(e) => setAgentLoop(e.target.checked)} />
                    </label>
                    <select value={careerRole} onChange={(event) => setCareerRole(event.target.value as CareerRole)}>
                      {careerRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="readme-editor-check">
                    <span>Use AI Enhancement</span>
                    <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
                  </label>
                  <div className="readme-ai-scan-card">
                    <div>
                      <strong>AI profile scan</strong>
                      <span>Reads public GitHub profile data, pinned projects, languages, stars, and repo descriptions before writing.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={aiProfileScan}
                      disabled={!useAI}
                      onChange={(event) => setAiProfileScan(event.target.checked)}
                    />
                  </div>
                  <div className="readme-ai-scan-evidence">
                    <span>Scan evidence</span>
                    {aiScanSignals.map((signal) => (
                      <div key={signal.label}>
                        <small>{signal.label}</small>
                        <strong>{signal.value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {isLoading && (
                <ThinkingProgress
                  steps={readmeProgress.steps}
                  activeIndex={readmeProgress.activeIndex}
                  variant="card"
                />
              )}
              {wrongOwnerNotice}
              {error && <div className="readme-editor-error">{error}</div>}
            </aside>

            <section className="readme-editor-timeline" data-guide-region="structure">
              <div className="readme-timeline-toolbar">
                <strong>README Sections</strong>
                <span>Select a section to edit it</span>
              </div>
              <div className="readme-track">
                {timelineSections.map((section) => {
                  const isIncluded = sections.includes(section.id);
                  const orderIndex = sections.indexOf(section.id);
                  const visualCount = getSectionPreviewAssets(section.id).length;
                  return (
                    <article
                      key={section.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectReadmeSection(section.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectReadmeSection(section.id);
                        }
                      }}
                      className={`${isIncluded ? 'active' : ''} ${selectedSection === section.id ? 'selected' : ''}`.trim()}
                      title={section.description}
                    >
                      <span>{isIncluded ? orderIndex + 1 : '+'}</span>
                      <strong>{section.label}</strong>
                      <small>{visualCount ? `${visualCount} visual asset${visualCount === 1 ? '' : 's'}` : section.description}</small>
                      <div className="readme-clip-badges">
                        {visualCount > 0 ? <em>Visual</em> : null}
                        {useAI ? <em>AI</em> : null}
                        {!isIncluded ? <em>Off</em> : null}
                      </div>
                      <div className="readme-clip-actions" aria-label={`${section.label} timeline actions`}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveSectionById(section.id, -1);
                          }}
                          disabled={!isIncluded || orderIndex <= 0}
                          aria-label={`Move ${section.label} earlier`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            moveSectionById(section.id, 1);
                          }}
                          disabled={!isIncluded || orderIndex >= sections.length - 1}
                          aria-label={`Move ${section.label} later`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSectionFromTimeline(section.id);
                          }}
                          aria-label={`${isIncluded ? 'Disable' : 'Enable'} ${section.label}`}
                        >
                          {isIncluded ? '−' : '+'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {studioGuideActive && workspaceMode === 'studio' && guideArrow && (
              <svg key={`guide-arrow-${studioGuideStep}`} className="readme-studio-guide-arrow" aria-hidden="true">
                <defs>
                  <linearGradient
                    id={`gs-guide-grad-${studioGuideStep}`}
                    gradientUnits="userSpaceOnUse"
                    x1={guideArrow.x1}
                    y1={guideArrow.y1}
                    x2={guideArrow.x2}
                    y2={guideArrow.y2}
                  >
                    <stop offset="0%" stopColor="rgba(47,187,99,0)" />
                    <stop offset="22%" stopColor="rgba(52,209,125,0.25)" />
                    <stop offset="72%" stopColor="#2fbb63" />
                    <stop offset="100%" stopColor="#86efac" />
                  </linearGradient>
                  <marker
                    id={`gs-guide-head-${studioGuideStep}`}
                    viewBox="0 0 16 16"
                    markerWidth="14"
                    markerHeight="14"
                    refX="13"
                    refY="8"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M1.2 1.4 C3.8 4.2 3.8 11.8 1.2 14.6 L14.4 8 Z" fill="#86efac" />
                  </marker>
                  <filter id={`gs-guide-glow-${studioGuideStep}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.8" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path
                  className="readme-studio-guide-arrow-halo"
                  d={guideArrow.d}
                  fill="none"
                  stroke="rgba(47,187,99,0.18)"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <path
                  className="readme-studio-guide-arrow-stroke"
                  d={guideArrow.d}
                  fill="none"
                  stroke={`url(#gs-guide-grad-${studioGuideStep})`}
                  strokeWidth="2.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1.5 11"
                  markerEnd={`url(#gs-guide-head-${studioGuideStep})`}
                  filter={`url(#gs-guide-glow-${studioGuideStep})`}
                />
                <circle
                  className="readme-studio-guide-arrow-orb"
                  cx={guideArrow.x2}
                  cy={guideArrow.y2}
                  r="5"
                  fill="#bbf7d0"
                />
              </svg>
            )}

            {studioGuideActive && workspaceMode === 'studio' && (
              <div
                key={studioGuideStepId}
                className={`readme-studio-coach dock-${studioGuideStepId}`}
                role="dialog"
                aria-label="Studio guide"
              >
                <div className="readme-studio-coach-progress">
                  Step {studioGuideStep + 1} of {studioGuideSteps.length}
                </div>
                <strong>{studioGuideStepMeta?.title}</strong>
                <p>{studioGuideStepMeta?.body}</p>
                <div className="readme-studio-coach-actions">
                  <button type="button" className="readme-studio-coach-skip" onClick={skipStudioGuide}>
                    Skip guide
                  </button>
                  <div className="readme-studio-coach-nav">
                    <button
                      type="button"
                      className="readme-studio-coach-back"
                      onClick={retreatStudioGuide}
                      disabled={studioGuideStep === 0}
                    >
                      Back
                    </button>
                    {isGuideConversionStep ? (
                      <button type="button" className="readme-studio-coach-back" onClick={advanceStudioGuide}>
                        Not now
                      </button>
                    ) : null}
                    <button type="button" className="readme-studio-coach-next" onClick={handleStudioGuidePrimary}>
                      {studioGuideStepMeta?.nextLabel ?? 'Continue'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '40px 20px',
          borderTop: '1px solid #1a1a1a',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#444', fontSize: '14px', margin: 0 }}>
          GitSkins - Beautiful GitHub README Widgets
        </p>
      </footer>

      {toast && (
        <div className="readme-toast" role="status" aria-live="polite">
          <span className="readme-toast-check">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          {toast}
          {toastAction && (
            <button
              type="button"
              className="readme-toast-action"
              onClick={() => {
                toastAction.run();
                setToast(null);
                setToastAction(null);
              }}
            >
              {toastAction.label}
            </button>
          )}
        </div>
      )}

      {exportPanel && typeof document !== 'undefined' ? createPortal(
        <aside className="mk readme-export-dock" aria-labelledby="readme-export-dock-title">
          <div className="readme-export-dock-head">
            <div className="readme-export-dock-brand" aria-hidden="true">
              <img src="/logo-no-bg.png" alt="" />
            </div>
            <button type="button" className="readme-export-dock-close" onClick={closeExportPanel} aria-label="Close export options">×</button>
          </div>
          <span className="readme-export-dock-kicker">One-time export</span>
          <h3 id="readme-export-dock-title">
            {exportPanel.decideCredit ? 'Your export credit is ready.' : 'Keep the version you designed.'}
          </h3>
          <p>
            {exportPanel.decideCredit
              ? `Use your credit to ${EXPORT_INTENT_LABEL[exportPanel.intent]} with every premium choice intact.`
              : `Pay once to ${EXPORT_INTENT_LABEL[exportPanel.intent]} exactly as it appears in Studio.`}
          </p>

          {exportPanel.reasons.length ? (
            <div className="readme-export-dock-reasons">
              <span>Included in this export</span>
              <div>
                {exportPanel.reasons.map((reason) => <strong key={reason}>{reason}</strong>)}
              </div>
            </div>
          ) : null}

          <div className="readme-export-dock-outcomes">
            <span>Premium visuals</span>
            <span>No watermark</span>
            <span>GitHub-ready Markdown</span>
          </div>

          <div className="readme-export-dock-feedback" aria-live="polite">
            {exportFeedbackState === 'sent' ? (
              <span>Thanks. That helps us improve the publishing flow.</span>
            ) : (
              <>
                <span>Not ready to continue?</span>
                <div>
                  {['Still deciding', 'Too expensive', 'Need more proof'].map((reason) => (
                    <button key={reason} type="button" onClick={() => submitExportFeedback(reason)} disabled={exportFeedbackState === 'sending'}>
                      {reason}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="readme-export-dock-actions">
            <div className="readme-export-dock-price-row">
              <div>
                <strong>{ONE_TIME_EXPORT_PRICE_USD_LABEL}</strong>
                <span>one-time export</span>
              </div>
              <span>No subscription</span>
            </div>
            {exportPanel.decideCredit ? (
              <button type="button" className="readme-export-dock-primary" onClick={() => resolveExportCredit('spend')}>
                Use credit and {EXPORT_INTENT_ACTION[exportPanel.intent]}
              </button>
            ) : (
              <a
                href={exportCheckoutHrefFor(exportPanel.intent, exportPanel.target)}
                className="readme-export-dock-primary"
                onClick={() => analytics.trackFunnel('readme_export_checkout_clicked', {
                  source: 'export_dock',
                  intent: exportPanel.intent,
                  target: exportPanel.target,
                  reasons: exportPanel.reasons,
                  username: username.trim() || undefined,
                  plan: 'export',
                })}
              >
                Pay {ONE_TIME_EXPORT_PRICE_USD_LABEL} and {EXPORT_INTENT_ACTION[exportPanel.intent]}
              </a>
            )}
            <small>One-time payment. No subscription.</small>
            <Link href={monthlyCheckoutHref} className="readme-export-dock-pro" onClick={() => analytics.trackFunnel('readme_upgrade_clicked', { source: 'export_dock_pro', intent: exportPanel.intent, username: username.trim() || undefined, plan: 'monthly' })}>
              <span>Start Pro</span>
              <strong>{monthlyIntroAvailable ? '$4.99/month' : '$9/month'}</strong>
            </Link>
            <small>{monthlyIntroAvailable ? 'First month is $4.99, then $9/month. No free trial.' : 'Unlimited exports at $9/month. Cancel anytime.'}</small>
            <button type="button" className="readme-export-dock-basic" onClick={switchToFreeExport}>Use basic export</button>
            <button type="button" className="readme-export-dock-later" onClick={closeExportPanel}>Keep editing</button>
          </div>
        </aside>,
        document.body,
      ) : null}

      {upgradeFeature && (
        <div className="readme-upgrade-overlay" onClick={closeUpgradeGate}>
          <div className="readme-upgrade-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button type="button" className="readme-upgrade-close" onClick={closeUpgradeGate} aria-label="Close upgrade prompt">
              ×
            </button>
            <div className="readme-upgrade-mark" aria-hidden="true">
              <img src="/logo-no-bg.png" alt="" />
            </div>
            <h3 className="readme-upgrade-title">
              {upgradeReasons.length ? 'Export your README.' : `Unlock ${upgradeFeature}`}
            </h3>
            <p className="readme-upgrade-copy">
              {upgradeReasons.length
                ? 'This README uses premium visuals. Upgrade to keep the design exactly as it appears in Studio.'
                : 'Pro unlocks every premium design, AI refinement, and the export workflow you need to stand out.'}
            </p>
            {upgradeReasons.length ? (
              <div className="readme-upgrade-reasons">
                <span>Included in this export</span>
                {upgradeReasons.map((reason) => (
                  <strong key={reason}>{reason}</strong>
                ))}
              </div>
            ) : null}
            <div className="readme-upgrade-value-line">
              <span>No watermark</span>
              <span>All premium visuals</span>
              <span>GitHub-ready export</span>
            </div>
            <div className="readme-upgrade-actions">
              <a href={upgradeReasons.length ? exportCheckoutHref : checkoutHref} className="readme-upgrade-cta" onClick={() => analytics.trackFunnel('readme_upgrade_clicked', { source: 'upgrade_modal', feature: upgradeFeature, reasons: upgradeReasons, username: username.trim() || undefined, plan: upgradeReasons.length ? 'export' : undefined })}>
                {upgradeReasons.length ? `Export once for ${ONE_TIME_EXPORT_PRICE_USD_LABEL}` : 'Upgrade to Pro'}
              </a>
              {upgradeReasons.length ? (
                <button type="button" className="readme-upgrade-free" onClick={switchToFreeExport}>Export free version</button>
              ) : null}
              <button type="button" className="readme-upgrade-dismiss" onClick={closeUpgradeGate}>Keep editing</button>
            </div>
          </div>
        </div>
      )}

      {showPublishGuide && (
        <div className="readme-publish-overlay" onClick={() => setShowPublishGuide(false)}>
          <div
            className="readme-publish-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="readme-publish-title"
          >
            <div className="readme-publish-header">
              <div>
                <h3 id="readme-publish-title">Get ready to publish</h3>
                <p>GitSkins opens a pull request for you. Nothing is merged into your profile until you review and approve it on GitHub.</p>
              </div>
              <button type="button" className="readme-publish-close" onClick={() => setShowPublishGuide(false)} aria-label="Close publish guide">×</button>
            </div>

            {showExportCreditNotice && (
              <div
                className="readme-publish-trial"
                style={{
                  marginBottom: 14, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                  border: `1px solid ${premiumExportAvailable ? 'rgba(65,216,197,0.35)' : 'rgba(240,85,109,0.35)'}`,
                  background: premiumExportAvailable ? 'rgba(65,216,197,0.08)' : 'rgba(240,85,109,0.08)',
                  color: premiumExportAvailable ? '#8ae9db' : '#ffb3bd',
                }}
              >
                {premiumExportAvailable ? (
                  <>
                    <b>This uses one premium export credit.</b> This README includes{' '}
                    {proExportReasons.join(', ')}. Publishing or downloading it now spends that credit.
                  </>
                ) : (
                  <>
                    <b>This README uses premium visuals.</b> Export it once for {ONE_TIME_EXPORT_PRICE_USD_LABEL} or upgrade to Pro
                    to publish READMEs with {proExportReasons.join(', ')}.
                  </>
                )}
              </div>
            )}

            <div className="readme-publish-readiness" aria-live="polite">
              <div className="readme-publish-readiness-heading">
                <strong>Publishing setup</strong>
                <span>{publishReadiness.state === 'checking' ? 'Checking GitHub...' : publishReadiness.state === 'ready' ? 'Ready' : 'Action needed'}</span>
              </div>
              <div className={`readme-publish-check${publishConnectionReady ? ' is-ready' : publishReadiness.state === 'checking' ? ' is-pending' : ' is-blocked'}`}>
                <i aria-hidden="true" />
                <div>
                  <strong>GitHub connection</strong>
                  <span>{publishConnectionReady ? `Connected${publishReadiness.login ? ` as @${publishReadiness.login}` : ''}` : publishReadiness.state === 'checking' ? 'Verifying your account' : 'Connect GitHub with repository access'}</span>
                </div>
              </div>
              <div className={`readme-publish-check${publishRepositoryReady ? ' is-ready' : publishReadiness.state === 'checking' ? ' is-pending' : ' is-blocked'}`}>
                <i aria-hidden="true" />
                <div>
                  <strong>Profile repository</strong>
                  <span>{publishRepositoryReady ? `${publishReadiness.repository || `${username.trim()}/${username.trim()}`} is public and initialized` : publishReadiness.state === 'checking' ? 'Looking for your profile repository' : 'A public username/username repository with README.md is required'}</span>
                </div>
              </div>
              <div className={`readme-publish-check${publishReadiness.state === 'ready' ? ' is-ready' : publishReadiness.state === 'checking' ? ' is-pending' : ' is-blocked'}`}>
                <i aria-hidden="true" />
                <div>
                  <strong>Pull request access</strong>
                  <span>{publishReadiness.state === 'ready' ? 'GitSkins can create the branch and open your PR' : publishReadiness.state === 'checking' ? 'Checking publishing permission' : 'Complete the setup above to enable publishing'}</span>
                </div>
              </div>
            </div>

            {publishReadiness.state === 'blocked' ? (
              <div className="readme-publish-setup" role="status">
                <div>
                  <strong>{publishReadiness.code === 'PROFILE_REPO_MISSING' ? 'Create your profile repository' : publishNeedsReconnect ? 'Reconnect GitHub' : 'Finish publishing setup'}</strong>
                  <span>{publishReadiness.message}</span>
                </div>
                {publishReadiness.actionUrl ? (
                  <a href={publishReadiness.actionUrl} target="_blank" rel="noreferrer" className="mk-btn">
                    {publishReadiness.code === 'PROFILE_REPO_MISSING' ? 'Create repository' : 'Open repository'}
                  </a>
                ) : null}
                {publishNeedsReconnect ? (
                  <button type="button" className="mk-btn" onClick={() => void reconnectGitHubForPublish()}>Reconnect GitHub</button>
                ) : publishReadiness.code === 'AUTH_REQUIRED' ? (
                  <button type="button" className="mk-btn" onClick={() => void reconnectGitHubForPublish()}>Connect GitHub</button>
                ) : null}
                <button type="button" className="mk-btn-ghost" onClick={() => void checkPublishReadiness()}>
                  Check again
                </button>
              </div>
            ) : null}

            <div className="readme-publish-actions" style={{ marginBottom: 14 }}>
              <button
                type="button"
                className="mk-btn"
                style={{ border: 'none', justifyContent: 'center' }}
                disabled={publishingPr || publishReadiness.state !== 'ready' || (!generatedReadme && !liveDraftReadme)}
                onClick={() => void publishReadmePullRequest()}
              >
                {publishingPr ? 'Opening PR...' : publishReadiness.state === 'checking' ? 'Checking setup...' : 'Open pull request'}
              </button>
              {publishPrUrl && (
                <a href={publishPrUrl} target="_blank" rel="noreferrer" className="mk-btn-ghost" style={{ textAlign: 'center', justifyContent: 'center' }}>
                  View pull request
                </a>
              )}
            </div>

            <div className="readme-publish-repo">
              <span>Repository name</span>
              <strong>{username.trim().replace(/^@/, '') || 'your-username'}</strong>
              <button
                type="button"
                onClick={async () => {
                  const repoName = username.trim().replace(/^@/, '') || 'your-username';
                  try {
                    await navigator.clipboard.writeText(repoName);
                    showToast('Repository name copied');
                  } catch {
                    showToast('Could not copy repository name');
                  }
                }}
              >
                Copy
              </button>
            </div>

            <ol className="readme-publish-steps">
              <li>
                <span className="readme-publish-step-index" aria-hidden="true">1</span>
                <div>
                  <strong>GitSkins creates a branch</strong>
                  <span>Your existing profile stays live and unchanged while the update is prepared.</span>
                </div>
              </li>
              <li>
                <span className="readme-publish-step-index" aria-hidden="true">2</span>
                <div>
                  <strong>GitSkins opens the pull request</strong>
                  <span>You are sent directly to GitHub to inspect every README change.</span>
                </div>
              </li>
              <li>
                <span className="readme-publish-step-index" aria-hidden="true">3</span>
                <div>
                  <strong>You decide when to publish</strong>
                  <span>Merge the PR only when the preview looks right. Closing it leaves your profile untouched.</span>
                </div>
              </li>
            </ol>

            <div className="readme-publish-actions">
              <button type="button" className="mk-btn-ghost" onClick={() => { void downloadReadme().then((done) => { if (done) setShowPublishGuide(false); }); }}>
                Download instead
              </button>
              <button type="button" className="readme-publish-dismiss" onClick={() => setShowPublishGuide(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes rs-sheet-in {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .readme-pro-tag {
          align-items: center;
          background: linear-gradient(180deg, #ffd67a, #f0a92e);
          border-radius: 999px;
          color: #2a1c02;
          display: inline-flex;
          font-size: 8.5px;
          font-weight: 900;
          justify-content: center;
          letter-spacing: 0.04em;
          margin-left: 6px;
          min-height: 18px;
          padding: 3px 7px;
          text-transform: uppercase;
          vertical-align: middle;
          white-space: nowrap;
        }

        .readme-pro-tag.corner {
          position: absolute;
          bottom: 10px;
          right: 10px;
          margin: 0;
          font-style: normal;
        }

        .readme-preset-card.locked,
        .readme-preset-card.pro-export,
        .readme-bin-grid button.locked,
        .readme-bin-grid button.pro-export {
          position: relative;
        }

        .readme-preset-card.locked,
        .readme-preset-card.pro-export {
          padding-right: 10px;
          padding-bottom: 38px;
        }

        .readme-preset-card.locked strong,
        .readme-preset-card.locked small {
          opacity: 0.78;
        }

        .readme-preset-card.pro-export {
          box-shadow: inset 0 0 0 1px rgba(22, 163, 74, 0.14);
        }

        .readme-export-dock {
          animation: readme-export-dock-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(18, 33, 26, 0.12);
          border-radius: 18px;
          bottom: 18px;
          box-shadow: 0 28px 80px -34px rgba(18, 33, 26, 0.42), 0 12px 32px -24px rgba(22, 163, 74, 0.42);
          color: var(--mk-ink);
          display: flex;
          flex-direction: column;
          max-height: min(780px, calc(100dvh - 104px));
          overflow: auto;
          padding: 16px 18px 18px;
          position: fixed;
          right: 18px;
          top: 86px;
          width: min(360px, calc(100vw - 36px));
          z-index: 1050;
        }

        @keyframes readme-export-dock-in {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .readme-export-dock-head {
          align-items: center;
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .readme-export-dock-brand {
          align-items: center;
          background: #effaf2;
          border: 1px solid rgba(22, 163, 74, 0.16);
          border-radius: 10px;
          display: flex;
          height: 40px;
          justify-content: center;
          width: 40px;
        }

        .readme-export-dock-brand img {
          display: block;
          height: 28px;
          object-fit: contain;
          width: 28px;
        }

        .readme-export-dock-close {
          align-items: center;
          background: #fff;
          border: 1px solid var(--mk-border);
          border-radius: 50%;
          color: var(--mk-ink-2);
          cursor: pointer;
          display: flex;
          font-size: 20px;
          height: 34px;
          justify-content: center;
          line-height: 1;
          padding: 0 0 2px;
          width: 34px;
        }

        .readme-export-dock-kicker {
          color: var(--mk-blue-ink);
          display: block;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .readme-export-dock h3 {
          font-size: 25px;
          letter-spacing: 0;
          line-height: 1.08;
          margin: 0 0 7px;
        }

        .readme-export-dock > p {
          color: var(--mk-ink-2);
          font-size: 13px;
          line-height: 1.45;
          margin: 0;
        }

        .readme-export-dock-reasons {
          background: var(--mk-bg-soft);
          border: 1px solid rgba(22, 163, 74, 0.16);
          border-radius: 10px;
          margin-top: 13px;
          padding: 11px;
        }

        .readme-export-dock-reasons > span {
          color: var(--mk-blue-ink);
          display: block;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .readme-export-dock-reasons > div {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .readme-export-dock-reasons strong {
          background: #fff;
          border: 1px solid var(--mk-border-soft);
          border-radius: 999px;
          font-size: 10px;
          padding: 6px 8px;
        }

        .readme-export-dock-outcomes {
          display: grid;
          gap: 7px;
          margin: 13px 0;
        }

        .readme-export-dock-outcomes span {
          align-items: center;
          color: var(--mk-ink-2);
          display: flex;
          font-size: 12px;
          font-weight: 700;
          gap: 9px;
        }

        .readme-export-dock-outcomes span::before {
          background: var(--mk-blue);
          border-radius: 50%;
          content: '';
          height: 7px;
          width: 7px;
        }

        .readme-export-dock-feedback {
          border-top: 1px solid var(--mk-border-soft);
          color: var(--mk-ink-3);
          font-size: 11px;
          padding-top: 10px;
        }

        .readme-export-dock-feedback > span {
          display: block;
          margin-bottom: 8px;
        }

        .readme-export-dock-feedback > div {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .readme-export-dock-feedback button {
          background: transparent;
          border: 1px solid var(--mk-border);
          border-radius: 999px;
          color: var(--mk-ink-2);
          cursor: pointer;
          font: inherit;
          padding: 6px 9px;
        }

        .readme-export-dock-feedback button:hover {
          background: var(--mk-bg-soft);
          border-color: rgba(22, 163, 74, 0.35);
          color: var(--mk-blue-ink);
        }

        .readme-export-dock-feedback button:disabled {
          cursor: wait;
          opacity: 0.6;
        }

        .readme-export-dock-actions {
          backdrop-filter: blur(12px);
          background: rgba(255, 255, 255, 0.96);
          border-top: 1px solid var(--mk-border-soft);
          display: grid;
          gap: 7px;
          margin: 10px -18px -18px;
          padding: 11px 18px 14px;
          position: sticky;
          bottom: -18px;
          z-index: 1;
        }

        .readme-export-dock-price-row {
          align-items: baseline;
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .readme-export-dock-price-row div {
          align-items: baseline;
          display: flex;
          gap: 6px;
        }

        .readme-export-dock-price-row strong {
          font-size: 22px;
          letter-spacing: -0.03em;
        }

        .readme-export-dock-price-row span {
          color: var(--mk-ink-3);
          font-size: 11px;
          font-weight: 700;
        }

        .readme-export-dock-primary,
        .readme-export-dock-pro,
        .readme-export-dock-basic,
        .readme-export-dock-later {
          align-items: center;
          border-radius: 999px;
          cursor: pointer;
          display: flex;
          font-size: 13px;
          font-weight: 850;
          justify-content: center;
          min-height: 44px;
          padding: 9px 14px;
          text-align: center;
          text-decoration: none;
        }

        .readme-export-dock-primary {
          background: linear-gradient(180deg, #2fbb63, #16a34a);
          border: 1px solid #15803d;
          box-shadow: 0 14px 28px -20px rgba(22, 163, 74, 0.9);
          color: #fff;
        }

        .readme-export-dock-actions small {
          color: var(--mk-ink-3);
          font-size: 11px;
          text-align: center;
        }

        .readme-export-dock-pro,
        .readme-export-dock-basic {
          background: #fff;
          border: 1px solid var(--mk-border);
          color: var(--mk-ink);
        }

        .readme-export-dock-pro {
          justify-content: space-between;
          padding-left: 16px;
          padding-right: 16px;
        }

        .readme-export-dock-pro strong {
          color: var(--mk-blue-ink);
          font-size: 12px;
        }

        .readme-export-dock-later {
          background: transparent;
          border: 0;
          color: var(--mk-ink-2);
          min-height: 34px;
        }

        @media (max-width: 720px) {
          .readme-export-dock {
            border-radius: 16px;
            bottom: 10px;
            left: 10px;
            max-height: min(720px, calc(100dvh - 20px));
            padding: 14px 16px 16px;
            right: 10px;
            top: 10px;
            width: auto;
          }

          .readme-export-dock h3 { font-size: 22px; }
          .readme-export-dock-outcomes { grid-template-columns: 1fr 1fr; }
          .readme-export-dock-feedback { display: none; }
          .readme-export-dock-reasons { margin-top: 10px; padding: 9px; }
          .readme-export-dock-reasons > div { gap: 5px; }
          .readme-export-dock-reasons strong { font-size: 9px; padding: 5px 7px; }
          .readme-export-dock-outcomes { gap: 5px; margin: 10px 0; }
          .readme-export-dock-outcomes span { font-size: 11px; gap: 7px; }
          .readme-export-dock-outcomes span::before { height: 6px; width: 6px; }
          .readme-export-dock-actions {
            margin-left: -16px;
            margin-right: -16px;
            margin-bottom: -16px;
            padding-left: 16px;
            padding-right: 16px;
          }
        }

        .readme-upgrade-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100dvh;
          padding: 24px;
          background:
            radial-gradient(520px 260px at 50% 50%, rgba(52, 209, 125, 0.16), transparent 70%),
            rgba(244, 247, 244, 0.62);
          backdrop-filter: blur(12px) saturate(1.04);
        }

        .readme-upgrade-sheet {
          width: 100%;
          max-width: 400px;
          background:
            radial-gradient(420px 180px at 80% -20%, rgba(52, 209, 125, 0.2), transparent 72%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 244, 0.98));
          border: 1px solid rgba(18, 33, 26, 0.1);
          border-radius: 24px;
          margin: auto;
          max-height: calc(100dvh - 48px);
          overflow: auto;
          padding: 22px;
          position: relative;
          box-shadow: 0 34px 90px -50px rgba(18, 33, 26, 0.62), 0 1px 0 rgba(255,255,255,0.9) inset;
          animation: rs-sheet-in 0.24s ease-out both;
        }

        .readme-upgrade-close {
          align-items: center;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(18, 33, 26, 0.08);
          border-radius: 999px;
          color: var(--mk-ink-3);
          cursor: pointer;
          display: inline-flex;
          font-size: 22px;
          font-weight: 650;
          height: 34px;
          justify-content: center;
          line-height: 1;
          position: absolute;
          right: 16px;
          top: 16px;
          width: 34px;
        }

        .readme-upgrade-close:hover {
          color: var(--mk-ink);
          background: #fff;
        }

        .readme-upgrade-mark {
          align-items: center;
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(22, 163, 74, 0.14);
          border-radius: 20px;
          box-shadow: 0 18px 38px -24px rgba(22, 163, 74, 0.85);
          display: inline-flex;
          height: 54px;
          justify-content: center;
          margin: 0 0 18px;
          width: 54px;
        }

        .readme-upgrade-mark img {
          display: block;
          height: 38px;
          object-fit: contain;
          width: 38px;
        }

        .readme-upgrade-title {
          color: var(--mk-ink);
          font-size: clamp(24px, 3vw, 29px);
          font-weight: 950;
          letter-spacing: -0.045em;
          margin: 0 0 8px;
          line-height: 1;
          white-space: nowrap;
        }

        .readme-upgrade-copy {
          color: var(--mk-ink-2);
          font-size: 13px;
          line-height: 1.5;
          margin: 0 0 14px;
        }

        .readme-upgrade-reasons {
          background: rgba(22, 163, 74, 0.07);
          border: 1px solid rgba(22, 163, 74, 0.16);
          border-radius: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 14px;
          padding: 12px;
        }

        .readme-upgrade-reasons span {
          color: var(--mk-blue-ink);
          flex-basis: 100%;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readme-upgrade-reasons strong {
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid rgba(18, 33, 26, 0.08);
          border-radius: 999px;
          color: var(--mk-ink);
          font-size: 12px;
          font-weight: 850;
          padding: 7px 10px;
        }

        .readme-upgrade-value-line {
          align-items: center;
          color: var(--mk-ink-2);
          display: flex;
          flex-wrap: wrap;
          font-size: 11.5px;
          font-weight: 800;
          gap: 8px 14px;
          margin: 0 0 14px;
        }

        .readme-upgrade-value-line span {
          align-items: center;
          display: inline-flex;
          gap: 6px;
          white-space: nowrap;
        }

        .readme-upgrade-value-line span::before {
          background: #16a34a;
          border-radius: 999px;
          content: '';
          height: 6px;
          width: 6px;
        }

        .readme-upgrade-actions {
          display: grid;
          gap: 9px;
        }

        .readme-upgrade-cta {
          background: linear-gradient(180deg, #2fbb63, #16a34a);
          border-radius: 999px;
          color: #fff;
          display: block;
          font-size: 14px;
          font-weight: 900;
          padding: 13px 16px;
          text-align: center;
          text-decoration: none;
          box-shadow: 0 16px 34px -18px rgba(22, 163, 74, 0.9);
          transition: transform 0.15s ease, filter 0.15s ease;
        }

        .readme-upgrade-cta:hover {
          transform: translateY(-1px);
          filter: brightness(1.06);
        }

        .readme-upgrade-actions button {
          background: rgba(255, 255, 255, 0.62);
          border: 1px solid rgba(18, 33, 26, 0.08);
          border-radius: 999px;
          color: var(--mk-ink-2);
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 850;
          min-height: 40px;
          padding: 0 14px;
        }

        .readme-upgrade-actions .readme-upgrade-dismiss {
          background: transparent;
          border-color: transparent;
          color: var(--mk-ink-3);
          min-height: 30px;
        }

        .readme-upgrade-actions .readme-upgrade-free {
          background: rgba(255, 255, 255, 0.78);
          border-color: rgba(22, 163, 74, 0.22);
          color: var(--mk-blue-ink);
        }

        .readme-upgrade-actions button:hover {
          background: rgba(255, 255, 255, 0.9);
          color: var(--mk-ink);
        }

        .readme-publish-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 12px;
          background: rgba(18, 33, 26, 0.16);
        }

        .readme-publish-sheet {
          width: min(100%, 480px);
          height: 100%;
          max-height: calc(100dvh - 24px);
          box-sizing: border-box;
          overflow: auto;
          border-radius: 18px;
          border: 1px solid var(--mk-border);
          background: #fff;
          box-shadow: var(--mk-shadow);
          padding: 20px;
          animation: readme-publish-sheet-in 0.22s ease-out both;
        }

        @keyframes readme-publish-sheet-in {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .readme-publish-header {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
        }

        .readme-publish-header h3 {
          margin: 0 0 6px;
          color: var(--mk-ink);
          font-size: 22px;
          line-height: 1.15;
        }

        .readme-publish-header p {
          margin: 0;
          color: var(--mk-ink-2);
          font-size: 13px;
          line-height: 1.5;
        }

        .readme-publish-header code,
        .readme-publish-steps code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.92em;
          color: var(--mk-blue-ink);
        }

        .readme-publish-close {
          width: 34px;
          height: 34px;
          border: 1px solid var(--mk-border);
          border-radius: 10px;
          background: #fff;
          color: var(--mk-ink-2);
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
        }

        .readme-publish-readiness {
          margin-bottom: 14px;
          overflow: hidden;
          border: 1px solid var(--mk-border);
          border-radius: 14px;
          background: #fff;
        }

        .readme-publish-readiness-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--mk-border-soft);
          background: var(--mk-bg-soft);
        }

        .readme-publish-readiness-heading strong {
          color: var(--mk-ink);
          font-size: 13px;
        }

        .readme-publish-readiness-heading span {
          color: var(--mk-blue-ink);
          font-size: 11px;
          font-weight: 800;
        }

        .readme-publish-check {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
          padding: 11px 14px;
        }

        .readme-publish-check + .readme-publish-check {
          border-top: 1px solid var(--mk-border-soft);
        }

        .readme-publish-check i {
          display: grid;
          width: 22px;
          height: 22px;
          place-items: center;
          border: 1px solid var(--mk-border);
          border-radius: 50%;
          background: #fff;
          color: var(--mk-ink-3);
          font-style: normal;
          font-size: 11px;
          font-weight: 900;
        }

        .readme-publish-check.is-ready i {
          border-color: rgba(22, 163, 74, 0.28);
          background: #e9f8ef;
          color: var(--mk-blue-ink);
        }

        .readme-publish-check.is-ready i::before { content: '✓'; }
        .readme-publish-check.is-pending i::before { content: '…'; }
        .readme-publish-check.is-blocked i::before { content: '!'; }

        .readme-publish-check > div {
          display: grid;
          gap: 2px;
        }

        .readme-publish-check strong {
          color: var(--mk-ink);
          font-size: 12.5px;
        }

        .readme-publish-check span {
          color: var(--mk-ink-2);
          font-size: 11.5px;
          line-height: 1.4;
        }

        .readme-publish-setup {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          padding: 14px;
          border: 1px solid rgba(22, 163, 74, 0.24);
          border-radius: 14px;
          background: #eef8f0;
          color: #12211a;
        }

        .readme-publish-setup > div {
          display: grid;
          gap: 4px;
        }

        .readme-publish-setup strong { font-size: 14px; }

        .readme-publish-setup span {
          color: #4c5a52;
          font-size: 12px;
          line-height: 1.45;
        }

        .readme-publish-setup :is(a, button) {
          min-height: 40px;
          padding: 10px 14px;
          border: none;
          font-size: 12px;
          text-decoration: none;
          white-space: nowrap;
        }

        .readme-publish-repo {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 4px 10px;
          align-items: center;
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(22,163,74,0.16);
          background: #e9f8ef;
        }

        .readme-publish-repo span {
          grid-column: 1 / -1;
          color: var(--mk-ink-3);
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .readme-publish-repo strong {
          min-width: 0;
          color: var(--mk-blue-ink);
          font-size: 16px;
          overflow-wrap: anywhere;
        }

        .readme-publish-repo button {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(22,163,74,0.22);
          background: #fff;
          color: var(--mk-blue-ink);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .readme-publish-steps {
          display: grid;
          gap: 12px;
          margin: 0 0 18px;
          padding: 0;
          list-style: none;
        }

        .readme-publish-steps li {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          min-width: 0;
          padding: 10px 12px;
          border: 1px solid var(--mk-border-soft);
          border-radius: 14px;
          background: var(--mk-bg-soft);
        }

        .readme-publish-step-index {
          width: 28px;
          height: 28px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          background: var(--mk-bg-soft);
          border: 1px solid var(--mk-border);
          color: var(--mk-blue-ink);
          font-size: 12px;
          font-weight: 900;
        }

        .readme-publish-steps li > div {
          min-width: 0;
        }

        .readme-publish-steps strong {
          display: block;
          margin-bottom: 3px;
          color: var(--mk-ink);
          font-size: 13.5px;
        }

        .readme-publish-steps span {
          display: block;
          color: var(--mk-ink-2);
          font-size: 12.5px;
          line-height: 1.45;
        }

        .readme-publish-steps .readme-publish-step-index {
          display: grid;
          color: var(--mk-blue-ink);
          font-size: 12px;
          line-height: 1;
        }

        .readme-publish-actions {
          display: grid;
          gap: 8px;
        }

        .readme-publish-actions .mk-btn:disabled {
          cursor: not-allowed;
          opacity: 0.48;
          box-shadow: none;
        }

        .readme-publish-dismiss {
          border: none;
          background: transparent;
          color: var(--mk-ink-3);
          font-size: 12.5px;
          font-weight: 750;
          cursor: pointer;
          padding: 6px;
        }

        .readme-mode-switch {
          display: flex;
          justify-content: center;
          gap: 4px;
          width: fit-content;
          max-width: 100%;
          margin: 0 auto 18px;
          padding: 4px;
          border-radius: 14px;
          border: 1px solid var(--mk-border);
          background: rgba(255,255,255,0.82);
          backdrop-filter: blur(10px);
        }

        .readme-mode-btn {
          padding: 9px 16px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: var(--mk-ink-2);
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }

        .readme-mode-btn.is-active {
          background: #12211a;
          color: #f4f7f4;
        }

        .mk.is-quick,
        .mk.is-studio {
          overflow-x: clip;
        }

        .mk.is-quick .readme-hero-intro {
          display: none;
        }

        @media (max-width: 720px) {
          .readme-publish-overlay {
            align-items: flex-end;
            padding: 8px;
          }

          .readme-publish-sheet {
            width: 100%;
            height: auto;
            max-height: calc(100dvh - 16px);
            padding: 18px;
            border-radius: 18px 18px 12px 12px;
            animation-name: readme-publish-sheet-up;
          }

          @keyframes readme-publish-sheet-up {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .readme-publish-setup {
            grid-template-columns: 1fr;
          }

          .readme-mode-switch {
            width: 100%;
          }

          .readme-mode-btn {
            flex: 1 1 0;
            min-width: 0;
            padding: 9px 10px;
            font-size: 12.5px;
          }

          .readme-hero-intro {
            padding-left: 16px !important;
            padding-right: 16px !important;
            padding-bottom: 18px !important;
          }

          .mk.is-quick main {
            padding-top: 78px !important;
          }

          .mk.is-studio main {
            padding-top: 0 !important;
          }
        }

        .readme-studio-guide-restart {
          margin-left: 10px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          color: #c6d0c9;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
        }

        .readme-studio-guide-restart:hover {
          color: #fff;
          border-color: rgba(255,255,255,0.28);
        }

        .readme-video-editor-shell {
          position: relative;
        }

        /* Guide focus mode: hide chrome + unused panels, spotlight one job */
        .readme-video-editor-shell.is-guiding .readme-studio-help-link,
        .readme-video-editor-shell.is-guiding .readme-studio-context-line + .readme-draft-state,
        .readme-video-editor-shell.is-guiding .readme-studio-guide-restart,
        .readme-video-editor-shell.is-guiding .readme-dashboard-link,
        .readme-video-editor-shell.is-guiding .readme-studio-upgrade-link,
        .readme-video-editor-shell.is-guiding .readme-draft-state,
        .readme-video-editor-shell.is-guiding .readme-panel-tabs,
        .readme-video-editor-shell.is-guiding .readme-preset-block,
        .readme-video-editor-shell.is-guiding .readme-mini-summary,
        .readme-video-editor-shell.is-guiding .readme-profile-scan-panel,
        .readme-video-editor-shell.is-guiding .readme-firstrun h2,
        .readme-video-editor-shell.is-guiding .readme-firstrun-copy,
        .readme-video-editor-shell.is-guiding .readme-firstrun-close,
        .readme-video-editor-shell.is-guiding .readme-bin-grid,
        .readme-video-editor-shell.is-guiding .readme-preview-sourcebar,
        .readme-video-editor-shell.is-guiding .readme-preview-section-heading,
        .readme-video-editor-shell.is-guiding .readme-monitor-actions {
          display: none !important;
        }

        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-studio-upgrade-link {
          display: inline-flex !important;
        }

        .readme-video-editor-shell.is-guiding.guide-export [data-guide-target='export'] {
          display: inline-flex !important;
        }

        .readme-video-editor-shell.is-guiding .readme-monitor-header strong {
          display: none;
        }

        .readme-video-editor-shell.is-guiding .readme-monitor-header span {
          color: rgba(255, 255, 255, 0.55);
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .readme-video-editor-shell.is-guiding.guide-profile,
        .readme-video-editor-shell.is-guiding.guide-visual {
          grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
          grid-template-rows: 56px minmax(0, 1fr);
        }

        .readme-video-editor-shell.is-guiding.guide-goal {
          grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
          grid-template-rows: 56px minmax(0, 1fr);
        }

        .readme-video-editor-shell.is-guiding.guide-structure {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: 56px minmax(0, 1fr) 168px;
        }

        .readme-video-editor-shell.is-guiding.guide-export,
        .readme-video-editor-shell.is-guiding.guide-signin,
        .readme-video-editor-shell.is-guiding.guide-upgrade {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: 64px minmax(0, 1fr);
        }

        .readme-video-editor-shell.is-guiding.guide-profile .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-profile .readme-editor-timeline,
        .readme-video-editor-shell.is-guiding.guide-profile .readme-topbar-actions,
        .readme-video-editor-shell.is-guiding.guide-visual .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-visual .readme-editor-timeline,
        .readme-video-editor-shell.is-guiding.guide-visual .readme-topbar-actions,
        .readme-video-editor-shell.is-guiding.guide-goal .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-goal .readme-editor-timeline,
        .readme-video-editor-shell.is-guiding.guide-goal .readme-topbar-actions,
        .readme-video-editor-shell.is-guiding.guide-structure .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-structure .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-structure .readme-topbar-actions,
        .readme-video-editor-shell.is-guiding.guide-export .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-export .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-export .readme-editor-timeline,
        .readme-video-editor-shell.is-guiding.guide-signin .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-signin .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-signin .readme-editor-timeline,
        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-editor-timeline {
          display: none !important;
        }

        .readme-video-editor-shell.is-guiding.guide-goal .readme-selected-section,
        .readme-video-editor-shell.is-guiding.guide-goal .readme-property-group:not([data-guide-spotlight='goal']) {
          display: none !important;
        }

        .readme-video-editor-shell.is-guiding.guide-profile .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-visual .readme-media-bin,
        .readme-video-editor-shell.is-guiding.guide-goal .readme-properties-panel,
        .readme-video-editor-shell.is-guiding.guide-structure .readme-editor-timeline,
        .readme-video-editor-shell.is-guiding.guide-export .readme-topbar-actions,
        .readme-video-editor-shell.is-guiding.guide-signin .readme-topbar-actions,
        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-topbar-actions {
          position: relative;
          z-index: 6;
          animation: guide-panel-pulse 1.8s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding.guide-signin .readme-topbar-actions > :not([data-guide-target='signin']),
        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-topbar-actions > :not([data-guide-target='upgrade']),
        .readme-video-editor-shell.is-guiding.guide-export .readme-topbar-actions > :not([data-guide-target='export']) {
          display: none !important;
        }

        .readme-video-editor-shell.is-guiding.guide-export [data-guide-target='export'] {
          animation: guide-cta-pulse 1.5s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding.guide-signin [data-guide-target='signin'],
        .readme-video-editor-shell.is-guiding.guide-upgrade [data-guide-target='upgrade'] {
          animation: guide-cta-pulse 1.5s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding.guide-profile [data-guide-target='profile'] {
          position: relative;
          border-radius: 12px;
          animation: guide-target-glow 1.6s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding.guide-profile [data-guide-target='profile'] input {
          animation: guide-input-caret 1.2s steps(1) infinite;
          box-shadow: 0 0 0 2px rgba(47, 187, 99, 0.55);
        }

        .readme-video-editor-shell.is-guiding.guide-profile [data-guide-target='profile-cta'] {
          animation: guide-cta-pulse 1.5s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding.guide-goal [data-guide-spotlight='goal'] .readme-option-stack > button {
          animation: guide-option-wave 2s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding.guide-goal [data-guide-spotlight='goal'] .readme-option-stack > button:nth-child(2) {
          animation-delay: 0.12s;
        }

        .readme-video-editor-shell.is-guiding.guide-goal [data-guide-spotlight='goal'] .readme-option-stack > button:nth-child(3) {
          animation-delay: 0.24s;
        }

        .readme-video-editor-shell.is-guiding.guide-goal [data-guide-spotlight='goal'] .readme-option-stack > button:nth-child(4) {
          animation-delay: 0.36s;
        }

        .readme-video-editor-shell.is-guiding.guide-structure .readme-track article:first-child {
          animation: guide-target-glow 1.6s ease-in-out infinite;
          border-radius: 12px;
        }

        .readme-video-editor-shell.is-guiding.guide-visual .readme-asset-snippets button:first-of-type {
          animation: guide-cta-pulse 1.5s ease-in-out infinite;
        }

        .readme-video-editor-shell.is-guiding .readme-player-monitor {
          position: relative;
          z-index: 3;
          opacity: 0.55;
          filter: saturate(0.7);
          pointer-events: none;
          transition: opacity 0.35s ease, filter 0.35s ease;
        }

        .readme-video-editor-shell.is-guiding.guide-structure .readme-player-monitor,
        .readme-video-editor-shell.is-guiding.guide-export .readme-player-monitor,
        .readme-video-editor-shell.is-guiding.guide-signin .readme-player-monitor,
        .readme-video-editor-shell.is-guiding.guide-upgrade .readme-player-monitor {
          opacity: 1;
          filter: none;
          pointer-events: auto;
        }

        .readme-video-editor-shell.is-guiding.guide-export .readme-monitor-actions {
          display: flex !important;
        }

        .readme-studio-coach {
          position: absolute;
          z-index: 20;
          width: min(320px, calc(100% - 28px));
          padding: 14px 16px 12px;
          border-radius: 16px;
          border: 1px solid rgba(22, 163, 74, 0.28);
          background: rgba(255, 255, 255, 0.98);
          color: var(--mk-ink);
          box-shadow: 0 18px 50px -24px rgba(18, 40, 28, 0.55);
          backdrop-filter: blur(10px);
          animation: guide-coach-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .readme-studio-guide-arrow-stroke {
          animation: guide-arrow-dash 1.15s linear infinite;
        }

        .readme-studio-guide-arrow {
          position: absolute;
          inset: 0;
          z-index: 18;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: visible;
          animation: guide-arrow-fade 0.45s ease both;
        }

        .readme-studio-guide-arrow-orb {
          transform-box: fill-box;
          transform-origin: center;
          animation: guide-arrow-orb 1.35s ease-in-out infinite;
          filter: drop-shadow(0 0 6px rgba(52, 209, 125, 0.7));
        }

        .readme-studio-coach.dock-profile,
        .readme-studio-coach.dock-visual {
          left: calc(340px + (100% - 340px) * 0.62);
          top: 46%;
          bottom: auto;
          transform: translate(-50%, -50%);
          width: min(340px, calc(100% - 420px));
        }

        .readme-studio-coach.dock-goal {
          left: calc((100% - 360px) * 0.38);
          right: auto;
          top: 46%;
          bottom: auto;
          transform: translate(-50%, -50%);
          width: min(340px, calc(100% - 420px));
        }

        .readme-studio-coach.dock-structure {
          left: 50%;
          bottom: 210px;
          top: auto;
          transform: translateX(-50%);
          width: min(380px, calc(100% - 32px));
        }

        .readme-studio-coach.dock-export,
        .readme-studio-coach.dock-signin,
        .readme-studio-coach.dock-upgrade {
          left: 50%;
          top: 120px;
          bottom: auto;
          transform: translateX(-50%);
          width: min(380px, calc(100% - 32px));
        }

        @keyframes guide-coach-in {
          from {
            opacity: 0;
            filter: blur(5px);
            scale: 0.96;
          }
          to {
            opacity: 1;
            filter: blur(0);
            scale: 1;
          }
        }

        @keyframes guide-arrow-dash {
          to {
            stroke-dashoffset: -28;
          }
        }

        @keyframes guide-arrow-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes guide-arrow-orb {
          0%, 100% {
            opacity: 0.7;
            transform: scale(0.85);
          }
          50% {
            opacity: 1;
            transform: scale(1.35);
          }
        }

        @keyframes guide-panel-pulse {
          0%, 100% {
            box-shadow: 0 0 0 2px rgba(47, 187, 99, 0.55), 0 18px 48px -28px rgba(47, 187, 99, 0.35);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(47, 187, 99, 0.85), 0 22px 56px -24px rgba(47, 187, 99, 0.55);
          }
        }

        @keyframes guide-target-glow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(47, 187, 99, 0.35);
          }
          50% {
            box-shadow: 0 0 0 6px rgba(47, 187, 99, 0.18);
          }
        }

        @keyframes guide-cta-pulse {
          0%, 100% {
            transform: translateY(0);
            box-shadow: 0 0 0 0 rgba(47, 187, 99, 0.35);
            filter: brightness(1);
          }
          50% {
            transform: translateY(-1px);
            box-shadow: 0 0 0 8px rgba(47, 187, 99, 0);
            filter: brightness(1.08);
          }
        }

        @keyframes guide-option-wave {
          0%, 100% {
            border-color: rgba(47, 187, 99, 0.18);
          }
          50% {
            border-color: rgba(47, 187, 99, 0.7);
          }
        }

        @keyframes guide-input-caret {
          0%, 49% {
            caret-color: #2fbb63;
          }
          50%, 100% {
            caret-color: transparent;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .readme-studio-coach,
          .readme-studio-guide-arrow,
          .readme-studio-guide-arrow-stroke,
          .readme-studio-guide-arrow-orb,
          .readme-video-editor-shell.is-guiding.guide-profile .readme-media-bin,
          .readme-video-editor-shell.is-guiding.guide-visual .readme-media-bin,
          .readme-video-editor-shell.is-guiding.guide-goal .readme-properties-panel,
          .readme-video-editor-shell.is-guiding.guide-structure .readme-editor-timeline,
          .readme-video-editor-shell.is-guiding.guide-export .readme-topbar-actions,
          .readme-video-editor-shell.is-guiding [data-guide-target],
          .readme-video-editor-shell.is-guiding [data-guide-spotlight='goal'] .readme-option-stack > button,
          .readme-video-editor-shell.is-guiding.guide-export [data-guide-target='export'] {
            animation: none !important;
          }
        }

        .readme-studio-coach-progress {
          margin-bottom: 6px;
          color: var(--mk-blue-ink);
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .readme-studio-coach strong {
          display: block;
          font-size: 15px;
          letter-spacing: -0.02em;
        }

        .readme-studio-coach p {
          margin: 6px 0 12px;
          color: var(--mk-ink-2);
          font-size: 13px;
          line-height: 1.45;
        }

        .readme-studio-coach-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .readme-studio-coach-skip {
          border: none;
          background: transparent;
          color: var(--mk-ink-3);
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          padding: 0;
        }

        .readme-studio-coach-nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .readme-studio-coach-back,
        .readme-studio-coach-next {
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 12.5px;
          font-weight: 800;
          cursor: pointer;
        }

        .readme-studio-coach-back {
          border: 1px solid var(--mk-border);
          background: #fff;
          color: var(--mk-ink-2);
        }

        .readme-studio-coach-back:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .readme-studio-coach-next {
          border: none;
          background: linear-gradient(180deg, #2fbb63 0%, var(--mk-blue) 100%);
          color: #fff;
          box-shadow: var(--mk-shadow-blue);
        }

        @media (max-width: 1100px) {
          .readme-video-editor-shell.is-guiding.guide-profile,
          .readme-video-editor-shell.is-guiding.guide-visual,
          .readme-video-editor-shell.is-guiding.guide-goal,
          .readme-video-editor-shell.is-guiding.guide-structure,
          .readme-video-editor-shell.is-guiding.guide-export,
          .readme-video-editor-shell.is-guiding.guide-signin,
          .readme-video-editor-shell.is-guiding.guide-upgrade {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: auto auto minmax(220px, 1fr) auto;
          }

          .readme-studio-coach.dock-profile,
          .readme-studio-coach.dock-visual,
          .readme-studio-coach.dock-goal,
          .readme-studio-coach.dock-structure,
          .readme-studio-coach.dock-export,
          .readme-studio-coach.dock-signin,
          .readme-studio-coach.dock-upgrade {
            left: 12px;
            right: 12px;
            top: auto;
            bottom: 12px;
            width: auto;
            transform: none;
          }

          .readme-studio-guide-arrow {
            display: none;
          }
        }

        .mk.is-studio .readme-hero-intro,
        .mk.is-studio .readme-summary-section,
        .mk.is-studio .readme-usage-banner {
          display: none;
        }

        body.readme-studio-fullscreen {
          background: #f4f7f4;
          overflow: hidden;
        }

        body.readme-studio-fullscreen .site-navigation {
          display: none !important;
        }

        .readme-usage-banner > div {
          border-radius: 6px !important;
          padding: 8px 12px !important;
        }

        .readme-editor-section {
          max-width: 1600px !important;
          padding: 0 20px 36px !important;
        }

        .readme-video-editor-shell {
          background:
            radial-gradient(1100px 420px at 50% -12%, rgba(47,227,168,0.10), transparent 72%),
            linear-gradient(180deg, rgba(19,23,31,0.98), rgba(11,13,18,0.98));
          border: 1px solid rgba(18,33,26,0.14);
          border-radius: 22px;
          display: grid;
          grid-template-columns: minmax(180px, 218px) minmax(0, 1fr) minmax(184px, 224px);
          grid-template-rows: 54px minmax(0, 1fr) 96px;
          gap: 1px;
          height: calc(100vh - 150px);
          min-height: 640px;
          max-width: 100%;
          overflow: hidden;
          box-shadow:
            0 34px 90px -34px rgba(18,33,26,0.46),
            0 1px 0 0 rgba(255,255,255,0.05) inset;
        }

        .mk.is-studio {
          min-height: 100vh !important;
        }

        .mk.is-studio .readme-editor-section {
          max-width: none !important;
          padding: 0 !important;
        }

        .mk.is-studio .readme-video-editor-shell {
          border: 0;
          border-radius: 0;
          height: 100vh;
          min-height: 100vh;
          width: 100vw;
        }

        .readme-video-topbar {
          grid-column: 1 / -1;
          align-items: center;
          background: rgba(8, 10, 14, 0.92);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: grid;
          grid-template-columns: 108px minmax(0, 1fr) auto;
          gap: 12px;
          padding: 0 12px;
          overflow: visible;
          position: relative;
          z-index: 120;
        }

        .readme-studio-brand {
          color: #f3f5f9;
          font-family: var(--font-display), 'Space Grotesk', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 750;
          letter-spacing: -0.03em;
          text-decoration: none;
        }

        .readme-studio-brand:hover {
          color: var(--mk-blue-ink);
        }

        .readme-video-topbar > div:nth-child(2) {
          text-align: center;
          min-width: 0;
        }

        .readme-studio-context {
          align-items: center;
          display: flex;
          gap: 10px;
          justify-content: center;
          min-width: 0;
        }

        .readme-studio-context-line {
          align-items: center;
          color: rgba(243, 245, 249, 0.72);
          display: inline-flex;
          font-size: 12.5px;
          font-weight: 600;
          gap: 8px;
          margin: 0;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .readme-studio-context-line strong {
          color: #f3f5f9;
          font-size: 12.5px;
          font-weight: 750;
          margin: 0;
        }

        .readme-studio-context-line span {
          color: rgba(243, 245, 249, 0.42);
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: 0;
          text-transform: none;
        }

        .readme-draft-state {
          background: transparent;
          border: none;
          border-radius: 0;
          color: rgba(243, 245, 249, 0.38);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.04em;
          line-height: 1;
          padding: 0;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .readme-draft-state.is-error {
          color: #f87171;
        }

        .readme-topbar-actions {
          align-items: center;
          display: flex;
          gap: 8px;
          justify-self: end;
        }

        .readme-topbar-publish {
          align-items: center;
          background: linear-gradient(180deg, #2fbb63, #16a34a) !important;
          border: 1px solid rgba(22, 163, 74, 0.22) !important;
          border-radius: 999px !important;
          box-shadow: 0 12px 28px rgba(22, 163, 74, 0.18) !important;
          color: #ffffff !important;
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          font-weight: 800;
          justify-content: center;
          min-height: 34px;
          padding: 0 14px !important;
          white-space: nowrap;
        }

        .readme-topbar-publish:not(:disabled):hover {
          filter: brightness(1.02);
          transform: translateY(-1px);
        }

        .readme-topbar-publish:disabled {
          cursor: not-allowed;
          opacity: 0.48;
          transform: none;
        }

        .readme-topbar-secondary,
        .readme-topbar-menu-trigger {
          align-items: center;
          background: transparent !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          border-radius: 999px !important;
          box-shadow: none !important;
          color: rgba(243, 245, 249, 0.88) !important;
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          font-weight: 700;
          justify-content: center;
          min-height: 34px;
          padding: 0 12px !important;
        }

        .readme-topbar-secondary:hover,
        .readme-topbar-menu-trigger:hover {
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(255,255,255,0.22) !important;
          filter: none !important;
          transform: none !important;
        }

        .readme-topbar-secondary.is-copied {
          border-color: rgba(47, 187, 99, 0.45) !important;
          color: #86efac !important;
        }

        .readme-topbar-secondary.is-locked {
          background: rgba(255, 255, 255, 0.04) !important;
          border-color: rgba(251, 191, 36, 0.3) !important;
          color: rgba(251, 191, 36, 0.86) !important;
        }

        .readme-export-state {
          align-items: center;
          background: linear-gradient(180deg, rgba(236, 253, 245, 0.98), rgba(220, 252, 231, 0.92));
          border: 1px solid rgba(22, 163, 74, 0.2);
          border-radius: 999px;
          box-shadow: 0 12px 28px -22px rgba(22, 163, 74, 0.65);
          color: var(--mk-ink);
          display: inline-flex;
          gap: 6px;
          min-height: 34px;
          padding: 0 5px 0 12px;
          white-space: nowrap;
        }

        .readme-export-state span {
          color: var(--mk-blue-ink);
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .readme-export-state a {
          align-items: center;
          background: linear-gradient(180deg, #2fbb63 0%, var(--mk-blue) 100%);
          border-radius: 999px;
          box-shadow: 0 10px 22px -16px rgba(22, 163, 74, 0.85);
          color: #fff;
          display: inline-flex;
          font-size: 11px;
          font-weight: 850;
          min-height: 24px;
          padding: 0 10px;
          text-decoration: none;
        }

        .readme-export-credit-pill {
          align-items: center;
          background: rgba(22, 163, 74, 0.1);
          border: 1px solid rgba(22, 163, 74, 0.2);
          border-radius: 999px;
          color: var(--mk-blue-ink);
          display: inline-flex;
          font-size: 11px;
          font-weight: 900;
          justify-content: center;
          min-height: 24px;
          padding: 0 10px;
          white-space: nowrap;
        }

        .readme-export-state button {
          background: transparent;
          border: none;
          border-radius: 999px;
          color: var(--mk-blue-ink);
          cursor: pointer;
          font-size: 11px;
          font-weight: 800;
          min-height: 23px;
          padding: 0 8px;
        }

        .readme-export-state button:hover {
          background: rgba(22, 163, 74, 0.08);
        }

        .readme-export-state .readme-export-review {
          background: linear-gradient(180deg, #2fbb63, #16a34a);
          color: #fff;
          padding: 0 10px;
        }

        .readme-export-state .readme-export-review:hover {
          background: #15803d;
        }

        .readme-topbar-menu {
          position: relative;
          z-index: 130;
        }

        .readme-topbar-menu-trigger {
          gap: 3px;
          min-width: 34px;
          padding: 0 !important;
          width: 34px;
        }

        .readme-topbar-menu-trigger span {
          background: rgba(243, 245, 249, 0.82);
          border-radius: 999px;
          display: block;
          height: 3px;
          letter-spacing: 0;
          text-transform: none;
          width: 3px;
        }

        .readme-topbar-menu-panel {
          background: rgba(14, 16, 22, 0.98);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          box-shadow: 0 22px 50px -28px rgba(0, 0, 0, 0.75);
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 188px;
          padding: 8px;
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          z-index: 200;
        }

        .readme-topbar-menu-panel a,
        .readme-topbar-menu-panel button {
          align-items: center;
          background: transparent !important;
          border: none !important;
          border-radius: 10px !important;
          box-shadow: none !important;
          color: rgba(243, 245, 249, 0.9) !important;
          cursor: pointer;
          display: flex;
          font-size: 12.5px !important;
          font-weight: 650 !important;
          justify-content: flex-start;
          min-height: 36px;
          padding: 0 10px !important;
          text-decoration: none;
          width: 100%;
        }

        .readme-topbar-menu-panel a:hover,
        .readme-topbar-menu-panel button:hover {
          background: rgba(255,255,255,0.06) !important;
          filter: none !important;
          transform: none !important;
        }

        .readme-topbar-menu-panel button:disabled {
          color: rgba(243, 245, 249, 0.28) !important;
          cursor: not-allowed;
        }

        .readme-studio-upgrade-link {
          align-items: center;
          background: transparent;
          border: 1px solid rgba(47, 187, 99, 0.35);
          border-radius: 999px;
          box-shadow: none;
          color: #86efac;
          display: inline-flex;
          font-size: 12px;
          font-weight: 750;
          justify-content: center;
          min-height: 34px;
          padding: 0 12px;
          text-decoration: none;
          white-space: nowrap;
        }

        .readme-topbar-menu-panel .readme-studio-upgrade-link {
          border: none;
          border-radius: 10px;
          color: #86efac;
          justify-content: flex-start;
          padding: 0 10px;
        }

        .readme-topbar-primary {
          background: linear-gradient(180deg, #2fbb63 0%, #16a34a 100%) !important;
          border: none !important;
          border-radius: 999px !important;
          box-shadow: 0 10px 24px -14px rgba(22, 163, 74, 0.8), 0 1px 0 rgba(255,255,255,0.2) inset !important;
          color: #fff !important;
          cursor: pointer;
          font-size: 12.5px !important;
          font-weight: 800 !important;
          min-height: 34px;
          padding: 0 16px !important;
        }

        .readme-topbar-primary:not(:disabled):hover {
          filter: brightness(1.05) !important;
          transform: translateY(-1px) !important;
        }

        .readme-topbar-primary:disabled {
          background: #2a2d35 !important;
          box-shadow: none !important;
          color: #7b8089 !important;
          cursor: not-allowed;
        }

        .readme-video-topbar button {
          transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }

        .readme-monitor-header span,
        .readme-timeline-toolbar span {
          color: #7b8089;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .readme-monitor-header strong {
          color: #f3f5f9;
          display: block;
          font-size: 13px;
          font-weight: 800;
          margin-top: 2px;
        }

        .readme-media-bin,
        .readme-player-monitor,
        .readme-properties-panel,
        .readme-editor-timeline {
          background: linear-gradient(180deg, #15181f 0%, #111319 100%);
          min-width: 0;
          min-height: 0;
        }

        .readme-media-bin,
        .readme-properties-panel {
          overflow: auto;
          overflow-x: hidden;
          padding: 14px;
        }

        .readme-panel-tabs {
          display: flex;
          gap: 18px;
          margin-bottom: 14px;
          white-space: nowrap;
        }

        .readme-panel-tabs span,
        .readme-panel-tabs button {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #8d8d8d;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          padding: 0 0 8px;
          transition: color 0.15s ease, border-color 0.15s ease;
        }

        .readme-panel-tabs span:hover,
        .readme-panel-tabs button:hover {
          color: #c8ccd4;
        }

        .readme-panel-tabs .active,
        .readme-panel-tabs button.active {
          color: #2fe3a8;
          border-bottom-color: #2fe3a8;
        }

        .readme-media-tab-panel {
          display: grid;
          gap: 18px;
        }

        .readme-firstrun {
          position: relative;
          background:
            radial-gradient(360px 180px at 20% -20%, rgba(47,227,168,0.22), transparent 72%),
            radial-gradient(280px 160px at 100% 0%, rgba(88,166,255,0.12), transparent 68%),
            linear-gradient(180deg, #18201d, #10141a);
          border: 1px solid rgba(47,227,168,0.34);
          border-radius: 16px;
          padding: 18px;
          display: grid;
          gap: 14px;
          animation: rs-sheet-in 0.28s ease-out both;
          box-shadow: 0 18px 42px -28px rgba(47,227,168,0.75);
        }

        .readme-firstrun h2 {
          color: #f4fff9;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1.08;
          margin: 0;
          max-width: 250px;
        }

        .readme-firstrun-copy {
          color: #b9c4bf;
          font-size: 12.5px;
          line-height: 1.5;
          margin: 0;
        }

        .readme-firstrun-copy strong { color: #2fe3a8; }
        .readme-firstrun-copy em { color: #f3f5f9; font-style: normal; font-weight: 700; }

        .readme-firstrun-field {
          margin-bottom: 0;
        }

        .readme-firstrun .readme-editor-field span {
          color: #84f7c2;
        }

        .readme-firstrun .readme-editor-field input {
          background: #fff;
          border-color: rgba(255,255,255,0.18);
          color: #12211a;
        }

        .readme-firstrun-actions {
          display: grid;
          gap: 8px;
        }

        .readme-firstrun-cta {
          background: linear-gradient(180deg, #45efb9 0%, #24c78f 100%);
          border: none;
          border-radius: 10px;
          color: #04110c;
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 800;
          padding: 11px 14px;
          transition: filter 0.15s ease, transform 0.15s ease;
          width: 100%;
        }

        .readme-firstrun-cta:hover { filter: brightness(1.05); transform: translateY(-1px); }

        .readme-firstrun-cta:disabled {
          cursor: not-allowed;
          filter: grayscale(0.5);
          opacity: 0.55;
          transform: none;
        }

        .readme-firstrun-secondary {
          background: rgba(255,255,255,0.055);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px;
          color: #d5ddd9;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          padding: 10px 12px;
          width: 100%;
        }

        .readme-firstrun-secondary:hover {
          background: rgba(255,255,255,0.085);
          color: #fff;
        }

        .readme-firstrun-close {
          position: absolute;
          top: 8px;
          right: 9px;
          background: transparent;
          border: none;
          color: #7c828d;
          cursor: pointer;
          font-size: 17px;
          line-height: 1;
          padding: 2px 4px;
        }

        .readme-firstrun-close:hover { color: #e3e7ee; }

        .readme-copied-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #2fe3a8;
        }
        .readme-topbar-actions button.is-copied {
          border-color: rgba(47,227,168,0.45) !important;
        }

        .readme-toast-action {
          background: rgba(40, 216, 156, 0.14);
          border: 1px solid rgba(40, 216, 156, 0.4);
          border-radius: 8px;
          color: #9ff5d7;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          margin-left: 4px;
          padding: 5px 10px;
        }

        .readme-toast-action:hover {
          background: rgba(40, 216, 156, 0.22);
        }

        .readme-toast {
          position: fixed;
          bottom: 22px;
          right: 22px;
          z-index: 1100;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 16px 11px 11px;
          background: linear-gradient(180deg, #16191f, #0f1116);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #eceff4;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 24px 50px -20px rgba(0,0,0,0.9), 0 1px 0 0 rgba(255,255,255,0.05) inset;
          backdrop-filter: blur(10px);
          animation: rs-toast-in 0.3s cubic-bezier(0.2,0.8,0.2,1) both;
        }
        @keyframes rs-toast-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .readme-toast-check {
          display: grid;
          place-items: center;
          width: 22px;
          height: 22px;
          border-radius: 7px;
          background: linear-gradient(180deg, #3ee08f, #21c274);
          color: #04110c;
          animation: rs-check-pop 0.42s cubic-bezier(0.2,0.9,0.25,1.25) both 0.08s;
        }
        @keyframes rs-check-pop {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .readme-toast, .readme-toast-check { animation: none; }
        }

        @media (max-width: 560px) {
          .readme-upgrade-title {
            white-space: normal;
          }

          .readme-pro-value-grid {
            grid-template-columns: 1fr;
          }
        }

        .readme-ai-pro-notice {
          display: grid;
          gap: 5px;
          width: 100%;
          text-align: left;
          background:
            radial-gradient(260px 110px at 100% -10%, rgba(52, 209, 125, 0.15), transparent 70%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(238, 244, 238, 0.86));
          border: 1px solid rgba(22, 163, 74, 0.2);
          border-radius: 16px;
          box-shadow: var(--mk-shadow-sm);
          color: var(--mk-ink);
          padding: 13px 14px;
          margin-bottom: 14px;
          cursor: pointer;
          transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .readme-ai-pro-notice:hover {
          border-color: rgba(22, 163, 74, 0.36);
          transform: translateY(-1px);
        }
        .readme-ai-pro-notice strong {
          color: var(--mk-ink);
          font-size: 13.5px;
          font-weight: 900;
          line-height: 1.2;
        }
        .readme-ai-pro-notice span {
          color: var(--mk-ink-2);
          font-size: 12px;
          font-weight: 650;
          line-height: 1.45;
        }

        .readme-pro-value-card {
          background:
            radial-gradient(220px 120px at 100% 0%, rgba(52, 209, 125, 0.16), transparent 70%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(238, 244, 238, 0.82));
          border: 1px solid rgba(22, 163, 74, 0.18);
          border-radius: 18px;
          box-shadow: var(--mk-shadow-sm);
          display: grid;
          gap: 12px;
          margin: 0 0 16px;
          padding: 14px;
        }

        .readme-pro-value-card.has-pro-draft {
          border-color: rgba(22, 163, 74, 0.34);
          box-shadow: 0 18px 42px -32px rgba(22, 163, 74, 0.7), var(--mk-shadow-sm);
        }

        .readme-pro-value-head {
          align-items: center;
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .readme-pro-value-head div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .readme-pro-value-head span,
        .readme-pro-value-grid span {
          color: var(--mk-blue-ink);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readme-pro-value-head strong {
          color: var(--mk-ink);
          font-size: 14px;
          font-weight: 900;
          line-height: 1.2;
        }

        .readme-pro-value-head a,
        .readme-free-export-button {
          align-items: center;
          background: linear-gradient(180deg, #2fbb63, #16a34a);
          border: 0;
          border-radius: 999px;
          color: #fff;
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          font-weight: 900;
          justify-content: center;
          min-height: 32px;
          padding: 0 12px;
          text-decoration: none;
          white-space: nowrap;
        }

        .readme-pro-value-grid {
          display: grid;
          gap: 8px;
          grid-template-columns: 1fr 1fr;
        }

        .readme-pro-value-grid div {
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(18, 33, 26, 0.08);
          border-radius: 14px;
          display: grid;
          gap: 5px;
          min-width: 0;
          padding: 10px;
        }

        .readme-pro-value-grid strong {
          color: var(--mk-ink);
          font-size: 12.5px;
          font-weight: 900;
          line-height: 1.2;
        }

        .readme-pro-value-grid small {
          color: var(--mk-ink-2);
          font-size: 11px;
          font-weight: 650;
          line-height: 1.35;
        }

        .readme-free-export-button {
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(22, 163, 74, 0.26);
          color: var(--mk-blue-ink);
          width: 100%;
        }

        .readme-disclosure-toggle {
          align-items: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 9px;
          color: #b6bbc4;
          cursor: pointer;
          display: flex;
          font-size: 12px;
          font-weight: 700;
          justify-content: space-between;
          letter-spacing: 0.02em;
          padding: 11px 12px;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          width: 100%;
        }

        .readme-disclosure-toggle:hover {
          background: rgba(255,255,255,0.055);
          border-color: rgba(255,255,255,0.14);
          color: #e3e7ee;
        }

        .readme-disclosure-toggle em {
          color: #2fe3a8;
          font-size: 16px;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
        }

        .readme-preset-block {
          display: grid;
          gap: 9px;
        }

        .readme-preset-label {
          color: #7c828d;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .readme-preset-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .readme-preset-card {
          background: linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012));
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 9px;
          cursor: pointer;
          display: grid;
          gap: 3px;
          padding: 9px 10px;
          text-align: left;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .readme-preset-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.16);
          box-shadow: 0 10px 22px -14px rgba(0,0,0,0.9);
          background: linear-gradient(160deg, rgba(255,255,255,0.065), rgba(255,255,255,0.02));
        }

        .readme-preset-card.active {
          border-color: var(--preset-accent, #2fe3a8);
          box-shadow: 0 0 0 1px var(--preset-accent, #2fe3a8) inset;
        }

        .readme-preset-card strong {
          color: #eceff4;
          font-size: 12px;
          font-weight: 800;
        }

        .readme-preset-card small {
          color: #8b909a;
          font-size: 10px;
          line-height: 1.3;
        }

        .readme-mini-summary {
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 7px;
          display: grid;
          gap: 6px;
          padding: 12px;
        }

        .readme-mini-summary span {
          color: #7c828d;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .readme-mini-summary strong {
          color: #e3e7ee;
          font-size: 13px;
        }

        .readme-mini-summary p {
          color: #8d8d8d;
          font-size: 12px;
          line-height: 1.45;
          margin: 0;
        }

        .readme-profile-scan-panel {
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 7px;
          display: grid;
          gap: 8px;
          padding: 12px;
        }

        .readme-profile-scan-panel > span {
          color: #58a6ff;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .readme-profile-scan-panel div {
          border-top: 1px solid rgba(255,255,255,0.06);
          display: grid;
          gap: 3px;
          padding-top: 8px;
        }

        .readme-profile-scan-panel div:first-of-type {
          border-top: none;
          padding-top: 0;
        }

        .readme-profile-scan-panel small {
          color: #8aa4c7;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readme-profile-scan-panel strong {
          color: #dbeafe;
          font-size: 12px;
          line-height: 1.35;
        }

        .readme-editor-field {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
        }

        .readme-editor-field.compact {
          margin-bottom: 8px;
        }

        .readme-editor-field span,
        .readme-property-group h3 {
          color: #e3e7ee;
          font-size: 13px;
          font-weight: 900;
          margin: 0;
        }

        .readme-editor-field input,
        .readme-editor-field textarea,
        .readme-property-group select {
          background: #0b0d12;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          outline: none;
          padding: 11px 12px;
          width: 100%;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .readme-editor-field input:focus,
        .readme-editor-field textarea:focus,
        .readme-property-group select:focus {
          border-color: rgba(47,227,168,0.55);
          background: #0d1016;
          box-shadow: 0 0 0 3px rgba(47,227,168,0.14);
        }

        .readme-editor-field input::placeholder,
        .readme-editor-field textarea::placeholder {
          color: #5a6069;
        }

        .readme-editor-field textarea {
          line-height: 1.45;
          resize: vertical;
        }

        .readme-bin-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .readme-bin-grid button {
          aspect-ratio: 1.35;
          background: #0e1015;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          color: #aaa;
          cursor: pointer;
          display: grid;
          font-size: 12px;
          font-weight: 800;
          gap: 8px;
          justify-items: start;
          padding: 10px;
          position: relative;
          text-align: left;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        .readme-bin-grid button.pro-export {
          padding-bottom: 34px;
        }

        .readme-bin-grid button:not(:disabled):hover {
          transform: translateY(-2px);
          background: #12151b;
          border-color: rgba(255,255,255,0.16);
          box-shadow: 0 12px 24px -14px rgba(0,0,0,0.9);
        }

        .readme-bin-grid button span {
          background:
            radial-gradient(circle at 30% 30%, var(--theme-color), transparent 44%),
            linear-gradient(135deg, #202020, #070707);
          border-radius: 5px;
          display: block;
          height: 42px;
          width: 100%;
        }

        .readme-bin-grid button.active {
          border-color: var(--theme-color);
          color: #fff;
        }

        .readme-bin-grid button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .readme-bin-grid small {
          color: #666;
          font-size: 9px;
          font-weight: 950;
          line-height: 1;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .readme-bin-grid button.pro-export small {
          background: linear-gradient(180deg, #ffd67a, #f0a92e);
          border-radius: 999px;
          bottom: 11px;
          color: #2a1c02;
          left: 10px;
          padding: 5px 7px;
          position: absolute;
        }

        .readme-asset-snippets {
          border-top: 1px solid rgba(255,255,255,0.09);
          display: grid;
          gap: 8px;
          margin-top: 16px;
          padding-top: 16px;
        }

        .readme-asset-snippets h3 {
          color: #e3e7ee;
          font-size: 13px;
          font-weight: 900;
          margin: 0 0 4px;
        }

        .readme-asset-snippets button {
          align-items: center;
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 6px;
          color: #d8d8d8;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px;
          text-align: left;
        }

        .readme-asset-snippets button.default,
        .readme-asset-snippets button.active {
          background: rgba(40, 216, 156, 0.07);
          border-color: rgba(40, 216, 156, 0.24);
        }

        .readme-asset-snippets button:disabled {
          cursor: default;
        }

        .readme-asset-snippets button span {
          font-size: 12px;
          font-weight: 900;
        }

        .readme-asset-snippets button small {
          color: #2fe3a8;
          font-size: 11px;
          font-weight: 800;
        }

        .readme-player-monitor {
          display: grid;
          grid-template-rows: 44px minmax(0, 1fr);
          padding: 14px;
          position: relative;
          overflow: hidden;
        }

        /* Ambient atmosphere: a slow-drifting aurora + faint film grain behind
           the glassy preview canvas, the "premium product" signal. */
        .readme-player-monitor::before {
          content: '';
          position: absolute;
          inset: -25%;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(38% 38% at 24% 22%, rgba(47,227,168,0.16), transparent 70%),
            radial-gradient(44% 44% at 80% 34%, rgba(88,166,255,0.14), transparent 70%),
            radial-gradient(46% 46% at 56% 88%, rgba(167,139,250,0.12), transparent 70%);
          animation: rs-aurora-drift 26s ease-in-out infinite alternate;
        }

        .readme-player-monitor::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0.045;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 140px 140px;
        }

        .readme-player-monitor > * {
          position: relative;
          z-index: 1;
        }

        @keyframes rs-aurora-drift {
          0% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(2.5%, -2%, 0) scale(1.09); }
          100% { transform: translate3d(-2.5%, 2.5%, 0) scale(1.02); }
        }

        @media (prefers-reduced-motion: reduce) {
          .readme-player-monitor::before { animation: none; }
        }

        .readme-monitor-header {
          align-items: center;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }

        .readme-monitor-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
          min-width: 0;
        }

        .readme-monitor-actions button {
          align-items: center;
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 5px;
          color: #999;
          cursor: pointer;
          display: inline-flex;
          font-size: 11px;
          font-weight: 800;
          gap: 5px;
          padding: 6px 9px;
        }

        .readme-monitor-actions button.active {
          background: rgba(40,216,156,0.12);
          border-color: #2fe3a8;
          color: #2fe3a8;
        }

        .readme-monitor-actions button.locked {
          border-color: rgba(47, 227, 168, 0.2);
          color: rgba(243, 245, 249, 0.72);
        }

        .readme-monitor-actions button small {
          background: rgba(47, 227, 168, 0.14);
          border: 1px solid rgba(47, 227, 168, 0.2);
          border-radius: 999px;
          color: #86efac;
          font-size: 8px;
          font-weight: 950;
          letter-spacing: 0.06em;
          line-height: 1;
          padding: 3px 5px;
          text-transform: uppercase;
        }

        .readme-document-frame {
          align-items: center;
          background:
            radial-gradient(circle at 50% 0%, rgba(88, 166, 255, 0.06), transparent 35%),
            rgba(10, 11, 15, 0.42);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 14px;
          display: flex;
          justify-content: center;
          overflow: auto;
          padding: 12px;
        }

        .readme-document-preview,
        .readme-document-code,
        .readme-document-empty {
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 12px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.45);
          color: #c9d1d9;
          height: 100%;
          max-width: 1220px;
          overflow: auto;
          padding: 26px;
          width: 100%;
        }

        .readme-gitskins-preview.github-mode {
          background: #0d1117;
          border-color: #30363d;
          box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.08), 0 24px 80px rgba(0,0,0,0.48);
          max-width: 1160px;
        }

        .readme-gitskins-preview.github-mode .readme-preview-sourcebar {
          background: #161b22;
          border-color: #30363d;
        }

        .readme-document-preview {
          font-size: 14px;
          line-height: 1.65;
        }

        .readme-document-preview h1,
        .readme-document-preview h2,
        .readme-document-preview h3 {
          color: #f0f6fc;
        }

        .readme-document-preview a {
          color: #58a6ff;
        }

        .readme-document-preview blockquote {
          background: rgba(40,216,156,0.08);
          border-left: 3px solid #2fe3a8;
          border-radius: 6px;
          color: #9ff5d7;
          margin: 12px 0;
          padding: 10px 12px;
        }

        .readme-document-preview img {
          display: block;
          max-width: 100%;
        }

        .readme-gitskins-preview {
          background:
            linear-gradient(180deg, rgba(13,17,23,0.98), rgba(10,13,18,0.98)),
            #0d1117;
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 28px;
        }

        .readme-advanced-reference-preview {
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 12px;
          min-height: 100%;
          overflow: auto;
          padding: 20px;
        }

        .readme-advanced-reference-preview img {
          display: block;
          height: auto;
          margin: 0 auto 18px;
          max-width: 100%;
          width: 100%;
        }

        .readme-advanced-reference-preview img:last-child { margin-bottom: 0; }

        .readme-advanced-reference-preview h2 {
          border-bottom: 1px solid #30363d;
          color: #f0f6fc;
          font-size: 22px;
          margin: 22px 0 12px;
          padding-bottom: 8px;
        }

        .readme-advanced-reference-preview pre {
          background: #161b22;
          border: 1px solid #21262d;
          color: #a9d7ff;
          font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
          margin: 0 0 16px;
          overflow: auto;
          padding: 16px;
          white-space: pre-wrap;
        }

        .readme-advanced-reference-preview blockquote {
          border-left: 4px solid #7b5cff;
          color: #9aa6b5;
          font-size: 14px;
          line-height: 1.6;
          margin: 0 0 18px;
          padding: 8px 14px;
        }

        .readme-advanced-reference-preview > p {
          color: #c9d1d9;
          font-size: 15px;
          text-align: center;
        }

        .readme-advanced-reference-stats {
          display: grid;
          gap: 12px;
        }

        .readme-reference-logo-fallback {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin: 0 auto 18px;
          max-width: 100%;
        }

        .readme-reference-logo-fallback span {
          background: #202938;
          border: 1px solid #3b4a60;
          border-radius: 8px;
          color: #dbeafe;
          font: 600 13px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
          padding: 8px 10px;
        }

        .readme-preview-sourcebar {
          align-items: center;
          background: rgba(88, 166, 255, 0.06);
          border: 1px solid rgba(88, 166, 255, 0.18);
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
        }

        .readme-preview-sourcebar span {
          color: #58a6ff;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .readme-preview-sourcebar strong {
          color: #c9d1d9;
          font-size: 12px;
          font-weight: 800;
          text-align: right;
        }

        .readme-preview-profile {
          align-items: center;
          border-bottom: 1px solid #30363d;
          display: grid;
          gap: 16px;
          grid-template-columns: 72px minmax(0, 1fr);
          padding-bottom: 18px;
        }

        .readme-preview-profile img {
          aspect-ratio: 1;
          border: 1px solid #30363d;
          border-radius: 50%;
          object-fit: cover;
          width: 72px;
        }

        .readme-preview-profile span,
        .readme-preview-section-heading span {
          color: #2fe3a8;
          display: block;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .readme-preview-profile h1 {
          color: #f0f6fc;
          font-size: 30px;
          line-height: 1.08;
          margin: 2px 0 8px;
        }

        .readme-preview-profile p,
        .readme-preview-section p {
          color: #8b949e;
          margin: 0;
        }

        .readme-preview-section {
          background: rgba(255, 255, 255, 0.018);
          border: 1px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          display: grid;
          gap: 14px;
          outline: none;
          padding: 14px;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }

        .readme-preview-section:hover,
        .readme-preview-section:focus-visible {
          border-color: rgba(40, 216, 156, 0.34);
          background: rgba(40, 216, 156, 0.045);
        }

        .readme-preview-section.selected {
          border-color: rgba(40, 216, 156, 0.68);
          box-shadow: 0 0 0 1px rgba(40, 216, 156, 0.1), 0 18px 60px rgba(0, 0, 0, 0.24);
        }

        .readme-preview-section-heading {
          align-items: center;
          display: flex;
          gap: 8px;
          justify-content: space-between;
          min-height: 20px;
        }

        .readme-preview-section-heading small {
          color: #6e7681;
          font-size: 11px;
          font-weight: 800;
          margin-left: auto;
        }

        .readme-preview-section-heading strong {
          background: rgba(40, 216, 156, 0.12);
          border: 1px solid rgba(40, 216, 156, 0.28);
          border-radius: 999px;
          color: #9ff5d7;
          font-size: 11px;
          padding: 3px 8px;
        }

        .readme-preview-visual-stack {
          display: grid;
          gap: 10px;
        }

        .readme-preview-visual {
          display: grid;
          margin: 0;
          position: relative;
        }

        .readme-preview-visual-stack img {
          background: #08080c;
          border: 1px solid #30363d;
          border-radius: 8px;
          height: auto;
          margin: 0 auto;
          max-height: 300px;
          object-fit: contain;
          width: min(100%, 760px);
        }

        .readme-preview-reorder-group {
          display: flex;
          flex-direction: column;
          gap: 22px;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .readme-preview-section.draggable {
          position: relative;
        }

        /* Handle and delete stay out of the way until the card is in play, so
           the preview still reads as a preview rather than an editor. */
        .readme-preview-drag-handle,
        .readme-preview-remove {
          align-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: #8b949e;
          cursor: pointer;
          display: flex;
          flex: none;
          justify-content: center;
          opacity: 0;
          padding: 0;
          transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }

        .readme-preview-drag-handle {
          cursor: grab;
          height: 22px;
          touch-action: none;
          width: 18px;
        }

        .readme-preview-drag-handle:active {
          cursor: grabbing;
        }

        .readme-preview-remove {
          height: 22px;
          width: 22px;
        }

        .readme-preview-section:hover .readme-preview-drag-handle,
        .readme-preview-section:hover .readme-preview-remove,
        .readme-preview-section.selected .readme-preview-drag-handle,
        .readme-preview-section.selected .readme-preview-remove,
        .readme-preview-section:focus-within .readme-preview-drag-handle,
        .readme-preview-section:focus-within .readme-preview-remove {
          opacity: 1;
        }

        .readme-preview-drag-handle:hover,
        .readme-preview-drag-handle:focus-visible {
          background: rgba(40, 216, 156, 0.12);
          border-color: rgba(40, 216, 156, 0.4);
          color: #9ff5d7;
        }

        .readme-preview-remove:hover,
        .readme-preview-remove:focus-visible {
          background: rgba(248, 81, 73, 0.14);
          border-color: rgba(248, 81, 73, 0.45);
          color: #ff9d97;
        }

        .readme-preview-remove.visual {
          position: absolute;
          right: 8px;
          top: 8px;
          z-index: 2;
        }

        .readme-preview-visual:hover .readme-preview-remove.visual,
        .readme-preview-visual:focus-within .readme-preview-remove.visual {
          opacity: 1;
        }

        /* Touch has no hover, so the affordances are always visible there. */
        @media (hover: none) {
          .readme-preview-drag-handle,
          .readme-preview-remove {
            opacity: 1;
          }
        }

        .readme-preview-callout {
          background: rgba(88, 166, 255, 0.07);
          border: 1px solid rgba(88, 166, 255, 0.2);
          border-radius: 8px;
          padding: 14px;
        }

        .readme-preview-callout strong {
          color: #dbeafe;
          display: block;
          font-size: 14px;
          margin-bottom: 5px;
        }

        .readme-preview-markdown {
          color: #c9d1d9;
          display: grid;
          gap: 10px;
        }

        .readme-preview-markdown > :first-child {
          margin-top: 0;
        }

        .readme-preview-markdown > :last-child {
          margin-bottom: 0;
        }

        .readme-preview-markdown h1,
        .readme-preview-markdown h2,
        .readme-preview-markdown h3,
        .readme-preview-markdown h4 {
          color: #f0f6fc;
          margin: 0;
        }

        .readme-preview-markdown p,
        .readme-preview-markdown ul,
        .readme-preview-markdown ol {
          margin: 0;
        }

        .readme-preview-markdown ul,
        .readme-preview-markdown ol {
          padding-left: 20px;
        }

        .readme-preview-markdown code {
          background: rgba(110, 118, 129, 0.22);
          border-radius: 4px;
          color: #f0f6fc;
          font-size: 12px;
          padding: 2px 5px;
        }

        .readme-preview-markdown a {
          color: #58a6ff;
          text-decoration: none;
        }

        .readme-preview-pills,
        .readme-preview-links,
        .readme-preview-projects article div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .readme-preview-pills span,
        .readme-preview-links span,
        .readme-preview-projects article div span {
          background: rgba(40, 216, 156, 0.09);
          border: 1px solid rgba(40, 216, 156, 0.22);
          border-radius: 999px;
          color: #9ff5d7;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          padding: 7px 10px;
        }

        .readme-preview-links {
          align-items: flex-start;
        }

        .readme-preview-links p {
          flex-basis: 100%;
          margin-bottom: 2px;
        }

        .readme-preview-links.contact-card {
          background: rgba(88, 166, 255, 0.07);
          border: 1px solid rgba(88, 166, 255, 0.2);
          border-radius: 8px;
          padding: 14px;
        }

        .readme-preview-links.minimal span {
          background: transparent;
          border-color: #30363d;
          border-radius: 6px;
        }

        .readme-preview-metrics {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .readme-preview-metrics div {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 12px;
          text-align: center;
        }

        .readme-preview-metrics strong {
          color: #f0f6fc;
          display: block;
          font-size: 18px;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .readme-preview-metrics span {
          color: #8b949e;
          display: block;
          font-size: 11px;
          font-weight: 800;
          margin-top: 4px;
          text-transform: uppercase;
        }

        .readme-preview-projects {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .readme-preview-projects article {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 14px;
        }

        .readme-preview-projects article strong {
          color: #f0f6fc;
          display: block;
          font-size: 14px;
          margin-bottom: 7px;
        }

        .readme-preview-projects article p {
          font-size: 13px;
          margin-bottom: 12px;
        }

        .readme-preview-projects article div span {
          background: rgba(88, 166, 255, 0.08);
          border-color: rgba(88, 166, 255, 0.2);
          color: #bfdbfe;
          font-size: 11px;
        }

        .readme-preview-activity {
          align-items: end;
          display: grid;
          gap: 7px;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }

        .readme-preview-activity span {
          background: linear-gradient(180deg, rgba(40, 216, 156, 0.9), rgba(40, 216, 156, 0.18));
          border-radius: 4px;
          min-height: 26px;
        }

        .readme-preview-activity span:nth-child(2) { min-height: 42px; }
        .readme-preview-activity span:nth-child(3) { min-height: 32px; }
        .readme-preview-activity span:nth-child(4) { min-height: 58px; }
        .readme-preview-activity span:nth-child(5) { min-height: 46px; }
        .readme-preview-activity span:nth-child(6) { min-height: 68px; }
        .readme-preview-activity span:nth-child(7) { min-height: 38px; }

        .readme-preview-activity p {
          grid-column: 1 / -1;
          margin-top: 4px;
        }

        .readme-document-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          line-height: 1.55;
          margin: 0;
          white-space: pre-wrap;
        }

        .readme-document-empty {
          align-content: center;
          display: grid;
          justify-items: center;
          text-align: center;
        }

        .readme-document-empty span {
          color: #2fe3a8;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readme-document-empty h2 {
          color: #f3f5f9;
          font-size: clamp(26px, 4vw, 44px);
          line-height: 1;
          margin: 14px 0 10px;
        }

        .readme-document-empty p {
          color: #8b949e;
          margin: 0;
          max-width: 520px;
        }

        .readme-document-empty div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin-top: 22px;
        }

        .readme-document-empty strong {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 999px;
          color: #c9d1d9;
          font-size: 12px;
          padding: 7px 10px;
        }

        .readme-property-group {
          border-bottom: 1px solid rgba(255,255,255,0.09);
          display: grid;
          gap: 12px;
          padding: 0 0 16px;
          margin-bottom: 16px;
        }

        .readme-selected-section {
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 8px;
          display: grid;
          gap: 10px;
          margin-bottom: 16px;
          padding: 14px;
        }

        .readme-selected-section > span {
          color: #2fe3a8;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readme-selected-section h3 {
          color: #f3f5f9;
          font-size: 18px;
          font-weight: 900;
          margin: 0;
        }

        .readme-selected-section p {
          color: #8b949e;
          font-size: 12px;
          line-height: 1.45;
          margin: 0;
        }

        .readme-selected-section button {
          background: #17191f;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 6px;
          color: #aaa;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          padding: 10px;
        }

        .readme-selected-section button.active {
          background: rgba(40,216,156,0.12);
          border-color: #2fe3a8;
          color: #2fe3a8;
        }

        .readme-selected-section button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .readme-section-order-controls {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px !important;
          margin: 0 !important;
        }

        .readme-section-details {
          border-top: 1px solid rgba(255,255,255,0.09);
          margin-top: 2px;
          padding-top: 4px;
        }

        .readme-section-details summary {
          align-items: center;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 8px;
          cursor: pointer;
          display: grid;
          gap: 4px;
          list-style: none;
          padding: 10px 12px;
        }

        .readme-section-details summary::-webkit-details-marker {
          display: none;
        }

        .readme-section-details summary span {
          color: #dfe5eb;
          font-size: 12.5px;
          font-weight: 900;
        }

        .readme-section-details summary small {
          color: #7c828d;
          font-size: 11px;
          font-weight: 700;
        }

        .readme-section-details[open] summary {
          margin-bottom: 12px;
        }

        .readme-section-order-controls button {
          font-size: 11px;
          padding: 8px;
        }

        .readme-selected-section div {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .readme-selected-section .readme-section-brief {
          border-top: 1px solid rgba(255,255,255,0.09);
          display: grid;
          gap: 8px;
          padding-top: 10px;
        }

        .readme-section-brief > span {
          color: #777;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .readme-section-brief div {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid #262626;
          border-radius: 6px;
          display: grid;
          gap: 4px;
          padding: 9px;
        }

        .readme-section-brief small {
          color: #2fe3a8;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .readme-section-brief p {
          color: #9ca3af;
          font-size: 12px;
          line-height: 1.4;
          margin: 0;
        }

        .readme-selected-section .readme-context-controls {
          border-top: 1px solid rgba(255,255,255,0.09);
          display: grid;
          gap: 10px;
          padding-top: 10px;
        }

        .readme-context-controls > span {
          color: #777;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .readme-context-controls select {
          background: #0b0d12;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 6px;
          color: #fff;
          font-size: 13px;
          outline: none;
          padding: 10px 12px;
          width: 100%;
        }

        .readme-stepper-control {
          align-items: center;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid #262626;
          border-radius: 6px;
          display: grid;
          gap: 8px;
          grid-template-columns: 1fr auto;
          padding: 10px;
        }

        .readme-stepper-control span {
          color: #d8d8d8;
          font-size: 12px;
          font-weight: 900;
        }

        .readme-stepper-control div {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
        }

        .readme-stepper-control button {
          background: #17191f;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 999px;
          color: #aaa;
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          height: 28px;
          width: 34px;
        }

        .readme-stepper-control button.active {
          background: rgba(40,216,156,0.12);
          border-color: rgba(40,216,156,0.42);
          color: #9ff5d7;
        }

        .readme-selected-section strong {
          background: #14161c;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 999px;
          color: #c9d1d9;
          font-size: 11px;
          padding: 6px 8px;
        }

        .readme-inserted-assets {
          border-top: 1px solid rgba(255,255,255,0.09);
          display: grid !important;
          gap: 8px !important;
          margin: 4px 0 0 !important;
          padding-top: 10px;
        }

        .readme-inserted-assets > span {
          color: #777;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .readme-inserted-assets p {
          color: #777;
          font-size: 12px;
          margin: 0;
        }

        .readme-inserted-assets button {
          align-items: center;
          background: #17191f;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 6px;
          color: #d8d8d8;
          cursor: pointer;
          display: flex;
          font-size: 12px;
          font-weight: 900;
          justify-content: space-between;
          padding: 9px 10px;
        }

        .readme-inserted-assets button.default {
          background: rgba(40, 216, 156, 0.07);
          border-color: rgba(40, 216, 156, 0.22);
          color: #d7fbea;
          cursor: default;
        }

        .readme-inserted-assets button small {
          color: #ff7b72;
          font-size: 11px;
          font-weight: 900;
        }

        .readme-inserted-assets button.default small {
          color: #2fe3a8;
        }

        .readme-option-stack {
          display: grid;
          gap: 8px;
        }

        .readme-option-stack.compact button {
          padding: 9px;
        }

        .readme-option-stack button,
        .readme-segmented button {
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 9px;
          color: #aaa;
          cursor: pointer;
          padding: 10px;
          text-align: left;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }

        .readme-segmented button:hover,
        .readme-token-list button:hover {
          background: #14171d;
          border-color: rgba(255,255,255,0.16);
          color: #e3e7ee;
        }

        .readme-segmented button.active:hover,
        .readme-token-list button.active:hover {
          color: #2fe3a8;
        }

        .readme-option-stack button strong {
          color: inherit;
          display: block;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .readme-option-stack button span {
          color: #666;
          display: block;
          font-size: 11px;
          line-height: 1.35;
        }

        .readme-option-stack button:hover {
          background: #14171d;
          border-color: rgba(255,255,255,0.16);
          color: #e3e7ee;
        }

        .readme-option-stack button.active,
        .readme-segmented button.active {
          background: rgba(47,187,99,0.14);
          border-color: #2fbb63;
          box-shadow: 0 0 0 1px rgba(47,187,99,0.35), 0 10px 24px -16px rgba(47,187,99,0.55);
        }

        .readme-option-stack button.active {
          color: #e8fff2;
        }

        .readme-option-stack button.active strong {
          color: #f4fff8;
        }

        .readme-option-stack button.active > span:last-child {
          color: rgba(187, 247, 208, 0.78);
        }

        .readme-option-stack button.active:hover {
          background: rgba(47,187,99,0.18);
          border-color: #34d17d;
          color: #f4fff8;
        }

        .readme-segmented {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
          gap: 8px;
        }

        .readme-segmented button {
          text-align: center;
          font-size: 12px;
          font-weight: 800;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .readme-editor-check {
          align-items: center;
          color: #d8d8d8;
          display: flex;
          font-size: 13px;
          font-weight: 800;
          justify-content: space-between;
          gap: 12px;
        }

        .readme-ai-scan-card {
          align-items: center;
          background: rgba(88, 166, 255, 0.07);
          border: 1px solid rgba(88, 166, 255, 0.22);
          border-radius: 8px;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          padding: 12px;
        }

        .readme-ai-scan-card strong {
          color: #dbeafe;
          display: block;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .readme-ai-scan-card span {
          color: #8aa4c7;
          display: block;
          font-size: 11px;
          line-height: 1.35;
        }

        .readme-ai-scan-card input {
          flex: 0 0 auto;
        }

        .readme-ai-scan-evidence {
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.075);
          border-radius: 8px;
          display: grid;
          gap: 8px;
          margin-top: 12px;
          padding: 12px;
        }

        .readme-ai-scan-evidence > span {
          color: #58a6ff;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .readme-ai-scan-evidence div {
          background: rgba(88, 166, 255, 0.055);
          border: 1px solid rgba(88, 166, 255, 0.14);
          border-radius: 6px;
          display: grid;
          gap: 3px;
          padding: 9px;
        }

        .readme-ai-scan-evidence small {
          color: #8aa4c7;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .readme-ai-scan-evidence strong {
          color: #dbeafe;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.35;
        }

        .readme-toggle-stack {
          border-top: 1px solid rgba(255,255,255,0.09);
          display: grid;
          gap: 10px;
          padding-top: 12px;
        }

        .readme-token-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .readme-token-list button {
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
          color: #aaa;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          padding: 8px 12px;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .readme-token-list button.active {
          background: rgba(47,227,168,0.12);
          border-color: rgba(47,227,168,0.55);
          color: #2fe3a8;
          box-shadow: 0 0 0 1px rgba(47,227,168,0.12) inset, 0 6px 16px -10px rgba(47,227,168,0.5);
        }

        .readme-editor-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 6px;
          color: #ef4444;
          font-size: 13px;
          padding: 10px;
        }

        .readme-editor-timeline {
          grid-column: 1 / -1;
          border-top: 1px solid rgba(255,255,255,0.10);
          display: grid;
          grid-template-rows: 26px minmax(0, 1fr);
          padding: 0 14px 10px;
        }

        .readme-timeline-toolbar {
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .readme-timeline-toolbar strong {
          color: #f3f5f9;
          font-size: 13px;
          font-weight: 900;
        }

        .readme-track {
          align-items: center;
          display: flex;
          gap: 7px;
          overflow-x: auto;
          padding-top: 12px;
        }

        .readme-track article {
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 34px),
            linear-gradient(160deg, #123227 0%, #0c1913 100%);
          border: 1px solid rgba(47,227,168,0.38);
          border-radius: 9px;
          color: #d7fff0;
          cursor: pointer;
          flex: 0 0 128px;
          font-size: 12px;
          font-weight: 900;
          height: 66px;
          outline: none;
          padding: 8px 30px 8px 36px;
          position: relative;
          text-align: left;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .readme-track article:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px -14px rgba(0,0,0,0.9);
        }

        .readme-track article.active {
          border-color: rgba(47,227,168,0.5);
          box-shadow: 0 0 0 1px rgba(47,227,168,0.12), 0 10px 26px -16px rgba(47,227,168,0.4);
        }

        .readme-track article strong {
          display: block;
          font-size: 12px;
          line-height: 1.1;
          margin-top: 0;
        }

        .readme-track article small {
          color: rgba(215, 255, 240, 0.68);
          display: block;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.25;
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .readme-track article:not(.active) {
          background: #0e1015;
          border-color: rgba(255,255,255,0.08);
          color: #8b909a;
        }

        .readme-track article:not(.active) small {
          color: #666;
        }

        .readme-track article.selected {
          outline: 2px solid #2fe3a8;
          outline-offset: 2px;
        }

        .readme-track article > span {
          align-items: center;
          background: #2fe3a8;
          border-radius: 4px;
          color: #06120d;
          display: inline-flex;
          height: 18px;
          justify-content: center;
          margin-right: 8px;
          width: 18px;
        }

        .readme-track article:not(.active) > span {
          background: rgba(255,255,255,0.10);
        }

        .readme-clip-badges {
          display: none;
          gap: 5px;
          margin-top: 8px;
          min-height: 18px;
        }

        .readme-clip-badges em {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          color: #b7f7df;
          font-size: 9px;
          font-style: normal;
          font-weight: 900;
          line-height: 1;
          padding: 4px 6px;
          text-transform: uppercase;
        }

        .readme-track article:not(.active) .readme-clip-badges em {
          color: #777;
        }

        .readme-clip-actions {
          bottom: 7px;
          display: flex;
          gap: 5px;
          position: absolute;
          right: 7px;
        }

        .readme-clip-actions button {
          align-items: center;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 4px;
          color: #d7fff0;
          cursor: pointer;
          display: inline-flex;
          font-size: 11px;
          font-weight: 900;
          height: 22px;
          justify-content: center;
          padding: 0;
          width: 22px;
        }

        .readme-clip-actions button:disabled {
          color: #555;
          cursor: not-allowed;
          opacity: 0.55;
        }

        /* Premium Studio skin: keep the README preview cinematic, make the controls
           feel like the light make.design-inspired homepage system. */
        .readme-video-editor-shell {
          background: color-mix(in srgb, var(--mk-surface) 86%, transparent);
          border: 1px solid var(--mk-border);
          box-shadow:
            var(--mk-shadow),
            0 1px 0 rgba(255,255,255,0.9) inset;
        }

        .readme-video-topbar {
          background: color-mix(in srgb, var(--mk-surface) 92%, transparent);
          border-bottom: 1px solid var(--mk-border);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .readme-studio-brand,
        .readme-video-topbar strong {
          color: var(--mk-ink);
        }

        .readme-video-topbar span {
          color: var(--mk-ink-3);
        }

        .readme-studio-context-line {
          color: var(--mk-ink-2);
        }

        .readme-studio-context-line strong {
          color: var(--mk-ink);
        }

        .readme-studio-context-line span {
          color: var(--mk-ink-3);
        }

        .readme-draft-state {
          background: transparent;
          border: none;
          color: var(--mk-ink-3);
        }

        .readme-studio-help-link {
          color: var(--mk-blue-ink);
        }

        .readme-topbar-primary {
          background: linear-gradient(180deg, #2fbb63 0%, var(--mk-blue) 100%) !important;
          color: #fff !important;
          box-shadow: var(--mk-shadow-blue), 0 1px 0 rgba(255,255,255,0.28) inset !important;
        }

        .readme-topbar-secondary,
        .readme-topbar-menu-trigger {
          background: var(--mk-surface) !important;
          border: 1px solid var(--mk-border) !important;
          color: var(--mk-ink) !important;
          box-shadow: var(--mk-shadow-sm) !important;
        }

        .readme-topbar-menu-trigger span {
          background: var(--mk-ink-2);
        }

        .readme-topbar-menu-panel {
          background: var(--mk-surface);
          border-color: var(--mk-border);
          box-shadow: var(--mk-shadow);
        }

        .readme-topbar-menu-panel a,
        .readme-topbar-menu-panel button {
          color: var(--mk-ink) !important;
        }

        .readme-topbar-menu-panel a:hover,
        .readme-topbar-menu-panel button:hover {
          background: var(--mk-bg) !important;
        }

        .readme-studio-upgrade-link {
          border: 1px solid rgba(22,163,74,0.28);
          background: transparent;
          color: var(--mk-blue-ink);
          box-shadow: none;
        }

        .readme-topbar-menu-panel .readme-studio-upgrade-link {
          color: var(--mk-blue-ink) !important;
        }

        .readme-media-bin,
        .readme-properties-panel {
          background: linear-gradient(180deg, var(--mk-surface) 0%, var(--mk-bg) 100%);
          scrollbar-color: rgba(125,139,131,0.34) transparent;
          scrollbar-width: thin;
        }

        .readme-media-bin,
        .readme-properties-panel {
          padding: 14px 12px;
        }

        .readme-player-monitor {
          background:
            radial-gradient(800px 360px at 50% -10%, rgba(22,163,74,0.16), transparent 70%),
            linear-gradient(180deg, #e6f6ec 0%, var(--mk-bg-soft) 100%);
          grid-template-rows: 38px minmax(0, 1fr);
          padding: 10px;
        }

        .readme-media-bin::-webkit-scrollbar,
        .readme-properties-panel::-webkit-scrollbar,
        .readme-document-frame::-webkit-scrollbar,
        .readme-gitskins-preview::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .readme-media-bin::-webkit-scrollbar-track,
        .readme-properties-panel::-webkit-scrollbar-track,
        .readme-document-frame::-webkit-scrollbar-track,
        .readme-gitskins-preview::-webkit-scrollbar-track {
          background: transparent;
        }

        .readme-media-bin::-webkit-scrollbar-thumb,
        .readme-properties-panel::-webkit-scrollbar-thumb,
        .readme-document-frame::-webkit-scrollbar-thumb {
          background: rgba(125,139,131,0.28);
          border-radius: 999px;
        }

        .readme-gitskins-preview::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.16);
          border-radius: 999px;
        }

        .readme-monitor-header strong {
          color: var(--mk-ink);
        }

        .readme-monitor-header span {
          color: var(--mk-ink-2);
        }

        .readme-monitor-actions button {
          background: var(--mk-surface);
          border-color: var(--mk-border);
          border-radius: 10px;
          color: var(--mk-ink-2);
        }

        .readme-monitor-actions button.active {
          background: var(--mk-ink);
          border-color: var(--mk-ink);
          color: #fff;
        }

        .readme-monitor-actions button.locked {
          background: rgba(255,255,255,0.78);
          border-color: rgba(22,163,74,0.24);
          color: var(--mk-ink-2);
        }

        .readme-monitor-actions button.locked small {
          background: rgba(52,209,125,0.18);
          border-color: rgba(22,163,74,0.22);
          color: var(--mk-blue-ink);
        }

        .readme-editor-timeline {
          background: var(--mk-bg-soft);
          border-top-color: var(--mk-border);
          grid-template-rows: 24px minmax(0, 1fr);
          padding: 0 12px 8px;
        }

        .readme-pro-value-card {
          border-radius: 14px;
          gap: 10px;
          margin-bottom: 12px;
          padding: 12px;
        }

        .readme-pro-value-grid {
          grid-template-columns: 1fr;
          gap: 7px;
        }

        .readme-pro-value-grid div {
          border-radius: 12px;
          gap: 3px;
          padding: 9px;
        }

        .readme-pro-value-grid small {
          display: none;
        }

        .readme-bin-grid {
          gap: 8px;
        }

        .readme-bin-grid button {
          aspect-ratio: 1.18;
          border-radius: 12px;
          gap: 7px;
          padding: 9px;
        }

        .readme-bin-grid button span {
          height: 34px;
        }

        .readme-track {
          gap: 6px;
          padding-top: 9px;
        }

        .readme-track article {
          border-radius: 12px;
          flex-basis: 116px;
          height: 54px;
          padding: 7px 28px 7px 34px;
        }

        .readme-track article strong {
          font-size: 11.5px;
        }

        .readme-track article small {
          font-size: 9.5px;
          margin-top: 2px;
        }

        .readme-track article > span {
          border-radius: 999px;
          height: 18px;
          left: 8px;
          margin: 0;
          position: absolute;
          top: 8px;
          width: 18px;
        }

        .readme-clip-actions {
          bottom: 5px;
          right: 5px;
        }

        .readme-clip-actions button {
          background: rgba(255,255,255,0.74);
          border-color: rgba(18,33,26,0.08);
          border-radius: 999px;
          color: var(--mk-ink-2);
          height: 20px;
          width: 20px;
        }

        .readme-panel-tabs {
          background: var(--mk-surface);
          border: 1px solid var(--mk-border);
          border-radius: 999px;
          gap: 4px;
          padding: 3px;
          width: 100%;
          box-shadow: var(--mk-shadow-sm);
        }

        .readme-panel-tabs span,
        .readme-panel-tabs button {
          border: none;
          border-radius: 999px;
          color: var(--mk-ink-2);
          flex: 1 1 0;
          font-size: 11.5px;
          padding: 7px 9px;
          text-align: center;
        }

        .readme-panel-tabs span:hover,
        .readme-panel-tabs button:hover {
          color: var(--mk-ink);
        }

        .readme-panel-tabs .active,
        .readme-panel-tabs button.active {
          background: var(--mk-ink);
          color: #fff;
          border-bottom-color: transparent;
          box-shadow: var(--mk-shadow-sm);
        }

        .readme-editor-field span,
        .readme-property-group h3,
        .readme-timeline-toolbar strong {
          color: var(--mk-ink);
        }

        .readme-preset-label,
        .readme-mini-summary span,
        .readme-profile-scan-panel > span,
        .readme-selected-section > span,
        .readme-context-controls > span,
        .readme-section-brief > span,
        .readme-inserted-assets > span,
        .readme-timeline-toolbar span {
          color: var(--mk-blue-ink);
        }

        .readme-editor-field input,
        .readme-editor-field textarea,
        .readme-property-group select,
        .readme-context-controls select {
          background: var(--mk-surface);
          border: 1px solid var(--mk-border);
          border-radius: 12px;
          color: var(--mk-ink);
          box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset;
        }

        .readme-editor-field input:focus,
        .readme-editor-field textarea:focus,
        .readme-property-group select:focus,
        .readme-context-controls select:focus {
          background: var(--mk-surface);
          border-color: rgba(22,163,74,0.42);
          box-shadow: 0 0 0 4px rgba(22,163,74,0.11);
        }

        .readme-editor-field input::placeholder,
        .readme-editor-field textarea::placeholder {
          color: var(--mk-ink-3);
        }

        .readme-preset-card,
        .readme-mini-summary,
        .readme-profile-scan-panel,
        .readme-selected-section,
        .readme-section-details summary,
        .readme-section-brief div,
        .readme-stepper-control,
        .readme-property-group,
        .readme-ai-scan-card,
        .readme-ai-scan-evidence {
          background: var(--mk-surface);
          border-color: var(--mk-border);
          border-radius: 14px;
        }

        .readme-property-group {
          border-bottom-color: var(--mk-border);
        }

        .readme-preset-card {
          border-left: 0;
          box-shadow: var(--mk-shadow-sm);
          min-height: 118px;
          padding: 11px;
        }

        .readme-preset-card.locked,
        .readme-preset-card.pro-export {
          padding-right: 11px;
          padding-bottom: 40px;
        }

        .readme-preset-card .readme-pro-tag.corner {
          box-shadow: 0 8px 18px -12px rgba(240,169,46,0.78);
        }

        .readme-preset-card strong,
        .readme-preset-card small {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .readme-preset-card .readme-template-thumb {
          height: 46px;
          margin-bottom: 2px;
        }

        .readme-preset-card .readme-template-thumb span:nth-child(1) {
          height: 18px;
          left: 9px;
          top: 10px;
          width: 18px;
        }

        .readme-preset-card .readme-template-thumb span:nth-child(2) {
          left: 34px;
          top: 11px;
          width: 42px;
        }

        .readme-preset-card .readme-template-thumb span:nth-child(3) {
          left: 34px;
          top: 23px;
          width: 58px;
        }

        .readme-preset-card .readme-template-thumb span:nth-child(4),
        .readme-preset-card .readme-template-thumb span:nth-child(5) {
          bottom: 9px;
          height: 7px;
        }

        .readme-preset-card .readme-template-thumb.is-wow::after {
          font-size: 9px;
          right: 9px;
          top: 10px;
        }

        .readme-preset-grid {
          grid-template-columns: 1fr;
          gap: 8px;
        }

        .readme-preset-card:nth-child(4n + 1),
        .readme-selected-section,
        .readme-track article.active {
          background: #e6f6ec;
          border-color: rgba(22,163,74,0.14);
        }

        .readme-preset-card:nth-child(4n + 2) {
          background: #f3eefe;
          border-color: rgba(123,69,242,0.10);
        }

        .readme-preset-card:nth-child(4n + 3) {
          background: #e9f8ef;
          border-color: rgba(16,150,90,0.10);
        }

        .readme-preset-card:nth-child(4n + 4) {
          background: #fdf1e7;
          border-color: rgba(230,150,80,0.12);
        }

        .readme-preset-card:hover {
          background: var(--mk-surface);
          border-color: rgba(22,163,74,0.22);
          box-shadow: var(--mk-shadow);
        }

        .readme-preset-card.active {
          background: var(--mk-surface);
          border-color: var(--mk-blue);
          box-shadow: var(--mk-shadow-blue);
        }

        .readme-preset-card strong,
        .readme-mini-summary strong,
        .readme-selected-section h3,
        .readme-section-details summary span,
        .readme-stepper-control span,
        .readme-selected-section strong,
        .readme-option-stack button strong,
        .readme-ai-scan-card strong,
        .readme-ai-scan-evidence strong,
        .readme-profile-scan-panel strong {
          color: var(--mk-ink);
        }

        .readme-preset-card small,
        .readme-mini-summary p,
        .readme-selected-section p,
        .readme-section-details summary small,
        .readme-section-brief p,
        .readme-option-stack button span,
        .readme-ai-scan-card span,
        .readme-ai-scan-evidence small,
        .readme-profile-scan-panel small,
        .readme-profile-scan-panel strong {
          color: var(--mk-ink-2);
        }

        .readme-selected-section button,
        .readme-section-order-controls button,
        .readme-inserted-assets button,
        .readme-option-stack button,
        .readme-segmented button,
        .readme-token-list button,
        .readme-stepper-control button {
          background: var(--mk-surface);
          border: 1px solid var(--mk-border);
          border-radius: 999px;
          color: var(--mk-ink-2);
          box-shadow: var(--mk-shadow-sm);
        }

        .readme-option-stack button,
        .readme-segmented button {
          border-radius: 12px;
        }

        .readme-segmented .readme-pro-tag {
          display: flex;
          margin: 7px auto 0;
          width: fit-content;
        }

        .readme-option-stack button {
          background: #fff;
          border: 1px solid rgba(18, 33, 26, 0.1);
          box-shadow: none;
          color: var(--mk-ink);
        }

        .readme-selected-section button:hover,
        .readme-option-stack button:hover,
        .readme-segmented button:hover,
        .readme-token-list button:hover,
        .readme-stepper-control button:hover {
          background: var(--mk-bg);
          border-color: rgba(22,163,74,0.22);
          color: var(--mk-ink);
        }

        .readme-selected-section button.active,
        .readme-option-stack button.active,
        .readme-segmented button.active,
        .readme-token-list button.active,
        .readme-stepper-control button.active,
        .readme-inserted-assets button.default {
          background: rgba(22,163,74,0.10);
          border-color: rgba(22,163,74,0.30);
          color: var(--mk-blue-ink);
          box-shadow: var(--mk-shadow-blue);
        }

        .readme-option-stack button.active {
          background: #e8f8ee;
          border-color: var(--mk-blue);
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.18), var(--mk-shadow-sm);
          color: var(--mk-ink);
        }

        .readme-option-stack button.active strong {
          color: var(--mk-ink);
        }

        .readme-option-stack button.active > span:last-child {
          color: var(--mk-ink-2);
        }

        .readme-option-stack button.active:hover {
          background: #e0f4e8;
          border-color: var(--mk-blue);
          color: var(--mk-ink);
        }

        .readme-editor-check {
          color: var(--mk-ink);
        }

        .readme-editor-check input {
          accent-color: #16a34a;
        }

        .readme-section-details,
        .readme-selected-section .readme-section-brief,
        .readme-selected-section .readme-context-controls,
        .readme-inserted-assets {
          border-top-color: var(--mk-border);
        }

        .readme-track article {
          background: var(--mk-surface);
          border-color: var(--mk-border);
          color: var(--mk-ink-2);
          box-shadow: var(--mk-shadow-sm);
        }

        .readme-track article.active {
          background:
            linear-gradient(180deg, #e6f6ec, rgba(255,255,255,0.92));
          border-color: rgba(22,163,74,0.26);
          color: var(--mk-ink);
        }

        .readme-track article:not(.active) {
          background: color-mix(in srgb, var(--mk-surface) 76%, transparent);
          border-color: var(--mk-border-soft);
          color: var(--mk-ink-3);
        }

        .readme-track article small,
        .readme-track article:not(.active) small {
          color: var(--mk-ink-3);
        }

        .readme-track article > span {
          background: var(--mk-blue);
          color: #fff;
          border-radius: 999px;
        }

        .readme-editor-timeline {
          background: linear-gradient(180deg, var(--mk-bg-soft), var(--mk-bg));
          border-top: 1px solid var(--mk-border);
          grid-template-rows: 34px minmax(0, 1fr);
          padding: 0 20px 14px;
        }

        .readme-timeline-toolbar {
          border-bottom-color: var(--mk-border-soft);
        }

        .readme-timeline-toolbar strong {
          color: var(--mk-ink);
          font-size: 14px;
          letter-spacing: -0.01em;
        }

        .readme-timeline-toolbar span {
          color: var(--mk-blue-ink);
          font-size: 10px;
        }

        .readme-track {
          gap: 8px;
          padding: 8px 2px 2px;
          scrollbar-color: rgba(125,139,131,0.26) transparent;
          scrollbar-width: thin;
        }

        .readme-track::-webkit-scrollbar {
          height: 8px;
        }

        .readme-track::-webkit-scrollbar-track {
          background: transparent;
        }

        .readme-track::-webkit-scrollbar-thumb {
          background: rgba(125,139,131,0.24);
          border-radius: 999px;
        }

        .readme-track article {
          align-content: center;
          border-radius: 14px;
          flex-basis: 148px;
          height: 68px;
          padding: 10px 34px 10px 42px;
        }

        .readme-track article:hover {
          box-shadow: var(--mk-shadow);
        }

        .readme-track article.selected {
          border-color: rgba(22,163,74,0.38);
          box-shadow: 0 0 0 2px rgba(22,163,74,0.16), var(--mk-shadow-sm);
          outline: none;
        }

        .readme-track article strong {
          color: inherit;
          font-size: 13px;
          line-height: 1.08;
          margin-top: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .readme-track article small {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.25;
          margin-top: 3px;
        }

        .readme-track article > span {
          height: 22px;
          left: 12px;
          margin: 0;
          position: absolute;
          top: 13px;
          width: 22px;
        }

        .readme-clip-actions {
          bottom: 10px;
          flex-direction: column;
          gap: 4px;
          right: 12px;
          top: 10px;
        }

        .readme-clip-actions button {
          background: color-mix(in srgb, var(--mk-surface) 76%, transparent);
          border: 1px solid var(--mk-border);
          border-radius: 999px;
          color: var(--mk-ink-2);
          height: 18px;
          width: 18px;
        }

        .readme-clip-actions button:not(:disabled):hover {
          background: var(--mk-surface);
          border-color: rgba(22,163,74,0.24);
          color: var(--mk-blue-ink);
        }

        .readme-clip-actions button:disabled {
          background: rgba(255,255,255,0.42);
          color: rgba(76,90,82,0.34);
          opacity: 1;
        }

        @media (max-width: 1320px) {
          .readme-draft-state {
            display: none;
          }

          .readme-video-topbar {
            grid-template-columns: 96px minmax(0, 1fr) auto;
            gap: 12px;
          }

          .readme-editor-section {
            padding: 0 12px 28px !important;
          }

          .readme-video-editor-shell {
            grid-template-columns: minmax(176px, 208px) minmax(0, 1fr) minmax(176px, 210px);
            min-height: 600px;
            height: calc(100vh - 130px);
          }
        }

        @media (max-width: 1100px) {
          body.readme-studio-fullscreen {
            overflow: auto;
          }

          .mk.is-studio .readme-editor-section {
            padding: 10px !important;
          }

          .readme-video-editor-shell {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto auto auto auto;
            height: auto;
            min-height: 0;
            overflow: visible;
            border-radius: 18px;
          }

          .readme-video-topbar,
          .readme-media-bin,
          .readme-player-monitor,
          .readme-properties-panel,
          .readme-editor-timeline {
            grid-column: 1;
          }

          .readme-video-topbar {
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
          }

          .readme-studio-context {
            display: none;
          }

          .readme-topbar-actions {
            display: flex;
            flex-wrap: nowrap;
            justify-content: flex-end;
            justify-self: end;
            width: auto;
            max-width: 100%;
            gap: 6px;
          }

          .readme-topbar-primary {
            min-width: 112px;
          }

          .readme-topbar-publish {
            min-width: 92px;
            padding: 0 12px !important;
          }

          .readme-topbar-menu-trigger {
            width: 34px !important;
            min-width: 34px !important;
            flex: 0 0 34px;
          }

          .readme-topbar-secondary {
            width: auto !important;
          }

          .readme-player-monitor {
            grid-row: 2;
            min-height: min(72svh, 620px);
          }

          .readme-media-bin {
            grid-row: 3;
            max-height: none;
            border-top: 1px solid var(--mk-border);
          }

          .readme-properties-panel {
            grid-row: 4;
            max-height: none;
            border-top: 1px solid var(--mk-border);
          }

          .readme-editor-timeline {
            grid-row: 5;
            min-height: 118px;
          }

          .readme-bin-grid {
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          }

          .readme-preset-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .readme-document-frame {
            min-height: 420px;
          }

          .readme-gitskins-preview {
            padding: 16px;
          }

          .readme-preview-profile {
            grid-template-columns: 56px minmax(0, 1fr);
          }

          .readme-preview-profile img {
            width: 56px;
          }

          .readme-preview-profile h1 {
            font-size: 24px;
          }

          .readme-preview-metrics,
          .readme-preview-projects {
            grid-template-columns: 1fr;
          }

          .readme-monitor-header {
            flex-wrap: wrap;
            gap: 8px;
          }

          .readme-track {
            padding-bottom: 8px;
          }

          .readme-track article {
            flex-basis: 132px;
            height: 60px;
          }
        }

        @media (max-width: 720px) {
          body.readme-studio-fullscreen {
            background: var(--mk-bg);
          }

          .readme-editor-section {
            padding: 0 10px 20px !important;
          }

          .mk.is-studio .readme-editor-section {
            padding: 0 !important;
          }

          .readme-video-editor-shell {
            border-radius: 0;
            width: 100vw;
          }

          .readme-video-topbar {
            grid-template-columns: auto minmax(0, 1fr);
            justify-items: stretch;
            min-height: 58px;
            position: sticky;
            top: 0;
            z-index: 20;
          }

          .readme-topbar-actions {
            gap: 5px;
            justify-content: stretch;
            justify-self: end;
            width: 100%;
          }

          .readme-topbar-primary {
            flex: 0 0 auto;
            min-width: 84px;
            padding: 0 12px !important;
          }

          .readme-topbar-publish {
            flex: 0 0 auto;
            min-width: 82px;
            padding: 0 10px !important;
          }

          .readme-studio-brand {
            font-size: 14px;
          }

          .readme-topbar-secondary,
          .readme-export-state {
            display: none;
          }

          .readme-player-monitor {
            grid-template-rows: auto minmax(0, 1fr);
            min-height: 62svh;
            padding: 8px;
          }

          .readme-monitor-header {
            align-items: stretch;
            flex-direction: column;
          }

          .readme-monitor-actions {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            justify-content: stretch;
            width: 100%;
          }

          .readme-monitor-actions button {
            justify-content: center;
            min-height: 36px;
            padding: 7px 6px;
          }

          .readme-document-frame {
            border-radius: 12px;
            min-height: 360px;
            padding: 8px;
          }

          .readme-document-preview,
          .readme-document-code,
          .readme-document-empty {
            border-radius: 10px;
            padding: 14px;
          }

          .readme-preset-grid {
            grid-template-columns: 1fr;
          }

          .readme-panel-tabs {
            overflow-x: auto;
            max-width: 100%;
          }

          .readme-media-bin,
          .readme-properties-panel {
            padding: 12px;
          }

          .readme-bin-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .readme-bin-grid button {
            min-height: 118px;
          }

          .readme-pro-value-card {
            display: none;
          }

          .readme-selected-section {
            margin-bottom: 12px;
            padding: 12px;
          }

          .readme-property-group {
            gap: 10px;
            margin-bottom: 12px;
            padding-bottom: 12px;
          }

          .readme-editor-timeline {
            min-height: 104px;
            padding: 0 10px 8px;
          }

          .readme-timeline-toolbar {
            min-width: 0;
          }

          .readme-timeline-toolbar span {
            display: none;
          }

          .readme-track {
            gap: 6px;
            padding-top: 8px;
          }

          .readme-track article {
            flex-basis: 124px;
            height: 56px;
            padding: 8px 28px 8px 34px;
          }

          .readme-track article > span {
            height: 18px;
            left: 9px;
            top: 10px;
            width: 18px;
          }

          .readme-clip-actions {
            bottom: 7px;
            right: 8px;
            top: 7px;
          }
        }

        @media (max-width: 520px) {
          .readme-video-topbar {
            gap: 8px;
            padding: 8px;
          }

          .readme-studio-brand {
            max-width: 88px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .readme-topbar-primary {
            min-width: 74px;
            padding: 0 10px !important;
          }

          .readme-topbar-publish {
            min-width: 74px;
            padding: 0 9px !important;
          }

          .readme-topbar-menu-trigger {
            width: 32px !important;
            min-width: 32px !important;
          }

          .readme-monitor-actions {
            gap: 5px;
          }

          .readme-monitor-actions button {
            font-size: 10.5px;
          }

          .readme-preview-sourcebar,
          .readme-preview-profile {
            align-items: flex-start;
            flex-direction: column;
          }

          .readme-preview-profile {
            display: flex;
          }

          .readme-preview-profile img {
            width: 52px;
          }

          .readme-preview-profile h1 {
            font-size: 22px;
          }

          .readme-bin-grid {
            grid-template-columns: 1fr 1fr;
          }

          .readme-bin-grid button {
            aspect-ratio: auto;
            min-height: 104px;
          }

          .readme-panel-tabs button {
            min-width: 88px;
          }
        }

        .readme-summary-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .readme-summary-card {
          background: #111;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 14px 16px;
          min-width: 0;
        }

        .readme-summary-card span {
          display: block;
          color: #666;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 5px;
          text-transform: uppercase;
        }

        .readme-summary-card strong {
          display: block;
          color: #f3f5f9;
          font-size: 15px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .readme-form-card {
          display: grid;
          grid-template-columns: 290px minmax(420px, 1fr) 300px;
          grid-template-rows: 44px minmax(0, 1fr) 168px;
          gap: 8px;
          align-items: stretch;
          height: calc(100vh - 150px);
          min-height: 680px;
          overflow: hidden;
        }

        .readme-form-card > * {
          min-width: 0;
        }

        .readme-form-card > :not(.readme-animated-section-panel) {
          grid-column: 1;
        }

        .readme-form-card > .readme-editor-toolbar {
          grid-column: 1 / -1;
          align-items: center;
          background: #0a0b0f;
          border: 1px solid #1f1f1f;
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          min-height: 0;
          padding: 8px 12px;
        }

        .readme-editor-toolbar span {
          color: #777;
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .readme-editor-toolbar strong {
          color: #fff;
          display: block;
          font-size: 15px;
          font-weight: 900;
          margin-top: 2px;
        }

        .readme-editor-toolbar__meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .readme-editor-toolbar__meta span {
          background: #17191f;
          border: 1px solid #2a2a2a;
          border-radius: 999px;
          color: #aaa;
          padding: 7px 10px;
          text-transform: none;
          letter-spacing: 0;
        }

        .readme-form-card > .readme-assets-bin {
          grid-column: 1;
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          margin-bottom: 0 !important;
          overflow: auto;
          padding: 16px;
        }

        .readme-form-card > .readme-theme-bin {
          grid-column: 1;
          grid-row: 2;
          align-self: end;
          max-height: 260px;
        }

        .readme-form-card > .readme-inspector-panel {
          grid-column: 3;
          margin-bottom: 0 !important;
          max-height: none;
          overflow: auto;
        }

        .readme-form-card > .readme-timeline-panel {
          grid-column: 1 / -1;
          grid-row: 3;
          background: #0d0d0d;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          margin-bottom: 0 !important;
          overflow: hidden;
          padding: 14px;
        }

        .readme-timeline-panel > div {
          display: flex !important;
          gap: 10px !important;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .readme-timeline-panel button {
          min-width: 154px;
          position: relative;
        }

        .readme-timeline-panel button::before {
          content: "";
          position: absolute;
          left: 16px;
          right: 16px;
          bottom: -5px;
          height: 3px;
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.35);
        }

        .readme-form-card > .readme-export-button {
          grid-column: 3;
          align-self: end;
          margin-top: 0;
        }

        .readme-advanced-drawer {
          grid-column: 3;
          margin-bottom: 0;
          padding: 14px;
          background: #0f1117;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
        }

        .readme-advanced-drawer summary,
        .readme-compact-details summary {
          align-items: center;
          cursor: pointer;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          list-style: none;
        }

        .readme-advanced-drawer summary::-webkit-details-marker,
        .readme-compact-details summary::-webkit-details-marker {
          display: none;
        }

        .readme-advanced-drawer summary span {
          color: #f3f5f9;
          font-size: 14px;
          font-weight: 800;
        }

        .readme-advanced-drawer summary small {
          color: #777;
          font-size: 12px;
          font-weight: 700;
        }

        .readme-compact-details {
          margin-bottom: 14px;
          padding: 12px;
          background: #0d0d0d;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
        }

        .readme-compact-details summary {
          color: #aaa;
          font-size: 13px;
          font-weight: 800;
        }

        .readme-compact-details[open] summary {
          margin-bottom: 12px;
        }

        .readme-animated-section-panel {
          grid-column: 2;
          grid-row: 2 / span 8;
          position: static;
          max-height: none;
          overflow: auto;
          padding: 20px;
          background: #0f1117;
          border: 1px solid #2a2a2a;
          border-radius: 8px;
          margin-bottom: 0 !important;
        }

        /* Keep light-surface controls readable when legacy dark-theme hover rules
           or the global link hover color would otherwise win the cascade. */
        .readme-video-editor-shell .readme-topbar-secondary:hover,
        .readme-video-editor-shell .readme-export-dock-pro:hover,
        .readme-video-editor-shell .readme-export-dock-basic:hover {
          background: var(--mk-bg-soft) !important;
          border-color: rgba(22, 163, 74, 0.24) !important;
          color: var(--mk-ink) !important;
        }

        .readme-video-editor-shell .readme-export-dock-later:hover {
          background: var(--mk-bg-soft);
          color: var(--mk-ink);
        }

        /* The export dock is portaled to document.body, so keep its light
           controls readable without relying on the editor-shell ancestor. */
        .mk.readme-export-dock .readme-export-dock-pro,
        .mk.readme-export-dock .readme-export-dock-pro span,
        .mk.readme-export-dock .readme-export-dock-basic {
          color: var(--mk-ink) !important;
          opacity: 1;
        }

        .mk.readme-export-dock .readme-export-dock-pro strong {
          color: var(--mk-blue-ink) !important;
        }

        .mk.readme-export-dock .readme-export-dock-pro:hover,
        .mk.readme-export-dock .readme-export-dock-basic:hover {
          background: var(--mk-bg-soft) !important;
          border-color: rgba(22, 163, 74, 0.24) !important;
          color: var(--mk-ink) !important;
        }

        .readme-video-editor-shell .readme-asset-snippets {
          border-top-color: var(--mk-border-soft);
        }

        .readme-video-editor-shell .readme-asset-snippets h3,
        .readme-video-editor-shell .readme-asset-snippets button,
        .readme-video-editor-shell .readme-asset-snippets button span {
          color: var(--mk-ink) !important;
        }

        .readme-video-editor-shell .readme-asset-snippets button {
          background: var(--mk-surface);
          border-color: var(--mk-border);
          opacity: 1;
        }

        .readme-video-editor-shell .readme-asset-snippets button.default,
        .readme-video-editor-shell .readme-asset-snippets button.active {
          background: var(--mk-bg-soft);
          border-color: rgba(22, 163, 74, 0.24);
        }

        .readme-video-editor-shell .readme-asset-snippets button:disabled {
          opacity: 1;
        }

        .readme-video-editor-shell .readme-asset-snippets button small {
          color: var(--mk-blue-ink) !important;
          opacity: 1;
        }

        .readme-video-editor-shell .readme-studio-help-link:hover,
        .readme-video-editor-shell .readme-studio-upgrade-link:hover {
          color: var(--mk-blue-ink) !important;
        }

        .readme-video-editor-shell .readme-username-helper button:hover,
        .readme-video-editor-shell .readme-export-state button:not(.readme-export-review):hover {
          color: var(--mk-blue-ink);
        }

        .readme-video-editor-shell .readme-monitor-actions button:not(.active):hover {
          background: var(--mk-bg-soft);
          border-color: rgba(22, 163, 74, 0.24);
          color: var(--mk-ink);
        }

        .readme-video-editor-shell .readme-topbar-menu-panel a:hover,
        .readme-video-editor-shell .readme-topbar-menu-panel button:hover {
          color: var(--mk-ink) !important;
        }

        .readme-video-editor-shell .readme-panel-tabs button:not(.active):hover,
        .readme-video-editor-shell .readme-selected-section button:not(.active):hover,
        .readme-video-editor-shell .readme-option-stack button:not(.active):hover,
        .readme-video-editor-shell .readme-segmented button:not(.active):hover,
        .readme-video-editor-shell .readme-token-list button:not(.active):hover,
        .readme-video-editor-shell .readme-stepper-control button:not(.active):hover {
          color: var(--mk-ink);
        }

        @media (max-width: 820px) {
          .readme-summary-strip {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .readme-form-card {
            grid-template-columns: 1fr;
          }

          .readme-form-card > :not(.readme-animated-section-panel),
          .readme-form-card > .readme-assets-bin,
          .readme-form-card > .readme-inspector-panel,
          .readme-form-card > .readme-timeline-panel,
          .readme-form-card > .readme-export-button,
          .readme-animated-section-panel {
            grid-column: 1;
          }

          .readme-animated-section-panel {
            grid-row: auto;
            position: static;
            max-height: none;
          }
        }

        @media (max-width: 620px) {
          .readme-summary-strip {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
