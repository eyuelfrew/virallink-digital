import { Op } from 'sequelize';
import { models } from '../models/index.js';
import { cached, cacheKey, invalidate } from '../utils/cache.js';
import { buildMeta, toLimitOffset } from '../utils/query.js';
import {
  toPublicCompany,
  toPublicEmployee,
  toPublicJob,
  toPublicMedia,
  toPublicPost,
  toPublicPostCard,
  toPublicProject,
  toPublicProjectCard,
  toPublicService,
  toPublicTestimonial,
  toPublicClient,
} from '../serializers/public.js';

/**
 * Public read service.
 *
 * Everything the website renders comes from here. Two properties matter:
 *
 *  1. Every query filters on isPublished (or isPublic) so unpublished admin
 *     content can never be read publicly.
 *  2. Every result passes through a serialiser with an explicit field allowlist.
 *
 * Results are cached briefly to keep the public site fast on shared hosting,
 * where each request may otherwise cost two database round trips. Any admin
 * write calls invalidate() so a change appears on the next render rather than
 * waiting out a TTL.
 */

const {
  Company,
  SocialLink,
  Service,
  Project,
  ProjectImage,
  Technology,
  ProjectTechnologyThrough,
  Employee,
  Department,
  Client,
  Testimonial,
  Media,
  Job,
  BlogPost,
  BlogCategory,
  BlogTag,
  CompanyStat,
  User,
} = models;

/** Cache lifetimes. Long enough to help, short enough to feel fresh. */
const TTL = {
  list: 120,
  detail: 300,
  company: 600,
};

/* -------------------------------------------------------------------------- */
/* Company                                                                    */
/* -------------------------------------------------------------------------- */

export async function getCompanyProfile() {
  return cached(cacheKey('public', 'company'), TTL.company, async () => {
    // companies is a singleton, so the row is found on its own and its related
    // collections are queried separately. Eager-loading them would require a
    // self-referencing association that has no meaning here.
    const company = await Company.findOne({
      include: [
        { model: Media, as: 'logo' },
        { model: Media, as: 'favicon' },
      ],
      order: [['id', 'ASC']],
    });

    if (!company) return null;

    const [socialLinks, stats, testimonials] = await Promise.all([
      SocialLink.findAll({
        where: { companyId: company.id },
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      }),
      CompanyStat.findAll({
        where: { companyId: company.id, isPublished: true },
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      }),
      Testimonial.findAll({
        where: { isPublished: true },
        include: [
          { model: Media, as: 'authorPhoto' },
          { model: Client, as: 'client', attributes: ['id', 'name'] },
        ],
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      }),
    ]);

    return {
      company: toPublicCompany(company, {
        socialLinks,
        logo: company.logo,
        stats,
        testimonials: testimonials.map((t) => toPublicTestimonial(t, { authorPhoto: t.authorPhoto })),
      }),
      favicon: toPublicMedia(company.favicon),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export async function listServices({ includeUnpublished = false } = {}) {
  return cached(cacheKey('public', 'services', includeUnpublished), TTL.list, async () => {
    const services = await Service.findAll({
      where: includeUnpublished ? {} : { isPublished: true },
      include: [{ model: Media, as: 'image' }],
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    });

    return services.map((service) => toPublicService(service, { image: service.image }));
  });
}

export async function getServiceBySlug(slug) {
  return cached(cacheKey('public', 'service', slug), TTL.detail, async () => {
    const service = await Service.findOne({
      where: { slug, isPublished: true },
      include: [{ model: Media, as: 'image' }],
    });

    if (!service) return null;

    // Real, published projects for this service — the internal linking that
    // gives the service page depth and keeps the sitemap coherent.
    const projects = await Project.findAll({
      where: { serviceId: service.id, isPublished: true },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name'], include: [{ model: Media, as: 'logo' }] },
        { model: Media, as: 'cover' },
      ],
      order: [['isFeatured', 'DESC'], ['displayOrder', 'ASC']],
      limit: 6,
    });

    return {
      service: toPublicService(service, { image: service.image }),
      projects: projects.map((project) =>
        toPublicProjectCard(project, { client: project.client, service: null, cover: project.cover }),
      ),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Portfolio                                                                  */
/* -------------------------------------------------------------------------- */

export async function listProjects({ page = 1, pageSize = 12, serviceSlug = null, featured = false } = {}) {
  return cached(cacheKey('public', 'projects', page, pageSize, serviceSlug, featured), TTL.list, async () => {
    const where = { isPublished: true };
    if (featured) where.isFeatured = true;

    // Filtering by service slug requires a join, which is done here rather than
    // in the caller so the where clause stays in one place.
    const includeService = serviceSlug
      ? [{ model: Service, as: 'service', where: { slug: serviceSlug, isPublished: true }, required: true }]
      : [{ model: Service, as: 'service' }];

    const { rows, count } = await Project.findAndCountAll({
      where,
      include: [
        // Only the client's display fields are selected; contact details, notes
        // and contract value are never loaded for a public page.
        { model: Client, as: 'client', attributes: ['id', 'name'], include: [{ model: Media, as: 'logo' }] },
        ...includeService,
        { model: Media, as: 'cover' },
      ],
      order: [['isFeatured', 'DESC'], ['displayOrder', 'ASC'], ['publishedAt', 'DESC']],
      ...toLimitOffset({ page, pageSize }),
      distinct: true,
    });

    return {
      projects: rows.map((project) =>
        toPublicProjectCard(project, { client: project.client, service: project.service, cover: project.cover }),
      ),
      meta: buildMeta({ page, pageSize, total: count }),
    };
  });
}

export async function getProjectBySlug(slug) {
  return cached(cacheKey('public', 'project', slug), TTL.detail, async () => {
    const project = await Project.findOne({
      where: { slug, isPublished: true },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name'], include: [{ model: Media, as: 'logo' }] },
        { model: Service, as: 'service', attributes: ['id', 'title', 'slug'] },
        { model: Media, as: 'cover' },
      ],
    });

    if (!project) return null;

    // Images and the tech stack need their own queries: including both through
    // the project would produce a cartesian product between the two join tables.
    const [images, techRows] = await Promise.all([
      ProjectImage.findAll({
        where: { projectId: project.id },
        include: [{ model: Media, as: 'media' }],
        order: [['displayOrder', 'ASC']],
      }),
      // ProjectTechnologyThrough is the explicit join model registered in
      // models/index.js; referencing the singular alias would not resolve.
      ProjectTechnologyThrough.findAll({
        where: { projectId: project.id },
        include: [{ model: Technology, as: 'technology' }],
      }),
    ]);

    return {
      project: toPublicProject(project, {
        client: project.client,
        service: project.service,
        cover: project.cover,
        images,
        techStack: techRows.map((row) => row.technology).filter(Boolean),
      }),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Team                                                                       */
/* -------------------------------------------------------------------------- */

export async function listTeam() {
  return cached(cacheKey('public', 'team'), TTL.list, async () => {
    const employees = await Employee.findAll({
      where: { isPublic: true, employmentStatus: 'active' },
      include: [
        { model: Department, as: 'department', attributes: ['id', 'name'] },
        { model: Media, as: 'photo' },
      ],
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    });

    return employees.map((employee) =>
      toPublicEmployee(employee, { department: employee.department, photo: employee.photo }),
    );
  });
}

export async function listDepartments() {
  return cached(cacheKey('public', 'departments'), TTL.list, () =>
    Department.findAll({
      attributes: ['id', 'name'],
      order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    }).then((rows) => rows.map((row) => ({ id: row.id, name: row.name }))),
  );
}

/* -------------------------------------------------------------------------- */
/* Clients (opt-in)                                                           */
/* -------------------------------------------------------------------------- */

export async function listPublicClients() {
  return cached(cacheKey('public', 'clients'), TTL.list, async () => {
    const clients = await Client.findAll({
      where: { isPublic: true },
      attributes: ['id', 'name', 'industry', 'website'],
      include: [{ model: Media, as: 'logo' }],
      order: [['name', 'ASC']],
    });

    return clients.map((client) => toPublicClient(client, { logo: client.logo }));
  });
}

export async function listTestimonials({ limit = 6 } = {}) {
  return cached(cacheKey('public', 'testimonials', limit), TTL.list, async () => {
    const testimonials = await Testimonial.findAll({
      where: { isPublished: true },
      include: [{ model: Media, as: 'authorPhoto' }],
      order: [['displayOrder', 'ASC']],
      limit,
    });

    return testimonials.map((t) => toPublicTestimonial(t, { authorPhoto: t.authorPhoto }));
  });
}

/* -------------------------------------------------------------------------- */
/* Careers                                                                    */
/* -------------------------------------------------------------------------- */

export async function listJobs({ includeClosed = false } = {}) {
  return cached(cacheKey('public', 'jobs', includeClosed), TTL.list, async () => {
    const where = { isPublished: true };
    // A role past its closing date disappears from the list without an admin
    // having to unpublish it.
    if (!includeClosed) {
      where[Op.and] = [
        { [Op.or]: [{ closesAt: null }, { closesAt: { [Op.gte]: new Date() } }] },
      ];
    }

    const jobs = await Job.findAll({
      where,
      include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
      order: [['displayOrder', 'ASC'], ['id', 'DESC']],
    });

    return jobs.map((job) => toPublicJob(job, { department: job.department }));
  });
}

export async function getJobBySlug(slug) {
  return cached(cacheKey('public', 'job', slug), TTL.detail, async () => {
    const job = await Job.findOne({
      where: { slug, isPublished: true },
      include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
    });

    return job ? { job: toPublicJob(job, { department: job.department }) } : null;
  });
}

/* -------------------------------------------------------------------------- */
/* Blog                                                                       */
/* -------------------------------------------------------------------------- */

const POST_INCLUDE = [
  { model: Media, as: 'featuredImage' },
  { model: User, as: 'author', attributes: ['id', 'name'] },
  { model: BlogCategory, as: 'categories', attributes: ['id', 'name', 'slug'], through: { attributes: [] } },
  { model: BlogTag, as: 'tags', attributes: ['id', 'name', 'slug'], through: { attributes: [] } },
];

export async function listPosts({ page = 1, pageSize = 10, categorySlug = null, tagSlug = null, excludeId = null } = {}) {
  const where = { status: 'published', publishedAt: { [Op.lte]: new Date() } };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const extraIncludes = [];
  if (categorySlug) {
    extraIncludes.push({
      model: BlogCategory,
      as: 'categories',
      attributes: [],
      where: { slug: categorySlug },
      through: { attributes: [] },
      required: true,
    });
  }
  if (tagSlug) {
    extraIncludes.push({
      model: BlogTag,
      as: 'tags',
      attributes: [],
      where: { slug: tagSlug },
      through: { attributes: [] },
      required: true,
    });
  }

  const { rows, count } = await BlogPost.findAndCountAll({
    where,
    include: [...POST_INCLUDE, ...extraIncludes],
    order: [['publishedAt', 'DESC']],
    ...toLimitOffset({ page, pageSize }),
    distinct: true,
    // Without this, the category/tag joins inflate `count` into a join total.
    subQuery: false,
  });

  return {
    posts: rows.map((post) => toPublicPostCard(post, { featuredImage: post.featuredImage })),
    meta: buildMeta({ page, pageSize, total: count }),
  };
}

export async function getPostBySlug(slug) {
  return cached(cacheKey('public', 'post', slug), TTL.detail, async () => {
    const post = await BlogPost.findOne({
      where: { slug, status: 'published', publishedAt: { [Op.lte]: new Date() } },
      include: POST_INCLUDE,
    });

    if (!post) return null;

    return {
      post: toPublicPost(post, {
        featuredImage: post.featuredImage,
        author: post.author,
        categories: post.categories,
        tags: post.tags,
      }),
    };
  });
}

/** Taxonomy lists for the blog sidebar and sitemap. */
export async function listBlogTaxonomy() {
  return cached(cacheKey('public', 'blog-taxonomy'), TTL.list, async () => {
    const [categories, tags] = await Promise.all([
      BlogCategory.findAll({ attributes: ['id', 'name', 'slug'], order: [['name', 'ASC']] }),
      BlogTag.findAll({ attributes: ['id', 'name', 'slug'], order: [['name', 'ASC']], limit: 50 }),
    ]);

    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
      tags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
    };
  });
}

/** Slugs for sitemap generation. Only published content. */
export async function listSitemapEntries() {
  const [services, projects, posts, jobs] = await Promise.all([
    Service.findAll({ where: { isPublished: true }, attributes: ['slug', 'updatedAt'] }),
    Project.findAll({
      where: { isPublished: true },
      attributes: ['slug', 'updatedAt', 'publishedAt'],
      order: [['publishedAt', 'DESC']],
    }),
    BlogPost.findAll({
      where: { status: 'published', publishedAt: { [Op.lte]: new Date() } },
      attributes: ['slug', 'updatedAt', 'publishedAt'],
      order: [['publishedAt', 'DESC']],
    }),
    Job.findAll({ where: { isPublished: true }, attributes: ['slug', 'updatedAt'] }),
  ]);

  return { services, projects, posts, jobs };
}

/** Drop cached public content. Called after any admin write that affects it. */
export function invalidatePublicContent() {
  return invalidate('public');
}

export { toPublicCompany, toPublicService, toPublicProject, toPublicMedia };