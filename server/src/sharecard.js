'use strict';
// Link-preview image ("share card") for public profile links: 1200x630, the
// size Facebook, LinkedIn, Slack and iMessage expect. Drawn as SVG and
// rendered to PNG with resvg, using the bundled Inter font so text looks the
// same everywhere.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const W = 1200;
const H = 630;
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONTS = ['Inter-Regular.otf', 'Inter-SemiBold.otf', 'Inter-Bold.otf'].map((f) => path.join(FONT_DIR, f));
const LEVEL_NAMES = { 1: 'Executes', 2: 'Maintains', 3: 'Builds', 4: 'Improves', 5: 'Leads' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const FONT_OPTS = { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' };

// Exact text width in the bundled font (resvg lays the text out without
// drawing it; about half a millisecond), for wrapping and placement.
const widths = new Map();
function widthOf(text, size, weight = 400) {
  const t = String(text || '');
  if (!t.trim()) return 0;
  const key = `${weight}|${size}|${t}`;
  if (widths.has(key)) return widths.get(key);
  const { Resvg } = require('@resvg/resvg-js');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="150" font-family="Inter" font-weight="${weight}" font-size="${size}" xml:space="preserve">${esc(t)}</text></svg>`;
  const w = new Resvg(svg, { font: FONT_OPTS }).getBBox()?.width || t.length * size * 0.55;
  if (widths.size > 2000) widths.clear();
  widths.set(key, w);
  return w;
}

function wrap(text, size, maxWidth, maxLines, weight) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (widthOf(next, size, weight) <= maxWidth) { line = next; continue; }
    if (line) lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const used = lines.join(' ').split(' ').length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && widthOf(`${last}…`, size, weight) > maxWidth) last = last.replace(/\s*\S+$/, '');
    lines[lines.length - 1] = `${last.replace(/[,;:·|\s-]+$/, '')}…`;
  }
  return lines;
}

const fit = (text, size, maxWidth, weight) => wrap(text, size, maxWidth, 1, weight)[0] || '';

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

// What a card shows; also its cache key, so a changed profile gets a new URL.
function cardData(view) {
  const caps = (view.capability_graph?.core_execution_vectors || []);
  const rubric = Number(view.capability_graph?.rubric_version || 1) >= 2;
  const strengths = (rubric ? caps.filter((c) => c.differentiator) : []).slice(0, 3).map((c) => ({ name: c.vector, level: c.level }));
  return {
    name: view.full_name || '',
    headline: view.headline || view.capability_graph?.capability_headline || '',
    photo: view.photo_file || null,
    strengths,
  };
}

const cardVersion = (data) => crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 12);

function svgFor(data, photoDataUri) {
  const x0 = 500; // text column
  const textW = W - x0 - 70;
  // The name shrinks to fit one line, and wraps to two only if it must.
  const nameSize = [64, 58, 52, 46].find((sz) => widthOf(data.name, sz, 700) <= textW) || 46;
  const nameLines = wrap(data.name, nameSize, textW, 2, 700);
  const headline = wrap(data.headline, 30, textW, 2, 400);
  let y = data.strengths.length ? 178 - (nameLines.length - 1) * 30 : 250;
  const parts = [];
  nameLines.forEach((line, i) => {
    parts.push(`<text x="${x0}" y="${y + i * (nameSize + 6)}" font-family="Inter" font-weight="700" font-size="${nameSize}" fill="#FFFFFF">${esc(line)}</text>`);
  });
  y += (nameLines.length - 1) * (nameSize + 6) + 52;
  for (const line of headline) {
    parts.push(`<text x="${x0}" y="${y}" font-family="Inter" font-weight="400" font-size="30" fill="#D9D2F5">${esc(line)}</text>`);
    y += 40;
  }
  if (data.strengths.length) {
    y += 22;
    parts.push(`<text x="${x0}" y="${y}" font-family="Inter" font-weight="600" font-size="18" letter-spacing="2.5" fill="#5EEAD4">WHAT SETS THEM APART</text>`);
    y += 16;
    for (const s of data.strengths) {
      y += 44;
      const label = s.level ? `${s.level} · ${LEVEL_NAMES[s.level] || ''}` : '';
      // Meter (5 x 16px) sits just left of its label ("4 · Improves").
      const labelW = s.level ? widthOf(label, 18, 600) : 0;
      const meterW = 5 * 20 - 4;
      const room = s.level ? textW - labelW - 12 - meterW - 22 : textW;
      parts.push(`<text x="${x0}" y="${y}" font-family="Inter" font-weight="600" font-size="24" fill="#FFFFFF">${esc(fit(s.name, 24, room, 600))}</text>`);
      if (s.level) {
        const mx = W - 70 - labelW - 12 - meterW;
        for (let i = 1; i <= 5; i++) {
          parts.push(`<rect x="${mx + (i - 1) * 20}" y="${y - 13}" width="16" height="8" rx="4" fill="${i <= s.level ? '#A78BFA' : 'rgba(190,170,255,0.25)'}"/>`);
        }
        parts.push(`<text x="${W - 70}" y="${y}" text-anchor="end" font-family="Inter" font-weight="600" font-size="18" fill="#5EEAD4">${esc(label)}</text>`);
      }
    }
  }
  const cx = 250;
  const cy = 300;
  const r = 165;
  const photo = photoDataUri
    ? `<image href="${photoDataUri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#round)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2A1A6E"/><text x="${cx}" y="${cy + 36}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="104" fill="#C4B5FD">${esc(initials(data.name))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="#0C0A24"/><stop offset="0.5" stop-color="#1D0F4A"/><stop offset="0.82" stop-color="#3A1590"/><stop offset="1" stop-color="#6A2FE6"/>
    </linearGradient>
    <radialGradient id="glow" cx="1" cy="0" r="0.7"><stop offset="0" stop-color="#8B3DFF" stop-opacity="0.55"/><stop offset="1" stop-color="#8B3DFF" stop-opacity="0"/></radialGradient>
    <clipPath id="round"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="rgba(255,255,255,0.92)"/>
  ${photo}
  ${parts.join('\n  ')}
  <g transform="translate(70, 540)">
    <rect width="44" height="44" rx="11" fill="#5B2BE0"/>
    <path d="M14 14 L30 30 M30 14 L14 30" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/>
    <text x="58" y="31" font-family="Inter" font-weight="700" font-size="25" fill="#FFFFFF">TalentBridge</text>
    <text x="228" y="31" font-family="Inter" font-weight="400" font-size="20" fill="#B6ABDE">· Capability Graph</text>
  </g>
</svg>`;
}

// Rendered cards, newest kept (cards are small; URLs are versioned).
const cache = new Map();
const CACHE_MAX = 50;

async function renderCard(data) {
  const key = cardVersion(data);
  if (cache.has(key)) return cache.get(key);
  let photoUri = null;
  if (data.photo) {
    const file = await require('./files').loadFile(data.photo).catch(() => null);
    if (file?.buffer?.length) photoUri = `data:${file.contentType || 'image/jpeg'};base64,${file.buffer.toString('base64')}`;
  }
  const { Resvg } = require('@resvg/resvg-js');
  const png = new Resvg(svgFor(data, photoUri), {
    fitTo: { mode: 'width', value: W },
    font: FONT_OPTS,
  }).render().asPng();
  cache.set(key, png);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return png;
}

module.exports = { renderCard, cardData, cardVersion, svgFor, W, H };
