/**
 * Public API serialisers.
 *
 * This file is the single most important boundary in the project.
 *
 * Private data (shareholder records, employee contact details, client contact
 * lists, financial figures, audit history) must never appear in a response the
 * website can read. Rather than trusting every developer to remember which
 * columns are safe, every public entity has an explicit allowlist here and a
 * `toPublic*` function that builds the response from those fields only.
 *
 * If a field is not named in this file, it cannot reach the public site. Adding a
 * column to a model therefore cannot accidentally make it public — a developer
 * would have to add it here, visibly, on purpose.
 *
 * A second layer: the public read endpoints live under their own `/public/*`
 * routers and use dedicated queries, so an admin query with a broader include
 * cannot be reused by accident.
 */

/**
 * Strip Sequelize internals and any key not in the allowlist.
 *
 * Named `pick` rather than `project` because the serialiser functions below take
 * a `project` parameter (a portfolio case study), which would shadow a function
 * of that name.
 */
function pick(source, allowedFields) {
  if (!source) return null;

  const plain = typeof source.get === 'function' ? source.get({ plain: true }) : source;
  const result = {};

  for (const field of allowedFields) {
    if (plain[field] !== undefined) {
      result[field] = plain[field];
    }
  }
  return result;
}

/** ISO date strings, so the API contract does not depend on server timezone. */
function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Company                                                                    */
/* -------------------------------------------------------------------------- */

const COMPANY_FIELDS = [
  'name',
  'legalName',
  'shortDescription',
  'description',
  'mission',
  'vision',
  'values',
  'foundedDate',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'country',
  'postalCode',
  'latitude',
  'longitude',
  'phone',
  'secondaryPhone',
  'email',
  'website',
  'openingHours',
  'metaTitle',
  'metaDescription',
];

/**
 * registrationNumber and taxIdentifier are intentionally excluded. They are
 * business-sensitive, and nothing on a public marketing site needs them.
 */
export function toPublicCompany(company, { socialLinks = [], logo = null, stats = [], testimonials = [] } = {}) {
  if (!company) return null;

  const base = pick(company, COMPANY_FIELDS);

  return {
    ...base,
    foundedDate: base.foundedDate || null,
    latitude: base.latitude === null ? null : Number(base.latitude),
    longitude: base.longitude === null ? null : Number(base.longitude),
    logo: logo ? toPublicMedia(logo) : null,
    socialLinks: socialLinks.map((link) =>
      pick(link, ['platform', 'label', 'url', 'displayOrder']),
    ),
    stats: stats.map((stat) => pick(stat, ['label', 'value', 'description', 'icon', 'displayOrder'])),
    testimonials: testimonials.map((testimonial) => toPublicTestimonial(testimonial)),
  };
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

const SERVICE_FIELDS = [
  'title',
  'slug',
  'summary',
  'description',
  'icon',
  'displayOrder',
  'metaTitle',
  'metaDescription',
];

export function toPublicService(service, { image = null } = {}) {
  if (!service) return null;

  const base = pick(service, SERVICE_FIELDS);

  return {
    ...base,
    // faq is published deliberately by an admin, so it is part of the contract.
    faq: Array.isArray(service.faq) ? service.faq : [],
    image: image ? toPublicMedia(image) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Projects / portfolio                                                       */
/* -------------------------------------------------------------------------- */

const PROJECT_CARD_FIELDS = [
  'title',
  'slug',
  'summary',
  'technologies',
  'isFeatured',
  'publishedAt',
  'completedAt',
];

const PROJECT_FIELDS = [
  ...PROJECT_CARD_FIELDS,
  'description',
  'challenge',
  'solution',
  'results',
  'projectUrl',
  'startedAt',
  'completedAt',
];

export function toPublicProjectCard(project, { client = null, service = null, cover = null } = {}) {
  if (!project) return null;

  return {
    ...pick(project, PROJECT_CARD_FIELDS),
    publishedAt: iso(project.publishedAt),
    completedAt: project.completedAt || null,
    // Only the client's display name and logo are exposed, never their contact
    // details, contract value, or notes.
    client: client
      ? { name: client.name, logo: client.logo ? toPublicMedia(client.logo) : null }
      : null,
    service: service ? { title: service.title, slug: service.slug } : null,
    cover: cover ? toPublicMedia(cover) : null,
  };
}

export function toPublicProject(
  project,
  { client = null, service = null, cover = null, images = [], techStack = [] } = {},
) {
  if (!project) return null;

  return {
    ...toPublicProjectCard(project, { client, service, cover }),
    description: project.description,
    challenge: project.challenge,
    solution: project.solution,
    results: project.results,
    projectUrl: project.projectUrl || null,
    startedAt: project.startedAt || null,
    images: images
      .map((image) => ({ caption: image.caption, displayOrder: image.displayOrder, media: toPublicMedia(image.media) }))
      .filter((image) => image.media)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    techStack: techStack.map((tech) => tech.name),
  };
}

/* -------------------------------------------------------------------------- */
/* Employees — the privacy boundary that matters most                         */
/* -------------------------------------------------------------------------- */

/**
 * Name, role, department, biography, photo, and LinkedIn. Nothing else.
 *
 * Explicitly excluded: email, phone, employmentStatus, joinedAt. Those are
 * internal HR data. Publishing them would expose staff contact details and
 * reveal who has left the company.
 */
const EMPLOYEE_PUBLIC_FIELDS = ['name', 'position', 'biography', 'linkedinUrl', 'displayOrder'];

export function toPublicEmployee(employee, { department = null, photo = null } = {}) {
  if (!employee) return null;

  return {
    ...pick(employee, EMPLOYEE_PUBLIC_FIELDS),
    department: department ? { name: department.name } : null,
    photo: photo ? toPublicMedia(photo) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Clients — opt-in only                                                      */
/* -------------------------------------------------------------------------- */

const CLIENT_PUBLIC_FIELDS = ['name', 'industry', 'website'];

export function toPublicClient(client, { logo = null } = {}) {
  if (!client) return null;

  return {
    ...pick(client, CLIENT_PUBLIC_FIELDS),
    logo: logo ? toPublicMedia(logo) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Testimonials                                                               */
/* -------------------------------------------------------------------------- */

const TESTIMONIAL_FIELDS = ['authorName', 'authorPosition', 'authorCompany', 'body', 'rating'];

export function toPublicTestimonial(testimonial, { authorPhoto = null } = {}) {
  if (!testimonial) return null;

  return {
    ...pick(testimonial, TESTIMONIAL_FIELDS),
    authorPhoto: authorPhoto ? toPublicMedia(authorPhoto) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Blog                                                                       */
/* -------------------------------------------------------------------------- */

const POST_CARD_FIELDS = ['title', 'slug', 'excerpt', 'publishedAt'];

export function toPublicPostCard(post, { featuredImage = null } = {}) {
  if (!post) return null;

  return {
    ...pick(post, POST_CARD_FIELDS),
    publishedAt: iso(post.publishedAt),
    featuredImage: featuredImage ? toPublicMedia(featuredImage) : null,
  };
}

/**
 * The full article. `content` is admin-authored HTML.
 *
 * The web app sanitises it before rendering; it is sanitised here too so a
 * stored-XSS payload cannot reach any other future consumer of this endpoint.
 */
export function toPublicPost(post, { featuredImage = null, author = null, categories = [], tags = [] } = {}) {
  if (!post) return null;

  return {
    ...toPublicPostCard(post, { featuredImage }),
    content: post.content,
    metaTitle: post.metaTitle || null,
    metaDescription: post.metaDescription || null,
    // Only the author's display name, never their email or role.
    author: author ? { name: author.name } : null,
    categories: categories.map((category) => pick(category, ['name', 'slug'])),
    tags: tags.map((tag) => pick(tag, ['name', 'slug'])),
  };
}

/* -------------------------------------------------------------------------- */
/* Careers                                                                    */
/* -------------------------------------------------------------------------- */

const JOB_FIELDS = [
  'title',
  'slug',
  'employmentType',
  'location',
  'isRemote',
  'summary',
  'description',
  'requirements',
  'applyEmail',
  'applyUrl',
  'closesAt',
];

export function toPublicJob(job, { department = null } = {}) {
  if (!job) return null;

  return {
    ...pick(job, JOB_FIELDS),
    department: department ? { name: department.name } : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Media metadata for rendering. Includes width and height so the layout can
 * reserve space before the image loads, which is what keeps CLS near zero.
 */
const MEDIA_FIELDS = ['url', 'kind', 'mimeType', 'width', 'height', 'altText', 'title', 'caption'];

export function toPublicMedia(media) {
  if (!media) return null;

  const base = pick(media, MEDIA_FIELDS);
  return base ? { ...base, blurDataUrl: media.blurDataUrl || null } : null;
}

export { pick, iso };