import { buildMetadata } from '@/lib/seo';
import { Section } from '@/components/site/Section';
import { PageHeader } from '@/components/site/PageHeader';

/**
 * Terms of service.
 *
 * Plain-language terms written to match how the business actually operates.
 * REVIEW BEFORE LAUNCH: these are not legal advice and will need review against
 * Ethiopian consumer and contract law.
 */

export const metadata = buildMetadata({
  title: 'Terms of service',
  description: 'The terms that apply when you use the Virallink website.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Terms of service"
        description="The terms that apply when you use this website."
      />

      <Section className="pt-0">
        <div className="max-w-3xl">
          <div className="prose-content">
            <h2>About these terms</h2>
            <p>
              These terms apply to your use of this website. By using it you agree to them. If you do not agree, do
              not use the site.
            </p>

            <h2>About the content on this site</h2>
            <p>
              We aim to keep the information here accurate and current. It is provided for general information and
              does not constitute advice specific to your circumstances. Where a figure, case study or quotation
              appears, it reflects work we have done and is published with the client&rsquo;s agreement.
            </p>

            <h2>Intellectual property</h2>
            <p>
              The logo, text, layout and design of this site belong to Virallink unless stated otherwise. You may
              view the site and quote from it with attribution. You may not reproduce it commercially without
              written permission.
            </p>
            <p>
              Where we present work for a client, the underlying work belongs to that client. Our right to show it
              is agreed with them at the time.
            </p>

            <h2>Enquiries</h2>
            <p>
              Sending us an enquiry does not create a contract. It means you are asking us to consider your project.
              Nothing is committed until we have agreed a scope in writing.
            </p>

            <h2>Prices and timelines</h2>
            <p>
              Any pricing or timeline mentioned in correspondence is an estimate until a signed proposal is in
              place. Estimates depend on the information available at the time and may change as the scope becomes
              clearer.
            </p>

            <h2>Third-party links</h2>
            <p>
              Where this site links to another site, we are not responsible for its content or its privacy practices.
              Following such a link is at your own discretion.
            </p>

            <h2>Liability</h2>
            <p>
              We are not liable for loss arising from reliance on the content of this site, or from the site being
              unavailable. Nothing here limits liability that cannot be limited by law.
            </p>

            <h2>Governing law</h2>
            <p>
              These terms are governed by the laws of Ethiopia, and the courts of Ethiopia have jurisdiction over
              any dispute.
            </p>

            <h2>Changes</h2>
            <p>
              We may update these terms. Continued use of the site after a change indicates acceptance of the
              revised version.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}