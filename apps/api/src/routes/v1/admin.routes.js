import { Router } from 'express';
import { models } from '../../models/index.js';
import { idFrom, query, v } from '../../middleware/schemas.js';
import { ADMIN_RESOURCE_PREFIXES } from '../../shared/permissions.js';
import { AppError } from '../../utils/AppError.js';
import { requireAuth } from '../../services/token.service.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as admin from '../../services/admin.service.js';
import * as userService from '../../services/user.service.js';
import * as taskService from '../../services/task.service.js';
import * as reportService from '../../services/report.service.js';
import * as pipelineService from '../../services/pipeline.service.js';
import { getDashboardSummary, getFinanceReport } from '../../services/dashboard.service.js';
import { storeImages, deleteMedia } from '../../services/media.service.js';
import { upload } from '../upload.js';

/**
 * Admin API.
 *
 * Every route is authenticated and gated on a permission. The order matters:
 * requireAuth populates request.user, then requirePermission decides. Mounting
 * both on each route rather than only at the router level keeps the requirement
 * visible next to the endpoint it protects.
 *
 * Authorisation is enforced here, on the server. The admin interface hides links
 * a user cannot follow, but that is cosmetic — a crafted request to a hidden
 * endpoint still gets a 403.
 */
const router = Router();
const authenticate = requireAuth(models);

/**
 * The path segments this router serves.
 *
 * The router is mounted at the root of the API namespace so resource paths stay
 * clean (`/api/v1/employees`), which means it would otherwise match *every*
 * unmatched request. Rather than mounting it per-prefix — that strips the prefix
 * before the sub-routes see it — the first path segment is checked here.
 *
 * Two things follow: an unknown path is a genuine 404 rather than a misleading
 * "authentication required", and a path outside this list never reaches any admin
 * handler regardless of session state.
 *
 * The list itself lives in @virallink/shared so the website's forwarding route
 * can enforce the identical set. It used to be duplicated there, and adding a
 * resource meant remembering both — a resource added to the API but not to the
 * proxy is a 404 from the browser with no server-side trace, which is a slow way
 * to find out.
 */
const ADMIN_PREFIXES = new Set(ADMIN_RESOURCE_PREFIXES);

router.use((request, _response, next) => {
  const [firstSegment = ''] = request.path.split('/').filter(Boolean);
  if (!ADMIN_PREFIXES.has(firstSegment)) return next('router');
  return next();
});

/**
 * Everything below requires a session.
 *
 * This single line is what guarantees no admin endpoint is reachable without
 * authentication. Any route declared above it would be unauthenticated, so none
 * are — the /public and /contact routers are mounted separately in routes/index.js.
 */
router.use(authenticate);

/* ================================================================== */
/* Dashboard                                                          */
/* ================================================================== */

router.get('/dashboard/summary', requirePermission('client.read'), async (request, response) => {
  const summary = await getDashboardSummary();
  response.json({ data: summary });
});

/* ================================================================== */
/* Company & settings                                                 */
/* ================================================================== */

router.get('/company', requirePermission('company.read'), async (request, response) => {
  const data = await admin.getCompany();
  response.json({ data });
});

router.put('/company', requirePermission('company.write'), v('updateCompany'), async (request, response) => {
  const company = await admin.updateCompany(request.body, request);
  response.json({ data: company });
});

router.put('/company/social-links', requirePermission('company.write'), v('updateSocialLinks'), async (request, response) => {
  const links = await admin.updateSocialLinks(request.body, request);
  response.json({ data: links });
});

/* ================================================================== */
/* Employees                                                          */
/* ================================================================== */

router.get('/employees', requirePermission('employee.read'), v('listEmployees'), async (request, response) => {
  const result = await admin.listEmployees(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/employees/:id', requirePermission('employee.read'), v('idParam'), async (request, response) => {
  const employee = await admin.getEmployee(idFrom(request));
  response.json({ data: employee });
});

router.post('/employees', requirePermission('employee.write'), v('upsertEmployee'), async (request, response) => {
  const employee = await admin.createEmployee(request.body, request);
  response.status(201).json({ data: employee });
});

router.put('/employees/:id', requirePermission('employee.write'), v('idParam'), v('upsertEmployee'), async (request, response) => {
  const employee = await admin.updateEmployee(idFrom(request), request.body, request);
  response.json({ data: employee });
});

router.delete('/employees/:id', requirePermission('employee.delete'), v('idParam'), async (request, response) => {
  const result = await admin.archiveEmployee(idFrom(request), request);
  response.json({ data: result });
});

router.post('/employees/reorder', requirePermission('employee.write'), v('reorderEmployees'), async (request, response) => {
  const result = await admin.reorderEmployees(request.body.items, request);
  response.json({ data: result });
});

/* ================================================================== */
/* Shareholders — confidential, no public counterpart                  */
/* ================================================================== */

router.get('/shareholders', requirePermission('shareholder.read'), v('listShareholders'), async (request, response) => {
  const result = await admin.listShareholders(query(request));
  response.json({ data: result.shareholders, meta: result.meta, totals: result.totals });
});

router.get('/shareholders/:id', requirePermission('shareholder.read'), v('idParam'), async (request, response) => {
  const shareholder = await admin.getShareholder(idFrom(request));
  response.json({ data: shareholder });
});

router.post('/shareholders', requirePermission('shareholder.write'), v('upsertShareholder'), async (request, response) => {
  const shareholder = await admin.createShareholder(request.body, request);
  response.status(201).json({ data: shareholder });
});

router.put('/shareholders/:id', requirePermission('shareholder.write'), v('idParam'), v('upsertShareholder'), async (request, response) => {
  const shareholder = await admin.updateShareholder(idFrom(request), request.body, request);
  response.json({ data: shareholder });
});

router.delete('/shareholders/:id', requirePermission('shareholder.delete'), v('idParam'), async (request, response) => {
  const result = await admin.archiveShareholder(idFrom(request), request);
  response.json({ data: result });
});

/* ================================================================== */
/* Clients                                                            */
/* ================================================================== */

router.get('/clients', requirePermission('client.read'), v('listClients'), async (request, response) => {
  const result = await admin.listClients(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/clients/:id', requirePermission('client.read'), v('idParam'), async (request, response) => {
  const client = await admin.getClient(idFrom(request));
  response.json({ data: client });
});

router.post('/clients', requirePermission('client.write'), v('upsertClient'), async (request, response) => {
  const client = await admin.createClient(request.body, request);
  response.status(201).json({ data: client });
});

router.put('/clients/:id', requirePermission('client.write'), v('idParam'), v('upsertClient'), async (request, response) => {
  const client = await admin.updateClient(idFrom(request), request.body, request);
  response.json({ data: client });
});

router.delete('/clients/:id', requirePermission('client.delete'), v('idParam'), async (request, response) => {
  const result = await admin.archiveClient(idFrom(request), request);
  response.json({ data: result });
});

router.post('/clients/:id/notes', requirePermission('client.write'), v('idParam'), v('clientNote'), async (request, response) => {
  const note = await admin.addClientNote(idFrom(request), request.body.body, request);
  response.status(201).json({ data: note });
});

router.post('/clients/:id/communications', requirePermission('client.write'), v('idParam'), v('clientCommunication'), async (request, response) => {
  const communication = await admin.addClientCommunication(idFrom(request), request.body, request);
  response.status(201).json({ data: communication });
});

/* ================================================================== */
/* Services                                                           */
/* ================================================================== */

router.get('/services', requirePermission('service.read'), v('listServices'), async (request, response) => {
  const result = await admin.listServicesAdmin(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/services/:id', requirePermission('service.read'), v('idParam'), async (request, response) => {
  const service = await admin.getService(idFrom(request));
  response.json({ data: service });
});

router.post('/services', requirePermission('service.write'), v('upsertService'), async (request, response) => {
  const service = await admin.createService(request.body, request);
  response.status(201).json({ data: service });
});

router.put('/services/:id', requirePermission('service.write'), v('idParam'), v('upsertService'), async (request, response) => {
  const service = await admin.updateService(idFrom(request), request.body, request);
  response.json({ data: service });
});

router.delete('/services/:id', requirePermission('service.delete'), v('idParam'), async (request, response) => {
  const result = await admin.deleteService(idFrom(request), request);
  response.json({ data: result });
});

router.post('/services/reorder', requirePermission('service.write'), v('reorderServices'), async (request, response) => {
  const result = await admin.reorderServices(request.body.items, request);
  response.json({ data: result });
});

/* ================================================================== */
/* Portfolio / projects                                               */
/* ================================================================== */

router.get('/portfolio', requirePermission('project.read'), v('listProjects'), async (request, response) => {
  const result = await admin.listProjectsAdmin(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/portfolio/:id', requirePermission('project.read'), v('idParam'), async (request, response) => {
  const project = await admin.getProject(idFrom(request));
  response.json({ data: project });
});

router.post('/portfolio', requirePermission('project.write'), v('upsertProject'), async (request, response) => {
  const project = await admin.createProject(request.body, request);
  response.status(201).json({ data: project });
});

router.put('/portfolio/:id', requirePermission('project.write'), v('idParam'), v('upsertProject'), async (request, response) => {
  const project = await admin.updateProject(idFrom(request), request.body, request);
  response.json({ data: project });
});

router.delete('/portfolio/:id', requirePermission('project.delete'), v('idParam'), async (request, response) => {
  const result = await admin.deleteProject(idFrom(request), request);
  response.json({ data: result });
});

router.post('/portfolio/reorder', requirePermission('project.write'), v('reorderProjects'), async (request, response) => {
  const result = await admin.reorderProjects(request.body.items, request);
  response.json({ data: result });
});

/* ================================================================== */
/* Blog                                                               */
/* ================================================================== */

router.get('/blog', requirePermission('blog.read'), v('listPosts'), async (request, response) => {
  const result = await admin.listPostsAdmin(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/blog/categories', requirePermission('blog.read'), async (request, response) => {
  const categories = await admin.listCategories();
  response.json({ data: categories });
});

router.get('/blog/tags', requirePermission('blog.read'), async (request, response) => {
  const tags = await admin.listTags();
  response.json({ data: tags });
});

router.post('/blog/categories', requirePermission('blog.write'), v('upsertTaxonomy'), async (request, response) => {
  const category = await admin.createCategory(request.body);
  response.status(201).json({ data: category });
});

router.post('/blog/tags', requirePermission('blog.write'), v('upsertTaxonomy'), async (request, response) => {
  const tag = await admin.createTag(request.body);
  response.status(201).json({ data: tag });
});

router.get('/blog/:id', requirePermission('blog.read'), v('idParam'), async (request, response) => {
  const post = await admin.getPost(idFrom(request));
  response.json({ data: post });
});

router.post('/blog', requirePermission('blog.write'), v('upsertPost'), async (request, response) => {
  const post = await admin.createPost(request.body, request);
  response.status(201).json({ data: post });
});

router.put('/blog/:id', requirePermission('blog.write'), v('idParam'), v('upsertPost'), async (request, response) => {
  const post = await admin.updatePost(idFrom(request), request.body, request);
  response.json({ data: post });
});

router.delete('/blog/:id', requirePermission('blog.delete'), v('idParam'), async (request, response) => {
  const result = await admin.deletePost(idFrom(request), request);
  response.json({ data: result });
});

/* ================================================================== */
/* Inquiries                                                          */
/* ================================================================== */

router.get('/inquiries', requirePermission('inquiry.read'), v('listInquiries'), async (request, response) => {
  const result = await admin.listInquiries(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/inquiries/:id', requirePermission('inquiry.read'), v('idParam'), async (request, response) => {
  const inquiry = await admin.getInquiry(idFrom(request));
  response.json({ data: inquiry });
});

router.put('/inquiries/:id', requirePermission('inquiry.write'), v('idParam'), v('updateInquiry'), async (request, response) => {
  const inquiry = await admin.updateInquiry(idFrom(request), request.body, request);
  response.json({ data: inquiry });
});

router.post('/inquiries/:id/archive', requirePermission('inquiry.write'), v('idParam'), async (request, response) => {
  const inquiry = await admin.archiveInquiry(idFrom(request), request);
  response.json({ data: inquiry });
});

/* ================================================================== */
/* Finance                                                            */
/* ================================================================== */

router.get('/finance/transactions', requirePermission('finance.read'), v('listTransactions'), async (request, response) => {
  const result = await admin.listTransactions(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.post('/finance/transactions', requirePermission('finance.write'), v('upsertTransaction'), async (request, response) => {
  const transaction = await admin.createTransaction(request.body, request);
  response.status(201).json({ data: transaction });
});

router.put('/finance/transactions/:id', requirePermission('finance.write'), v('idParam'), v('upsertTransaction'), async (request, response) => {
  const transaction = await admin.updateTransaction(idFrom(request), request.body, request);
  response.json({ data: transaction });
});

router.delete('/finance/transactions/:id', requirePermission('finance.delete'), v('idParam'), async (request, response) => {
  const result = await admin.deleteTransaction(idFrom(request), request);
  response.json({ data: result });
});

router.get('/finance/categories', requirePermission('finance.read'), async (request, response) => {
  const categories = await admin.listFinancialCategories({ type: request.query.type });
  response.json({ data: categories });
});

router.post('/finance/categories', requirePermission('finance.write'), v('upsertFinancialCategory'), async (request, response) => {
  const category = await admin.createFinancialCategory(request.body);
  response.status(201).json({ data: category });
});

router.get('/finance/invoices', requirePermission('finance.read'), v('listInvoices'), async (request, response) => {
  const result = await admin.listInvoices(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/finance/invoices/:id', requirePermission('finance.read'), v('idParam'), async (request, response) => {
  const invoice = await admin.getInvoice(idFrom(request));
  response.json({ data: invoice });
});

router.post('/finance/invoices', requirePermission('finance.write'), v('upsertInvoice'), async (request, response) => {
  const invoice = await admin.createInvoice(request.body, request);
  response.status(201).json({ data: invoice });
});

router.put('/finance/invoices/:id', requirePermission('finance.write'), v('idParam'), v('upsertInvoice'), async (request, response) => {
  const invoice = await admin.updateInvoice(idFrom(request), request.body, request);
  response.json({ data: invoice });
});

router.post('/finance/payments', requirePermission('finance.write'), v('upsertPayment'), async (request, response) => {
  const result = await admin.createPayment(request.body, request);
  response.status(201).json({ data: result });
});

router.delete('/finance/payments/:id', requirePermission('finance.delete'), v('idParam'), async (request, response) => {
  const result = await admin.deletePayment(idFrom(request), request);
  response.json({ data: result });
});

router.get('/finance/reports', requirePermission('finance.read'), v('financeReport'), async (request, response) => {
  const report = await getFinanceReport(query(request));
  response.json({ data: report });
});

/* ================================================================== */
/* Activity log                                                       */
/* ================================================================== */

/**
 * Filtering and searching happen in SQL with bound parameters. A user without
 * activity.read sees only their own entries, enforced here rather than trusted
 * to the query builder.
 */
router.get('/activity', requirePermission('activity.read'), v('listActivity'), async (request, response) => {
  const userId = request.user.permissions.includes('activity.read') ? request.query.userId : request.user.id;
  const result = await admin.listActivity({ ...query(request), userId });
  response.json({ data: result.rows, meta: result.meta });
});

/* ================================================================== */
/* Media                                                              */
/* ================================================================== */

router.get('/media', requirePermission('media.read'), v('listMedia'), async (request, response) => {
  const result = await admin.listMedia(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

/**
 * POST /api/v1/media
 *
 * Uploaded files are validated by multer (size, declared type) and then decoded
 * by sharp, which is the authoritative check that the file really is an image.
 */
router.post('/media', requirePermission('media.write'), upload.array('files', 10), async (request, response) => {
  const files = Array.isArray(request.files) ? request.files : [request.file].filter(Boolean);

  if (!files.length) {
    response.status(400).json({
      error: { code: 'NO_FILE', message: 'Choose at least one file to upload', requestId: request.id },
    });
    return;
  }

  const result = await storeImages(files, {
    folder: request.body?.folder || 'general',
    uploadedById: request.user.id,
    altText: request.body?.altText || null,
  });

  response.status(201).json({ data: result });
});

router.put('/media/:id', requirePermission('media.write'), v('idParam'), v('updateMedia'), async (request, response) => {
  const media = await admin.updateMedia(idFrom(request), request.body);
  response.json({ data: media });
});

router.delete('/media/:id', requirePermission('media.delete'), v('idParam'), async (request, response) => {
  const result = await deleteMedia(idFrom(request), request);
  response.json({ data: result });
});

/* ================================================================== */
/* Testimonials, statistics, careers, departments                     */
/* ================================================================== */

router.get('/testimonials', requirePermission('testimonial.write'), v('listTestimonials'), async (request, response) => {
  const result = await admin.listTestimonials(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.post('/testimonials', requirePermission('testimonial.write'), v('upsertTestimonial'), async (request, response) => {
  const testimonial = await admin.createTestimonial(request.body, request);
  response.status(201).json({ data: testimonial });
});

router.put('/testimonials/:id', requirePermission('testimonial.write'), v('idParam'), v('upsertTestimonial'), async (request, response) => {
  const testimonial = await admin.updateTestimonial(idFrom(request), request.body, request);
  response.json({ data: testimonial });
});

router.delete('/testimonials/:id', requirePermission('testimonial.write'), v('idParam'), async (request, response) => {
  const result = await admin.deleteTestimonial(idFrom(request), request);
  response.json({ data: result });
});

router.get('/stats', requirePermission('company.read'), v('listTestimonials'), async (request, response) => {
  const result = await admin.listStats(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.post('/stats', requirePermission('company.write'), v('upsertStat'), async (request, response) => {
  const stat = await admin.createStat(request.body, request);
  response.status(201).json({ data: stat });
});

router.put('/stats/:id', requirePermission('company.write'), v('idParam'), v('upsertStat'), async (request, response) => {
  const stat = await admin.updateStat(idFrom(request), request.body, request);
  response.json({ data: stat });
});

router.delete('/stats/:id', requirePermission('company.write'), v('idParam'), async (request, response) => {
  const result = await admin.deleteStat(idFrom(request), request);
  response.json({ data: result });
});

router.get('/jobs', requirePermission('job.write'), v('listJobs'), async (request, response) => {
  const result = await admin.listJobsAdmin(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.post('/jobs', requirePermission('job.write'), v('upsertJob'), async (request, response) => {
  const job = await admin.createJob(request.body, request);
  response.status(201).json({ data: job });
});

router.put('/jobs/:id', requirePermission('job.write'), v('idParam'), v('upsertJob'), async (request, response) => {
  const job = await admin.updateJob(idFrom(request), request.body, request);
  response.json({ data: job });
});

router.delete('/jobs/:id', requirePermission('job.write'), v('idParam'), async (request, response) => {
  const result = await admin.deleteJob(idFrom(request), request);
  response.json({ data: result });
});

router.get('/departments', requirePermission('employee.read'), async (request, response) => {
  const departments = await admin.listDepartmentsAdmin();
  response.json({ data: departments });
});

router.post('/departments', requirePermission('employee.write'), v('upsertDepartment'), async (request, response) => {
  const department = await admin.createDepartment(request.body);
  response.status(201).json({ data: department });
});

/* ================================================================== */
/* Publish toggle (generic)                                            */
/* ================================================================== */

/**
 * Resources whose rows can be published, and the permission that guards each.
 *
 * The admin's PublishToggle is a single button shared by every publishable list
 * page, and it has to work for whichever resource the page was configured with.
 * Rather than repeat a near-identical route per resource, they are declared here
 * and mounted below.
 *
 * Why this exists at all: the toggle sends only `{ isPublished }`, but each
 * resource's own `PUT /:id` runs the *full* upsert validator — title, slug,
 * content and the rest. A partial payload fails that with a 422, so publishing
 * silently did nothing on every content type. This endpoint validates only the
 * one field it changes.
 *
 * `publishedAt` is stamped alongside the flag on the way in and cleared on the
 * way out, so the public site can order by publication date without a second
 * pass, and unpublishing does not leave a stale date behind.
 */
const PUBLISHABLE = {
  blog: { model: 'BlogPost', permission: 'blog.write', publishedField: 'status' },
  services: { model: 'Service', permission: 'service.write' },
  portfolio: { model: 'Project', permission: 'project.write' },
  testimonials: { model: 'Testimonial', permission: 'testimonial.write' },
  jobs: { model: 'Job', permission: 'job.write' },
};

for (const [resource, config] of Object.entries(PUBLISHABLE)) {
  router.put(
    `/${resource}/:id/publish`,
    requirePermission(config.permission),
    v('idParam'),
    async (request, response) => {
      const record = await models[config.model].findByPk(idFrom(request));
      if (!record) throw AppError.notFound('That record no longer exists');

      const shouldPublish = Boolean(request.body?.isPublished);

      // A blog post is public by having a published status rather than a boolean,
      // so the two are kept distinct rather than overloading one column.
      if (config.publishedField === 'status') {
        record.status = shouldPublish ? 'published' : 'draft';
        record.publishedAt = shouldPublish ? new Date() : null;
      } else {
        record.isPublished = shouldPublish;
      }

      await record.save();

      response.json({
        data: { id: record.id, isPublished: shouldPublish },
      });
    },
  );
}

/* ================================================================== */
/* Users and roles                                                     */
/* ================================================================== */

router.get('/users', requirePermission('user.read'), v('listUsers'), async (request, response) => {
  const result = await userService.listUsers(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.post('/users', requirePermission('user.write'), v('createUser'), async (request, response) => {
  const user = await userService.createUser(request.body, request);
  response.status(201).json({ data: user });
});

router.put('/users/:id', requirePermission('user.write'), v('idParam'), v('updateUser'), async (request, response) => {
  const user = await userService.updateUser(idFrom(request), request.body, request);
  response.json({ data: user });
});

router.delete('/users/:id', requirePermission('user.write'), v('idParam'), async (request, response) => {
  const result = await userService.deleteUser(idFrom(request), request);
  response.json({ data: result });
});

/**
 * Role permissions are read-only here. The four system roles and their grants are
 * seeded and referenced by name in code (RBAC tests, the admin nav), so editing
 * them from the UI would let a change silently disable an endpoint nobody was
 * looking at. Grants are changed in the seeder, where the diff is reviewable.
 */
router.get('/roles', requirePermission('role.read'), async (_request, response) => {
  const roles = await userService.listRoles();
  response.json({ data: roles });
});

/* ================================================================== */
/* Tasks (internal)                                                     */
/* ================================================================== */

router.get('/tasks', requirePermission('task.read'), v('listTasks'), async (request, response) => {
  const result = await taskService.listTasks(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.get('/tasks/summary', requirePermission('task.read'), async (_request, response) => {
  response.json({ data: await taskService.taskSummary() });
});

/*
 * The signed-in person's own tasks — the "My tasks" view.
 *
 * Deliberately gated on authentication alone rather than requirePermission:
 * it returns only data about the caller (resolved from the employee link on
 * their session), so it is the task equivalent of /auth/me. Every seeded role
 * holds task.read anyway, and a future read-only role should still be able to
 * see its own work.
 *
 * Declared BEFORE GET /tasks/:id on purpose — otherwise "mine" is captured as
 * an :id and rejected by the idParam validator with a 422.
 */
router.get('/tasks/mine', async (request, response) => {
  response.json({ data: await taskService.myTasks(request.user) });
});

router.get('/tasks/:id', requirePermission('task.read'), v('idParam'), async (request, response) => {
  response.json({ data: await taskService.getTask(idFrom(request)) });
});

router.post('/tasks', requirePermission('task.write'), v('upsertTask'), async (request, response) => {
  const task = await taskService.createTask(request.body);
  response.status(201).json({ data: task });
});

router.put('/tasks/:id', requirePermission('task.write'), v('idParam'), v('updateTask'), async (request, response) => {
  const task = await taskService.updateTask(idFrom(request), request.body);
  response.json({ data: task });
});

router.delete('/tasks/:id', requirePermission('task.delete'), v('idParam'), async (request, response) => {
  response.json({ data: await taskService.deleteTask(idFrom(request)) });
});

/* ================================================================== */
/* Client reporting — deliverables and monthly metrics                 */
/* ================================================================== */

/*
 * Gated on the client permissions rather than a new reporting permission set.
 * A deliverable *is* client data: it names a client's work and how it performed.
 * Adding report.* would only create a second way to grant access to the same
 * information, and the two could drift apart.
 */
router.get('/deliverables', requirePermission('client.read'), v('listDeliverables'), async (request, response) => {
  const result = await reportService.listDeliverables(query(request));
  response.json({ data: result.rows, meta: result.meta });
});

router.post('/deliverables', requirePermission('client.write'), v('upsertDeliverable'), async (request, response) => {
  const deliverable = await reportService.createDeliverable(request.body);
  response.status(201).json({ data: deliverable });
});

router.put('/deliverables/:id', requirePermission('client.write'), v('idParam'), v('updateDeliverable'), async (request, response) => {
  const deliverable = await reportService.updateDeliverable(idFrom(request), request.body);
  response.json({ data: deliverable });
});

router.delete('/deliverables/:id', requirePermission('client.write'), v('idParam'), async (request, response) => {
  response.json({ data: await reportService.deleteDeliverable(idFrom(request)) });
});

/**
 * POST /api/v1/deliverables/metrics
 *
 * An upsert rather than a create. Staff correcting last month's figure should not
 * be told the row already exists, and two people entering the same month must not
 * create two rows that the report would then add together.
 */
router.post('/deliverables/metrics', requirePermission('client.write'), v('upsertMetric'), async (request, response) => {
  const metric = await reportService.upsertMetric(request.body, request);
  response.status(metric.updated ? 200 : 201).json({ data: metric });
});

router.delete('/deliverables/metrics/:id', requirePermission('client.write'), v('idParam'), async (request, response) => {
  response.json({ data: await reportService.deleteMetric(idFrom(request)) });
});

/**
 * GET /api/v1/clients/:id/report?month=YYYY-MM&months=6
 *
 * One call rather than four. The headline, the trend, the platform split and the
 * top performers all derive from the same two tables, so fetching them separately
 * would mean four round trips and four chances for the figures to disagree.
 */
router.get('/clients/:id/report', requirePermission('client.read'), v('report'), async (request, response) => {
  const report = await reportService.buildClientReport(idFrom(request), query(request));
  response.json({ data: report });
});

router.get('/clients/:id/totals', requirePermission('client.read'), v('idParam'), async (request, response) => {
  response.json({ data: await reportService.clientTotals(idFrom(request)) });
});

/* ================================================================== */
/* Content production pipeline                                          */
/* ================================================================== */

/*
 * Gated on content.* rather than client.*. Running the board is day-to-day
 * production work; a content editor needs to move cards without also being able to
 * edit a client's contract value. They are different powers and conflating them
 * means either over-granting or a production team that cannot work.
 */
router.get('/content/board', requirePermission('content.read'), async (request, response) => {
  const board = await pipelineService.getBoard({
    clientId: request.query.clientId ? Number(request.query.clientId) : undefined,
    includePosted: request.query.includePosted === 'true',
  });
  response.json({ data: board });
});

router.get('/content/cycle-time', requirePermission('content.read'), async (request, response) => {
  const cycle = await pipelineService.getCycleTime({
    clientId: request.query.clientId ? Number(request.query.clientId) : undefined,
  });
  response.json({ data: cycle });
});

router.get('/content/weekly', requirePermission('content.read'), v('weeklyReport'), async (request, response) => {
  const report = await pipelineService.getWeeklyReport(query(request));
  response.json({ data: report });
});

router.put('/content/:id', requirePermission('content.write'), v('idParam'), v('updateContentItem'), async (request, response) => {
  const item = await pipelineService.updateItem(idFrom(request), request.body);
  response.json({ data: item });
});

/** Moves a card and records the move. Separate from the field update above. */
router.post('/content/:id/stage', requirePermission('content.write'), v('idParam'), v('moveStage'), async (request, response) => {
  const item = await pipelineService.moveStage(idFrom(request), request.body, request);
  response.json({ data: item });
});

router.get('/content/:id/history', requirePermission('content.read'), v('idParam'), async (request, response) => {
  response.json({ data: await pipelineService.getStageHistory(idFrom(request)) });
});

/* ---- Proposals, upstream of the pipeline ---------------------------- */

router.get('/proposals', requirePermission('content.read'), async (request, response) => {
  const proposals = await pipelineService.listProposals({
    clientId: request.query.clientId ? Number(request.query.clientId) : undefined,
    status: request.query.status,
  });
  response.json({ data: proposals });
});

router.get('/proposals/summary', requirePermission('content.read'), async (_request, response) => {
  response.json({ data: await pipelineService.proposalSummary() });
});

router.post('/proposals', requirePermission('content.write'), v('upsertProposal'), async (request, response) => {
  const proposal = await pipelineService.createProposal(request.body);
  response.status(201).json({ data: proposal });
});

router.put('/proposals/:id', requirePermission('content.write'), v('idParam'), v('updateProposal'), async (request, response) => {
  const proposal = await pipelineService.updateProposal(idFrom(request), request.body);
  response.json({ data: proposal });
});

router.delete('/proposals/:id', requirePermission('content.write'), v('idParam'), async (request, response) => {
  response.json({ data: await pipelineService.deleteProposal(idFrom(request)) });
});

export default router;