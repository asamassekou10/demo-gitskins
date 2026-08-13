import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateWidgetQuery } from '@/lib/validations';
import { fetchExtendedGitHubData } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  if (!['hero', 'focus', 'divider', 'technology-stack'].includes(asset)) return new NextResponse('Not found', { status: 404 });
  try {
    const params = request.nextUrl.searchParams;
    if (asset === 'technology-stack') {
      const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
      const colors = ['#f7df1e', '#3178c6', '#61dafb', '#3776ab', '#a8b9cc', '#f97316', '#22c55e', '#a78bfa'];
      const logos = (params.get('logos') || 'JavaScript,TypeScript,React').split(',').map((value) => value.trim()).filter(Boolean).slice(0, 16);
      const width = Math.max(420, Math.min(920, logos.length * 116));
      const cards = logos.map((logo, index) => {
        const x = (index % 8) * 114 + 8;
        const y = Math.floor(index / 8) * 92 + 8;
        const initials = logo.replace(/[^A-Za-z0-9+#]/g, '').slice(0, 3).toUpperCase() || '?';
        return `<g><rect x="${x}" y="${y}" width="104" height="76" rx="12" fill="#202938" stroke="${colors[index % colors.length]}" stroke-width="2"/><text x="${x + 52}" y="${y + 38}" fill="${colors[index % colors.length]}" font-family="Arial,sans-serif" font-size="22" font-weight="700" text-anchor="middle">${escapeXml(initials)}</text><text x="${x + 52}" y="${y + 61}" fill="#dbeafe" font-family="Arial,sans-serif" font-size="11" text-anchor="middle">${escapeXml(logo.slice(0, 16))}</text></g>`;
      }).join('');
      const height = Math.ceil(logos.length / 8) * 92 + 8;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="16" fill="#0d1117"/>${cards}</svg>`;
      return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } });
    }
    const { username } = validateWidgetQuery({ username: params.get('username'), theme: 'neon' });
    const data = await fetchExtendedGitHubData(username);
    if (!data) return new NextResponse('Profile not found', { status: 404 });
    const fileName = asset === 'hero' ? 'hero-banner.svg' : asset === 'focus' ? 'focus-grid.svg' : 'divider.svg';
    const filePath = path.join(process.cwd(), 'public', 'readme-reference', fileName);
    let svg = await readFile(filePath, 'utf8');
    const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const palettes: Record<string, string[]> = {
      neon: ['#7df9ff', '#7b5cff', '#00ffa3', '#ff6b9d'],
      'github-dark': ['#58a6ff', '#8b949e', '#3fb950', '#f778ba'],
      dracula: ['#8be9fd', '#bd93f9', '#50fa7b', '#ff79c6'],
      aurora: ['#67e8f9', '#818cf8', '#34d399', '#f0abfc'],
      matrix: ['#39ff14', '#16a34a', '#a3e635', '#22c55e'],
      satan: ['#ff6b35', '#ff2d55', '#ffd166', '#ef476f'],
    };
    const palette = palettes[params.get('theme') || 'neon'] || palettes.neon;
    const sourceColors = ['#7df9ff', '#7b5cff', '#00ffa3', '#ff6b9d'];
    sourceColors.forEach((source, index) => { svg = svg.replaceAll(source, palette[index]!); });
    if (asset === 'hero') {
      const name = xml(data.name || username);
      const role = xml(params.get('role') || 'FULL-STACK DEVELOPER · BUILDER');
      const alias = xml(username.toUpperCase());
      svg = svg.replaceAll('G S Tejas', name).replaceAll('G S TEJAS', name).replace('DEMON_KING &#47;&#47; 001', alias).replace('FULL&#8209;STACK DEVELOPER  &#183;  AI&#47;ML ENGINEER  &#183;  FOUNDER', role);
    }
    if (asset === 'focus') {
      const items = (params.get('focus')?.split('|') || []).slice(0, 4);
      const replacements = [
        ['FOUNDER &amp; CEO', items[0] || 'BUILDING IN PUBLIC'],
        ['Five AM Labs Pvt Ltd', items[1] || 'SHIPPING USEFUL THINGS'],
        ['AI&#47;ML ENGINEER', items[2] || 'AI · DATA · SYSTEMS'],
        ['Scopeout &#183; Intern', data.languages[0]?.name || 'LEARNING · BUILDING'],
        ['FULL&#8209;STACK DEV', items[3] || 'FULL-STACK BUILDER'],
        ['MentorLink &#183; Intern', data.languages.slice(0, 2).map((language) => language.name).join(' · ') || 'WEB · PRODUCTS'],
        ['B.TECH &#183; CSE', items[0] || 'OPEN SOURCE'],
        ['BENGALURU, INDIA', params.get('location') || 'BUILDING FROM ANYWHERE'],
      ];
      for (const [from, to] of replacements) svg = svg.replace(from, xml(to));
    }
    return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } });
  } catch {
    return new NextResponse('Unable to render profile visual', { status: 500 });
  }
}
