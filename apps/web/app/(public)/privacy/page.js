import { fetchCompany } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';
import { ContactCta } from '@/components/site/home-sections';

/**
 * Legal pages.
 *
 * The text below is a starting point written to be honest about what this
 * application actually does, not a generic template. It is deliberately specific:
 * it states that the admin area is authenticated, that contact submissions are
 * stored, and that no third-party tracking is used — because a policy that
 * contradicts the product is worse than no policy.
 *
 * REVIEW BEFORE LAUNCH. These are not legal advice and will need review against
 * Ethiopian consumer and data protection requirements, which vary. The
 * administrator can edit this text from the settings section.
 */

export const metadata = buildMetadata({
  title: 'Privacy policy',
  description: 'How Virallink handles personal information submitted through this website.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Privacy policy"
        description="What we collect, why, and what we do not do with it."
      />

      <Section className="pt-0">
        <div className="max-w-3xl">
          <div className="prose-content">
            <h2>Who we are</h2>
            <p>
              Virallink is a digital marketing company. This policy covers this website and the enquiry form on it.
            </p>

            <h2>What we collect</h2>
            <p>
              If you use the contact form we collect the name, email address, optional phone number, optional
              company name and the message you send us. We use this only to reply to your enquiry and to keep a
              record of the conversation.
            </p>
            <p>
              We also record a hashed form of your IP address when you submit the form. This is used to identify
              automated spam submissions. It is not stored in a form that can be traced back to you.
            </p>

            <h2>What we do not collect</h2>
            <p>
              This website does not use advertising trackers, third-party analytics or social pixels. We do not
              sell or share personal information with third parties for marketing purposes.
            </p>

            <h2>How long we keep it</h2>
            <p>
              Enquiries are retained for as long as needed to manage the commercial relationship, and are archived
              rather than deleted immediately once concluded.
            </p>

            <h2>Cookies</h2>
            <p>
              Public pages set no cookies. Signing in to the administration area sets two strictly necessary cookies
              to hold your session; they are marked <code>httpOnly</code> and <code>SameSite=Lax</code>, and contain
              nothing but a session token.
            </p>

            <h2>Your rights</h2>
            <p>
              You can ask us what information we hold about you, request a correction, or ask for it to be deleted.
              Contact us using the details on the contact page and we will respond.
            </p>

            <h2>Security</h2>
            <p>
              The administration area requires authentication, and every request for private data is authorised on
              the server. Passwords are stored only as irreversible hashes. Access to management functions is
              restricted by role.
            </p>

            <h2>Changes</h2>
            <p>
              If this policy changes we will update the date below. Continued use of the website after a change
              indicates acceptance of the revised policy.
            </p>

            <h2>Contact</h2>
            <p>Questions about this policy can be sent through the contact form.</p>
          </div>
        </div>
      </Section>
    </>
  );
}

/** Exported so the footer and about page can reuse the same wording. */
export async function PrivacyCompany() {
  return fetchCompany().catch(() => null);
}