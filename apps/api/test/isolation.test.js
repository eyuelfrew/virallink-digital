/**
 * Public data-isolation tests.
 *
 * The security claim this project makes is that private data cannot reach the
 * public website. That claim rests on one file — src/serializers/public.js —
 * which uses explicit field allowlists. These tests assert the allowlists by
 * checking the serialisers directly with fields set that must never be emitted.
 *
 * They are fast, need no database, and fail loudly if someone adds a column to a
 * model and reaches for a broad serialiser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toPublicCompany,
  toPublicEmployee,
  toPublicClient,
  toPublicService,
  toPublicProjectCard,
  toPublicProject,
  toPublicPost,
  toPublicTestimonial,
  toPublicJob,
  toPublicMedia,
} from '../src/serializers/public.js';

/** A record carrying every private field the models define. */
function fullEmployee(overrides = {}) {
  return {
    name: 'Public Name',
    position: 'Engineer',
    biography: 'Bio text',
    linkedinUrl: 'https://linkedin.com/in/x',
    displayOrder: 1,
    email: 'secret@internal.test',
    phone: '+251-000-000',
    employmentStatus: 'active',
    joinedAt: '2024-01-01',
    departmentId: 3,
    photoMediaId: 9,
    id: 5,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function fullClient(overrides = {}) {
  return {
    name: 'Client Ltd',
    industry: 'Retail',
    website: 'https://client.test',
    email: 'private@client.test',
    phone: '+251-111',
    contactPerson: 'Jane Doe',
    addressLine1: 'Secret address',
    notes: 'Internal notes',
    contractValue: '150000.00',
    status: 'active',
    source: 'referral',
    logoMediaId: 4,
    id: 7,
    ...overrides,
  };
}

function fullCompany(overrides = {}) {
  return {
    name: 'Virallink',
    legalName: 'Virallink PLC',
    shortDescription: 'Short',
    description: 'Long',
    mission: 'Mission',
    vision: 'Vision',
    values: 'Values',
    foundedDate: '2020-01-01',
    addressLine1: 'Address',
    city: 'Addis Ababa',
    country: 'Ethiopia',
    phone: '+251',
    email: 'hello@virallink.test',
    website: 'https://virallink.test',
    // Must never be published: business-sensitive registration data.
    registrationNumber: 'REG-12345',
    taxIdentifier: 'TAX-98765',
    logoMediaId: 1,
    faviconMediaId: 2,
    id: 1,
    ...overrides,
  };
}

function fullProject(overrides = {}) {
  return {
    title: 'Case Study',
    slug: 'case-study',
    summary: 'Summary',
    technologies: ['Next.js'],
    isFeatured: true,
    publishedAt: new Date('2024-06-01'),
    completedAt: '2024-05-01',
    description: 'Description',
    challenge: 'Challenge',
    solution: 'Solution',
    results: 'Results',
    projectUrl: 'https://example.test',
    status: 'completed',
    clientId: 7,
    serviceId: 2,
    id: 11,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Employees                                                                  */
/* -------------------------------------------------------------------------- */

test('public employee omits email, phone and employment details', () => {
  const result = toPublicEmployee(fullEmployee());
  const serialised = JSON.stringify(result);

  assert.equal(result.name, 'Public Name');
  assert.equal(result.position, 'Engineer');

  assert.equal('email' in result, false);
  assert.equal('phone' in result, false);
  assert.equal('employmentStatus' in result, false);
  assert.equal('joinedAt' in result, false);
  assert.equal('departmentId' in result, false);
  assert.equal('photoMediaId' in result, false);

  assert.equal(serialised.includes('secret@internal.test'), false);
  assert.equal(serialised.includes('000-000'), false);
});

test('public employee includes only the department name', () => {
  const result = toPublicEmployee(fullEmployee(), {
    department: { id: 3, name: 'Engineering', description: 'Internal description' },
  });

  assert.deepEqual(result.department, { name: 'Engineering' });
});

test('public employee handles a missing department and photo', () => {
  const result = toPublicEmployee(fullEmployee());
  assert.equal(result.department, null);
  assert.equal(result.photo, null);
});

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

test('public client omits contact details, notes and contract value', () => {
  const result = toPublicClient(fullClient());
  const serialised = JSON.stringify(result);

  assert.equal(result.name, 'Client Ltd');
  assert.equal(result.industry, 'Retail');

  assert.equal('email' in result, false);
  assert.equal('phone' in result, false);
  assert.equal('contactPerson' in result, false);
  assert.equal('addressLine1' in result, false);
  assert.equal('notes' in result, false);
  assert.equal('contractValue' in result, false);

  assert.equal(serialised.includes('private@client.test'), false);
  assert.equal(serialised.includes('150000'), false);
  assert.equal(serialised.includes('Secret address'), false);
});

/* -------------------------------------------------------------------------- */
/* Company                                                                    */
/* -------------------------------------------------------------------------- */

test('public company omits registration and tax identifiers', () => {
  const result = toPublicCompany(fullCompany());
  const serialised = JSON.stringify(result);

  assert.equal(result.name, 'Virallink');
  assert.equal(result.city, 'Addis Ababa');

  assert.equal('registrationNumber' in result, false);
  assert.equal('taxIdentifier' in result, false);
  assert.equal(serialised.includes('REG-12345'), false);
  assert.equal(serialised.includes('TAX-98765'), false);
});

test('public company converts coordinates to numbers', () => {
  const result = toPublicCompany(fullCompany({ latitude: '9.0192000', longitude: '38.7525000' }));
  assert.equal(typeof result.latitude, 'number');
  assert.equal(typeof result.longitude, 'number');
  assert.equal(result.latitude, 9.0192);
});

test('public company returns null for a missing record', () => {
  assert.equal(toPublicCompany(null), null);
});

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

test('public project card omits internal status fields', () => {
  const result = toPublicProjectCard(fullProject());
  const serialised = JSON.stringify(result);

  assert.equal(result.title, 'Case Study');
  assert.equal(result.slug, 'case-study');
  assert.equal(result.publishedAt, '2024-06-01T00:00:00.000Z');

  assert.equal('status' in result, false);
  assert.equal('clientId' in result, false);
  assert.equal('serviceId' in result, false);
  assert.equal('isPublished' in result, false);
});

test('public project exposes only a client name and logo', () => {
  const result = toPublicProjectCard(fullProject(), {
    client: { ...fullClient() },
    service: null,
    cover: null,
  });

  assert.deepEqual(Object.keys(result.client).sort(), ['logo', 'name']);
  assert.equal(JSON.stringify(result).includes('private@client.test'), false);
  assert.equal(JSON.stringify(result).includes('150000'), false);
});

test('public project includes challenge, solution and results', () => {
  const result = toPublicProject(fullProject(), {
    images: [{ caption: 'Shot', displayOrder: 0, media: { url: '/media/a.webp', width: 10, height: 10 } }],
    techStack: [{ name: 'Next.js' }],
  });

  assert.equal(result.challenge, 'Challenge');
  assert.equal(result.solution, 'Solution');
  assert.equal(result.results, 'Results');
  assert.deepEqual(result.techStack, ['Next.js']);
  assert.equal(result.images.length, 1);
});

test('public project sorts images by display order', () => {
  const result = toPublicProject(fullProject(), {
    images: [
      { caption: 'b', displayOrder: 2, media: { url: '/b.webp' } },
      { caption: 'a', displayOrder: 1, media: { url: '/a.webp' } },
    ],
    techStack: [],
  });

  assert.deepEqual(result.images.map((image) => image.caption), ['a', 'b']);
});

test('public project drops images with no media', () => {
  const result = toPublicProject(fullProject(), {
    images: [{ caption: 'broken', displayOrder: 0, media: null }],
    techStack: [],
  });
  assert.equal(result.images.length, 0);
});

/* -------------------------------------------------------------------------- */
/* Services, blog, misc                                                       */
/* -------------------------------------------------------------------------- */

test('public service exposes the FAQ an admin added', () => {
  const result = toPublicService({
    title: 'SEO',
    slug: 'seo',
    summary: 'Search optimisation',
    description: 'Details',
    faq: [{ question: 'How long?', answer: 'Depends.' }],
    isPublished: true,
  });

  assert.equal(result.faq.length, 1);
  assert.equal(result.faq[0].question, 'How long?');
  // The publish flag itself is internal state.
  assert.equal('isPublished' in result, false);
});

test('public service defaults a missing FAQ to an empty array', () => {
  const result = toPublicService({ title: 'SEO', slug: 'seo', faq: null });
  assert.deepEqual(result.faq, []);
});

test('public post exposes only the author name', () => {
  const result = toPublicPost(
    {
      title: 'Post',
      slug: 'post',
      excerpt: 'Excerpt',
      content: '<p>Body</p>',
      publishedAt: new Date('2024-01-01'),
      metaTitle: 'Meta',
      metaDescription: 'Description',
    },
    { author: { id: 2, name: 'Writer', email: 'writer@internal.test' }, categories: [], tags: [] },
  );

  assert.deepEqual(result.author, { name: 'Writer' });
  assert.equal(JSON.stringify(result).includes('writer@internal.test'), false);
  assert.equal(result.content, '<p>Body</p>');
});

test('public testimonial omits the client record and rating stays optional', () => {
  const result = toPublicTestimonial({
    authorName: 'Client',
    authorCompany: 'Ltd',
    body: 'Great work',
    rating: 5,
    clientId: 7,
    isPublished: true,
  });

  assert.equal(result.rating, 5);
  assert.equal('clientId' in result, false);
  assert.equal('isPublished' in result, false);
});

test('public job exposes application details but not internal flags', () => {
  const result = toPublicJob({
    title: 'Developer',
    slug: 'developer',
    employmentType: 'Full time',
    isRemote: true,
    description: 'Do the work',
    isPublished: true,
    closesAt: null,
  });

  assert.equal(result.isRemote, true);
  assert.equal('isPublished' in result, false);
});

test('public media exposes dimensions for layout stability', () => {
  const result = toPublicMedia({
    url: '/media/2026/01/a.webp',
    kind: 'image',
    mimeType: 'image/webp',
    width: 1200,
    height: 630,
    sizeBytes: 4096,
    altText: 'Alt',
    key: '2026/01/a.webp',
    uploadedById: 1,
    blurDataUrl: 'data:image/webp;base64,AAA',
  });

  assert.equal(result.width, 1200);
  assert.equal(result.altText, 'Alt');
  assert.equal(result.blurDataUrl, 'data:image/webp;base64,AAA');
  // The storage key and uploader are internal.
  assert.equal('key' in result, false);
  assert.equal('uploadedById' in result, false);
  assert.equal('sizeBytes' in result, false);
});

test('serialisers accept a Sequelize instance as well as a plain object', () => {
  // findAll returns model instances; `get({ plain: true })` is used internally.
  const instance = {
    get: () => fullEmployee(),
  };
  const result = toPublicEmployee(instance);
  assert.equal(result.name, 'Public Name');
  assert.equal('email' in result, false);
});