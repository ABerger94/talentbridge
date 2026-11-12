import React from "react";
import { Link } from "react-router-dom";
import LegalPage from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

const sections = [
  {
    id: "agreement",
    title: "Agreement to these terms",
    body: (
      <p>
        These Terms of Service are an agreement between you and {LEGAL.operator}, who operates {LEGAL.siteName} (“we”,
        “us”). By creating an account or using {LEGAL.siteName}, you agree to these terms and to our{" "}
        <Link to="/privacy">Privacy Policy</Link>. If you don’t agree, please don’t use the service.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use TalentBridge",
    body: (
      <ul>
        <li>You must be at least {LEGAL.minimumAge} years old.</li>
        <li>If you use {LEGAL.siteName} on behalf of an employer, you confirm you’re authorized to act for it, and these
          terms apply to that employer too.</li>
        <li>You may not use the service if we’ve previously suspended or removed your account.</li>
      </ul>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>Give accurate information and keep it up to date.</li>
        <li>Keep your password private. You’re responsible for activity on your account; tell us at {mail} if you think
          it’s been accessed without permission.</li>
        <li>One person per account. Don’t create accounts for someone else without their permission.</li>
      </ul>
    ),
  },
  {
    id: "job-seekers",
    title: "Job seekers",
    body: (
      <ul>
        <li>Your profile, resume, and applications must be truthful and your own.</li>
        <li>Employers on {LEGAL.siteName} can view your profile; employers you apply to can also see your resume and
          application (see the <Link to="/privacy">Privacy Policy</Link>).</li>
        <li>{LEGAL.siteName} doesn’t guarantee interviews, offers, or employment. Offers and employment terms are
          between you and the employer.</li>
      </ul>
    ),
  },
  {
    id: "employers",
    title: "Employers",
    body: (
      <>
        <p>If you post roles or contact candidates, you agree that:</p>
        <ul>
          <li>Your postings describe real, currently available positions and are accurate, including pay where you
            state it.</li>
          <li>You will comply with all applicable employment laws, including laws against discrimination based on race,
            color, religion, sex, sexual orientation, gender identity, national origin, age, disability, genetic
            information, veteran status, or any other protected characteristic.</li>
          <li>You won’t charge candidates any fee to apply, interview, or be hired.</li>
          <li>You’ll use candidate information only to evaluate and communicate with candidates for your roles, keep it
            confidential, and not sell it, publish it, or use it for marketing.</li>
          <li>You won’t rely on {LEGAL.siteName}’s AI scores or summaries as the sole basis for any hiring decision, and
            you’re responsible for complying with any laws that apply to your use of automated tools in hiring
            (including notice, audit, or consent requirements where you hire).</li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: (
      <>
        <p>
          {LEGAL.siteName} uses AI to parse documents, suggest matches, score fit, summarize capabilities, and help with
          interviews and resumes. AI output can be inaccurate, incomplete, or biased. It’s provided for information
          only. It isn’t professional, legal, or career advice, and it isn’t a hiring decision.
        </p>
        <p>
          To provide these features, content you submit is processed by third-party AI providers, as described in the{" "}
          <Link to="/privacy">Privacy Policy</Link>. Review AI-generated content before relying on it or sharing it.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>Don’t use {LEGAL.siteName} to:</p>
        <ul>
          <li>post false, misleading, or fraudulent jobs or profiles, or impersonate anyone;</li>
          <li>collect information about users for purposes other than hiring for a real role, or scrape the site;</li>
          <li>send spam, harass, threaten, or discriminate against anyone;</li>
          <li>upload malware or content that’s illegal, infringing, or that you don’t have the right to share;</li>
          <li>try to access accounts, data, or systems you aren’t authorized to, or interfere with the service
            (including getting around rate limits or security measures);</li>
          <li>use the service in a way that breaks any law.</li>
        </ul>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <p>
        You keep ownership of what you submit (profiles, resumes, postings, messages). You give us a non-exclusive,
        worldwide, royalty-free license to host, store, copy, process (including with AI providers), and display that
        content only as needed to operate and improve {LEGAL.siteName} and as described in the Privacy Policy. The
        license ends when you delete the content or your account, except for copies we must keep by law or that other
        users already received (for example, an application you sent an employer).
      </p>
    ),
  },
  {
    id: "our-service",
    title: "Our service",
    body: (
      <ul>
        <li>{LEGAL.siteName} is currently free. If we introduce paid features, we’ll tell you before you’re charged.</li>
        <li>The {LEGAL.siteName} name, design, and software belong to us. These terms don’t give you rights to them
          except to use the service.</li>
        <li>We may change, suspend, or discontinue features. We’ll try to give notice of significant changes.</li>
      </ul>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <p>
        You can stop using {LEGAL.siteName} and ask us to delete your account at any time by emailing {mail}. We may
        suspend or remove accounts or content that break these terms or the law, or that put other users at risk.
        Sections that by their nature should continue (such as disclaimers, limits of liability, and governing law)
        survive termination.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        {LEGAL.siteName} is provided “as is” and “as available”. To the fullest extent permitted by law, we disclaim all
        warranties, express or implied, including merchantability, fitness for a particular purpose, and
        non-infringement. We don’t verify every user, job, or profile, and we don’t guarantee the accuracy of
        user-provided or AI-generated content, the outcome of any application, or that the service will be
        uninterrupted or error-free.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the fullest extent permitted by law, we won’t be liable for indirect, incidental, special, consequential,
        or punitive damages, or for lost profits, data, or opportunities, arising from your use of {LEGAL.siteName}.
        Our total liability for any claim relating to the service is limited to the greater of the amount you paid us
        in the 12 months before the claim or US $100. Some places don’t allow these limits, so they may not fully apply
        to you.
      </p>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        If you break these terms or the law while using {LEGAL.siteName} (for example, posting an unlawful job or
        misusing candidate data), you agree to cover the reasonable costs, including legal fees, of claims brought
        against us because of it.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of the State of {LEGAL.governingState}, USA, without regard to its
        conflict-of-law rules. Any dispute will be resolved in the state or federal courts located in{" "}
        {LEGAL.governingState}, and you and we consent to their jurisdiction. If you live outside the United States,
        you may also have protections under your local law that these terms can’t override.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. We’ll update the effective date above, and for material changes we’ll give notice on
        the site or by email before they take effect. If you keep using {LEGAL.siteName} after changes take effect, you
        accept the updated terms.
      </p>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <p>
        These terms and the Privacy Policy are the whole agreement between you and us about {LEGAL.siteName}. If any part
        is found unenforceable, the rest still applies. Our not enforcing a term isn’t a waiver. You can’t transfer
        these terms without our consent; we may transfer them if the service changes operators. Questions: {mail}.
      </p>
    ),
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          Please read these terms carefully. They explain the rules for using {LEGAL.siteName}, what you can expect from
          us, and what we expect from job seekers and employers.
        </p>
      }
      sections={sections}
      otherDoc={{ to: "/privacy", label: "Privacy Policy" }}
    />
  );
}
