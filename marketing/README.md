# TalentBridge $0 marketing campaign

Everything here costs nothing but time. The plan: **win job seekers in Maryland, DC and Virginia first**, let the product spread itself (people sharing their Capability Graphs), and borrow other people’s audiences: partners, communities and local press. Employers follow once there are candidates to show them.

| File | What it is |
|---|---|
| `posts-weeks-1-2.md` | Ready-to-post copy for LinkedIn, X and Facebook, two weeks |
| `outreach.md` | Partner, employer and press emails, plus the workshop outline |
| `assets/post-before-after.png` | Résumé line vs. TalentBridge (1080×1350) |
| `assets/post-show-what-you-can-do.png` | The #ShowWhatYouCanDo challenge |
| `assets/post-hospitality.png` | For servers, cooks and hotel staff |
| `assets/flyer.pdf` | One-page flyer for partners; its QR code is tracked |
| `../brand/` | Logo, X header, Capability Graph explainer, promo video |

To change an image or the flyer, edit `src/social.html` or `src/flyer.html` and run `node marketing/src/render.cjs`.

## The campaigns

1. **#ShowWhatYouCanDo**: people build their graph and share it. The **Share on LinkedIn / X / Facebook** buttons on the profile page tag every share, so signups from shares show up as the campaign `showwhatyoucando`.
2. **Hospitality**: servers, bartenders, cooks and hotel staff now get their own questions and local restaurant and hotel jobs. They’re easy to reach in Facebook groups, and almost nobody else serves them well.
3. **Partners**: job centers, community colleges, culinary and nursing programs, and veterans and reentry programs. You run a free workshop; they bring the people.

## Before you start (one evening)

- [ ] Merge the branch so the share buttons, tracking and hospitality features are live.
- [ ] Build **your own** Capability Graph, turn on your public link, and add a photo. Several posts say “here’s mine.”
- [ ] Ask 10–15 friends and former coworkers to build and share theirs in week 1. Early shares make the hashtag look alive.
- [ ] Update your LinkedIn headline to mention TalentBridge, and put the site in your LinkedIn, X and Facebook profiles.
- [ ] Save the tracking links below somewhere handy.

## Six weeks

| Week | Focus | Done when |
|---|---|---|
| 1 | Launch posts; your own profile; 15 friends share theirs | 15+ graphs built |
| 2 | #ShowWhatYouCanDo and hospitality posts; email 10 partners | 3 partner replies |
| 3 | Product Hunt and Show HN; 4 Facebook group posts; check the scorecard and double down on what’s working | Your best channel is clear |
| 4 | First workshop; pitch local press; start contacting employers | 1 workshop booked or done |
| 5 | Share real (anonymous) results; second workshop | |
| 6 | Employer push using your candidate numbers; plan the next six weeks around your best channel | 10 employers contacted |

**Daily, about 30 minutes:** post if it’s a posting day; leave 5–10 thoughtful comments on posts by recruiters, career coaches and job seekers; and answer every comment and DM the same day.

## Tracking links

Always use these instead of the bare address. Each one shows up in **Admin → System → Where signups come from**. New accounts are also asked “How did you hear about TalentBridge?” at onboarding.

| Where | Link |
|---|---|
| LinkedIn posts | `https://talentbridge-jobboard.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=launch` |
| LinkedIn, hospitality | `https://talentbridge-jobboard.vercel.app/?utm_source=linkedin&utm_medium=social&utm_campaign=hospitality` |
| X posts | `https://talentbridge-jobboard.vercel.app/?utm_source=x&utm_medium=social&utm_campaign=launch` |
| X, hospitality | `https://talentbridge-jobboard.vercel.app/?utm_source=x&utm_medium=social&utm_campaign=hospitality` |
| Facebook page or profile | `https://talentbridge-jobboard.vercel.app/?utm_source=facebook&utm_medium=social&utm_campaign=launch` |
| Facebook groups | `https://talentbridge-jobboard.vercel.app/?utm_source=facebook&utm_medium=group&utm_campaign=launch` |
| Facebook groups, hospitality | `https://talentbridge-jobboard.vercel.app/?utm_source=facebook&utm_medium=group&utm_campaign=hospitality` |
| Reddit or Nextdoor | `https://talentbridge-jobboard.vercel.app/?utm_source=reddit&utm_medium=community&utm_campaign=launch` (change `reddit` to `nextdoor`) |
| Partner emails | `https://talentbridge-jobboard.vercel.app/?utm_source=partner&utm_medium=email&utm_campaign=partners&utm_content=PARTNERNAME` |
| Flyer (QR code) | `https://talentbridge-jobboard.vercel.app/?utm_source=flyer&utm_medium=print&utm_campaign=partners` |
| Press | `https://talentbridge-jobboard.vercel.app/?utm_source=press&utm_medium=email&utm_campaign=press` |
| Product Hunt / Hacker News | `https://talentbridge-jobboard.vercel.app/?utm_source=producthunt&utm_medium=launch&utm_campaign=launch` (or `hackernews`) |
| Profile shares | Automatic: the share buttons tag them `showwhatyoucando` |

Replace `PARTNERNAME` with a short name, such as `ccbc` or `pratt-library`, so you can see which partner sends people. On LinkedIn, put the link in the **first comment**, not the post: posts with links tend to reach fewer people there.

## Weekly scorecard (Fridays, 10 minutes)

Use **Admin → System** (“Last 7 days” and “Where signups come from”) and the overview numbers.

| Week | New signups | Graphs built | Top source | Top campaign | Partners contacted / replied | Notes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |

Week 3 rule: put twice the time into the channel with the most signups per hour spent, and cut the weakest.

## Rules that keep this working

- **Lead with value in groups.** Read each group’s rules first, and where links aren’t allowed, say “comment and I’ll send it.”
- **Only real numbers.** Never invent statistics or testimonials. Quote a user only with their permission.
- **Sample profiles stay labeled.** The images use made-up people (Jordan Rivera, the server story) and say “Sample profile”; keep it that way.
- **No mass DMs, scraped email lists or bought followers.**
- **Announcements are for service updates only.** The Privacy Policy says TalentBridge doesn’t send marketing email. For a newsletter, make it opt-in and update the Privacy Policy first.
- **“Free”:** the copy says it’s free for job seekers. Change it everywhere if that ever stops being true.
