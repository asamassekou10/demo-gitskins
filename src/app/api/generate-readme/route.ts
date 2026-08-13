/**
 * README Generator API Route
 *
 * POST /api/generate-readme
 * Generates a professional GitHub profile README using Gemini AI or templates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchProfileForReadme } from '@/lib/github';
import {
  generateReadmeTemplate,
  parseGeneratedReadme,
  buildReadmeStrategy,
  scoreReadme,
  applyReadmeAnimationPack,
} from '@/lib/readme-generator';
import { generateReadmeWithGemini, isGeminiConfigured } from '@/lib/gemini';
import { checkReadmeAllowedById, incrementReadmeUsageById } from '@/lib/server-usage';
import { signNoWatermark } from '@/lib/widget-token';
import type { ReadmeConfig, ReadmeSectionType, ReadmeStyle } from '@/types/readme';
import { db } from '@/lib/db';
import { checkRateLimit, parseJsonBody, rateLimitResponse, requireUserApi } from '@/lib/security';
import { usernameSchema } from '@/lib/validations';
import { modernizeReadmeVisuals } from '@/lib/readme-visuals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inFlightReadmeGenerations = new Map<string, number>();
const IN_FLIGHT_TTL_MS = 90_000;

function reserveGenerationSlot(userId: string): boolean {
  const now = Date.now();
  for (const [key, startedAt] of inFlightReadmeGenerations.entries()) {
    if (now - startedAt > IN_FLIGHT_TTL_MS) {
      inFlightReadmeGenerations.delete(key);
    }
  }

  if (inFlightReadmeGenerations.has(userId)) {
    return false;
  }

  inFlightReadmeGenerations.set(userId, now);
  return true;
}

const requestSchema = z.object({
  username: usernameSchema,
  sections: z
    .array(z.enum(['header', 'about', 'skills', 'stats', 'languages', 'projects', 'highlights', 'heatmap', 'streak', 'connect']))
    .optional()
    .default(['header', 'about', 'skills', 'stats', 'projects', 'connect']),
  style: z.enum(['minimal', 'detailed', 'creative']).optional().default('detailed'),
  preset: z.enum(['showcase', 'terminal-identity', 'system-scan', 'terminal-portfolio', 'neon-circuit']).optional(),
  sectionStyle: z.enum(['aura', 'terminal']).optional().default('aura'),
  theme: z.string().optional().default('satan'),
  careerMode: z.boolean().optional().default(false),
  careerRole: z.string().optional().default('fullstack'),
  agentLoop: z.boolean().optional().default(false),
  useAI: z.boolean().optional().default(true),
  aiProfileScan: z.boolean().optional().default(true),
  goal: z.enum(['get-hired', 'open-source', 'freelance', 'indie-hacker', 'student', 'founder', 'personal-brand']).optional().default('personal-brand'),
  structure: z.enum(['portfolio', 'hiring', 'open-source', 'founder', 'minimal', 'visual', 'technical']).optional().default('visual'),
  tone: z.enum(['concise', 'confident', 'friendly', 'senior', 'founder', 'playful', 'recruiter']).optional().default('confident'),
  motionStyle: z.enum(['none', 'subtle', 'animated', 'playful']).optional().default('none'),
  typingHeadline: z.boolean().optional().default(false),
  typingLines: z.array(z.string().min(1).max(90)).max(4).optional().default([]),
  animatedDivider: z.boolean().optional().default(false),
  contributionSnake: z.boolean().optional().default(false),
  spaceShooter: z.boolean().optional().default(false),
  spaceShooterStrategy: z.enum(['random', 'row', 'column']).optional().default('random'),
  jetHeatmap: z.boolean().optional().default(false),
  heatmapStyle: z.enum(['aura', 'jet', 'erased', 'snake']).optional().default('aura'),
  skillBadges: z.boolean().optional().default(true),
  languageLogos: z.array(z.string().min(1).max(40)).max(24).optional().default([]),
  visitorCounter: z.boolean().optional().default(false),
  githubTrophies: z.boolean().optional().default(false),
  avatarBlock: z.boolean().optional().default(false),
  socialWebsite: z.string().max(200).optional().default(''),
  socialX: z.string().max(80).optional().default(''),
  socialLinkedIn: z.string().max(120).optional().default(''),
  socialEmail: z.string().max(160).optional().default(''),
  professionalRole: z.string().max(120).optional().default(''),
  experienceSummary: z.string().max(1600).optional().default(''),
  education: z.string().max(400).optional().default(''),
  achievements: z.array(z.string().min(1).max(220)).max(6).optional().default([]),
  currentFocus: z.array(z.string().min(1).max(160)).max(6).optional().default([]),
  openTo: z.string().max(240).optional().default(''),
  sectionAssets: z
    .record(
      z.enum(['header', 'about', 'skills', 'stats', 'languages', 'projects', 'highlights', 'heatmap', 'streak', 'connect']),
    z.array(z.enum(['hero', 'about', 'stats', 'stack', 'projects', 'highlights', 'heatmap', 'social', 'wordmark', 'portrait', 'chess'])).max(6)
    )
    .optional()
    .default({}),
});

export async function POST(request: NextRequest) {
  try {
    const { user: sessionUser, response } = await requireUserApi(request);
    if (response) return response;

    const rateLimit = checkRateLimit(`readme:${sessionUser.id}`, { limit: 8, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfter);
    }

    const inFlightKey = sessionUser.id;
    if (!reserveGenerationSlot(inFlightKey)) {
      return NextResponse.json(
        {
          error: 'A README generation is already running. Wait for it to finish before retrying.',
          code: 'GENERATION_IN_PROGRESS',
        },
        { status: 409 }
      );
    }

    try {
      const usageCheckBefore = await checkReadmeAllowedById(sessionUser.id);
      if (!usageCheckBefore.allowed) {
        return NextResponse.json(
          {
            error: usageCheckBefore.plan === 'pro'
              ? 'Daily README generation limit reached.'
              : 'You have used your free README draft for this account.',
            code: 'LIMIT_REACHED',
            remaining: 0,
            limit: usageCheckBefore.limit,
            plan: usageCheckBefore.plan,
            period: usageCheckBefore.period,
          },
          { status: 429 }
        );
      }

      const parsed = await parseJsonBody(request, requestSchema, 'Invalid request');
      if (parsed.response) return parsed.response;
      const validatedData = parsed.data;

      const {
        username,
        sections,
        style,
        preset,
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
        typingHeadline,
        typingLines,
        animatedDivider,
        contributionSnake,
        spaceShooter,
        spaceShooterStrategy,
        jetHeatmap,
        heatmapStyle,
        skillBadges,
        languageLogos,
        visitorCounter,
        githubTrophies,
        avatarBlock,
        socialWebsite,
        socialX,
        socialLinkedIn,
        socialEmail,
        professionalRole,
        experienceSummary,
        education,
        achievements,
        currentFocus,
        openTo,
        sectionAssets,
      } = validatedData;

    // Fetch GitHub profile data
    const profileData = await fetchProfileForReadme(username);

    if (!profileData) {
      return NextResponse.json(
        { error: 'User not found', code: 'USER_NOT_FOUND' },
        { status: 404 }
      );
    }

    const config: ReadmeConfig = {
      username,
      sections: sections as ReadmeSectionType[],
      style: style as ReadmeStyle,
      theme,
      includeGitSkins: true,
      preset,
      aiProfileScan,
      goal,
      structure,
      tone,
      motionStyle,
      typingHeadline,
      typingLines,
      animatedDivider,
      contributionSnake,
      spaceShooter,
      spaceShooterStrategy,
      jetHeatmap,
      heatmapStyle,
      skillBadges,
      languageLogos,
      visitorCounter,
      githubTrophies,
      avatarBlock,
      socialWebsite,
      socialX,
      socialLinkedIn,
      socialEmail,
      professionalRole,
      experienceSummary,
      education,
      achievements,
      currentFocus,
      openTo,
      sectionAssets,
    };

    let result = preset ? generateReadmeTemplate(profileData, config) : undefined;
    let aiProvider: 'gemini' | 'gemini_refined' | 'openai' | 'template' = 'template';
    let refinementNotes: string[] | undefined;
    let reasoning: string | undefined;

    // AI generation is a Pro feature, free users get the non-AI template.
    // Presets are deliberate layouts. Keep them deterministic so users see
    // the selected structure immediately and avoid an unnecessary AI pass.
    const aiAllowed = useAI && usageCheckBefore.plan === 'pro' && !preset;

    // Try Gemini AI generation first (primary provider)
    if (aiAllowed && isGeminiConfigured()) {
      try {
        const geminiResult = await generateReadmeWithGemini(profileData, {
          username,
          sections,
          style: style as 'minimal' | 'detailed' | 'creative',
          theme,
          careerMode,
          careerRole,
          agentLoop,
          aiProfileScan,
          goal,
          structure,
          tone,
          motionStyle,
          typingHeadline,
          typingLines,
          animatedDivider,
          contributionSnake,
          spaceShooter,
          spaceShooterStrategy,
          jetHeatmap,
          heatmapStyle,
          skillBadges,
          visitorCounter,
          githubTrophies,
          avatarBlock,
          socialWebsite,
          socialX,
          socialLinkedIn,
          socialEmail,
          sectionAssets,
        });

        if (geminiResult?.markdown) {
          result = parseGeneratedReadme(geminiResult.markdown, config);
          result.metadata = {
            ...result.metadata,
            username,
            languages: profileData.languages.map((l) => l.name),
            repoCount: profileData.totalRepos,
            totalStars: profileData.totalStars,
          };
          aiProvider = geminiResult.refinementNotes ? 'gemini_refined' : 'gemini';
          refinementNotes = geminiResult.refinementNotes ?? undefined;
          reasoning = geminiResult.reasoning ?? undefined;
        }
      } catch {
        console.error('Gemini generation failed');
      }
    }

    // Fallback to OpenAI if Gemini fails
    if (!result && aiAllowed && process.env.OPENAI_API_KEY) {
      try {
        const { buildReadmePrompt } = await import('@/lib/readme-generator');
        const prompt = buildReadmePrompt(profileData, config);

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            messages: [
              {
                role: 'system',
                content: 'You are a professional README generator. Output only valid markdown, no explanations.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 2500,
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const generatedMarkdown = aiData.choices?.[0]?.message?.content;

          if (generatedMarkdown) {
            result = parseGeneratedReadme(generatedMarkdown, config);
            result.metadata = {
              ...result.metadata,
              username,
              languages: profileData.languages.map((l) => l.name),
              repoCount: profileData.totalRepos,
              totalStars: profileData.totalStars,
            };
            aiProvider = 'openai';
          }
        }
      } catch {
        console.error('OpenAI generation failed, falling back to template');
      }
    }

    // Fallback to template-based generation
    if (!result) {
      result = generateReadmeTemplate(profileData, config);
    }

    const animationPack = applyReadmeAnimationPack(result.markdown, profileData, config);
    result.markdown = modernizeReadmeVisuals(animationPack.markdown, {
      username: config.username,
      theme: config.theme,
    });

    // Apply the terminal render style by appending &style=terminal to every
    // GitSkins section URL (covers both the AI and template output in one place).
    if (sectionStyle === 'terminal') {
      result.markdown = result.markdown.replace(
        /(\/api\/section\/[a-z-]+\?[^"'\s)>]+)/g,
        (url) => (url.includes('style=') ? url : `${url}&style=terminal`),
      );
    }

    // Pro users get watermark-free section widgets via a signed token.
    if (usageCheckBefore.plan === 'pro') {
      const nw = signNoWatermark(config.username);
      result.markdown = result.markdown.replace(
        /(\/api\/section\/[a-z-]+\?[^"'\s)>]+)/g,
        (url) => (url.includes('nw=') ? url : `${url}&nw=${nw}`),
      );
    }

    // Theme-aware <picture>: wrap each section widget so GitHub serves a light
    // variant to light-mode viewers and the dark image to everyone else.
    result.markdown = result.markdown.replace(
      /<img\s[^>]*\bsrc="([^"]*\/api\/section\/[^"]+)"[^>]*?>/g,
      (imgTag, src) =>
        src.includes('mode=')
          ? imgTag
          : `<picture><source media="(prefers-color-scheme: light)" srcset="${src}&mode=light" />${imgTag}</picture>`,
    );

    const strategy = buildReadmeStrategy(profileData, config);
    const score = scoreReadme(result.markdown, profileData, config);
    result.metadata = {
      ...result.metadata,
      strategy,
      score,
    };

    let usageCheckAfter = usageCheckBefore;
    let savedGenerationId: string | null = null;
    if (sessionUser.id) {
      const usageIncrement = await incrementReadmeUsageById(sessionUser.id);
      if (usageCheckBefore.plan !== 'pro' && !usageIncrement) {
        return NextResponse.json(
          {
            error: 'Usage tracking is temporarily unavailable. Please retry in a moment.',
            code: 'USAGE_UPDATE_FAILED',
          },
          { status: 503 }
        );
      }
      usageCheckAfter = await checkReadmeAllowedById(sessionUser.id);
      const savedGeneration = await db.readmeGeneration.create({
        data: {
          userId: sessionUser.id,
          username,
          title: `${username} README`,
          goal,
          structure,
          tone,
          style,
          theme,
          score: score.overall,
          markdown: result.markdown,
        },
      }).catch(() => console.error('[readme] save generation failed'));
      savedGenerationId = savedGeneration?.id ?? null;
    }

      return NextResponse.json({
        success: true,
        projectId: savedGenerationId,
        readme: result.markdown,
        sections: result.sections,
        metadata: result.metadata,
        aiProvider,
        refinementNotes,
        reasoning,
        strategy,
        score,
        animationBlocks: animationPack.blocks,
        setupInstructions: animationPack.setupInstructions,
        profile: {
          name: profileData.name,
          avatarUrl: profileData.avatarUrl,
          bio: profileData.bio,
          followers: profileData.followers,
          totalStars: profileData.totalStars,
          totalRepos: profileData.totalRepos,
        },
        usage: {
          remaining: usageCheckAfter.remaining,
          limit: usageCheckAfter.limit,
          plan: usageCheckAfter.plan,
          creditsRemaining: usageCheckAfter.creditsRemaining,
        },
      });
    } finally {
      inFlightReadmeGenerations.delete(inFlightKey);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'VALIDATION_ERROR', details: error.errors },
        { status: 400 }
      );
    }

    console.error('README generation error');
    return NextResponse.json(
      { error: 'Failed to generate README', code: 'GENERATION_ERROR' },
      { status: 500 }
    );
  }
}
