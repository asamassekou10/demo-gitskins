/**
 * README Generator Library
 *
 * Generates professional GitHub profile READMEs using AI or templates.
 */

import type {
  ReadmeConfig,
  ReadmeStyle,
  ReadmeSectionType,
  GeneratedReadme,
  ExtendedProfileData,
  ReadmeGoal,
  ReadmeStructure,
  ReadmeTone,
  ReadmeStrategy,
  ReadmeScore,
  ReadmeAnimationBlocks,
  ReadmeSetupInstructions,
  ReadmeAnimatedSection,
} from '@/types/readme';

/**
 * Language badges mapping
 */
const languageBadges: Record<string, string> = {
  TypeScript: 'https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white',
  JavaScript: 'https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black',
  Python: 'https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white',
  Java: 'https://img.shields.io/badge/Java-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white',
  Go: 'https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white',
  Rust: 'https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white',
  'C++': 'https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=cplusplus&logoColor=white',
  C: 'https://img.shields.io/badge/C-A8B9CC?style=for-the-badge&logo=c&logoColor=black',
  'C#': 'https://img.shields.io/badge/C%23-239120?style=for-the-badge&logo=csharp&logoColor=white',
  PHP: 'https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white',
  Ruby: 'https://img.shields.io/badge/Ruby-CC342D?style=for-the-badge&logo=ruby&logoColor=white',
  Swift: 'https://img.shields.io/badge/Swift-FA7343?style=for-the-badge&logo=swift&logoColor=white',
  Kotlin: 'https://img.shields.io/badge/Kotlin-7F52FF?style=for-the-badge&logo=kotlin&logoColor=white',
  Dart: 'https://img.shields.io/badge/Dart-0175C2?style=for-the-badge&logo=dart&logoColor=white',
  HTML: 'https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white',
  CSS: 'https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white',
  Shell: 'https://img.shields.io/badge/Shell-4EAA25?style=for-the-badge&logo=gnubash&logoColor=white',
  Vue: 'https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white',
  React: 'https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black',
  Svelte: 'https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white',
};

/**
 * GitHub's language names are human-readable, while skillicons.dev expects
 * short, exact icon ids. Keep this normalization in one place so a detected
 * language can never turn into a broken image URL (for example,
 * "Jupyter Notebook" must become "jupyter").
 */
const skillIconAliases: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  react: 'react',
  'react.js': 'react',
  nextjs: 'nextjs',
  'next.js': 'nextjs',
  node: 'nodejs',
  'node.js': 'nodejs',
  python: 'python',
  'jupyter notebook': 'jupyter',
  jupyter: 'jupyter',
  java: 'java',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  dart: 'dart',
  c: 'c',
  'c++': 'cpp',
  'c#': 'cs',
  html: 'html',
  html5: 'html',
  css: 'css',
  shell: 'bash',
  bash: 'bash',
  docker: 'docker',
  dockerfile: 'docker',
  git: 'git',
  github: 'github',
  vscode: 'vscode',
  figma: 'figma',
  'tailwind css': 'tailwindcss',
  tailwind: 'tailwindcss',
  vue: 'vue',
  svelte: 'svelte',
  mongodb: 'mongodb',
  mysql: 'mysql',
  postgresql: 'postgres',
  postgres: 'postgres',
  aws: 'aws',
};

function skillIconIds(values: string[]): string[] {
  return values
    .map((value) => skillIconAliases[value.trim().toLowerCase()])
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index)
    .slice(0, 24);
}

const themeAccent: Record<string, string> = {
  satan: 'FF4500',
  neon: '00FFFF',
  zen: '00FF88',
  'github-dark': '22C55E',
  dracula: 'FF79C6',
  matrix: '22C55E',
};

const goalLabels: Record<ReadmeGoal, string> = {
  'get-hired': 'get hired or attract recruiters',
  'open-source': 'grow open-source trust and contributor confidence',
  freelance: 'win freelance or consulting opportunities',
  'indie-hacker': 'show builder momentum and product taste',
  student: 'show learning velocity and project potential',
  founder: 'present as a technical founder',
  'personal-brand': 'build a memorable developer brand',
};

const structureLabels: Record<ReadmeStructure, string> = {
  portfolio: 'portfolio README with featured proof and clear CTAs',
  hiring: 'hiring README optimized for recruiter scanning',
  'open-source': 'open-source maintainer README with contribution clarity',
  founder: 'founder README emphasizing products, traction, and direction',
  minimal: 'minimal badge-light README',
  visual: 'visual GitSkins README with profile card and widgets',
  technical: 'technical deep-dive README emphasizing systems and stack',
};

const toneLabels: Record<ReadmeTone, string> = {
  concise: 'concise and direct',
  confident: 'confident without hype',
  friendly: 'friendly and approachable',
  senior: 'senior engineer with judgment and ownership',
  founder: 'founder-style, outcome-focused, product-minded',
  playful: 'playful but still professional',
  recruiter: 'recruiter-focused and easy to scan',
};

const defaultVisualAssetBySection: Partial<Record<ReadmeSectionType, ReadmeAnimatedSection[]>> = {
  header: ['hero'],
  about: ['about'],
  skills: ['stack'],
  stats: ['stats'],
  projects: ['projects'],
  highlights: ['highlights'],
  heatmap: ['heatmap'],
  connect: ['social'],
};

function renderSectionAsset(asset: ReadmeAnimatedSection, config: ReadmeConfig): string {
  const params = new URLSearchParams({ username: config.username, theme: config.theme });
  if (asset === 'social') {
    if (config.socialWebsite) params.set('website', config.socialWebsite);
    if (config.socialX) params.set('x', config.socialX);
    if (config.socialLinkedIn) params.set('linkedin', config.socialLinkedIn);
    if (config.socialEmail) params.set('email', config.socialEmail);
  }
  return `<p align="center">
  <img src="https://www.gitskins.com/api/section/${asset}?${params.toString()}" alt="${config.username} ${asset} visual" />
</p>`;
}

function renderExtraSectionAssets(section: ReadmeSectionType, config: ReadmeConfig): string {
  const selected = config.sectionAssets?.[section] ?? [];
  const defaults = defaultVisualAssetBySection[section] ?? [];
  const extra = selected.filter((asset, index, list) => !defaults.includes(asset) && list.indexOf(asset) === index);
  return extra.length ? `\n\n${extra.map((asset) => renderSectionAsset(asset, config)).join('\n\n')}` : '';
}

export function buildReadmeStrategy(data: ExtendedProfileData, config: ReadmeConfig): ReadmeStrategy {
  const languages = data.languages.slice(0, 3).map((l) => l.name);
  const primaryRole = inferPrimaryRole(languages, config);
  const strongestSignals = [
    ...languages.map((language) => `${language} work`),
    data.totalStars > 0 ? `${data.totalStars} earned stars` : '',
    data.totalRepos > 0 ? `${data.totalRepos} public repositories` : '',
    data.streak.current > 0 ? `${data.streak.current}-day current streak` : '',
  ].filter(Boolean).slice(0, 4);
  const weakSignals = [
    data.pinnedRepos.length === 0 ? 'No pinned repositories detected' : '',
    !data.bio ? 'Bio is missing or too thin' : '',
    !data.websiteUrl ? 'No portfolio or website link detected' : '',
    data.totalStars === 0 ? 'Limited external project proof from stars' : '',
  ].filter(Boolean).slice(0, 4);

  return {
    primaryRole,
    strongestSignals: strongestSignals.length ? strongestSignals : ['Consistent GitHub presence'],
    weakSignals: weakSignals.length ? weakSignals : ['Keep the README concise and proof-driven'],
    suggestedTone: toneLabels[config.tone ?? 'confident'],
    profileGoal: goalLabels[config.goal ?? 'personal-brand'],
  };
}

export function scoreReadme(markdown: string, data: ExtendedProfileData, config: ReadmeConfig): ReadmeScore {
  const hasProfileCard = markdown.includes('/api/section/hero');
  const hasProjects = /## .*project|## .*work|### \[/.test(markdown.toLowerCase());
  const hasContact = /connect|contact|twitter|website|linkedin|github\.com/.test(markdown.toLowerCase());
  const length = markdown.length;
  const profileClarity = clampScore(55 + (data.bio ? 15 : 0) + (markdown.startsWith('#') || markdown.includes('<h1') ? 15 : 0) + (config.goal ? 10 : 0));
  const projectProof = clampScore(45 + Math.min(25, data.pinnedRepos.length * 6) + (hasProjects ? 20 : 0) + (data.totalStars > 0 ? 10 : 0));
  const visualConsistency = clampScore(55 + (hasProfileCard ? 25 : 0) + (markdown.includes(`theme=${config.theme}`) ? 15 : 0));
  const recruiterScanability = clampScore(45 + (hasContact ? 15 : 0) + (length < 5000 ? 20 : 5) + (markdown.split('\n## ').length >= 4 ? 15 : 0));
  const overall = Math.round((profileClarity + projectProof + visualConsistency + recruiterScanability) / 4);

  const suggestions = [
    !data.bio ? 'Add a clearer GitHub bio so the README can open with a sharper positioning line.' : '',
    data.pinnedRepos.length < 3 ? 'Pin or feature at least three strong repositories for better project proof.' : '',
    !hasContact ? 'Add a clear contact or portfolio link so visitors know what to do next.' : '',
    !hasProfileCard ? 'Include a GitSkins profile card near the top for a stronger visual first impression.' : '',
    length > 6500 ? 'Shorten the README so the strongest projects remain above the fold.' : '',
  ].filter(Boolean).slice(0, 3);

  return {
    overall,
    profileClarity,
    projectProof,
    visualConsistency,
    recruiterScanability,
    suggestions: suggestions.length ? suggestions : ['Strong structure. Keep project descriptions specific and outcome-focused.'],
  };
}

export function buildReadmeAnimationPack(
  data: ExtendedProfileData,
  config: ReadmeConfig
): {
  markdown: string;
  blocks: ReadmeAnimationBlocks;
  setupInstructions?: ReadmeSetupInstructions;
} {
  if ((!config.motionStyle || config.motionStyle === 'none') && !config.contributionSnake && !config.spaceShooter) {
    return { markdown: '', blocks: {} };
  }

  const color = themeAccent[config.theme] ?? '22C55E';
  const displayName = data.name || config.username;
  const defaultLines = [
    `Hi, I'm ${displayName}`,
    buildReadmeStrategy(data, config).primaryRole,
    data.bio || `Building with ${data.languages[0]?.name || 'code'}`,
  ];
  const typingLines = (config.typingLines?.filter(Boolean).length ? config.typingLines : defaultLines)
    .slice(0, 4)
    .map((line) => line.trim())
    .filter(Boolean);

  const blocks: ReadmeAnimationBlocks = {};
  const parts: string[] = [];

  if (config.typingHeadline && typingLines.length > 0) {
    const lines = typingLines.map((line) => line.replace(/\s+/g, '+')).join(';');
    const typingUrl = `https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=28&duration=2800&pause=900&color=${color}&center=true&vCenter=true&width=820&lines=${encodeURIComponent(lines).replace(/%3B/g, ';').replace(/%2B/g, '+')}`;
    blocks.typingSvg = `<p align="center">\n  <img src="${typingUrl}" alt="Typing SVG" />\n</p>`;
    parts.push(blocks.typingSvg);
  }

  if (config.avatarBlock) {
    parts.push(`<p align="center">\n  <img src="https://www.gitskins.com/api/avatar?username=${config.username}&theme=${config.theme}&family=character&size=240" width="140" alt="${config.username}'s GitSkins avatar" />\n</p>`);
  }

  if (config.visitorCounter) {
    blocks.visitorCounter = `<p align="center">\n  <img src="https://komarev.com/ghpvc/?username=${config.username}&label=Profile%20views&color=${color.toLowerCase()}&style=flat" alt="${config.username} profile views" />\n</p>`;
    parts.push(blocks.visitorCounter);
  }

  if (config.githubTrophies) {
    blocks.trophies = `<p align="center">\n  <img src="https://github-profile-trophy.vercel.app/?username=${config.username}&theme=onedark&no-frame=true&row=1&column=6" alt="${config.username}'s GitHub trophies" />\n</p>`;
    parts.push(blocks.trophies);
  }

  if (config.animatedDivider) {
    blocks.divider = `<p align="center">\n  <img src="https://capsule-render.vercel.app/api?type=rect&height=2&color=gradient&customColorList=12,20,24&section=footer" width="100%" alt="" />\n</p>`;
    parts.push(blocks.divider);
  }

  let setupInstructions: ReadmeSetupInstructions | undefined;
  if (config.contributionSnake) {
    blocks.snake = `<p align="center">\n  <img src="https://raw.githubusercontent.com/${config.username}/${config.username}/output/github-snake.svg" alt="Contribution snake animation" />\n</p>`;
    parts.push(`## Contribution Snake\n\n${blocks.snake}`);
  }

  if (config.spaceShooter) {
    blocks.spaceShooter = `<p align="center">\n  <img src="https://raw.githubusercontent.com/${config.username}/${config.username}/output/space-shooter.gif" alt="${config.username}'s contribution Space Shooter" />\n</p>`;
    parts.push(`## Contribution Space Shooter\n\n${blocks.spaceShooter}`);
  }

  if (config.contributionSnake || config.spaceShooter) {
    setupInstructions = {
      title: 'Contribution games setup',
      description: 'This GitSkins workflow refreshes your selected contribution games every day and publishes the generated assets to the output branch.',
      files: [
        {
          path: '.github/workflows/gitskins-contribution-games.yml',
          content: buildContributionGamesWorkflow(config.username, {
            snake: Boolean(config.contributionSnake),
            spaceShooter: Boolean(config.spaceShooter),
            strategy: config.spaceShooterStrategy ?? 'random',
          }),
        },
      ],
    };
  }

  return {
    markdown: parts.length ? `${parts.join('\n\n')}\n\n` : '',
    blocks,
    setupInstructions,
  };
}

export function applyReadmeAnimationPack(
  markdown: string,
  data: ExtendedProfileData,
  config: ReadmeConfig
) {
  const pack = buildReadmeAnimationPack(data, config);
  if (!pack.markdown) return { ...pack, markdown };

  return {
    ...pack,
    markdown: `${pack.markdown}${markdown}`.trim(),
  };
}

export function buildContributionGamesWorkflow(
  username: string,
  options: { snake: boolean; spaceShooter: boolean; strategy: 'random' | 'row' | 'column' }
): string {
  const generateShooter = options.spaceShooter
    ? `      - name: Generate Space Shooter\n        env:\n          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n        run: |\n          python -m pip install --disable-pip-version-check \"gh-space-shooter==2.0.4\"\n          gh-space-shooter ${username} --output dist/space-shooter.gif --strategy ${options.strategy} --fps 30\n`
    : '';
  const generateSnake = options.snake
    ? `      - name: Generate contribution snake\n        uses: Platane/snk/svg-only@d8f6715049803e982ee5ff501b6b9b7d5deeb09b # v3\n        with:\n          github_user_name: ${username}\n          outputs: dist/github-snake.svg\n`
    : '';

  return `name: Generate GitSkins contribution games

on:
  push:
    paths:
      - README.md
      - .github/workflows/gitskins-contribution-games.yml
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

concurrency:
  group: gitskins-contribution-games
  cancel-in-progress: true

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Check out profile repository
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Prepare output
        run: mkdir -p dist

${generateShooter}${generateSnake}      - name: Publish generated games
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if git ls-remote --exit-code origin refs/heads/output >/dev/null 2>&1; then
            git fetch origin output
            git worktree add /tmp/gitskins-output FETCH_HEAD
          else
            git worktree add --detach /tmp/gitskins-output
            cd /tmp/gitskins-output
            git checkout --orphan output
            git rm -rf . >/dev/null 2>&1 || true
            cd -
          fi
          cp -f dist/* /tmp/gitskins-output/
          cd /tmp/gitskins-output
          git add .
          git diff --cached --quiet || git commit -m "Update GitSkins contribution games"
          git push origin HEAD:output
`;
}

function inferPrimaryRole(languages: string[], config: ReadmeConfig): string {
  if (config.goal === 'founder') return 'Technical founder';
  if (config.goal === 'freelance') return 'Freelance developer or consultant';
  if (config.goal === 'open-source') return 'Open-source maintainer';
  const normalized = languages.map((l) => l.toLowerCase());
  if (normalized.some((l) => ['typescript', 'javascript', 'html', 'css', 'vue', 'svelte'].includes(l))) return 'Frontend or full-stack engineer';
  if (normalized.some((l) => ['go', 'rust', 'java', 'c#', 'python'].includes(l))) return 'Backend or systems engineer';
  return 'Product-minded developer';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Build AI prompt for README generation
 */
export function buildReadmePrompt(
  data: ExtendedProfileData,
  config: ReadmeConfig
): string {
  const sectionsToInclude = config.sections.join(', ');
  const topLanguages = data.languages.slice(0, 5).map(l => l.name).join(', ');
  const strategy = buildReadmeStrategy(data, config);

  const pinnedReposText = data.pinnedRepos
    .map(r => `- ${r.name}: ${r.description || 'No description'} (${r.stars} stars)`)
    .join('\n');

  return `You are a professional README generator for GitHub profiles. Create a clean, modern README.md.

**Developer Profile:**
- Name: ${data.name || config.username}
- Bio: ${data.bio || 'Not provided'}
- Location: ${data.location || 'Not specified'}
- Company: ${data.company || 'Not specified'}
- Website: ${data.websiteUrl || 'Not provided'}
- Twitter: ${data.twitterUsername ? `@${data.twitterUsername}` : 'Not provided'}
- Followers: ${data.followers} | Following: ${data.following}
- Total Repositories: ${data.totalRepos}
- Total Stars: ${data.totalStars}
- Contributions This Year: ${data.totalContributions}
- Current Streak: ${data.streak.current} days
- Longest Streak: ${data.streak.longest} days
- Top Languages: ${topLanguages || 'None detected'}

**Pinned/Featured Repositories:**
${pinnedReposText || 'No pinned repositories'}

**Generation Settings:**
- Style: ${config.style}
- Goal: ${goalLabels[config.goal ?? 'personal-brand']}
- Structure: ${structureLabels[config.structure ?? 'visual']}
- Tone: ${toneLabels[config.tone ?? 'confident']}
- AI profile scan: ${config.aiProfileScan ? 'enabled - use public profile and project evidence as source of truth' : 'disabled - keep personalization lighter'}
- Sections to include: ${sectionsToInclude}
- Theme for GitSkins widgets: ${config.theme}
- User-selected visual sections: ${Object.entries(config.sectionAssets ?? {}).map(([section, assets]) => `${section}: ${assets.join(', ')}`).join('; ') || 'default GitSkins visual sections'}
- User-provided links: ${[
    config.socialWebsite && `Website ${config.socialWebsite}`,
    config.socialX && `X ${config.socialX}`,
    config.socialLinkedIn && `LinkedIn ${config.socialLinkedIn}`,
    config.socialEmail && `Email ${config.socialEmail}`,
  ].filter(Boolean).join('; ') || 'use GitHub profile links only'}

**Profile Strategy:**
- Primary role: ${strategy.primaryRole}
- Strongest signals: ${strategy.strongestSignals.join(', ')}
- Weak signals to compensate for: ${strategy.weakSignals.join(', ')}
- Profile goal: ${strategy.profileGoal}

**Instructions:**
1. Generate a professional, well-structured README.md
2. Use proper markdown formatting with headers, lists, and sections
3. For visual GitSkins sections, prefer these first-party animated SVG section URLs:
   - Hero: <img src="https://www.gitskins.com/api/section/hero?username=${config.username}&theme=${config.theme}" alt="${config.username} profile hero" />
   - About: <img src="https://www.gitskins.com/api/section/about?username=${config.username}&theme=${config.theme}" alt="${config.username} about" />
   - Stats: <img src="https://www.gitskins.com/api/section/stats?username=${config.username}&theme=${config.theme}" alt="${config.username} GitHub stats" />
   - Stack: <img src="https://www.gitskins.com/api/section/stack?username=${config.username}&theme=${config.theme}" alt="${config.username} language stack" />
   - 3D Wordmark: <img src="https://www.gitskins.com/api/section/wordmark?username=${config.username}&theme=${config.theme}" alt="${config.username} 3D ASCII wordmark" />
   - ASCII Portrait: <img src="https://www.gitskins.com/api/section/portrait?username=${config.username}&theme=${config.theme}" alt="${config.username} ASCII portrait" />
   - Heatmap: <img src="https://www.gitskins.com/api/section/heatmap?username=${config.username}&theme=${config.theme}${(config.heatmapStyle ?? (config.jetHeatmap ? 'jet' : 'aura')) !== 'aura' ? `&style=${config.heatmapStyle ?? 'jet'}` : ''}" alt="${config.username} contribution activity" />${(config.heatmapStyle ?? (config.jetHeatmap ? 'jet' : 'aura')) !== 'aura' ? ` — keep the &style=${config.heatmapStyle ?? 'jet'} parameter on the heatmap URL.` : ''}
   - Projects: <img src="https://www.gitskins.com/api/section/projects?username=${config.username}&theme=${config.theme}" alt="${config.username} featured projects" />
   - Highlights (you write the content): <img src="https://www.gitskins.com/api/section/highlights?username=${config.username}&theme=${config.theme}&items=Title::short description|Title2::short description2|Title3::short description3" alt="${config.username} highlights" /> — supply exactly 3 concise value props drawn from the profile (e.g. "Open Source::All projects public", "Systems::Low-level C and kernels"). Keep each title and description short, and URL-encode spaces as %20.
   - Social: <img src="https://www.gitskins.com/api/section/social?username=${config.username}&theme=${config.theme}${config.socialWebsite ? `&website=${encodeURIComponent(config.socialWebsite)}` : ''}${config.socialX ? `&x=${encodeURIComponent(config.socialX)}` : ''}${config.socialLinkedIn ? `&linkedin=${encodeURIComponent(config.socialLinkedIn)}` : ''}${config.socialEmail ? `&email=${encodeURIComponent(config.socialEmail)}` : ''}" alt="${config.username} social links" />
   Never use the retired /api/premium-card, /api/card, /api/stats, /api/languages, /api/repos, or /api/streak endpoints. Use only the animated /api/section/* visuals above.
   Compose the sections that fit this profile, in this order when included: hero, wordmark, portrait, about, stats, stack, projects, social. Center each in <p align="center">, keep one blank line between them, and use the SAME theme on every section so the page reads as one cohesive design. Include wordmark and portrait when the user-selected visual sections include them or when a visual/personal-brand wow effect is requested. Include projects only when the profile has pinned repositories; include social only when social links are provided.
4. Keep the tone ${toneLabels[config.tone ?? 'confident']}
5. ${config.structure === 'minimal' || config.style === 'minimal' ? 'Keep content brief and focused' : 'Include specific project proof and clear descriptions'}
6. Use badges for technologies/languages when appropriate
7. Include a proper header with the developer's name
8. End with social links/contact info if available
9. Include user-provided links exactly when present; do not invent missing social URLs
10. Do not invent employers, degrees, metrics, links, or project claims that are not supported by the profile data
11. ${config.aiProfileScan ? 'Use pinned repositories, languages, stars, descriptions, contributions, and public profile fields to make the README more accurate. Mention specific projects only when they are present in the data.' : 'Avoid deep project inference and keep the README closer to the explicit profile fields.'}

Generate ONLY the markdown content, no explanations.`;
}

function escapeReadmeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeProfileUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function renderTerminalIdentityAsset(
  asset: 'portrait' | 'wordmark' | 'heatmap' | 'system-scan' | 'stack' | 'stats',
  config: ReadmeConfig,
  width = '100%',
  label?: string | null
): string {
  const params = new URLSearchParams({
    username: config.username,
    theme: config.theme,
    style: 'terminal',
  });
  if (asset === 'wordmark' && label?.trim()) {
    params.set('label', label.trim());
  }
  if (asset === 'system-scan') {
    if (config.socialWebsite) params.set('website', config.socialWebsite);
    if (config.socialX) params.set('x', config.socialX);
    if (config.socialLinkedIn) params.set('linkedin', config.socialLinkedIn);
    if (config.socialEmail) params.set('email', config.socialEmail);
  }
  const base = `https://www.gitskins.com/api/section/${asset}?${params.toString()}`;
  return `<picture>
  <source media="(prefers-color-scheme: light)" srcset="${base}&mode=light" />
  <img src="${base}&mode=dark" width="${width}" alt="${escapeReadmeHtml(config.username)} ${asset}" />
</picture>`;
}

function buildProfileLinks(data: ExtendedProfileData, config: ReadmeConfig): string[] {
  const profileUrl = `https://github.com/${encodeURIComponent(config.username)}`;
  const website = normalizeProfileUrl(config.socialWebsite || data.websiteUrl || '');
  const xHandle = (config.socialX || data.twitterUsername || '').trim().replace(/^@/, '');
  const linkedIn = normalizeProfileUrl(
    config.socialLinkedIn
      ? config.socialLinkedIn.includes('linkedin.com')
        ? config.socialLinkedIn
        : `linkedin.com/in/${config.socialLinkedIn.replace(/^@/, '')}`
      : ''
  );
  const email = config.socialEmail?.trim() || '';
  return [
    `<a href="${profileUrl}">GitHub</a>`,
    website ? `<a href="${escapeReadmeHtml(website)}">Website</a>` : '',
    xHandle ? `<a href="https://x.com/${encodeURIComponent(xHandle)}">X</a>` : '',
    linkedIn ? `<a href="${escapeReadmeHtml(linkedIn)}">LinkedIn</a>` : '',
    email ? `<a href="mailto:${escapeReadmeHtml(email)}">Email</a>` : '',
  ].filter(Boolean);
}

function generateTerminalIdentityTemplate(
  data: ExtendedProfileData,
  config: ReadmeConfig
): GeneratedReadme {
  const displayName = escapeReadmeHtml(data.name || config.username);
  const bio = escapeReadmeHtml(
    data.bio || inferPrimaryRole(data.languages.slice(0, 3).map((language) => language.name), config)
  );
  const links = buildProfileLinks(data, config);

  const header = `<div align="center">

<h3><code>${escapeReadmeHtml(config.username)}@github ~ $ whoami</code></h3>

<table>
<tr>
<td width="42%" valign="top">${renderTerminalIdentityAsset('portrait', config)}</td>
<td width="58%" valign="top">${renderTerminalIdentityAsset('wordmark', config, '100%', data.name)}</td>
</tr>
</table>

<p><b>${bio}</b></p>

<p>${links.join(' &nbsp;·&nbsp; ')}</p>

</div>`;
  const heatmap = `<div align="center">

<h3><code>${escapeReadmeHtml(config.username)}@github ~ $ ./contributions.sh</code></h3>

${renderTerminalIdentityAsset('heatmap', config)}

</div>`;
  const footer = `<p align="center"><sub>${displayName} · Profile generated with <a href="https://www.gitskins.com/readme-generator">GitSkins</a></sub></p>`;
  const markdown = `${header}\n\n${heatmap}\n\n${footer}`;
  const strategy = buildReadmeStrategy(data, config);
  const score = scoreReadme(markdown, data, config);

  return {
    markdown,
    sections: [
      { id: 'header', type: 'header', content: header },
      { id: 'heatmap', type: 'heatmap', content: heatmap },
      { id: 'connect', type: 'connect', content: footer },
    ],
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: data.languages.map((language) => language.name),
      repoCount: data.totalRepos,
      totalStars: data.totalStars,
      strategy,
      score,
    },
  };
}

/**
 * Showcase — the full premium profile, in one click.
 *
 * The other presets are single-idea layouts. This is the whole product on one
 * page: 3D wordmark, hero, highlights, animated contribution graph, stats,
 * language stack, pinned projects and the ASCII profile scan, all on one theme.
 * It exists so a new user can reach a finished, impressive README in a couple
 * of minutes instead of assembling nine sections by hand and giving up.
 *
 * Hero and heatmap ship as <picture> so they follow the reader's light/dark
 * setting; the rest are single images because their panels read on both.
 */
function generateShowcaseTemplate(
  data: ExtendedProfileData,
  config: ReadmeConfig
): GeneratedReadme {
  const user = encodeURIComponent(config.username);
  const theme = encodeURIComponent(config.theme);
  const displayName = escapeReadmeHtml(data.name || config.username);
  const links = buildProfileLinks(data, config);
  const sectionUrl = (section: string, extra = '') =>
    `https://www.gitskins.com/api/section/${section}?username=${user}&theme=${theme}${extra}`;

  const dualMode = (section: string, alt: string, extra = '') => `<picture>
    <source media="(prefers-color-scheme: light)" srcset="${sectionUrl(section, `${extra}&mode=light`)}" />
    <img src="${sectionUrl(section, `${extra}&mode=dark`)}" width="100%" alt="${escapeReadmeHtml(alt)}" />
  </picture>`;

  const single = (section: string, alt: string, extra = '') =>
    `<img src="${sectionUrl(section, extra)}" width="100%" alt="${escapeReadmeHtml(alt)}" />`;

  // Three value props drawn from the profile, so the panel says something real
  // rather than shipping lorem ipsum the user has to go and rewrite.
  const topLanguage = data.languages[0]?.name ?? 'Code';
  const topRepo = data.pinnedRepos[0];
  const highlightItems = [
    `${topLanguage}::${data.totalRepos} public repositories`,
    topRepo
      ? `${topRepo.name}::${(topRepo.description || 'Featured project').slice(0, 46)}`
      : `Building::Shipping in the open`,
    `Impact::${data.totalStars} stars · ${data.streak?.totalDays ?? 0} active days`,
  ].join('|');

  const header = `<p align="center">
  ${single('wordmark', displayName, `&label=${encodeURIComponent(data.name || config.username)}`)}
</p>

<p align="center">
  ${dualMode('hero', `${displayName} — profile`)}
</p>

<p align="center">${links.join(' &nbsp;·&nbsp; ')}</p>`;

  const highlights = `<p align="center">
  ${single('highlights', 'Highlights', `&items=${encodeURIComponent(highlightItems)}`)}
</p>`;

  const heatmap = `## The year, so far

<p align="center">
  ${dualMode('heatmap', `${data.totalContributions} contributions in the last year`, '&style=jet')}
</p>`;

  const signal = `## Signal

<p align="center">
  ${single('stats', `${data.totalStars} stars across ${data.totalRepos} repositories`)}
</p>

<p align="center">
  ${single('stack', 'Language stack')}
</p>`;

  const work = data.pinnedRepos.length
    ? `## Work

<p align="center">
  ${single('projects', 'Pinned projects')}
</p>`
    : '';

  const scan = `## Profile scan

<p align="center">
  ${single('system-scan', 'ASCII profile scan')}
</p>`;

  const footer = `<hr />

<p align="center">
  <sub>${displayName} · every panel is a single <code>&lt;img&gt;</code> of live GitHub data ·
  built with <a href="https://www.gitskins.com/readme-generator">GitSkins</a></sub>
</p>`;

  const blocks = [header, highlights, heatmap, signal, work, scan, footer].filter(Boolean);
  const markdown = blocks.join('\n\n');
  const strategy = buildReadmeStrategy(data, config);
  const score = scoreReadme(markdown, data, config);

  const sections: GeneratedReadme['sections'] = [
    { id: 'header', type: 'header', content: header },
    { id: 'highlights', type: 'highlights', content: highlights },
    { id: 'heatmap', type: 'heatmap', content: heatmap },
    { id: 'stats', type: 'stats', content: signal },
  ];
  if (work) sections.push({ id: 'projects', type: 'projects', content: work });
  sections.push({ id: 'connect', type: 'connect', content: `${scan}\n\n${footer}` });

  return {
    markdown,
    sections,
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: data.languages.map((language) => language.name),
      repoCount: data.totalRepos,
      totalStars: data.totalStars,
      strategy,
      score,
    },
  };
}

/**
 * Reference-style profile — mirrors the supplied README's long-form structure:
 * banner, typing headline, social buttons, whoami, focus, arsenal, project
 * grid, stats, beyond-the-code bullets, and a collaboration CTA.
 */
function generateNeonCircuitTemplate(
  data: ExtendedProfileData,
  config: ReadmeConfig
): GeneratedReadme {
  const user = encodeURIComponent(config.username);
  const theme = encodeURIComponent(config.theme || 'neon');
  const displayName = escapeReadmeHtml(data.name || config.username);
  const bio = escapeReadmeHtml(data.bio || inferPrimaryRole(data.languages.slice(0, 3).map((language) => language.name), config));
  const role = escapeReadmeHtml(config.professionalRole || inferPrimaryRole(data.languages.slice(0, 3).map((language) => language.name), config));
  const location = escapeReadmeHtml(data.location || 'Building from the open web');
  const sectionUrl = (section: string, extra = '') => `https://www.gitskins.com/api/section/${section}?username=${user}&theme=${theme}${extra}`;
  const referenceUrl = (asset: 'hero' | 'focus' | 'divider', extra = '') => `https://www.gitskins.com/api/readme-reference/${asset}?username=${user}&theme=${theme}${extra}`;
  const img = (section: string, alt: string, extra = '', width = '100%') => `<img src="${sectionUrl(section, extra)}" width="${width}" alt="${escapeReadmeHtml(alt)}" />`;
  const referenceImg = (asset: 'hero' | 'focus' | 'divider', alt: string, extra = '') => `<img src="${referenceUrl(asset, extra)}" width="100%" alt="${escapeReadmeHtml(alt)}" />`;
  const badge = (label: string, color: string, href?: string) => {
    const src = `https://img.shields.io/badge/${encodeURIComponent(label).replaceAll('%20', '_')}-${color}?style=for-the-badge&labelColor=0d1117`;
    return href ? `[![${label}](${src})](${escapeReadmeHtml(href)})` : `![${label}](${src})`;
  };
  const languages = data.languages.slice(0, 8).map((language) => badge(language.name, language.color.replace('#', '') || '7DF9FF')).join(' ');
  const typingLines = [role, bio, `Building with ${data.languages.slice(0, 3).map((language) => language.name).join(' · ') || 'code'}`, 'Always coding · learning · shipping 🚀'];
  const typingUrl = `https://readme-typing-svg.demolab.com?font=Orbitron&weight=600&size=26&pause=900&color=7DF9FF&center=true&vCenter=true&width=900&height=66&lines=${typingLines.map((line) => encodeURIComponent(line)).join(';')}`;
  const social = [
    data.websiteUrl ? badge('Portfolio', '7B5CFF', data.websiteUrl) : '',
    data.twitterUsername ? badge('X', '00C2FF', `https://x.com/${data.twitterUsername.replace(/^@/, '')}`) : '',
    config.socialLinkedIn ? badge('LinkedIn', '0077B5', config.socialLinkedIn) : '',
    config.socialEmail ? badge('Email', 'FF6B9D', `mailto:${config.socialEmail}`) : '',
  ].filter(Boolean).join(' ');
  const repos = data.pinnedRepos.slice(0, 4).map((repo) => `<td width="50%" valign="top">\n\n**${escapeReadmeHtml(repo.name)}**\n\n${escapeReadmeHtml(repo.description || 'A featured build from this profile.')}\n\n\`${escapeReadmeHtml(repo.language || 'Open source')}\` · \`${repo.stars} stars\`\n\n${badge('Code', '181717', repo.url)}\n\n</td>`);
  const projectRows = Array.from({ length: Math.ceil(repos.length / 2) }, (_, index) => `<tr>\n${repos.slice(index * 2, index * 2 + 2).join('\n')}\n</tr>`).join('\n');
  const whoami = `const ${config.username.replace(/[^a-zA-Z0-9_$]/g, '_')}: Developer = {\n  name:      "${displayName}",\n  role:      "${role}",\n  location:  "${location}",\n  currently: "${escapeReadmeHtml(config.currentFocus?.[0] || 'building in public')}",\n  stack:     ["${data.languages.slice(0, 6).map((language) => language.name).join('", "') || 'JavaScript'}"],\n  mantra:    "Make useful things, then make them delightful 🚀",\n};`;

  const header = `<div align="center">\n\n${referenceImg('hero', `${displayName} profile banner`, `&role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`)}\n\n<br/>\n\n<img src="${typingUrl}" alt="What ${displayName} does" />\n\n<br/>\n\n${social || badge('GitHub', '181717', `https://github.com/${user}`)}\n\n<br/><br/>\n\n${badge('Profile views', '7B5CFF')} ${badge(`${data.followers} followers`, '00FFA3')}\n\n</div>`;
  const about = `## ⚡ whoami\n\n\`\`\`typescript\n${whoami}\n\`\`\`\n\n> ${bio}\n> \n> **Collaborations welcome when they are meaningful 🤝**`;
  const focusItems = config.currentFocus?.slice(0, 3).map((item) => `${item}::Current focus`).join('|') || `${role}::Building useful things|${data.totalRepos} public repositories::Shipping in public|${data.totalStars} stars::Community signal`;
  const focus = `## 🛠️ What Keeps Me Busy\n\n<div align="center">\n\n${referenceImg('focus', 'Current focus and profile highlights', `&role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&focus=${encodeURIComponent(focusItems.split('|').map((item) => item.split('::')[0]).join('|'))}`)}\n\n</div>`;
  const selectedLogos = config.languageLogos?.length ? config.languageLogos : data.languages.slice(0, 12).map((language) => language.name);
  const skillIcons = skillIconIds(selectedLogos).join(',');
  const arsenal = `## ⚔️ Tech Arsenal\n\n<div align="center">\n\n<img src="https://skillicons.dev/icons?i=${encodeURIComponent(skillIcons || 'javascript,typescript,react,nodejs,python,git,github')}&perline=8&theme=dark" alt="Tech stack" />\n\n<br/><br/>\n\n**🧠 AI / ML &nbsp;·&nbsp; ⚙️ Automation**\n\n${languages || badge('Open source', '7DF9FF')}\n\n</div>`;
  const projects = data.pinnedRepos.length ? `## 🌌 Featured Projects\n\n<table>\n${projectRows}\n</table>` : '';
  const stats = `## 📊 GitHub Stats\n\n<div align="center">\n\n<img height="170" src="https://github-readme-stats.vercel.app/api?username=${user}&show_icons=true&hide_border=true&title_color=7df9ff&icon_color=00ffa3&text_color=c9d4e0&bg_color=0d1117" alt="GitHub stats" />\n<img height="170" src="https://github-readme-stats.vercel.app/api/top-langs/?username=${user}&layout=compact&hide_border=true&langs_count=8&title_color=7df9ff&text_color=c9d4e0&bg_color=0d1117" alt="Top languages" />\n\n<br/>\n\n${img('heatmap', 'Contribution activity', '&style=aura')}\n\n</div>`;
  const moreRepos = data.pinnedRepos.slice(4, 8);
  const moreWork = moreRepos.length ? `\n\n<details>\n<summary><b>More work samples</b> &nbsp;<i>(click to expand)</i></summary>\n\n<br/>\n\n${moreRepos.map((repo) => `- **${escapeReadmeHtml(repo.name)}** — ${escapeReadmeHtml(repo.description || 'Featured work')} · ${badge('Code', '181717', repo.url)}`).join('\n')}\n\n</details>` : '';
  const beyond = `## 🏆 Beyond the Code\n\n* 🧠 **Profile signal:** ${data.totalContributions} contributions in the last year\n* 🚀 **Builder energy:** ${data.totalRepos} public repositories\n* ⭐ **Community signal:** ${data.totalStars} stars across featured work\n* 🗣️ **Open to:** ${escapeReadmeHtml(config.openTo || 'interesting collaborations and useful products')}`;
  const cta = `<div align="center">\n\n## 🤝 Let's Build Something Meaningful\n\nI build useful software and enjoy turning ambitious ideas into working products.\n\n${social || badge('Start a conversation', '7B5CFF', `https://github.com/${user}`)}\n\n<br/><br/>\n\n***⭐ From [${displayName}](https://github.com/${user}) · built with code, AI & a little chaos 😈***\n\n</div>`;
  const divider = `<div align="center">${referenceImg('divider', 'Section divider')}</div>`;
  const markdown = [header, divider, about, divider, focus, divider, arsenal, divider, projects ? `${projects}${moreWork}` : '', divider, stats, divider, beyond, divider, cta].filter(Boolean).join('\n\n');
  const strategy = buildReadmeStrategy(data, config);
  const score = scoreReadme(markdown, data, config);

  return {
    markdown,
    sections: [
      { id: 'header', type: 'header', content: header },
      { id: 'about', type: 'about', content: about },
      { id: 'highlights', type: 'highlights', content: focus },
      { id: 'skills', type: 'skills', content: arsenal },
      ...(projects ? [{ id: 'projects', type: 'projects' as const, content: projects }] : []),
      { id: 'stats', type: 'stats', content: stats },
      { id: 'connect', type: 'connect', content: cta },
    ],
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: data.languages.map((language) => language.name),
      repoCount: data.totalRepos,
      totalStars: data.totalStars,
      strategy,
      score,
    },
  };
}

function generateSystemScanTemplate(
  data: ExtendedProfileData,
  config: ReadmeConfig
): GeneratedReadme {
  const displayName = escapeReadmeHtml(data.name || config.username);
  const links = buildProfileLinks(data, config);
  const header = `<div align="center">

${renderTerminalIdentityAsset('system-scan', config)}

<p>${links.join(' &nbsp;·&nbsp; ')}</p>

</div>`;
  const heatmap = `<div align="center">

${renderTerminalIdentityAsset('heatmap', config)}

</div>`;
  const footer = `<p align="center"><sub>${displayName} · Live profile system generated with <a href="https://www.gitskins.com/readme-generator">GitSkins</a></sub></p>`;
  const markdown = `${header}\n\n${heatmap}\n\n${footer}`;
  const strategy = buildReadmeStrategy(data, config);
  const score = scoreReadme(markdown, data, config);

  return {
    markdown,
    sections: [
      { id: 'header', type: 'header', content: header },
      { id: 'heatmap', type: 'heatmap', content: heatmap },
      { id: 'connect', type: 'connect', content: footer },
    ],
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: data.languages.map((language) => language.name),
      repoCount: data.totalRepos,
      totalStars: data.totalStars,
      strategy,
      score,
    },
  };
}

function generateTerminalPortfolioTemplate(
  data: ExtendedProfileData,
  config: ReadmeConfig
): GeneratedReadme {
  const displayName = escapeReadmeHtml(data.name || config.username);
  const bio = escapeReadmeHtml(data.bio || 'Developer building and sharing work on GitHub.');
  const role = escapeReadmeHtml(
    config.professionalRole
      || inferPrimaryRole(data.languages.slice(0, 3).map((language) => language.name), config)
  );
  const languages = data.languages.slice(0, 6).map((language) => language.name);
  const links = buildProfileLinks(data, config);
  const header = `<div align="center">

<h3><code>${escapeReadmeHtml(config.username)}@github ~ $ ./portfolio.sh</code></h3>

${renderTerminalIdentityAsset('wordmark', config, '100%', data.name)}

<p><b>${bio}</b></p>

</div>`;
  const about = `## \`> whoami\`

${bio}

\`\`\`bash
NAME          = ${displayName}
ROLE          = ${role}
FOCUS         = ${escapeReadmeHtml(languages.slice(0, 3).join(' | ') || 'Open source | Projects')}
REPOSITORIES  = ${data.totalRepos}
CONTRIBUTIONS = ${data.totalContributions}
STATUS        = Building | Learning | Shipping
${config.openTo ? `OPEN_TO       = ${escapeReadmeHtml(config.openTo)}` : ''}
\`\`\``;
  const stack = `## \`> ls /tech-stack\`

${renderTerminalIdentityAsset('stack', config)}`;
  const projectItems = data.pinnedRepos.slice(0, 5).map((repo, index) => {
    const language = escapeReadmeHtml(repo.language || 'Multiple technologies');
    const description = escapeReadmeHtml(repo.description || 'A featured public repository.');
    return `<details${index === 0 ? ' open' : ''}>
<summary><b>${escapeReadmeHtml(repo.name)}</b></summary>

${description}

- **Stack:** ${language}
- **Stars:** ${repo.stars}
- **Repository:** [View on GitHub](${repo.url})

</details>`;
  }).join('\n\n');
  const projects = projectItems
    ? `## \`> ls /projects --sort=impact\`

${projectItems}`
    : '';
  const experienceLines = (config.experienceSummary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  const experience = experienceLines.length
    ? `## \`> cat experience.log\`

${experienceLines.map((line) => `- ${escapeReadmeHtml(line)}`).join('\n')}`
    : '';
  const achievements = (config.achievements || []).filter(Boolean).slice(0, 6);
  const achievementSection = achievements.length
    ? `## \`> echo $ACHIEVEMENTS\`

${achievements.map((achievement) => `- ${escapeReadmeHtml(achievement)}`).join('\n')}`
    : '';
  const education = config.education?.trim()
    ? `## \`> git log --oneline /education\`

${escapeReadmeHtml(config.education.trim())}`
    : '';
  const activity = `## \`> git stats --global\`

${renderTerminalIdentityAsset('stats', config)}

${renderTerminalIdentityAsset('heatmap', config)}`;
  const focus = (config.currentFocus || []).filter(Boolean).slice(0, 6);
  const focusSection = focus.length || config.openTo?.trim()
    ? `## \`> cat current-focus.yaml\`

\`\`\`yaml
building:
${focus.length ? focus.map((item) => `  - ${escapeReadmeHtml(item)}`).join('\n') : '  - Open source projects'}
${config.openTo?.trim() ? `\nopen_to:\n  - ${escapeReadmeHtml(config.openTo.trim())}` : ''}
\`\`\``
    : '';
  const connect = `## \`> ping me\`

<div align="center">

${links.join(' &nbsp;·&nbsp; ')}

</div>`;
  const footer = `<p align="center"><sub>${displayName} · Terminal portfolio generated with <a href="https://www.gitskins.com/readme-generator">GitSkins</a></sub></p>`;
  const blocks = [
    header,
    about,
    stack,
    projects,
    experience,
    achievementSection,
    education,
    activity,
    focusSection,
    connect,
    footer,
  ].filter(Boolean);
  const markdown = blocks.join('\n\n---\n\n');
  const strategy = buildReadmeStrategy(data, config);
  const score = scoreReadme(markdown, data, config);

  return {
    markdown,
    sections: [
      { id: 'header', type: 'header', content: header },
      { id: 'about', type: 'about', content: about },
      { id: 'skills', type: 'skills', content: stack },
      ...(projects ? [{ id: 'projects', type: 'projects' as const, content: projects }] : []),
      ...((experience || achievementSection || education || focusSection)
        ? [{
            id: 'career',
            type: 'highlights' as const,
            content: [experience, achievementSection, education, focusSection].filter(Boolean).join('\n\n'),
          }]
        : []),
      { id: 'stats', type: 'stats', content: activity },
      { id: 'connect', type: 'connect', content: connect },
    ],
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: data.languages.map((language) => language.name),
      repoCount: data.totalRepos,
      totalStars: data.totalStars,
      strategy,
      score,
    },
  };
}

/**
 * Generate README using template (fallback when AI is unavailable)
 */
export function generateReadmeTemplate(
  data: ExtendedProfileData,
  config: ReadmeConfig
): GeneratedReadme {
  if (config.preset === 'showcase') {
    return generateShowcaseTemplate(data, config);
  }
  if (config.preset === 'neon-circuit') {
    return generateNeonCircuitTemplate(data, config);
  }
  if (config.preset === 'terminal-identity') {
    return generateTerminalIdentityTemplate(data, config);
  }
  if (config.preset === 'system-scan') {
    return generateSystemScanTemplate(data, config);
  }
  if (config.preset === 'terminal-portfolio') {
    return generateTerminalPortfolioTemplate(data, config);
  }

  const sections: GeneratedReadme['sections'] = [];
  let markdown = '';

  const displayName = data.name || config.username;

  // Header Section
  if (config.sections.includes('header')) {
    const headerContent = generateHeaderSection(displayName, data, config) + renderExtraSectionAssets('header', config);
    sections.push({ id: 'header', type: 'header', content: headerContent });
    markdown += headerContent + '\n\n';
  }

  // About Section
  if (config.sections.includes('about')) {
    const aboutContent = generateAboutSection(data, config) + renderExtraSectionAssets('about', config);
    sections.push({ id: 'about', type: 'about', content: aboutContent });
    markdown += aboutContent + '\n\n';
  }

  // Skills/Languages Section
  if (config.sections.includes('skills') || config.sections.includes('languages')) {
    const skillsContent = generateSkillsSection(data, config) + renderExtraSectionAssets('skills', config);
    sections.push({ id: 'skills', type: 'skills', content: skillsContent });
    markdown += skillsContent + '\n\n';
  }

  // Stats Section
  if (config.sections.includes('stats')) {
    const statsContent = generateStatsSection(config.username, config.theme, config.style) + renderExtraSectionAssets('stats', config);
    sections.push({ id: 'stats', type: 'stats', content: statsContent });
    markdown += statsContent + '\n\n';
  }

  // Streak Section
  if (config.sections.includes('streak')) {
    const streakContent = generateStreakSection(config.username, config.theme, data.streak) + renderExtraSectionAssets('streak', config);
    sections.push({ id: 'streak', type: 'streak', content: streakContent });
    markdown += streakContent + '\n\n';
  }

  // Projects Section
  if (config.sections.includes('projects')) {
    const projectsContent = generateProjectsSection(data, config) + renderExtraSectionAssets('projects', config);
    sections.push({ id: 'projects', type: 'projects', content: projectsContent });
    markdown += projectsContent + '\n\n';
  }

  // Heatmap Section
  if (config.sections.includes('heatmap')) {
    const heatmapContent = generateHeatmapSection(
      config.username,
      config.theme,
      config.heatmapStyle ?? (config.jetHeatmap ? 'jet' : 'aura'),
    ) + renderExtraSectionAssets('heatmap', config);
    sections.push({ id: 'heatmap', type: 'heatmap', content: heatmapContent });
    markdown += heatmapContent + '\n\n';
  }

  // Highlights Section
  if (config.sections.includes('highlights')) {
    const highlightsContent = generateHighlightsSection(config.username, config.theme) + renderExtraSectionAssets('highlights', config);
    sections.push({ id: 'highlights', type: 'highlights', content: highlightsContent });
    markdown += highlightsContent + '\n\n';
  }

  // Connect Section
  if (config.sections.includes('connect')) {
    const connectContent = generateConnectSection(data, config) + renderExtraSectionAssets('connect', config);
    sections.push({ id: 'connect', type: 'connect', content: connectContent });
    markdown += connectContent + '\n\n';
  }

  // Footer
  markdown += '---\n\n';
  markdown += `<p align="center">Profile README generated with <a href="https://www.gitskins.com/readme-generator">GitSkins</a></p>\n`;
  const strategy = buildReadmeStrategy(data, config);
  const score = scoreReadme(markdown, data, config);

  return {
    markdown: markdown.trim(),
    sections,
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: data.languages.map(l => l.name),
      repoCount: data.totalRepos,
      totalStars: data.totalStars,
      strategy,
      score,
    },
  };
}

function generateHeaderSection(name: string, data: ExtendedProfileData, config: ReadmeConfig): string {
  const { style, theme, username } = config;
  if (style === 'minimal') {
    return `# Hi, I'm ${name} 👋`;
  }

  if (style === 'detailed') {
    return `<p align="center">
  <img src="https://www.gitskins.com/api/section/hero?username=${username}&theme=${theme}" alt="${name} profile hero" />
</p>`;
  }

  if (style === 'creative') {
    return `<h1 align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=600&size=28&pause=1000&color=22C55E&center=true&vCenter=true&width=435&lines=Hi+👋+I'm+${encodeURIComponent(name)};Welcome+to+my+profile!" alt="Typing SVG" />
</h1>

<p align="center">
  <img src="${data.avatarUrl}" width="150" style="border-radius: 50%;" alt="${name}" />
</p>`;
  }

  return `<h1 align="center">Hi 👋, I'm ${name}</h1>

<p align="center">
  <img src="${data.avatarUrl}" width="120" style="border-radius: 50%;" alt="${name}" />
</p>`;
}

function generateAboutSection(data: ExtendedProfileData, config: ReadmeConfig): string {
  const { style, theme, username } = config;
  const bio = data.bio || 'Passionate developer building awesome things.';

  if (style === 'minimal') {
    return `${bio}`;
  }

  if (style === 'detailed') {
    return `<p align="center">
  <img src="https://www.gitskins.com/api/section/about?username=${username}&theme=${theme}" alt="About ${data.name || username}" />
</p>`;
  }

  let about = `## 👨‍💻 About Me\n\n${bio}\n\n`;

  const details: string[] = [];
  if (data.location) details.push(`📍 Based in **${data.location}**`);
  if (data.company) details.push(`🏢 Working at **${data.company}**`);
  if (data.websiteUrl) details.push(`🌐 Check out my [website](${data.websiteUrl})`);
  details.push(`👥 **${data.followers}** followers · **${data.following}** following`);

  if (details.length > 0) {
    about += details.map(d => `- ${d}`).join('\n');
  }

  return about;
}

function generateSkillsSection(data: ExtendedProfileData, config: ReadmeConfig): string {
  const { style, theme, username } = config;
  if (data.languages.length === 0) {
    return '';
  }

  if (config.languageLogos?.length) {
    const selectedIconIds = skillIconIds(config.languageLogos);
    if (selectedIconIds.length === 0) return '';
    return `<p align="center">\n  <img src="https://skillicons.dev/icons?i=${selectedIconIds.join(',')}&perline=8&theme=dark" alt="Selected language and technology logos" />\n</p>`;
  }

  if (style === 'detailed') {
    return `<p align="center">
  <img src="https://www.gitskins.com/api/section/stack?username=${username}&theme=${theme}" alt="Language stack" />
</p>`;
  }

  let section = style === 'minimal' ? '## Tech Stack\n\n' : '## 🛠️ Languages & Tools\n\n';

  // Add badges for known languages
  const badges = data.languages
    .slice(0, 6)
    .map(lang => {
      const badge = languageBadges[lang.name];
      if (badge) {
        return `![${lang.name}](${badge})`;
      }
      return null;
    })
    .filter(Boolean);

  if (badges.length > 0) {
    section += badges.join(' ') + '\n';
  } else {
    // Fallback to text list
    section += data.languages
      .slice(0, 6)
      .map(l => `**${l.name}** (${l.percentage}%)`)
      .join(' • ');
  }

  return section;
}

function generateStatsSection(username: string, theme: string, style: ReadmeStyle): string {
  const title = style === 'minimal' ? '## Stats\n\n' : '## 📊 GitHub Stats\n\n';
  return `${title}<p align="center">
  <img src="https://www.gitskins.com/api/section/stats?username=${username}&theme=${theme}" alt="GitHub Stats" />
</p>`;
}

function generateStreakSection(
  username: string,
  theme: string,
  streak: ExtendedProfileData['streak']
): string {
  return `## 🔥 Contribution Streak

<p align="center">
  <img src="https://www.gitskins.com/api/section/heatmap?username=${username}&theme=${theme}" alt="Animated contribution activity" />
</p>

- 🔥 **Current Streak:** ${streak.current} days
- 🏆 **Longest Streak:** ${streak.longest} days
- 📅 **Total Active Days:** ${streak.totalDays} days`;
}

function generateProjectsSection(
  data: ExtendedProfileData,
  config: ReadmeConfig
): string {
  const { style, theme, username } = config;
  const repos = data.pinnedRepos;
  if (repos.length === 0) {
    return '';
  }

  if (style === 'detailed') {
    return `<p align="center">
  <img src="https://www.gitskins.com/api/section/projects?username=${username}&theme=${theme}" alt="${username} featured projects" />
</p>`;
  }

  let section = style === 'minimal' ? '## Projects\n\n' : '## 🚀 Featured Projects\n\n';

  repos.slice(0, 6).forEach(repo => {
    const langBadge = repo.language ? ` \`${repo.language}\`` : '';
    const description = repo.description || 'No description provided';

    section += `### [${repo.name}](${repo.url})${langBadge}\n`;
    section += `${description}\n`;
    section += `⭐ ${repo.stars} | 🍴 ${repo.forks}\n\n`;
  });

  return section;
}

function generateHeatmapSection(
  username: string,
  theme: string,
  heatmapStyle: 'aura' | 'jet' | 'erased' | 'snake' = 'aura',
): string {
  const style = heatmapStyle === 'aura' ? '' : `&style=${heatmapStyle}`;
  const description = {
    aura: 'contribution activity',
    jet: 'contribution activity, with a jet firing at their busiest days',
    erased: 'contribution activity, with an animated erased field',
    snake: 'contribution activity, with an animated snake trail',
  }[heatmapStyle];
  const alt = `${username} ${description}`;
  return `<p align="center">
  <img src="https://www.gitskins.com/api/section/heatmap?username=${username}&theme=${theme}${style}" alt="${alt}" />
</p>`;
}

function generateHighlightsSection(username: string, theme: string): string {
  // Data-derived defaults (repos/stars/followers) render when no items are given.
  return `<p align="center">
  <img src="https://www.gitskins.com/api/section/highlights?username=${username}&theme=${theme}" alt="${username} highlights" />
</p>`;
}

function generateConnectSection(data: ExtendedProfileData, config: ReadmeConfig): string {
  const { username, theme } = config;
  let section = '## 🤝 Connect With Me\n\n';

  const socialParams = new URLSearchParams();
  socialParams.set('username', username);
  socialParams.set('theme', theme);
  if (config.socialWebsite || data.websiteUrl) socialParams.set('website', config.socialWebsite || data.websiteUrl || '');
  if (config.socialX || data.twitterUsername) socialParams.set('x', config.socialX || data.twitterUsername || '');
  if (config.socialLinkedIn) socialParams.set('linkedin', config.socialLinkedIn);
  if (config.socialEmail) socialParams.set('email', config.socialEmail);

  section += `<p align="center">
  <img src="https://www.gitskins.com/api/section/social?${socialParams.toString()}" alt="${username} social links" />
</p>\n\n`;

  const links: string[] = [];

  links.push(`[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/${username})`);

  if (config.socialX || data.twitterUsername) {
    links.push(`[![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://twitter.com/${config.socialX || data.twitterUsername})`);
  }

  if (config.socialWebsite || data.websiteUrl) {
    links.push(`[![Website](https://img.shields.io/badge/Website-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](${config.socialWebsite || data.websiteUrl})`);
  }

  if (config.socialLinkedIn) {
    const linkedInUrl = config.socialLinkedIn.startsWith('http') ? config.socialLinkedIn : `https://www.linkedin.com/${config.socialLinkedIn}`;
    links.push(`[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](${linkedInUrl})`);
  }

  if (config.socialEmail) {
    links.push(`[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:${config.socialEmail})`);
  }

  section += links.join(' ');

  return section;
}

/**
 * Parse AI-generated README into sections
 */
export function parseGeneratedReadme(markdown: string, config: ReadmeConfig): GeneratedReadme {
  const sections: GeneratedReadme['sections'] = [];

  // Simple parsing - split by ## headers
  const parts = markdown.split(/(?=^## )/gm);

  parts.forEach((part, index) => {
    if (part.trim()) {
      const lines = part.trim().split('\n');
      const firstLine = lines[0].toLowerCase();

      let type: ReadmeSectionType = 'custom';
      if (firstLine.includes('about') || index === 0) type = 'about';
      else if (firstLine.includes('skill') || firstLine.includes('tech') || firstLine.includes('language')) type = 'skills';
      else if (firstLine.includes('stat')) type = 'stats';
      else if (firstLine.includes('streak')) type = 'streak';
      else if (firstLine.includes('project') || firstLine.includes('repo')) type = 'projects';
      else if (firstLine.includes('connect') || firstLine.includes('contact')) type = 'connect';

      sections.push({
        id: `section-${index}`,
        type,
        content: part.trim(),
      });
    }
  });

  return {
    markdown,
    sections,
    metadata: {
      username: config.username,
      generatedAt: new Date().toISOString(),
      languages: [],
      repoCount: 0,
      totalStars: 0,
    },
  };
}
