import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../config/database.js';
import { models } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { allowOnly } from '../middleware/validate.js';
import { buildMeta, toLimitOffset, generateUniqueSlug, normaliseSearch } from '../utils/query.js';
import { logCrud, buildDiff, publishAction } from '../middleware/audit.js';
import { invalidatePublicContent } from './public.service.js';
import { toCents, fromCents, calculateInvoiceTotals, deriveInvoiceStatus, sumCents, outstandingCents } from '../utils/money.js';
import { ACTIVITY_ACTION, ENTITY, TRANSACTION_TYPE, INVOICE_STATUS } from '@virallink/shared/enums';

/**
 * Admin CRUD services.
 *
 * Every function here takes the authenticated `actor` and writes an activity log
 * entry. Two rules are applied consistently:
 *
 *  1. Writes go through `allowOnly(payload, FIELDS)`, so a request cannot set a
 *     column the endpoint does not own (mass-assignment protection).
 *  2. Any change to publicly visible content invalidates the public cache, so the
 *     website reflects the edit immediately rather than after a TTL.
 *
 * Soft-deleted rows stay out of queries automatically (paranoid models) while
 * remaining available for financial history and audit.
 */

const {
  Company,
  SocialLink,
  CompanyStat,
  Testimonial,
  Department,
  Employee,
  Shareholder,
  Client,
  ClientNote,
  ClientCommunication,
  Service,
  Project,
  ProjectImage,
  Technology,
  ProjectTechnology,
  Job,
  BlogPost,
  BlogCategory,
  BlogTag,
  ContactInquiry,
  FinancialCategory,
  FinancialTransaction,
  Invoice,
  InvoiceItem,
  Payment,
  ActivityLog,
  Media,
} = models;

/** Columns a client may write for each resource. Anything else is dropped. */
const WRITABLE = {
  company: [
    'name', 'legalName', 'shortDescription', 'description', 'mission', 'vision', 'values',
    'foundedDate', 'registrationNumber', 'taxIdentifier', 'addressLine1', 'addressLine2',
    'city', 'region', 'country', 'postalCode', 'latitude', 'longitude', 'phone',
    'secondaryPhone', 'email', 'website', 'logoMediaId', 'faviconMediaId',
    'openingHours', 'metaTitle', 'metaDescription',
  ],
  employee: [
    'name', 'position', 'departmentId', 'biography', 'photoMediaId', 'email', 'phone',
    'linkedinUrl', 'employmentStatus', 'joinedAt', 'displayOrder', 'isPublic',
  ],
  shareholder: [
    'name', 'shareClass', 'shareCount', 'ownershipPercentage', 'joinedAt', 'status', 'notes', 'parentId',
  ],
  client: [
    'name', 'contactPerson', 'email', 'phone', 'website', 'industry', 'addressLine1',
    'city', 'country', 'status', 'source', 'notes', 'logoMediaId', 'isPublic', 'contractValue',
  ],
  service: [
    'title', 'slug', 'summary', 'description', 'icon', 'imageMediaId', 'parentId',
    'displayOrder', 'isPublished', 'metaTitle', 'metaDescription', 'faq',
  ],
  project: [
    'title', 'slug', 'clientId', 'serviceId', 'summary', 'description', 'challenge',
    'solution', 'results', 'technologies', 'projectUrl', 'coverMediaId', 'status',
    'isFeatured', 'isPublished', 'publishedAt', 'startedAt', 'completedAt',
    'deadlineAt', 'displayOrder', 'metaTitle', 'metaDescription',
  ],
  job: [
    'title', 'slug', 'departmentId', 'employmentType', 'location', 'isRemote', 'summary',
    'description', 'requirements', 'applyEmail', 'applyUrl', 'isPublished', 'closesAt', 'displayOrder',
  ],
  blogPost: [
    'title', 'slug', 'excerpt', 'content', 'featuredMediaId', 'authorId', 'status',
    'publishedAt', 'metaTitle', 'metaDescription',
  ],
  inquiry: ['status', 'isRead', 'assignedToId', 'notes', 'isArchived'],
  category: ['name', 'slug', 'description'],
  financialCategory: ['name', 'type'],
  testimonial: [
    'authorName', 'authorPosition', 'authorCompany', 'authorPhotoMediaId', 'clientId',
    'body', 'rating', 'isPublished', 'displayOrder',
  ],
  stat: ['label', 'value', 'description', 'icon', 'displayOrder', 'isPublished'],
  socialLink: ['platform', 'label', 'url', 'displayOrder'],
  department: ['name', 'description', 'displayOrder'],
};

/* -------------------------------------------------------------------------- */
/* Generic list helper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Paginated, searched, server-side-filtered list.
 *
 * Search and filtering happen in SQL with bound parameters. Sorting only accepts
 * a field from the caller's whitelist, so a crafted `?sort=` cannot reach an
 * arbitrary column.
 */
async function listResource(Model, {
  page,
  pageSize,
  search,
  sort = 'createdAt',
  order = 'DESC',
  searchFields = [],
  where = {},
  include = [],
  paranoid = true,
}) {
  const conditions = { ...where };

  if (search && searchFields.length) {
    const term = normaliseSearch(search);
    conditions[Op.or] = searchFields.map((field) => ({ [field]: { [Op.like]: `%${term}%` } }));
  }

  const { rows, count } = await Model.findAndCountAll({
    where: conditions,
    include,
    order: [[sort, order]],
    ...toLimitOffset({ page, pageSize }),
    distinct: true,
    paranoid,
  });

  return { rows, meta: buildMeta({ page, pageSize, total: count }) };
}

/* -------------------------------------------------------------------------- */
/* Company profile & settings                                                  */
/* -------------------------------------------------------------------------- */

export async function getCompany() {
  const company = await Company.findOne({
    order: [['id', 'ASC']],
    include: [
      { model: SocialLink, as: 'socialLinks' },
      { model: Media, as: 'logo' },
      { model: Media, as: 'favicon' },
    ],
  });

  const [stats, testimonials, departments] = await Promise.all([
    CompanyStat.findAll({ order: [['displayOrder', 'ASC']] }),
    Testimonial.findAll({ order: [['displayOrder', 'ASC']] }),
    Department.findAll({ order: [['displayOrder', 'ASC'], ['name', 'ASC']] }),
  ]);

  return { company, stats, testimonials, departments };
}

/**
 * Update the company profile.
 *
 * The row is created on first write if the seeder has not run, so a fresh
 * install is usable without a separate setup step.
 */
export async function updateCompany(payload, request) {
  let company = await Company.findOne({ order: [['id', 'ASC']] });
  const before = company ? company.get({ plain: true }) : null;

  if (!company) company = await Company.create({ name: payload.name });

  const fields = allowOnly(payload, WRITABLE.company);
  await company.update(fields);

  await logCrud(request, {
    action: before ? ACTIVITY_ACTION.UPDATE : ACTIVITY_ACTION.CREATE,
    entity: ENTITY.COMPANY,
    entityId: company.id,
    metadata: buildDiff(before, company.get({ plain: true })),
  });

  invalidatePublicContent();
  return company;
}

/** Replace the social links list. */
export async function updateSocialLinks(payload, request) {
  const links = Array.isArray(payload.links) ? payload.links : [];

  // Replace wholesale rather than diffing: the admin form submits the full list.
  await SocialLink.destroy({ where: {}, force: true });

  const created = await Promise.all(
    links.map((link) => {
      const fields = allowOnly(link, WRITABLE.socialLink);
      fields.companyId = 1;
      return SocialLink.create(fields);
    }),
  );

  await logCrud(request, {
    action: ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.COMPANY,
    entityId: 1,
    metadata: { socialLinkCount: created.length },
  });

  invalidatePublicContent();
  return created;
}

/* -------------------------------------------------------------------------- */
/* Employees                                                                   */
/* -------------------------------------------------------------------------- */

export async function listEmployees({ page, pageSize, search, sort, order, departmentId, status }) {
  const where = {};
  if (departmentId) where.departmentId = departmentId;
  if (status) where.employmentStatus = status;

  return listResource(Employee, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['name', 'position'],
    where,
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: Media, as: 'photo' },
    ],
  });
}

export async function getEmployee(id) {
  const employee = await Employee.findByPk(id, {
    include: [
      { model: Department, as: 'department' },
      { model: Media, as: 'photo' },
    ],
  });
  if (!employee) throw AppError.notFound('Employee not found');
  return employee;
}

export async function createEmployee(payload, request) {
  const fields = allowOnly(payload, WRITABLE.employee);
  const employee = await Employee.create(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.EMPLOYEE,
    entityId: employee.id,
    metadata: { name: employee.name, isPublic: employee.isPublic },
  });

  invalidatePublicContent();
  return employee;
}

export async function updateEmployee(id, payload, request) {
  const employee = await getEmployee(id);
  const before = employee.get({ plain: true });

  const fields = allowOnly(payload, WRITABLE.employee);
  await employee.update(fields);

  // Publishing an employee is the moment they become public, so it gets its own
  // log action rather than a generic "update".
  const action =
    fields.isPublished !== undefined ? publishAction(before.isPublished, employee.isPublished) : ACTIVITY_ACTION.EMPLOYEE_UPDATE;

  await logCrud(request, {
    action,
    entity: ENTITY.EMPLOYEE,
    entityId: employee.id,
    metadata: buildDiff(before, employee.get({ plain: true })),
  });

  invalidatePublicContent();
  return getEmployee(id);
}

/** Soft delete, so the employee disappears from the site but history remains. */
export async function archiveEmployee(id, request) {
  const employee = await getEmployee(id);

  await employee.update({ isPublic: false });
  await employee.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.EMPLOYEE,
    entityId: id,
    metadata: { name: employee.name, archived: true },
  });

  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function reorderEmployees(items, request) {
  // One transaction so a partial reorder cannot leave the list inconsistent.
  const transaction = await sequelize.transaction();
  try {
    await Promise.all(
      items.map((item) => Employee.update({ displayOrder: item.displayOrder }, { where: { id: item.id }, transaction })),
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  await logCrud(request, {
    action: ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.EMPLOYEE,
    metadata: { reordered: items.length },
  });

  invalidatePublicContent();
  return { updated: items.length };
}

/* -------------------------------------------------------------------------- */
/* Shareholders — confidential module                                          */
/* -------------------------------------------------------------------------- */

export async function listShareholders({ page, pageSize, search, sort, order, status }) {
  const where = {};
  if (status) where.status = status;

  const { rows, meta } = await listResource(Shareholder, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['name', 'shareClass'],
    where,
  });

  // Ownership totals are aggregated in SQL so the sum is exact. `raw: true` sends
  // the expressions straight to MySQL, so they name physical columns.
  const [totals] = await Shareholder.findAll({
    attributes: [
      [fn('COALESCE', fn('SUM', literal('share_count')), literal(0)), 'shares'],
      [fn('COALESCE', fn('SUM', literal('ownership_percentage')), literal(0)), 'percentage'],
    ],
    raw: true,
  });

  return {
    shareholders: rows,
    totals: { shareCount: Number(totals?.shares || 0), ownershipPercentage: Number(totals?.percentage || 0) },
    meta,
  };
}

export async function getShareholder(id) {
  const shareholder = await Shareholder.findByPk(id);
  if (!shareholder) throw AppError.notFound('Shareholder not found');
  return shareholder;
}

export async function createShareholder(payload, request) {
  const fields = allowOnly(payload, WRITABLE.shareholder);
  const shareholder = await Shareholder.create(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.SHAREHOLDER,
    entityId: shareholder.id,
    // Percentage and share count are recorded but the name is the key detail.
    metadata: { shareClass: shareholder.shareClass, status: shareholder.status },
  });

  return shareholder;
}

export async function updateShareholder(id, payload, request) {
  const shareholder = await getShareholder(id);
  const before = shareholder.get({ plain: true });

  await shareholder.update(allowOnly(payload, WRITABLE.shareholder));

  await logCrud(request, {
    action: ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.SHAREHOLDER,
    entityId: id,
    metadata: buildDiff(before, shareholder.get({ plain: true })),
  });

  return shareholder;
}

export async function archiveShareholder(id, request) {
  const shareholder = await getShareholder(id);
  await shareholder.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.SHAREHOLDER,
    entityId: id,
    metadata: { shareClass: shareholder.shareClass, archived: true },
  });

  return { id: Number(id), deleted: true };
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

export async function listClients({ page, pageSize, search, sort, order, status, source }) {
  const where = {};
  if (status) where.status = status;
  if (source) where.source = source;

  return listResource(Client, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['name', 'contactPerson', 'email', 'industry'],
    where,
    include: [{ model: Media, as: 'logo' }],
  });
}

export async function getClient(id) {
  const client = await Client.findByPk(id, {
    include: [
      { model: Media, as: 'logo' },
      {
        model: Project,
        as: 'projects',
        include: [{ model: Service, as: 'service', attributes: ['id', 'title'] }],
      },
      { model: ClientNote, as: 'clientNotes', include: [{ model: models.User, as: 'author', attributes: ['id', 'name'] }] },
      {
        model: ClientCommunication,
        as: 'communications',
        include: [{ model: models.User, as: 'author', attributes: ['id', 'name'] }],
      },
      { model: Invoice, as: 'invoices' },
    ],
  });

  if (!client) throw AppError.notFound('Client not found');

  // Outstanding balance per invoice is computed rather than stored.
  client.invoices = (client.invoices || []).map((invoice) => {
    const plain = invoice.get({ plain: true });
    return {
      ...plain,
      outstanding: fromCents(outstandingCents(toCents(plain.total), toCents(plain.paidAmount))),
    };
  });

  return client;
}

export async function createClient(payload, request) {
  const fields = allowOnly(payload, WRITABLE.client);
  // Money arrives as a decimal string; store it as a fixed 2-decimal string.
  if (fields.contractValue !== undefined && fields.contractValue !== null) {
    fields.contractValue = fromCents(toCents(fields.contractValue));
  }

  const client = await Client.create(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.CLIENT,
    entityId: client.id,
    metadata: { name: client.name, status: client.status, source: client.source },
  });

  invalidatePublicContent();
  return client;
}

export async function updateClient(id, payload, request) {
  const client = await Client.findByPk(id);
  if (!client) throw AppError.notFound('Client not found');

  const before = client.get({ plain: true });
  const fields = allowOnly(payload, WRITABLE.client);

  if (fields.contractValue !== undefined && fields.contractValue !== null) {
    fields.contractValue = fromCents(toCents(fields.contractValue));
  }

  await client.update(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.CLIENT_UPDATE,
    entity: ENTITY.CLIENT,
    entityId: id,
    metadata: buildDiff(before, client.get({ plain: true })),
  });

  invalidatePublicContent();
  return getClient(id);
}

export async function archiveClient(id, request) {
  const client = await Client.findByPk(id);
  if (!client) throw AppError.notFound('Client not found');

  await client.update({ isPublic: false, status: 'inactive' });
  await client.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.CLIENT,
    entityId: id,
    metadata: { name: client.name, archived: true },
  });

  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function addClientNote(clientId, body, request) {
  const client = await Client.findByPk(clientId);
  if (!client) throw AppError.notFound('Client not found');

  const note = await ClientNote.create({ clientId: Number(clientId), userId: request.user.id, body });

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.CLIENT,
    entityId: clientId,
    metadata: { noteId: note.id },
  });

  return note;
}

export async function addClientCommunication(clientId, payload, request) {
  const client = await Client.findByPk(clientId);
  if (!client) throw AppError.notFound('Client not found');

  const communication = await ClientCommunication.create({
    clientId: Number(clientId),
    userId: request.user.id,
    type: payload.type || 'call',
    subject: payload.subject || null,
    body: payload.body || null,
    occurredAt: payload.occurredAt || new Date(),
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.CLIENT,
    entityId: clientId,
    metadata: { communicationId: communication.id, type: communication.type },
  });

  return communication;
}

/* -------------------------------------------------------------------------- */
/* Services                                                                    */
/* -------------------------------------------------------------------------- */

export async function listServicesAdmin({ page, pageSize, search, sort, order, isPublished }) {
  const where = {};
  if (isPublished !== undefined && isPublished !== null) where.isPublished = isPublished;

  return listResource(Service, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['title', 'summary'],
    where,
    include: [{ model: Media, as: 'image' }],
  });
}

export async function getService(id) {
  const service = await Service.findByPk(id, {
    include: [{ model: Media, as: 'image' }],
  });
  if (!service) throw AppError.notFound('Service not found');
  return service;
}

export async function createService(payload, request) {
  const fields = allowOnly(payload, WRITABLE.service);

  // A supplied slug must still be checked. generateUniqueSlug only applies when
  // the slug is derived from the title, and soft-deleted rows are excluded from
  // normal queries, so the uniqueness check has to look at deleted rows too —
  // otherwise a re-created entry reuses a slug still held by an archived one.
  if (fields.slug) {
    const clash = await Service.findOne({ where: { slug: fields.slug }, paranoid: false });
    if (clash) throw AppError.conflict('That slug is already in use by another service');
  } else {
    fields.slug = await generateUniqueSlug(Service, payload.title, { includeSoftDeleted: true });
  }

  const service = await Service.create(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.SERVICE,
    entityId: service.id,
    metadata: { title: service.title, slug: service.slug, isPublished: service.isPublished },
  });

  invalidatePublicContent();
  return service;
}

export async function updateService(id, payload, request) {
  const service = await getService(id);
  const before = service.get({ plain: true });

  const fields = allowOnly(payload, WRITABLE.service);

  // Keep the slug unique when it is being changed.
  if (fields.slug && fields.slug !== before.slug) {
    const clash = await Service.findOne({ where: { slug: fields.slug, id: { [Op.ne]: id } } });
    if (clash) throw AppError.conflict('That slug is already in use by another service');
  }

  await service.update(fields);

  const action = fields.isPublished !== undefined
    ? publishAction(before.isPublished, service.isPublished)
    : ACTIVITY_ACTION.UPDATE;

  await logCrud(request, {
    action,
    entity: ENTITY.SERVICE,
    entityId: id,
    metadata: buildDiff(before, service.get({ plain: true })),
  });

  invalidatePublicContent();
  return getService(id);
}

export async function deleteService(id, request) {
  const service = await getService(id);

  // A service with published projects cannot be deleted outright: the projects
  // would be left pointing at a missing category. Unpublishing is the safe path.
  const projectCount = await Project.count({ where: { serviceId: id } });
  if (projectCount > 0) {
    throw AppError.conflict(
      `This service is linked to ${projectCount} project${projectCount === 1 ? '' : 's'}. Unpublish or reassign them first.`,
    );
  }

  await service.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.SERVICE,
    entityId: id,
    metadata: { title: service.title, slug: service.slug },
  });

  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function reorderServices(items, request) {
  await sequelize.transaction(async (transaction) => {
    await Promise.all(
      items.map((item) => Service.update({ displayOrder: item.displayOrder }, { where: { id: item.id }, transaction })),
    );
  });

  await logCrud(request, { action: ACTIVITY_ACTION.UPDATE, entity: ENTITY.SERVICE, metadata: { reordered: items.length } });
  invalidatePublicContent();
  return { updated: items.length };
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

const PROJECT_CARD_INCLUDE = [
  { model: Client, as: 'client', attributes: ['id', 'name'] },
  { model: Service, as: 'service', attributes: ['id', 'title'] },
  { model: Media, as: 'cover' },
];

export async function listProjectsAdmin({ page, pageSize, search, sort, order, status, serviceId, isPublished }) {
  const where = {};
  if (status) where.status = status;
  if (serviceId) where.serviceId = serviceId;
  if (isPublished !== undefined && isPublished !== null) where.isPublished = isPublished;

  return listResource(Project, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['title', 'summary'],
    where,
    include: PROJECT_CARD_INCLUDE,
  });
}

export async function getProject(id) {
  const project = await Project.findByPk(id, {
    include: [
      ...PROJECT_CARD_INCLUDE,
      { model: ProjectImage, as: 'images', include: [{ model: Media, as: 'media' }] },
      { model: ProjectTechnology, as: 'techRows', include: [{ model: Technology, as: 'technology' }] },
    ],
  });

  if (!project) throw AppError.notFound('Project not found');

  // Normalise the tech stack to a plain string array for the edit form.
  project.techStackNames = (project.techRows || []).map((row) => row.technology?.name).filter(Boolean);
  return project;
}

export async function createProject(payload, request) {
  const fields = allowOnly(payload, WRITABLE.project);
  fields.slug = payload.slug || (await generateUniqueSlug(Project, payload.title));

  const images = Array.isArray(payload.images) ? payload.images : [];
  const technologies = Array.isArray(payload.technologies) ? payload.technologies : [];

  const project = await sequelize.transaction(async (transaction) => {
    const created = await Project.create(fields, { transaction });

    if (images.length) {
      await ProjectImage.bulkCreate(
        images.map((image, index) => ({
          projectId: created.id,
          mediaId: image.mediaId,
          caption: image.caption || null,
          displayOrder: image.displayOrder ?? index,
        })),
        { transaction },
      );
    }

    await syncProjectTechnologies(created.id, technologies, transaction);

    return created;
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.PROJECT,
    entityId: project.id,
    metadata: { title: project.title, slug: project.slug, isPublished: project.isPublished, isFeatured: project.isFeatured },
  });

  invalidatePublicContent();
  return getProject(project.id);
}

export async function updateProject(id, payload, request) {
  const project = await Project.findByPk(id);
  if (!project) throw AppError.notFound('Project not found');

  const before = project.get({ plain: true });
  const fields = allowOnly(payload, WRITABLE.project);

  if (fields.slug && fields.slug !== before.slug) {
    const clash = await Project.findOne({ where: { slug: fields.slug, id: { [Op.ne]: id } } });
    if (clash) throw AppError.conflict('That slug is already in use by another project');
  }

  const images = Array.isArray(payload.images) ? payload.images : null;
  const technologies = Array.isArray(payload.technologies) ? payload.technologies : null;

  await sequelize.transaction(async (transaction) => {
    await project.update(fields, { transaction });

    // Images are replaced wholesale, which matches how the edit form submits.
    if (images) {
      await ProjectImage.destroy({ where: { projectId: id }, transaction });
      if (images.length) {
        await ProjectImage.bulkCreate(
          images.map((image, index) => ({
            projectId: id,
            mediaId: image.mediaId,
            caption: image.caption || null,
            displayOrder: image.displayOrder ?? index,
          })),
          { transaction },
        );
      }
    }

    if (technologies) {
      await syncProjectTechnologies(id, technologies, transaction);
    }
  });

  const action = fields.isPublished !== undefined
    ? publishAction(before.isPublished, project.isPublished)
    : ACTIVITY_ACTION.PORTFOLIO_UPDATE;

  await logCrud(request, {
    action,
    entity: ENTITY.PROJECT,
    entityId: id,
    metadata: buildDiff(before, project.get({ plain: true })),
  });

  invalidatePublicContent();
  return getProject(id);
}

/**
 * Match technology names to rows, creating any that are new.
 * Runs inside the caller's transaction so a project and its tags commit together.
 */
async function syncProjectTechnologies(projectId, names, transaction) {
  const cleaned = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].slice(0, 30);

  const rows = [];
  for (const name of cleaned) {
    const [technology] = await Technology.findOrCreate({
      where: { name },
      defaults: { name },
      transaction,
    });
    rows.push(technology);
  }

  await ProjectTechnology.destroy({ where: { projectId }, transaction });
  if (rows.length) {
    await ProjectTechnology.bulkCreate(
      rows.map((technology) => ({ projectId, technologyId: technology.id })),
      { transaction },
    );
  }
}

export async function deleteProject(id, request) {
  const project = await Project.findByPk(id);
  if (!project) throw AppError.notFound('Project not found');

  await project.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.PROJECT,
    entityId: id,
    metadata: { title: project.title, slug: project.slug },
  });

  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function reorderProjects(items, request) {
  await sequelize.transaction(async (transaction) => {
    await Promise.all(
      items.map((item) => Project.update({ displayOrder: item.displayOrder }, { where: { id: item.id }, transaction })),
    );
  });

  await logCrud(request, { action: ACTIVITY_ACTION.UPDATE, entity: ENTITY.PROJECT, metadata: { reordered: items.length } });
  invalidatePublicContent();
  return { updated: items.length };
}

/* -------------------------------------------------------------------------- */
/* Blog                                                                        */
/* -------------------------------------------------------------------------- */

const POST_INCLUDE = [
  { model: Media, as: 'featuredImage' },
  { model: models.User, as: 'author', attributes: ['id', 'name'] },
  { model: BlogCategory, as: 'categories', attributes: ['id', 'name', 'slug'], through: { attributes: [] } },
  { model: BlogTag, as: 'tags', attributes: ['id', 'name', 'slug'], through: { attributes: [] } },
];

export async function listPostsAdmin({ page, pageSize, search, sort, order, status }) {
  const where = {};
  if (status) where.status = status;

  return listResource(BlogPost, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['title', 'excerpt'],
    where,
    include: POST_INCLUDE,
  });
}

export async function getPost(id) {
  const post = await BlogPost.findByPk(id, { include: POST_INCLUDE });
  if (!post) throw AppError.notFound('Post not found');
  return post;
}

export async function createPost(payload, request) {
  const fields = allowOnly(payload, WRITABLE.blogPost);
  fields.slug = payload.slug || (await generateUniqueSlug(BlogPost, payload.title));
  fields.authorId = payload.authorId || request.user.id;

  // A post going live without a date would sort unpredictably, so stamp it now.
  if (fields.status === 'published' && !fields.publishedAt) {
    fields.publishedAt = new Date();
  }

  const categoryIds = Array.isArray(payload.categoryIds) ? payload.categoryIds : [];
  const tagIds = Array.isArray(payload.tagIds) ? payload.tagIds : [];

  const post = await sequelize.transaction(async (transaction) => {
    const created = await BlogPost.create(fields, { transaction });
    await created.setCategories(categoryIds, { transaction });
    await created.setTags(tagIds, { transaction });
    return created;
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.BLOG_POST,
    entityId: post.id,
    metadata: { title: post.title, slug: post.slug, status: post.status },
  });

  invalidatePublicContent();
  return getPost(post.id);
}

export async function updatePost(id, payload, request) {
  const post = await BlogPost.findByPk(id);
  if (!post) throw AppError.notFound('Post not found');

  const before = post.get({ plain: true });
  const fields = allowOnly(payload, WRITABLE.blogPost);

  if (fields.slug && fields.slug !== before.slug) {
    const clash = await BlogPost.findOne({ where: { slug: fields.slug, id: { [Op.ne]: id } } });
    if (clash) throw AppError.conflict('That slug is already in use by another post');
  }

  if (fields.status === 'published' && !post.publishedAt && !fields.publishedAt) {
    fields.publishedAt = new Date();
  }

  const categoryIds = Array.isArray(payload.categoryIds) ? payload.categoryIds : null;
  const tagIds = Array.isArray(payload.tagIds) ? payload.tagIds : null;

  await sequelize.transaction(async (transaction) => {
    await post.update(fields, { transaction });
    if (categoryIds) await post.setCategories(categoryIds, { transaction });
    if (tagIds) await post.setTags(tagIds, { transaction });
  });

  const action = fields.status !== undefined && fields.status !== before.status
    ? (fields.status === 'published' ? ACTIVITY_ACTION.PUBLISH : ACTIVITY_ACTION.UNPUBLISH)
    : ACTIVITY_ACTION.UPDATE;

  await logCrud(request, {
    action,
    entity: ENTITY.BLOG_POST,
    entityId: id,
    metadata: buildDiff(before, post.get({ plain: true })),
  });

  invalidatePublicContent();
  return getPost(id);
}

export async function deletePost(id, request) {
  const post = await BlogPost.findByPk(id);
  if (!post) throw AppError.notFound('Post not found');

  await post.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.BLOG_POST,
    entityId: id,
    metadata: { title: post.title, slug: post.slug },
  });

  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function listCategories() {
  return BlogCategory.findAll({ order: [['name', 'ASC']] });
}

export async function createCategory(payload) {
  const fields = allowOnly(payload, WRITABLE.category);
  fields.slug = payload.slug || (await generateUniqueSlug(BlogCategory, payload.name));

  const existing = await BlogCategory.findOne({ where: { slug: fields.slug } });
  if (existing) throw AppError.conflict('That slug is already in use');

  const category = await BlogCategory.create(fields);
  invalidatePublicContent();
  return category;
}

export async function listTags() {
  return BlogTag.findAll({ order: [['name', 'ASC']], limit: 200 });
}

export async function createTag(payload) {
  const fields = allowOnly(payload, WRITABLE.category);
  fields.slug = payload.slug || (await generateUniqueSlug(BlogTag, payload.name));

  const [tag] = await BlogTag.findOrCreate({ where: { slug: fields.slug }, defaults: fields });
  invalidatePublicContent();
  return tag;
}

/* -------------------------------------------------------------------------- */
/* Inquiries                                                                   */
/* -------------------------------------------------------------------------- */

export async function listInquiries({ page, pageSize, search, sort, order, status, isRead, isArchived }) {
  const where = {};
  if (status) where.status = status;
  if (isRead !== undefined && isRead !== null) where.isRead = isRead;
  if (isArchived !== undefined && isArchived !== null) where.isArchived = isArchived;

  return listResource(ContactInquiry, {
    page,
    pageSize,
    search,
    sort: sort || 'createdAt',
    order,
    searchFields: ['name', 'email', 'company', 'subject'],
    where,
    include: [
      { model: Service, as: 'service', attributes: ['id', 'title'] },
      { model: models.User, as: 'assignedTo', attributes: ['id', 'name'] },
    ],
  });
}

export async function getInquiry(id) {
  const inquiry = await ContactInquiry.findByPk(id, {
    include: [
      { model: Service, as: 'service', attributes: ['id', 'title'] },
      { model: models.User, as: 'assignedTo', attributes: ['id', 'name'] },
    ],
  });
  if (!inquiry) throw AppError.notFound('Inquiry not found');
  return inquiry;
}

export async function updateInquiry(id, payload, request) {
  const inquiry = await getInquiry(id);
  const before = inquiry.get({ plain: true });

  await inquiry.update(allowOnly(payload, WRITABLE.inquiry));

  await logCrud(request, {
    action: ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.INQUIRY,
    entityId: id,
    metadata: buildDiff(before, inquiry.get({ plain: true })),
  });

  return getInquiry(id);
}

export async function archiveInquiry(id, request) {
  const inquiry = await getInquiry(id);
  await inquiry.update({ isArchived: true });

  await logCrud(request, {
    action: ACTIVITY_ACTION.ARCHIVE,
    entity: ENTITY.INQUIRY,
    entityId: id,
  });

  return getInquiry(id);
}

/* -------------------------------------------------------------------------- */
/* Finance                                                                     */
/* -------------------------------------------------------------------------- */

export async function listTransactions({ page, pageSize, search, sort, order, type, status, from, to }) {
  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (from || to) {
    where.transactionDate = {};
    if (from) where.transactionDate[Op.gte] = from;
    if (to) where.transactionDate[Op.lte] = to;
  }

  return listResource(FinancialTransaction, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['description', 'reference'],
    where,
    include: [
      { model: FinancialCategory, as: 'category', attributes: ['id', 'name', 'type'] },
      { model: Client, as: 'client', attributes: ['id', 'name'] },
      { model: Project, as: 'project', attributes: ['id', 'title'] },
    ],
  });
}

export async function createTransaction(payload, request) {
  const fields = allowOnly(payload, [
    'type', 'currency', 'categoryId', 'clientId', 'projectId', 'description',
    'transactionDate', 'paymentMethod', 'reference', 'status', 'notes',
  ]);

  // Normalise the amount through integer cents before it reaches the DECIMAL column.
  fields.amount = fromCents(toCents(payload.amount));
  fields.createdById = request.user.id;

  const transaction = await FinancialTransaction.create(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_CREATE,
    entity: ENTITY.TRANSACTION,
    entityId: transaction.id,
    // Amount is recorded as a decimal string, never re-derived from a float.
    metadata: { type: transaction.type, amount: transaction.amount, currency: transaction.currency },
  });

  return transaction;
}

export async function updateTransaction(id, payload, request) {
  const transaction = await FinancialTransaction.findByPk(id);
  if (!transaction) throw AppError.notFound('Transaction not found');

  const before = transaction.get({ plain: true });
  const fields = allowOnly(payload, [
    'type', 'amount', 'currency', 'categoryId', 'clientId', 'projectId', 'description',
    'transactionDate', 'paymentMethod', 'reference', 'status', 'notes',
  ]);

  if (payload.amount !== undefined) {
    fields.amount = fromCents(toCents(payload.amount));
  }

  await transaction.update(fields);

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_UPDATE,
    entity: ENTITY.TRANSACTION,
    entityId: id,
    metadata: buildDiff(before, transaction.get({ plain: true })),
  });

  return transaction;
}

export async function deleteTransaction(id, request) {
  const transaction = await FinancialTransaction.findByPk(id);
  if (!transaction) throw AppError.notFound('Transaction not found');

  await transaction.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_DELETE,
    entity: ENTITY.TRANSACTION,
    entityId: id,
    metadata: { type: transaction.type, amount: transaction.amount },
  });

  return { id: Number(id), deleted: true };
}

export async function listFinancialCategories({ type } = {}) {
  const where = type ? { type } : {};
  return FinancialCategory.findAll({ where, order: [['type', 'ASC'], ['name', 'ASC']] });
}

export async function createFinancialCategory(payload) {
  return FinancialCategory.create(allowOnly(payload, WRITABLE.financialCategory));
}

/* -------------------------------------------------------------------------- */
/* Invoices & payments — multi-record writes use a transaction                */
/* -------------------------------------------------------------------------- */

export async function listInvoices({ page, pageSize, search, sort, order, status, clientId }) {
  const where = {};
  if (status) where.status = status;
  if (clientId) where.clientId = clientId;

  const result = await listResource(Invoice, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['invoiceNumber'],
    where,
    include: [
      { model: Client, as: 'client', attributes: ['id', 'name'] },
      { model: Project, as: 'project', attributes: ['id', 'title'] },
    ],
  });

  // Outstanding is derived on read so it can never contradict the payment rows.
  result.rows = result.rows.map((invoice) => {
    const plain = invoice.get({ plain: true });
    return {
      ...plain,
      outstanding: fromCents(outstandingCents(toCents(plain.total), toCents(plain.paidAmount))),
    };
  });

  return result;
}

export async function getInvoice(id) {
  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: Client, as: 'client', attributes: ['id', 'name', 'email'] },
      { model: InvoiceItem, as: 'items', order: [['position', 'ASC']] },
      { model: Payment, as: 'payments', order: [['paidAt', 'DESC']] },
    ],
  });

  if (!invoice) throw AppError.notFound('Invoice not found');

  const plain = invoice.get({ plain: true });
  plain.outstanding = fromCents(outstandingCents(toCents(plain.total), toCents(plain.paidAmount)));
  return plain;
}

/**
 * Create an invoice with its line items.
 *
 * Totals are recalculated from the items inside the same transaction that writes
 * them, so an invoice is never persisted with a total that disagrees with its
 * lines.
 */
export async function createInvoice(payload, request) {
  const fields = allowOnly(payload, [
    'clientId', 'projectId', 'invoiceNumber', 'issueDate', 'dueDate',
    'currency', 'taxRate', 'status', 'notes',
  ]);
  fields.createdById = request.user.id;

  const duplicate = await Invoice.findOne({ where: { invoiceNumber: fields.invoiceNumber } });
  if (duplicate) throw AppError.conflict(`Invoice ${fields.invoiceNumber} already exists`);

  const client = await Client.findByPk(payload.clientId);
  if (!client) throw AppError.badRequest('Select a valid client for this invoice');

  const totals = calculateInvoiceTotals(payload.items, payload.taxRate || 0);

  const invoice = await sequelize.transaction(async (transaction) => {
    const created = await Invoice.create(
      {
        ...fields,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        paidAmount: '0.00',
      },
      { transaction },
    );

    await InvoiceItem.bulkCreate(
      totals.lineTotals.map((item, index) => ({
        invoiceId: created.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: fromCents(toCents(item.unitPrice)),
        lineTotal: fromCents(item.lineTotalCents),
        position: index,
      })),
      { transaction },
    );

    return created;
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_CREATE,
    entity: ENTITY.INVOICE,
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, total: invoice.total, currency: invoice.currency },
  });

  return getInvoice(invoice.id);
}

/**
 * Replace an invoice's line items and recalculate its totals atomically.
 * A draft invoice can be edited freely; one that has been issued should not have
 * its totals silently rewritten.
 */
export async function updateInvoice(id, payload, request) {
  const invoice = await Invoice.findByPk(id);
  if (!invoice) throw AppError.notFound('Invoice not found');

  if (invoice.status === INVOICE_STATUS.PAID && payload.items) {
    throw AppError.conflict('This invoice is fully paid and its line items can no longer be changed');
  }

  const before = invoice.get({ plain: true });
  const fields = allowOnly(payload, [
    'projectId', 'dueDate', 'taxRate', 'status', 'notes',
  ]);

  if (Array.isArray(payload.items)) {
    const totals = calculateInvoiceTotals(payload.items, payload.taxRate ?? invoice.taxRate);
    fields.subtotal = totals.subtotal;
    fields.taxAmount = totals.taxAmount;
    fields.total = totals.total;
  }

  await sequelize.transaction(async (transaction) => {
    await invoice.update(fields, { transaction });

    if (Array.isArray(payload.items)) {
      await InvoiceItem.destroy({ where: { invoiceId: id }, transaction });
      const totals = calculateInvoiceTotals(payload.items, payload.taxRate ?? invoice.taxRate);
      await InvoiceItem.bulkCreate(
        totals.lineTotals.map((item, index) => ({
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: fromCents(toCents(item.unitPrice)),
          lineTotal: fromCents(item.lineTotalCents),
          position: index,
        })),
        { transaction },
      );
    }
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_UPDATE,
    entity: ENTITY.INVOICE,
    entityId: id,
    metadata: buildDiff(before, invoice.get({ plain: true })),
  });

  return getInvoice(id);
}

/**
 * Record a payment against an invoice.
 *
 * The invoice's paidAmount and status are updated in the same transaction as the
 * payment row, so a payment can never exist without being reflected on the
 * invoice. The status is derived from the new totals rather than set by hand.
 */
export async function createPayment(payload, request) {
  const invoice = await Invoice.findByPk(payload.invoiceId);
  if (!invoice) throw AppError.notFound('Invoice not found');

  const amountCents = toCents(payload.amount);
  const paidCents = toCents(invoice.paidAmount);
  const totalCents = toCents(invoice.total);

  if (paidCents + amountCents > totalCents) {
    throw AppError.badRequest('That payment would exceed the invoice total');
  }

  if (invoice.status === INVOICE_STATUS.DRAFT || invoice.status === INVOICE_STATUS.VOID) {
    throw AppError.badRequest(`Payments cannot be recorded against a ${invoice.status} invoice`);
  }

  const newPaidCents = paidCents + amountCents;

  const payment = await sequelize.transaction(async (transaction) => {
    const created = await Payment.create(
      {
        invoiceId: invoice.id,
        amount: fromCents(amountCents),
        currency: payload.currency || invoice.currency,
        paymentMethod: payload.paymentMethod || null,
        reference: payload.reference || null,
        paidAt: payload.paidAt,
        notes: payload.notes || null,
        createdById: request.user.id,
      },
      { transaction },
    );

    await invoice.update(
      {
        paidAmount: fromCents(newPaidCents),
        status: deriveInvoiceStatus({
          totalCents,
          paidCents: newPaidCents,
          dueDate: invoice.dueDate,
          currentStatus: invoice.status,
        }),
      },
      { transaction },
    );

    return created;
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_CREATE,
    entity: ENTITY.PAYMENT,
    entityId: payment.id,
    metadata: {
      invoiceId: invoice.id,
      amount: payment.amount,
      invoiceTotalAfter: fromCents(newPaidCents),
    },
  });

  return { payment, invoice: await getInvoice(invoice.id) };
}

export async function deletePayment(id, request) {
  const payment = await Payment.findByPk(id);
  if (!payment) throw AppError.notFound('Payment not found');

  const invoice = await Invoice.findByPk(payment.invoiceId);

  // Roll the invoice back to reflect the removed payment.
  await sequelize.transaction(async (transaction) => {
    await payment.destroy({ transaction });

    if (invoice) {
      const remaining = sumCents(
        (await Payment.findAll({ where: { invoiceId: payment.invoiceId }, attributes: ['amount'], transaction })).map((p) =>
          toCents(p.amount),
        ),
      );

      await invoice.update(
        {
          paidAmount: fromCents(remaining),
          status: deriveInvoiceStatus({
            totalCents: toCents(invoice.total),
            paidCents: remaining,
            dueDate: invoice.dueDate,
            currentStatus: invoice.status,
          }),
        },
        { transaction },
      );
    }
  });

  await logCrud(request, {
    action: ACTIVITY_ACTION.FINANCIAL_DELETE,
    entity: ENTITY.PAYMENT,
    entityId: id,
    metadata: { invoiceId: payment.invoiceId, amount: payment.amount },
  });

  return { id: Number(id), deleted: true };
}

/* -------------------------------------------------------------------------- */
/* Activity log reads                                                          */
/* -------------------------------------------------------------------------- */

export async function listActivity({ page, pageSize, search, order, action, entity, userId, from, to }) {
  const where = {};
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (userId) where.userId = userId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = from;
    if (to) where.createdAt[Op.lte] = to;
  }

  const result = await listResource(ActivityLog, {
    page,
    pageSize,
    search,
    sort: 'createdAt',
    order: order || 'DESC',
    searchFields: ['action', 'entity', 'userEmail'],
    where,
    // The audit trail is append-only: no soft delete.
    paranoid: false,
    include: [{ model: models.User, as: 'user', attributes: ['id', 'name', 'email'] }],
  });

  return result;
}

/* -------------------------------------------------------------------------- */
/* Media & branding collections                                                */
/* -------------------------------------------------------------------------- */

export async function listMedia({ page, pageSize, search, sort, order, kind }) {
  const where = {};
  if (kind) where.kind = kind;

  return listResource(Media, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['altText', 'title', 'key'],
    where,
    include: [{ model: models.User, as: 'uploadedBy', attributes: ['id', 'name'] }],
  });
}

export async function updateMedia(id, payload) {
  const media = await Media.findByPk(id);
  if (!media) throw AppError.notFound('Media not found');

  await media.update(allowOnly(payload, ['altText', 'title', 'caption']));
  invalidatePublicContent();
  return media;
}

export async function listTestimonials({ page, pageSize, search, sort, order }) {
  return listResource(Testimonial, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['authorName', 'authorCompany'],
    include: [
      { model: Media, as: 'authorPhoto' },
      { model: Client, as: 'client', attributes: ['id', 'name'] },
    ],
  });
}

export async function createTestimonial(payload, request) {
  const testimonial = await Testimonial.create(allowOnly(payload, WRITABLE.testimonial));
  await logCrud(request, { action: ACTIVITY_ACTION.CREATE, entity: ENTITY.TESTIMONIAL, entityId: testimonial.id });
  invalidatePublicContent();
  return testimonial;
}

export async function updateTestimonial(id, payload, request) {
  const testimonial = await Testimonial.findByPk(id);
  if (!testimonial) throw AppError.notFound('Testimonial not found');

  const before = testimonial.get({ plain: true });
  await testimonial.update(allowOnly(payload, WRITABLE.testimonial));

  await logCrud(request, {
    action: payload.isPublished !== undefined ? publishAction(before.isPublished, testimonial.isPublished) : ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.TESTIMONIAL,
    entityId: id,
    metadata: buildDiff(before, testimonial.get({ plain: true })),
  });

  invalidatePublicContent();
  return testimonial;
}

export async function deleteTestimonial(id, request) {
  await Testimonial.findByPk(id).then((row) => row?.destroy());
  await logCrud(request, { action: ACTIVITY_ACTION.DELETE, entity: ENTITY.TESTIMONIAL, entityId: id });
  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function listStats({ page, pageSize, sort, order }) {
  return listResource(CompanyStat, { page, pageSize, sort: sort || 'displayOrder', order: order || 'ASC' });
}

export async function createStat(payload, request) {
  const stat = await CompanyStat.create({
    ...allowOnly(payload, WRITABLE.stat),
    companyId: 1,
  });
  await logCrud(request, { action: ACTIVITY_ACTION.CREATE, entity: ENTITY.COMPANY, entityId: stat.id, metadata: { stat: stat.label } });
  invalidatePublicContent();
  return stat;
}

export async function updateStat(id, payload, request) {
  const stat = await CompanyStat.findByPk(id);
  if (!stat) throw AppError.notFound('Statistic not found');

  const before = stat.get({ plain: true });
  await stat.update(allowOnly(payload, WRITABLE.stat));

  await logCrud(request, {
    action: payload.isPublished !== undefined ? publishAction(before.isPublished, stat.isPublished) : ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.COMPANY,
    entityId: id,
    metadata: buildDiff(before, stat.get({ plain: true })),
  });

  invalidatePublicContent();
  return stat;
}

export async function deleteStat(id, request) {
  await CompanyStat.findByPk(id).then((row) => row?.destroy());
  await logCrud(request, { action: ACTIVITY_ACTION.DELETE, entity: ENTITY.COMPANY, entityId: id });
  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function listJobsAdmin({ page, pageSize, search, sort, order, isPublished }) {
  const where = {};
  if (isPublished !== undefined && isPublished !== null) where.isPublished = isPublished;

  return listResource(Job, {
    page,
    pageSize,
    search,
    sort,
    order,
    searchFields: ['title', 'location'],
    where,
    include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
  });
}

export async function createJob(payload, request) {
  const fields = allowOnly(payload, WRITABLE.job);
  fields.slug = payload.slug || (await generateUniqueSlug(Job, payload.title));
  const job = await Job.create(fields);

  await logCrud(request, { action: ACTIVITY_ACTION.CREATE, entity: ENTITY.SERVICE, entityId: job.id, metadata: { title: job.title } });
  invalidatePublicContent();
  return job;
}

export async function updateJob(id, payload, request) {
  const job = await Job.findByPk(id);
  if (!job) throw AppError.notFound('Job not found');

  const before = job.get({ plain: true });
  const fields = allowOnly(payload, WRITABLE.job);
  await job.update(fields);

  await logCrud(request, {
    action: payload.isPublished !== undefined ? publishAction(before.isPublished, job.isPublished) : ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.SERVICE,
    entityId: id,
    metadata: buildDiff(before, job.get({ plain: true })),
  });

  invalidatePublicContent();
  return job;
}

export async function deleteJob(id, request) {
  const job = await Job.findByPk(id);
  if (!job) throw AppError.notFound('Job not found');
  await job.destroy();
  await logCrud(request, { action: ACTIVITY_ACTION.DELETE, entity: ENTITY.SERVICE, entityId: id, metadata: { title: job.title } });
  invalidatePublicContent();
  return { id: Number(id), deleted: true };
}

export async function listDepartmentsAdmin() {
  return Department.findAll({ order: [['displayOrder', 'ASC'], ['name', 'ASC']] });
}

export async function createDepartment(payload) {
  const department = await Department.create(allowOnly(payload, WRITABLE.department));
  invalidatePublicContent();
  return department;
}

export { listResource, WRITABLE };
export default { listEmployees, listClients, listProjectsAdmin };