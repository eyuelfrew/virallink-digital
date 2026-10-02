/**
 * Demo content seeder.
 *
 * Fills an empty or near-empty install with a coherent, realistic set of demo
 * content so the site can be shown to stakeholders: the company profile, stats,
 * social links, testimonials, services, clients, projects, blog posts and open
 * roles, plus enough finance history for the dashboard chart to mean something.
 *
 * Idempotent: every step checks before writing, so it can be re-run safely and
 * never duplicates rows. It also deliberately does not touch the three seeded
 * platform accounts, so the RBAC test suite keeps working after a demo reseed.
 *
 * Run with:  npm run seed:demo --workspace @virallink/api
 */
import sequelize from '../config/database.js';
import { models } from '../models/index.js';
import {
  CLIENT_STATUS,
  CLIENT_SOURCE,
  PROJECT_STATUS,
  PAYMENT_METHOD,
  INVOICE_STATUS,
  EMPLOYMENT_STATUS,
} from '@virallink/shared/enums';

const {
  Company,
  SocialLink,
  CompanyStat,
  Department,
  Employee,
  Testimonial,
  Client,
  Service,
  Project,
  Technology,
  Job,
  BlogCategory,
  BlogTag,
  BlogPost,
  FinancialCategory,
  FinancialTransaction,
  Invoice,
  InvoiceItem,
  Payment,
  User,
} = models;

/** Small helpers ------------------------------------------------------------ */

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysAhead = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const isoDate = (date) => date.toISOString().slice(0, 10);

const created = [];
function log(entity, name) {
  created.push(`${entity}: ${name}`);
}

/**
 * findOrCreate with two extra behaviours a paranoid schema needs:
 *
 *  - a unique-constraint failure is retried as a plain find. Two seeders racing
 *    is one cause; a soft-deleted row is the other — it is invisible to the
 *    paranoid SELECT but still holds the unique index, so the INSERT fails and
 *    the row has to be found again with deleted rows included.
 *  - a found soft-deleted row is restored and updated, so the demo content is
 *    correct rather than resurrecting stale test data.
 */
async function findOrCreate(model, where, defaults, label) {
  try {
    const [row, wasCreated] = await model.findOrCreate({ where, defaults });

    if (wasCreated) log(label, defaults.title || defaults.name || where.slug || where.key);

    return row;
  } catch (error) {
    const isDuplicate = error?.original?.code === 'ER_DUP_ENTRY' || error?.name === 'SequelizeUniqueConstraintError';

    if (!isDuplicate) throw error;
  }

  const existing = await model.findOne({ where, paranoid: false });

  if (!existing) throw new Error(`Insert failed for ${JSON.stringify(where)} and no row could be found afterwards.`);

  if (existing.deletedAt) {
    await existing.restore();
    await existing.update(defaults);
    log(label, `${defaults.title || defaults.name} (restored)`);
  }

  return existing;
}

/* -------------------------------------------------------------------------- */
/* Seed steps                                                                  */
/* -------------------------------------------------------------------------- */

async function seedCompany() {
  const company = await Company.findOne({ order: [['id', 'ASC']] });

  if (!company) {
    const row = await Company.create({
      name: 'Virallink',
      shortDescription:
        'A digital marketing studio in Addis Ababa, building campaigns, websites and content for ambitious brands.',
    });
    log('company', row.name);
    return row;
  }

  // Fill only the blanks: a profile someone has started editing is respected.
  const updates = {};

  if (!company.shortDescription) {
    updates.shortDescription =
      'A digital marketing studio in Addis Ababa, building campaigns, websites and content for ambitious brands.';
  }
  if (!company.description) {
    updates.description = [
      'Virallink is a digital marketing and creative studio based in Addis Ababa. We plan and produce the work that makes a brand findable, watchable and worth talking about: search campaigns that compound, social content people actually finish, and websites that turn attention into enquiries.',
      'The studio was built around a simple belief — marketing should be measurable. Every engagement starts with the outcome you need, then works out what it actually takes to get there. No vanity metrics, no retainers that quietly renew without results.',
      'We work with growing Ethiopian businesses and with international teams entering the region, and we keep both kinds of client close to the work: one team, senior people, direct communication.',
    ].join('\n\n');
  }
  if (!company.mission) {
    updates.mission =
      'To give ambitious businesses in Ethiopia the standard of digital marketing usually reserved for global brands — measurable, honest and built in-house.';
  }
  if (!company.vision) {
    updates.vision =
      'A region where the best local brands are also the most visible ones, online and off.';
  }
  if (!company.values) {
    updates.values =
      'Craft over volume. Numbers over noise. Straight talk over jargon. Long-term clients over short-term wins.';
  }
  if (!company.city) {
    updates.city = 'Addis Ababa';
    updates.region = 'Addis Ababa';
    updates.country = 'Ethiopia';
  }
  if (!company.addressLine1) updates.addressLine1 = 'Bole Road, Flamingo Area';
  if (!company.phone) updates.phone = '+251 911 234 567';
  if (!company.email) updates.email = 'hello@virallink.example';
  if (!company.website) updates.website = 'https://virallink.example';
  if (!company.openingHours) {
    updates.openingHours = 'Monday – Friday, 8:30 – 17:30 (EAT)';
  }
  if (!company.metaTitle) {
    updates.metaTitle = 'Virallink — Digital marketing studio in Addis Ababa';
  }
  if (!company.metaDescription) {
    updates.metaDescription =
      'Virallink is a digital marketing studio in Addis Ababa: SEO, paid campaigns, social media, video and web development for brands that want measurable growth.';
  }

  if (Object.keys(updates).length) {
    await company.update(updates);
    log('company profile', 'filled with demo details');
  }

  return company;
}

async function seedSocialLinks(company) {
  const existing = await SocialLink.count({ where: { companyId: company.id } });

  if (existing > 0) return;

  const links = [
    { platform: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/company/virallink', displayOrder: 1 },
    { platform: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/virallink', displayOrder: 2 },
    { platform: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/virallink', displayOrder: 3 },
    { platform: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@virallink', displayOrder: 4 },
    { platform: 'x', label: 'X (Twitter)', url: 'https://x.com/virallink', displayOrder: 5 },
  ];

  for (const link of links) {
    await SocialLink.create({ ...link, companyId: company.id });
  }

  log('social links', `${links.length} profiles`);
}

async function seedStats(company) {
  const existing = await CompanyStat.count({ where: { companyId: company.id } });

  if (existing > 0) return;

  const stats = [
    { label: 'Campaigns delivered', value: '120+', description: 'Across search, social and display', displayOrder: 1 },
    { label: 'Average ROAS', value: '4.2x', description: 'Across managed ad accounts, last 12 months', displayOrder: 2 },
    { label: 'Content pieces per month', value: '60+', description: 'Video, photo and copy, all in-house', displayOrder: 3 },
    { label: 'Client retention', value: '93%', description: 'Clients still with us after year one', displayOrder: 4 },
  ];

  for (const stat of stats) {
    await CompanyStat.create({ ...stat, companyId: company.id, isPublished: true });
  }

  log('company stats', `${stats.length} published figures`);
}

async function seedDepartments() {
  const departments = [
    { name: 'Strategy & Accounts', description: 'Planning, account management and reporting.', displayOrder: 1 },
    { name: 'Creative Studio', description: 'Video, photography, design and motion.', displayOrder: 2 },
    { name: 'Performance Marketing', description: 'Search, paid social and analytics.', displayOrder: 3 },
    { name: 'Web & Development', description: 'Websites, landing pages and technical SEO.', displayOrder: 4 },
  ];

  for (const department of departments) {
    await findOrCreate(Department, { name: department.name }, department, 'department');
  }
}

async function seedEmployees() {
  const departments = {};
  for (const department of await Department.findAll()) departments[department.name] = department.id;

  const existing = await Employee.count();

  const people = [
    {
      name: 'Hanna Bekele',
      position: 'Founder & Strategy Director',
      departmentId: departments['Strategy & Accounts'],
      biography:
        'Hanna started Virallink after a decade running campaigns for telecom and banking brands. She leads strategy on every account and still reviews every media plan personally.',
      isPublic: true,
      displayOrder: 1,
    },
    {
      name: 'Dawit Alemu',
      position: 'Head of Creative',
      departmentId: departments['Creative Studio'],
      biography:
        'Dawit directs the studio’s video and photography work. Formerly a documentary editor, he brings a film-maker’s patience to brand content.',
      isPublic: true,
      displayOrder: 2,
    },
    {
      name: 'Selam Girma',
      position: 'Performance Lead',
      departmentId: departments['Performance Marketing'],
      biography:
        'Selam manages search and paid social across the account base. She is the person who will tell you an ad is not working — and then fix it.',
      isPublic: true,
      displayOrder: 3,
    },
    {
      name: 'Yonas Tesfaye',
      position: 'Web Engineer',
      departmentId: departments['Web & Development'],
      biography:
        'Yonas builds the fast, accessible sites the studio ships. Obsessive about Core Web Vitals so you never have to be.',
      isPublic: true,
      displayOrder: 4,
    },
  ];

  let createdCount = 0;

  for (const person of people) {
    const [row, wasCreated] = await Employee.findOrCreate({
      where: { name: person.name },
      defaults: { ...person, employmentStatus: EMPLOYMENT_STATUS.ACTIVE, joinedAt: isoDate(daysAgo(500)) },
    });

    if (wasCreated) {
      createdCount += 1;
      log('employee', row.name);
    }
  }

  // The one employee the install already has stays hidden unless an admin opted
  // it in — respect that choice rather than publishing over it.
  if (existing === 0 && createdCount === 0) {
    log('employees', 'already present, none added');
  }
}

async function seedClients() {
  const clients = [
    { name: 'Abyssinia Coffee Roasters', industry: 'Food & beverage', status: CLIENT_STATUS.ACTIVE, isPublic: true },
    { name: 'Sahara Logistics', industry: 'Transport', status: CLIENT_STATUS.ACTIVE, isPublic: true },
    { name: 'Blue Nile Fitness', industry: 'Health & wellness', status: CLIENT_STATUS.ACTIVE, isPublic: true },
    { name: 'Rift Valley Tours', industry: 'Tourism', status: CLIENT_STATUS.ACTIVE, isPublic: true },
    { name: 'Addis Properties Group', industry: 'Real estate', status: CLIENT_STATUS.PROSPECT, isPublic: false },
  ];

  const rows = {};

  for (const client of clients) {
    rows[client.name] = await findOrCreate(Client, { name: client.name }, { ...client, source: CLIENT_SOURCE.WEBSITE }, 'client');
  }

  return rows;
}

async function seedServices() {
  const services = [
    {
      title: 'Search Engine Optimisation',
      slug: 'seo',
      summary: 'Technical fixes, content and authority building that compound month after month.',
      description:
        'We start with a technical audit, fix what is broken, then build the content and authority that moves the rankings that matter. You get a monthly report in plain language: what we did, what moved, what is next.',
      icon: 'Search',
      displayOrder: 1,
      faq: [
        { question: 'How long until we see results?', answer: 'Technical wins can land within weeks. Competitive rankings usually take three to six months of consistent work.' },
        { question: 'Do you guarantee first position?', answer: 'No — anyone who guarantees a rank is selling something else. We guarantee the work, and we report honestly on what moved.' },
      ],
    },
    {
      title: 'Paid Advertising',
      slug: 'paid-advertising',
      summary: 'Google and Meta campaigns managed against revenue, not impressions.',
      description:
        'Campaign planning, creative production, launch and optimisation — all in-house. We manage to the numbers that matter to you: cost per enquiry, return on ad spend, and what the business actually banked.',
      icon: 'Target',
      displayOrder: 2,
    },
    {
      title: 'Social Media Management',
      slug: 'social-media',
      summary: 'Always-on content calendars, community management and reporting.',
      description:
        'A monthly calendar planned with you, produced by our studio, published and moderated daily. Monthly reporting shows growth, engagement and — the part most agencies skip — what social actually contributed to sales.',
      icon: 'Share2',
      displayOrder: 3,
    },
    {
      title: 'Video & Content Production',
      slug: 'video-production',
      summary: 'Brand films, product photography and short-form video, shot in-house.',
      description:
        'Scripting, shooting and editing under one roof. From a full brand film to the thirty Reels a month your audience actually watches.',
      icon: 'Clapperboard',
      displayOrder: 4,
    },
    {
      title: 'Brand & Identity',
      slug: 'branding',
      summary: 'Naming, identity systems and guidelines that survive contact with the real world.',
      description:
        'Identity work that holds up on a billboard in Merkato and a 9:16 story frame alike. Delivered as a practical system: marks, type, colour, voice and the templates your team will actually use.',
      icon: 'Palette',
      displayOrder: 5,
    },
    {
      title: 'Web Design & Development',
      slug: 'web-development',
      summary: 'Fast, accessible websites built to convert, not just to look good in a portfolio.',
      description:
        'Design and build in one team. Every site ships measured: fast on 3G, accessible, structured for search, and instrumented so you can see where enquiries come from.',
      icon: 'Globe',
      displayOrder: 6,
    },
  ];

  const rows = {};

  for (const service of services) {
    rows[service.slug] = await findOrCreate(
      Service,
      { slug: service.slug },
      { ...service, isPublished: true, metaTitle: `${service.title} | Virallink` },
      'service',
    );
  }

  // Older installs may hold test rows with placeholder slugs; publish the real
  // ones and leave anything else exactly as an admin left it.
  return rows;
}

async function seedTechnologies() {
  const names = ['Next.js', 'React', 'WordPress', 'Shopify', 'Meta Ads', 'Google Ads', 'HubSpot', 'GA4', 'Klaviyo', 'Webflow'];

  const rows = {};

  for (const name of names) {
    rows[name] = await findOrCreate(Technology, { name }, { name }, 'technology');
  }

  return rows;
}

async function seedProjects(clients, services, technologies) {
  const projects = [
    {
      title: 'Abyssinia Coffee — direct-to-consumer launch',
      slug: 'abyssinia-coffee-dtc-launch',
      client: 'Abyssinia Coffee Roasters',
      service: 'paid-advertising',
      summary:
        'Took a wholesale roaster direct to consumers with a Meta and Google campaign built around single-origin storytelling.',
      description:
        'Abyssinia had wholesale relationships and no direct channel. We built the shop, the campaign structure and the creative system, then scaled the accounts against a target cost per order.',
      challenge:
        'Coffee is a crowded category online, and the brand had no owned audience. The first eight weeks had to prove unit economics before any serious spend.',
      solution:
        'A two-tier campaign: broad prospecting around origin storytelling, retargeting built from recipe and brewing content. Weekly creative refreshes from the studio kept frequency fatigue away.',
      results:
        '4.9x return on ad spend by month three, a 38% cheaper cost per order than target, and an email list of 6,000 that now outsells paid on launch days.',
      technologies: ['Meta Ads', 'Google Ads', 'GA4', 'Klaviyo'],
      status: PROJECT_STATUS.COMPLETED,
      isFeatured: true,
      isPublished: true,
      publishedAt: daysAgo(120),
      startedAt: isoDate(daysAgo(320)),
      completedAt: isoDate(daysAgo(130)),
    },
    {
      title: 'Sahara Logistics — lead generation engine',
      slug: 'sahara-logistics-lead-generation',
      client: 'Sahara Logistics',
      service: 'seo',
      summary:
        'Rebuilt the site and search presence so freight enquiries arrive qualified, with quotes attached.',
      description:
        'Sahara’s old site ranked for nothing and its enquiries came through phone calls of variable quality. We rebuilt the site around the services buyers actually search for and wired in proper lead tracking.',
      challenge:
        'Logistics search is dominated by aggregators. Outranking them needed technical fixes and genuinely useful service content, not keyword pages.',
      solution:
        'A rebuilt site with service and route pages written from real sales calls, structured data throughout, and a case-study programme sourced from existing clients.',
      results:
        'Organic enquiries up 210% in six months, and the sales team now receives quotes with route, volume and timeline attached.',
      technologies: ['Next.js', 'GA4', 'HubSpot'],
      status: PROJECT_STATUS.COMPLETED,
      isFeatured: true,
      isPublished: true,
      publishedAt: daysAgo(80),
      startedAt: isoDate(daysAgo(280)),
      completedAt: isoDate(daysAgo(90)),
    },
    {
      title: 'Blue Nile Fitness — always-on social',
      slug: 'blue-nile-fitness-social',
      client: 'Blue Nile Fitness',
      service: 'social-media',
      summary:
        'A year-round content engine that took a single gym location to a waitlist for its second.',
      description:
        'Thirty short-form videos a month, a daily stories rhythm and a community management rota — built around real members rather than stock footage.',
      challenge:
        'Every fitness brand posts the same thing. The content had to be unmistakably Addis, unmistakably this gym.',
      solution:
        'Member-story formats, trainer-led series, and a challenge campaign the community carried for us. The studio shoots on-site twice a month.',
      results:
        'Follower growth of 340% in a year, a membership waitlist twice over, and the second location funded on the back of it.',
      technologies: ['Meta Ads', 'GA4'],
      status: PROJECT_STATUS.IN_PROGRESS,
      isFeatured: true,
      isPublished: true,
      publishedAt: daysAgo(40),
      startedAt: isoDate(daysAgo(200)),
    },
    {
      title: 'Rift Valley Tours — booking-ready website',
      slug: 'rift-valley-tours-website',
      client: 'Rift Valley Tours',
      service: 'web-development',
      summary:
        'A fast multilingual site that turns trip research into confirmed bookings.',
      description:
        'The old site took nine seconds to load on mobile data and lost most visitors before the first photo. The rebuild tells each itinerary as a story and books while the excitement is still warm.',
      challenge:
        'Tourism buyers browse on phones, on variable networks, often in more than one language. Every kilobyte counts.',
      solution:
        'A statically-generated site with AVIF imagery, itinerary schema for search, and WhatsApp deep links at the exact moments research turns into intent.',
      results:
        'Load time down from 9.1s to 1.4s, booking conversion up 160%, and itinerary pages now rank for the routes that matter.',
      technologies: ['Next.js', 'GA4'],
      status: PROJECT_STATUS.REVIEW,
      isFeatured: true,
      isPublished: true,
      publishedAt: daysAgo(15),
      startedAt: isoDate(daysAgo(150)),
    },
    {
      title: 'Addis Properties — brand identity',
      slug: 'addis-properties-brand-identity',
      client: 'Addis Properties Group',
      service: 'branding',
      summary:
        'An identity system for a property group that needed to feel established before its tower was finished.',
      description:
        'Naming review, a full identity system and the sales-office templates to run it — designed for billboards, brochures and a sales team moving fast.',
      challenge:
        'A pre-construction brand has no building to photograph. The identity had to carry the promise alone.',
      solution:
        'A confident monogram, a skyline-inspired rule motif, and photography direction the client’s own team can shoot to keep the library growing.',
      results:
        'The sales office opened with the identity live across print, signage and social — and pre-sales pacing 30% ahead of the pro-forma.',
      technologies: ['Webflow'],
      status: PROJECT_STATUS.COMPLETED,
      isPublished: true,
      isFeatured: false,
      publishedAt: daysAgo(200),
      startedAt: isoDate(daysAgo(380)),
      completedAt: isoDate(daysAgo(210)),
    },
  ];

  const rows = {};

  for (const project of projects) {
    const { client, service, technologies: techNames, ...data } = project;

    const [row, wasCreated] = await Project.findOrCreate({
      where: { slug: data.slug },
      defaults: {
        ...data,
        clientId: clients[client]?.id || null,
        serviceId: services[service]?.id || null,
        technologies: techNames,
        metaTitle: `${data.title} | Virallink case study`,
      },
    });

    if (wasCreated) {
      log('project', row.title);

      for (const techName of techNames) {
        const technology = technologies[techName];
        if (technology) await row.addTechStack(technology);
      }
    }

    rows[data.slug] = row;
  }

  return rows;
}

async function seedTestimonials(clients) {
  const existing = await Testimonial.count();

  if (existing > 0) return;

  const testimonials = [
    {
      authorName: 'Meron Tadesse',
      authorPosition: 'Managing Director',
      authorCompany: 'Abyssinia Coffee Roasters',
      clientId: clients['Abyssinia Coffee Roasters']?.id || null,
      body:
        'Virallink treated our budget like their own money. Every report told us what worked, what did not, and what they were changing — in that order. Our direct channel now funds its own growth.',
      rating: 5,
      displayOrder: 1,
    },
    {
      authorName: 'Kalkidan Mengistu',
      authorPosition: 'Commercial Manager',
      authorCompany: 'Sahara Logistics',
      clientId: clients['Sahara Logistics']?.id || null,
      body:
        'The enquiries we get now come with volume, route and timeline attached. The sales call starts three steps further in than it used to, and our close rate shows it.',
      rating: 5,
      displayOrder: 2,
    },
    {
      authorName: 'Robel Assefa',
      authorPosition: 'Owner',
      authorCompany: 'Blue Nile Fitness',
      clientId: clients['Blue Nile Fitness']?.id || null,
      body:
        'They shot our members, not models. The content feels like our gym because it is our gym. Second location opens in March — the waitlist paid for it.',
      rating: 5,
      displayOrder: 3,
    },
  ];

  for (const testimonial of testimonials) {
    await Testimonial.create({ ...testimonial, isPublished: true });
  }

  log('testimonials', `${testimonials.length} published quotes`);
}

async function seedBlog() {
  const categories = [
    { name: 'Marketing playbooks', slug: 'playbooks', description: 'Step-by-step guides from campaigns we have actually run.' },
    { name: 'Studio notes', slug: 'studio-notes', description: 'How we work, what we are learning, and what we got wrong.' },
    { name: 'Industry', slug: 'industry', description: 'What is changing in Ethiopian digital — and how to respond.' },
  ];

  const categoryRows = {};

  for (const category of categories) {
    categoryRows[category.slug] = await findOrCreate(BlogCategory, { slug: category.slug }, category, 'blog category');
  }

  const tags = [
    { name: 'SEO', slug: 'seo' },
    { name: 'Paid media', slug: 'paid-media' },
    { name: 'Content', slug: 'content' },
    { name: 'Analytics', slug: 'analytics' },
  ];

  const tagRows = {};

  for (const tag of tags) {
    tagRows[tag.slug] = await findOrCreate(BlogTag, { slug: tag.slug }, tag, 'blog tag');
  }

  const author = await User.findOne({ where: { email: 'admin@virallink.test' } });

  const posts = [
    {
      title: 'The Ethiopian social media landscape in 2026: where attention actually is',
      slug: 'ethiopian-social-media-landscape-2026',
      category: 'industry',
      tagSlugs: ['content', 'analytics'],
      excerpt:
        'Platform usage has shifted hard towards short-form video and messaging apps. Here is what the numbers say — and what we are doing about it for clients.',
      metaDescription:
        'Where Ethiopian audiences actually spend attention in 2026, and how brands should split budget between short-form video, communities and messaging.',
      publishedAt: daysAgo(12),
      content: [
        'Every year someone declares email dead, another platform the future, and organic reach finished. The honest picture in Ethiopia is more interesting than any of those takes.',
        '## Short-form video is the front door\n\nShort-form video is now the first place most people meet a brand. That does not mean it is the last — discovery happens in the feed, but consideration and purchase happen in messaging, on the phone and in person. Treat video as the introduction, then build the paths that carry people from a 30-second clip to a conversation.',
        '## Messaging is the new inbox\n\nThe most under-invested channel we see is messaging. Enquiries that arrive through chat convert at roughly twice the rate of form fills, because the conversation starts while intent is high. Put the chat links where the research happens — after the price, after the gallery, after the reviews — not in the header where nobody clicks them.',
        '## What we recommend\n\nBudget the funnel, not the platform. A useful split for most consumer brands: half of production effort into short-form video, a quarter into the destination (site, catalogue, menu pages), and a quarter into the messaging and email flows that convert it. Then measure by contribution, not by follower count.',
        'The platforms will keep changing. The brands that win are the ones with a repeatable way to make things people want to watch, and a way to answer quickly when the watching turns into asking.',
      ].join('\n\n'),
    },
    {
      title: 'A marketing dashboard you will actually read: five numbers that matter',
      slug: 'marketing-dashboard-five-numbers',
      category: 'playbooks',
      tagSlugs: ['analytics'],
      excerpt:
        'Most dashboards are decoration. These are the five numbers we put in front of every client, and the questions each one answers.',
      metaDescription:
        'The five marketing numbers that matter — cost per enquiry, contribution, payback period and more — and how to build a dashboard around them.',
      publishedAt: daysAgo(30),
      content: [
        'A good dashboard answers questions you actually ask on a Monday morning. Most answer questions nobody asked, which is why nobody reads them.',
        '## 1. Cost per enquiry, by channel\n\nNot clicks, not reach — what did each enquiry cost you? This single number, tracked weekly, changes budget conversations faster than any report.',
        '## 2. Enquiry to sale rate\n\nThe number that tells you whether marketing’s leads are real. If it is falling, the problem is upstream of marketing or downstream of sales — this number is how you find out which.',
        '## 3. Contribution by campaign\n\nRevenue attributed to the campaign, minus the cost of the campaign. Not perfect attribution — honest attribution, with the method written down.',
        '## 4. Payback period\n\nHow many weeks until a customer’s revenue covers their acquisition cost? This is the number that decides whether scaling is safe.',
        '## 5. One quality metric you control\n\nPage speed, email reply rate, content output — one operational number the team can move this month. Dashboards full of outcomes and no inputs are spectator sport.',
        'Everything else — impressions, sessions, engagement rates — is diagnostic. It explains movement in the five; it is not a target in itself.',
      ].join('\n\n'),
    },
    {
      title: 'How we produce 30 videos a month without burning out a team of four',
      slug: 'producing-thirty-videos-a-month',
      category: 'studio-notes',
      tagSlugs: ['content'],
      excerpt:
        'Our shoot-day system: batch, template and edit-for-the-mute. The production math that keeps always-on content sustainable.',
      metaDescription:
        'Inside the shoot-day system a four-person studio uses to produce thirty short-form videos a month — batching, formats and edit rules.',
      publishedAt: daysAgo(55),
      content: [
        'Always-on content fails the same way every time: a team sprints for six weeks, produces nothing for two, and the calendar goes quiet. The fix is production design, not discipline.',
        '## Batch ruthlessly\n\nOne shoot day, five to seven setups, thirty to forty raw clips. Editing happens across the following week in fixed slots. Nothing is shot for a single post — every setup yields at least three.',
        '## Build formats, not posts\n\nA format is a repeatable skeleton: member stories, 60-second FAQs, before-and-afters. Formats turn ideation from a blank page into a checklist. Ours live in a board anyone on the account can pick from.',
        '## Edit for the mute scroller\n\nRoughly three quarters of feed video plays without sound. Captions are not an accessibility extra here; they are the primary track. On-screen text carries the argument, audio carries the charm.',
        '## Keep a visible pipeline\n\nA shared board with four columns: ideas, scripted, shot, published. The team sees the machine working, which is most of what keeps it working.',
        'The result is boring on purpose: a production line you can run at 30 videos a month without a hero week that wrecks the next two.',
      ].join('\n\n'),
    },
  ];

  for (const post of posts) {
    const { category, tagSlugs, ...data } = post;

    const [row, wasCreated] = await BlogPost.findOrCreate({
      where: { slug: data.slug },
      defaults: {
        ...data,
        status: 'published',
        authorId: author?.id || null,
        content: data.content,
        metaTitle: `${data.title} | Virallink`,
      },
    });

    if (wasCreated) {
      log('blog post', row.title);

      if (categoryRows[category]) await row.addCategories(categoryRows[category]);
      for (const slug of tagSlugs) {
        if (tagRows[slug]) await row.addTags(tagRows[slug]);
      }
    }
  }
}

async function seedJobs() {
  const departments = {};
  for (const department of await Department.findAll()) departments[department.name] = department.id;

  const jobs = [
    {
      title: 'Motion Designer',
      slug: 'motion-designer',
      departmentId: departments['Creative Studio'] || null,
      employmentType: 'Full-time',
      location: 'Addis Ababa',
      isRemote: false,
      summary:
        'Cut and animate the short-form library behind our client campaigns — Reels, TikToks, brand films and everything between.',
      description:
        'You will work with the creative team to turn shoot-day footage into finished work: edited for the mute scroller, captioned, and on-brand to the frame. Some days it is a member story for a gym; some days it is a 60-second brand film for a roaster. Both matter.',
      requirements:
        'A portfolio of short-form work you can talk through. Fluent in After Effects or Resolve (we will ask you to cut something live). Amharic and English copy sensibility. Two or more years in an agency or studio helps, but a portfolio beats a CV.',
      applyEmail: 'careers@virallink.example',
      isPublished: true,
      closesAt: isoDate(daysAhead(45)),
      displayOrder: 1,
    },
    {
      title: 'Paid Media Specialist',
      slug: 'paid-media-specialist',
      departmentId: departments['Performance Marketing'] || null,
      employmentType: 'Full-time',
      location: 'Addis Ababa',
      isRemote: true,
      summary:
        'Own the Google and Meta accounts on a third of our client base, with the studio producing your creative.',
      description:
        'You will plan, launch and optimise campaigns against real business numbers — cost per enquiry and return on spend, not impressions. Weekly client reporting in plain language, and a direct line to the strategists on every account.',
      requirements:
        'Two or more years managing five-figure monthly budgets. Comfortable reading analytics without a chaperone. You can explain to a client why an ad is not working and what you are changing — kindly.',
      applyEmail: 'careers@virallink.example',
      isPublished: true,
      closesAt: isoDate(daysAhead(60)),
      displayOrder: 2,
    },
  ];

  for (const job of jobs) {
    await findOrCreate(Job, { slug: job.slug }, job, 'job');
  }
}

async function seedFinance(clients, projects) {
  const categories = {};
  for (const category of await FinancialCategory.findAll()) categories[`${category.type}:${category.name}`] = category.id;

  const existing = await FinancialTransaction.count();

  if (existing < 3) {
    const admin = await User.findOne({ where: { email: 'admin@virallink.test' } });

    const transactions = [
      { type: 'income', categoryName: 'Service revenue', description: 'Retainer — Blue Nile Fitness social management', amount: 85000, clientId: clients['Blue Nile Fitness']?.id, transactionDate: isoDate(daysAgo(20)), paymentMethod: PAYMENT_METHOD.BANK_TRANSFER, reference: 'INV-2026-014' },
      { type: 'income', categoryName: 'Project revenue', description: 'Milestone 2 — Rift Valley Tours website', amount: 240000, clientId: clients['Rift Valley Tours']?.id, transactionDate: isoDate(daysAgo(45)), paymentMethod: PAYMENT_METHOD.BANK_TRANSFER, reference: 'INV-2026-011' },
      { type: 'income', categoryName: 'Service revenue', description: 'Retainer — Sahara Logistics SEO & content', amount: 60000, clientId: clients['Sahara Logistics']?.id, transactionDate: isoDate(daysAgo(75)), paymentMethod: PAYMENT_METHOD.BANK_TRANSFER, reference: 'INV-2026-008' },
      { type: 'expense', categoryName: 'Software & tools', description: 'Adobe Creative Cloud & scheduling tools', amount: 22000, transactionDate: isoDate(daysAgo(30)), paymentMethod: PAYMENT_METHOD.CARD },
      { type: 'expense', categoryName: 'Salaries & contractors', description: 'Freelance editor — Blue Nile shoot batch', amount: 35000, transactionDate: isoDate(daysAgo(35)), paymentMethod: PAYMENT_METHOD.MOBILE_MONEY },
      { type: 'expense', categoryName: 'Rent & utilities', description: 'Studio rent — Bole office', amount: 48000, transactionDate: isoDate(daysAgo(50)), paymentMethod: PAYMENT_METHOD.BANK_TRANSFER },
      { type: 'expense', categoryName: 'Software & tools', description: 'Media hosting & backup storage', amount: 9500, transactionDate: isoDate(daysAgo(90)), paymentMethod: PAYMENT_METHOD.CARD },
    ];

    for (const transaction of transactions) {
      await FinancialTransaction.create({
        type: transaction.type,
        amount: transaction.amount,
        currency: 'ETB',
        categoryId: categories[`${transaction.type}:${transaction.categoryName}`] || null,
        clientId: transaction.clientId || null,
        projectId: null,
        description: transaction.description,
        transactionDate: transaction.transactionDate,
        paymentMethod: transaction.paymentMethod,
        reference: transaction.reference,
        status: 'completed',
        createdById: admin?.id || null,
      });
    }

    log('financial transactions', `${transactions.length} entries across the last quarter`);
  }

  // One issued invoice awaiting payment, one paid — so every invoice state has an example.
  const invoiceCount = await Invoice.count();

  if (invoiceCount === 0) {
    const admin = await User.findOne({ where: { email: 'admin@virallink.test' } });
    const toursClient = clients['Rift Valley Tours'];
    const toursProject = projects['rift-valley-tours-website'];

    const invoice = await Invoice.create({
      clientId: toursClient?.id,
      projectId: toursProject?.id || null,
      invoiceNumber: 'INV-2026-021',
      issueDate: isoDate(daysAgo(10)),
      dueDate: isoDate(daysAhead(20)),
      currency: 'ETB',
      taxRate: 15,
      subtotal: 300000,
      taxAmount: 45000,
      total: 345000,
      paidAmount: 0,
      status: INVOICE_STATUS.ISSUED,
      createdById: admin?.id || null,
      notes: 'Website rebuild — final milestone on delivery.',
    });

    await InvoiceItem.create({
      invoiceId: invoice.id,
      description: 'Website rebuild — design, build and launch',
      quantity: 1,
      unitPrice: 300000,
      lineTotal: 300000,
      position: 1,
    });

    log('invoice', `${invoice.invoiceNumber} (issued)`);

    const paid = await Invoice.create({
      clientId: clients['Abyssinia Coffee Roasters']?.id,
      invoiceNumber: 'INV-2026-019',
      issueDate: isoDate(daysAgo(40)),
      dueDate: isoDate(daysAgo(10)),
      currency: 'ETB',
      taxRate: 15,
      subtotal: 180000,
      taxAmount: 27000,
      total: 207000,
      paidAmount: 207000,
      status: INVOICE_STATUS.PAID,
      createdById: admin?.id || null,
      notes: 'Q3 campaign production.',
    });

    await InvoiceItem.create({
      invoiceId: paid.id,
      description: 'Campaign production — video and photography batch',
      quantity: 1,
      unitPrice: 180000,
      lineTotal: 180000,
      position: 1,
    });

    await Payment.create({
      invoiceId: paid.id,
      amount: 207000,
      currency: 'ETB',
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
      reference: 'TT-88231',
      paidAt: isoDate(daysAgo(12)),
      createdById: admin?.id || null,
    });

    log('invoice', `${paid.invoiceNumber} (paid, with one payment)`);
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('\nVirallink — demo content seeder\n');

  await sequelize.authenticate();

  const company = await seedCompany();
  await seedSocialLinks(company);
  await seedStats(company);
  await seedDepartments();

  const clients = await seedClients();
  const services = await seedServices();
  const technologies = await seedTechnologies();

  await seedEmployees();
  const projects = await seedProjects(clients, services, technologies);
  await seedTestimonials(clients);
  await seedBlog();
  await seedJobs();
  await seedFinance(clients, projects);

  await sequelize.close();

  if (created.length === 0) {
    console.log('Nothing to add — the demo content is already in place.\n');
    return;
  }

  console.log(`\nAdded ${created.length} items:\n`);
  for (const item of created) console.log(`  + ${item}`);
  console.log('\nOpen http://localhost:3000 to see the site, or /admin-teftef/login to manage it.\n');
}

main().catch((error) => {
  console.error(`\nSeeding failed: ${error.message}\n`);
  console.error(error);
  process.exit(1);
});
