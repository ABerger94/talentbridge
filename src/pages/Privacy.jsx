import React from "react";
import { Link } from "react-router-dom";
import LegalPage from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

const sections = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.siteName} is a job platform that connects job seekers with employers and uses AI to describe how a
          candidate’s capabilities fit a role. It is operated by {LEGAL.operator} (“we”, “us”). You can reach us about
          anything in this policy at {mail}.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "Information we collect",
    body: (
      <>
        <p><strong>Account information.</strong> Your email address, a password (stored only as a one-way hash), your
          role (job seeker or employer), and, if you sign in with Google, your Google account’s name and ID.</p>
        <p><strong>Job seeker profiles.</strong> What you choose to add: your name, headline, bio, skills, experience,
          work history, education, career goals, values, preferred location and work type, salary expectations,
          industries of interest, portfolio and GitHub links, and your resume file. We also store AI-generated content
          about your profile, such as a capability graph, portfolio analysis, and resume critique.</p>
        <p><strong>Applications and hiring activity.</strong> Cover letters, application status, interview times and
          your responses, offer details and your responses, invitations, and AI capability assessments an employer runs
          on your application.</p>
        <p><strong>Messages.</strong> Messages you send to an employer or candidate about an application, and whether
          they’ve been read. Messages are only available between the two people on that application.</p>
        <p><strong>Employer content.</strong> Job postings (including documents you upload to fill a posting), and the
          actions you take on candidates.</p>
        <p><strong>Emails we send.</strong> A record of each notification (type, recipient, and whether it was
          delivered).</p>
        <p><strong>Technical information.</strong> Our hosting provider records standard server logs (such as IP
          address, browser type, and the pages requested). We keep short-lived counters keyed to your account or IP
          address to limit abuse (for example, too many sign-in attempts).</p>
        <p>We do not use advertising or analytics trackers, and we do not use cookies for tracking. Your browser’s
          local storage keeps your sign-in token so you stay signed in.</p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use your information",
    body: (
      <ul>
        <li>To run your account and the platform: sign-in, profiles, job postings, applications, interviews, and offers.</li>
        <li>To provide AI features: parsing resumes and job descriptions, matching candidates and roles, capability
          assessments, interview preparation, and resume critique.</li>
        <li>To send emails you need: verification and password-reset codes, and updates about applications,
          invitations, interviews, offers, and new messages. We do not send marketing email.</li>
        <li>To keep the service secure and prevent abuse, and to fix problems.</li>
        <li>To comply with the law.</li>
      </ul>
    ),
  },
  {
    id: "who-sees-what",
    title: "Who can see your information",
    body: (
      <>
        <p><strong>If you’re a job seeker:</strong></p>
        <ul>
          <li><strong>Employers on {LEGAL.siteName}</strong> can browse job seeker profiles (your name, headline, bio,
            skills, experience, and other profile details) and see AI match scores for their roles.</li>
          <li><strong>Your resume file</strong> is private. Only you, employers whose roles you apply to, and site
            administrators can open it.</li>
          <li><strong>When you apply</strong>, that employer sees your application, cover letter, resume, and
            responses, and can run AI assessments on it.</li>
        </ul>
        <p><strong>If you’re an employer:</strong> open job postings are public, including to visitors who aren’t
          signed in. Candidates see your company name and role details on invitations, interviews, and offers.</p>
        <p><strong>Messages</strong> can be read only by the candidate and employer on that application, and by site
          administrators when needed to investigate a report or abuse.</p>
        <p><strong>Site administrators</strong> can access all data to operate and support the service.</p>
        <p>We do not sell your personal information, and we do not share it for advertising.</p>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "Service providers we use",
    body: (
      <>
        <p>We rely on these companies to run {LEGAL.siteName}. They process your information on our behalf:</p>
        <ul>
          <li><strong>Hosting and database:</strong> Vercel (website and servers) and Turso (database, including
            uploaded files).</li>
          <li><strong>Sign-in:</strong> Google, if you choose “Continue with Google”.</li>
          <li><strong>Email delivery:</strong> Brevo, and where configured, Google Gmail or Resend.</li>
          <li><strong>AI providers:</strong> to power AI features we send the relevant text (for example, profile
            details, resume text, job descriptions, or application content) to one or more of: Google (Gemini), Groq,
            Cerebras, Mistral AI, OpenRouter (which may route requests to other model providers), and Anthropic. If one
            provider is unavailable, the request is sent to the next.</li>
        </ul>
        <p>
          Some of these AI services are used on free tiers. Under their own terms, a free-tier provider may retain
          submitted content or use it to improve its products. Please don’t put information in your profile, resume, or
          applications that you wouldn’t want processed this way (for example, government ID numbers, health
          information, or financial account details).
        </p>
        <p>Messages between candidates and employers are <strong>not</strong> sent to AI providers.</p>
        <p>We may also disclose information if required by law, to protect the rights and safety of users or others,
          or as part of a transfer of the service to a new operator (in which case this policy continues to apply).</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI features and hiring decisions",
    body: (
      <>
        <p>
          AI on {LEGAL.siteName} produces scores, summaries, and suggestions. It can be wrong or incomplete, and it is
          meant to help people, not to replace them. {LEGAL.siteName} does not make hiring decisions and does not
          automatically reject anyone; employers decide whom to contact, interview, and hire.
        </p>
        <p>If you think an AI-generated summary about you is inaccurate, update your profile or contact us at {mail}.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <ul>
        <li>Account, profile, job, and application data: for as long as your account exists, and deleted within 30 days
          of an account-deletion request (except where we must keep something to comply with the law or resolve
          disputes).</li>
        <li>Verification and reset codes: up to 10 minutes. Abuse-prevention counters: up to 24 hours.</li>
        <li>Messages: for as long as both related accounts exist; deleted with your account on request (the other
          person’s copies of their own messages may remain).</li>
        <li>Email notification records: for as long as the related account exists.</li>
        <li>Server logs: according to our hosting provider’s retention settings.</li>
      </ul>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices and rights",
    body: (
      <>
        <p>You can view and edit your profile at any time, withdraw applications, and decline invitations or offers in
          the app. You can also email {mail} to:</p>
        <ul>
          <li>get a copy of your personal information;</li>
          <li>correct information you can’t edit yourself;</li>
          <li>delete your account and personal information.</li>
        </ul>
        <p>We’ll respond within 30 days and may need to confirm your identity first. Depending on where you live (for
          example, California), you may have additional rights under local law; we’ll honor them as required. We won’t
          treat you differently for exercising your rights.</p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        We protect your information with measures such as hashed passwords, encrypted connections (HTTPS), private
        file links that expire, access controls on resumes and applications, and limits on repeated sign-in attempts.
        No system is perfectly secure, so we can’t guarantee absolute security. If you believe your account has been
        compromised, contact us right away.
      </p>
    ),
  },
  {
    id: "age",
    title: "Age requirement",
    body: (
      <p>
        {LEGAL.siteName} is for people {LEGAL.minimumAge} and older. We don’t knowingly collect information from anyone
        under {LEGAL.minimumAge}. If you believe someone under {LEGAL.minimumAge} has created an account, contact us
        and we’ll delete it.
      </p>
    ),
  },
  {
    id: "location",
    title: "Where information is processed",
    body: (
      <p>
        {LEGAL.siteName} is operated from the United States, and our service providers may process information in the
        United States and other countries. By using the service, you understand your information will be processed
        there.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the service changes. We’ll update the effective date above, and for significant
        changes we’ll give notice on the site or by email before they take effect.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us",
    body: (
      <p>
        Questions or requests about your privacy: {mail}. See also our <Link to="/terms">Terms of Service</Link>.
      </p>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what information {LEGAL.siteName} collects, how it’s used and shared, and the choices you
          have. It applies to everyone who uses the site, including job seekers, employers, and visitors.
        </p>
      }
      sections={sections}
      otherDoc={{ to: "/terms", label: "Terms of Service" }}
    />
  );
}
