// Remembers how someone first reached TalentBridge (a campaign link's utm_*
// tags, or the site that linked here) for 30 days, so it can be saved with
// their account at onboarding. Only in this browser; nothing is sent until
// they sign up.
const KEY = "tb_acq";
const TTL = 30 * 24 * 60 * 60 * 1000;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Date.now() - v.at < TTL ? v : null;
  } catch {
    return null;
  }
}

export function captureAcquisition() {
  try {
    const url = new URL(window.location.href);
    const utm = {};
    for (const k of UTM) if (url.searchParams.get(k)) utm[k] = url.searchParams.get(k).slice(0, 80);
    let referrer = null;
    try {
      const r = document.referrer && new URL(document.referrer);
      if (r && r.host !== url.host) referrer = r.host;
    } catch { /* no referrer */ }
    const existing = read();
    // A campaign link always counts (the latest one); otherwise keep the first visit.
    if (!Object.keys(utm).length && existing) return;
    localStorage.setItem(KEY, JSON.stringify({ ...utm, referrer, landing: url.pathname, at: Date.now() }));
  } catch { /* storage blocked: skip */ }
}

export const getAcquisition = () => {
  const v = read();
  if (!v) return null;
  const { at, ...rest } = v; // eslint-disable-line no-unused-vars
  return rest;
};

// Answers for "How did you hear about TalentBridge?" (keys match the server).
export const HEARD_FROM = [
  ["friend", "A friend or coworker"],
  ["linkedin", "LinkedIn"],
  ["facebook", "Facebook"],
  ["x", "X (Twitter)"],
  ["instagram", "Instagram"],
  ["search", "Google or another search"],
  ["job_center", "A job center, school or program"],
  ["employer", "An employer"],
  ["news", "News, a podcast or an article"],
  ["other", "Somewhere else"],
];
