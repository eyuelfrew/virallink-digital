import { Router } from 'express';
import { models } from '../../models/index.js';
import { idFrom, query, v } from '../../middleware/schemas.js';
import { requireAuth } from '../../services/token.service.js';
import { requirePermission } from '../../middleware/rbac.js';
import * as admin from '../../services/admin.service.js';
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
 */
const ADMIN_PREFIXES = new Set([
  'dashboard', 'company', 'employees', 'shareholders', 'clients', 'services',
  'portfolio', 'blog', 'inquiries', 'finance', 'activity', 'media',
  'testimonials', 'stats', 'jobs', 'departments', 'users',
]);

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

export default router;