import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import modelDefinitions from './definitions.js';

/**
 * Model registry.
 *
 * Each model is instantiated from its definition here, so `definitions.js` stays
 * a pure description and this file owns the Sequelize instance plus the
 * association graph.
 */

/**
 * Map declared index fields (model attribute names) to physical column names.
 *
 * Sequelize passes model-level index definitions to MySQL without translating
 * them, so an index declared on `isActive` is looked up as a literal column
 * named "isActive" and fails with "Key column doesn't exist". Columns are created
 * as `is_active` because of `underscored: true`, so the index has to say the same
 * thing.
 */
function toColumnNames(definition) {
  // createdAt/updatedAt/deletedAt are injected by the registry rather than
  // declared in `fields`, so they must be added to the map explicitly for any
  // index that references them.
  const attributeNames = [
    ...Object.keys(definition.fields),
    'createdAt',
    'updatedAt',
    ...(definition.paranoid === true ? ['deletedAt'] : []),
  ];
  const attributeToColumn = new Map(
    attributeNames.map((name) => [name, name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]),
  );
  return (fields) => fields.map((field) => attributeToColumn.get(field) || field);
}

export const models = {};

for (const [name, definition] of Object.entries(modelDefinitions)) {
  const { fields, options = {} } = definition;
  const toColumns = toColumnNames(definition);

  // `paranoid` is declared as a sibling of `options` in definitions.js, not
  // inside it. Reading options.paranoid silently disabled soft deletion on every
  // model, so deletes were hard and archive/filter queries could not work.
  const paranoid = definition.paranoid === true;

  models[name] = sequelize.define(
    name,
    {
      ...fields,
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // Only paranoid models carry deleted_at.
      ...(paranoid ? { deletedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null } } : {}),
    },
    {
      tableName: definition.tableName,
      underscored: true,
      freezeTableName: false,
      timestamps: true,
      paranoid,
      indexes: (options.indexes || []).map((index) => ({ ...index, fields: toColumns(index.fields) })),
    },
  );
}

const {
  Permission,
  Role,
  User,
  RefreshToken,
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
  Media,
  Service,
  Project,
  ProjectImage,
  Technology,
  ProjectTechnology,
  Job,
  Task,
  ContentDeliverable,
  ContentMetric,
  ContentStageEvent,
  ClientProposal,
  FinancialCategory,
  FinancialTransaction,
  Invoice,
  InvoiceItem,
  Payment,
  BlogCategory,
  BlogTag,
  BlogPost,
  BlogPostCategory,
  BlogPostTag,
  ContactInquiry,
  ActivityLog,
} = models;

/* -------------------------------------------------------------------------- */
/* Access control                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Many-to-many through tables.
 *
 * `timestamps: false` is essential here. Sequelize's default for a through
 * model is to add created_at/updated_at, but the migrations create these join
 * tables with only `created_at`. Without this flag every query fails with
 * "Unknown column '<association>.updated_at'".
 */
/**
 * Join-table models.
 *
 * These must be explicit models rather than inline `{ tableName }` through
 * configs. With only a table name Sequelize builds an implicit through model with
 * no attributes, and the association then fails on `rawAttributes.permissionId`.
 *
 * The tables carry `created_at` but no `updated_at`, so `timestamps` is false —
 * otherwise Sequelize selects an `updated_at` column that does not exist.
 */
function defineJoinModel(name, tableName, foreignKeys) {
  return sequelize.define(
    name,
    {
      ...Object.fromEntries(foreignKeys.map((key) => [key, { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }])),
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName, timestamps: false, underscored: true, freezeTableName: true },
  );
}

models.RolePermission = defineJoinModel('RolePermission', 'role_permissions', ['roleId', 'permissionId']);
models.UserRole = defineJoinModel('UserRole', 'user_roles', ['userId', 'roleId']);
models.BlogPostCategory = defineJoinModel('BlogPostCategory', 'blog_post_categories', ['postId', 'categoryId']);
models.BlogPostTag = defineJoinModel('BlogPostTag', 'blog_post_tags', ['postId', 'tagId']);
models.ProjectTechnologyThrough = defineJoinModel('ProjectTechnologyThrough', 'project_technologies', ['projectId', 'technologyId']);

const rolePermissionsThrough = { through: models.RolePermission };
const userRolesThrough = { through: models.UserRole };
const postCategoriesThrough = { through: models.BlogPostCategory };
const postTagsThrough = { through: models.BlogPostTag };
const projectTechnologiesThrough = { through: models.ProjectTechnologyThrough };

// A role grants many permissions; a permission can belong to many roles.
Permission.belongsToMany(Role, { ...rolePermissionsThrough, as: 'roles', foreignKey: 'permissionId' });
Role.belongsToMany(Permission, { ...rolePermissionsThrough, as: 'permissions', foreignKey: 'roleId' });

// A user may hold multiple roles (e.g. admin + finance).
User.belongsToMany(Role, { ...userRolesThrough, as: 'roles', foreignKey: 'userId' });
Role.belongsToMany(User, { ...userRolesThrough, as: 'users', foreignKey: 'roleId' });

RefreshToken.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(RefreshToken, { as: 'refreshTokens', foreignKey: 'userId' });

/* -------------------------------------------------------------------------- */
/* Company & branding                                                         */
/* -------------------------------------------------------------------------- */

// Company → social links and statistics.
// The company table is a singleton, so `companies` has no self-referencing
// association of its own.
Company.hasMany(SocialLink, { as: 'socialLinks', foreignKey: 'companyId' });
SocialLink.belongsTo(Company, { as: 'company', foreignKey: 'companyId' });

Company.hasMany(CompanyStat, { as: 'stats', foreignKey: 'companyId' });
CompanyStat.belongsTo(Company, { as: 'company', foreignKey: 'companyId' });

Company.belongsTo(Media, { as: 'logo', foreignKey: 'logoMediaId' });
Company.belongsTo(Media, { as: 'favicon', foreignKey: 'faviconMediaId' });

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

Department.hasMany(Employee, { as: 'employees', foreignKey: 'departmentId' });
Employee.belongsTo(Department, { as: 'department', foreignKey: 'departmentId' });
Employee.belongsTo(Media, { as: 'photo', foreignKey: 'photoMediaId' });

// Holdings structure: a shareholder may itself hold shares in the company.
Shareholder.belongsTo(Shareholder, { as: 'parent', foreignKey: 'parentId' });
Shareholder.hasMany(Shareholder, { as: 'subsidiaries', foreignKey: 'parentId' });

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

Client.belongsTo(Media, { as: 'logo', foreignKey: 'logoMediaId' });
Client.hasMany(ClientNote, { as: 'clientNotes', foreignKey: 'clientId', onDelete: 'CASCADE' });
ClientNote.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });
ClientNote.belongsTo(User, { as: 'author', foreignKey: 'userId' });

Client.hasMany(ClientCommunication, { as: 'communications', foreignKey: 'clientId', onDelete: 'CASCADE' });
ClientCommunication.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });
ClientCommunication.belongsTo(User, { as: 'author', foreignKey: 'userId' });

Testimonial.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });
Client.hasMany(Testimonial, { as: 'testimonials', foreignKey: 'clientId' });
Testimonial.belongsTo(Media, { as: 'authorPhoto', foreignKey: 'authorPhotoMediaId' });

/* -------------------------------------------------------------------------- */
/* Services & projects                                                        */
/* -------------------------------------------------------------------------- */

Service.belongsTo(Service, { as: 'parent', foreignKey: 'parentId' });
Service.hasMany(Service, { as: 'children', foreignKey: 'parentId' });
Service.belongsTo(Media, { as: 'image', foreignKey: 'imageMediaId' });

Client.hasMany(Project, { as: 'projects', foreignKey: 'clientId' });
Project.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });

Service.hasMany(Project, { as: 'projects', foreignKey: 'serviceId' });
Project.belongsTo(Service, { as: 'service', foreignKey: 'serviceId' });

Project.belongsTo(Media, { as: 'cover', foreignKey: 'coverMediaId' });
Project.hasMany(ProjectImage, { as: 'images', foreignKey: 'projectId', onDelete: 'CASCADE' });
ProjectImage.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
ProjectImage.belongsTo(Media, { as: 'media', foreignKey: 'mediaId' });

Project.belongsToMany(Technology, {
  ...projectTechnologiesThrough,
  as: 'techStack',
  foreignKey: 'projectId',
  otherKey: 'technologyId',
});
Technology.belongsToMany(Project, {
  ...projectTechnologiesThrough,
  as: 'projects',
  foreignKey: 'technologyId',
  otherKey: 'projectId',
});

/**
 * The join table is queryable directly (to replace a project's tech list without
 * touching the project row), so it needs its own associations to both sides.
 *
 * These are declared on the *registered* through model, not on a separately
 * named `ProjectTechnology` model — the two are different objects, and an
 * include declared against the wrong one throws "X is not associated to Y".
 */
models.ProjectTechnologyThrough.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
models.ProjectTechnologyThrough.belongsTo(Technology, { as: 'technology', foreignKey: 'technologyId' });

// Reverse side, so the tech list can be read in one include with the project.
Project.hasMany(models.ProjectTechnologyThrough, { as: 'techRows', foreignKey: 'projectId' });

// Readable aliases so the rest of the codebase can refer to the join table by its
// table name without redefining it.
Object.defineProperty(models, 'ProjectTechnology', {
  get: () => models.ProjectTechnologyThrough,
  configurable: true,
});

Job.belongsTo(Department, { as: 'department', foreignKey: 'departmentId' });
Department.hasMany(Job, { as: 'jobs', foreignKey: 'departmentId' });

/* -------------------------------------------------------------------------- */
/* Tasks                                                                       */
/* -------------------------------------------------------------------------- */

/*
 * The optional links are resolved as associations for display, but nothing
 * cascades: deleting a client or project must not remove the tasks that mention
 * it. `onDelete: 'SET NULL'` keeps the join clean while the task text survives.
 */
Task.belongsTo(Employee, { as: 'assignee', foreignKey: 'assigneeId' });
Task.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });
Task.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });

Employee.hasMany(Task, { as: 'tasks', foreignKey: 'assigneeId' });
Client.hasMany(Task, { as: 'tasks', foreignKey: 'clientId' });
Project.hasMany(Task, { as: 'tasks', foreignKey: 'projectId' });

/* -------------------------------------------------------------------------- */
/* Client reporting                                                            */
/* -------------------------------------------------------------------------- */

/*
 * A deliverable belongs to a client and cannot outlive one, so this cascades.
 * Metrics hang off a deliverable and cascade with it: deleting the video should
 * take its view counts with it rather than orphaning rows nothing will ever read.
 */
Client.hasMany(ContentDeliverable, { as: 'deliverables', foreignKey: 'clientId' });
ContentDeliverable.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });

ContentDeliverable.hasMany(ContentMetric, { as: 'metrics', foreignKey: 'deliverableId' });
ContentMetric.belongsTo(ContentDeliverable, { as: 'deliverable', foreignKey: 'deliverableId' });

/*
 * Stage history cascades: deleting a piece of content discards its movement log
 * with it. That is the one place a cascade is right here, because an orphaned
 * event row would never be read again and would quietly distort cycle-time
 * figures for every future report.
 */
ContentDeliverable.hasMany(ContentStageEvent, { as: 'stageEvents', foreignKey: 'deliverableId' });
ContentStageEvent.belongsTo(ContentDeliverable, { as: 'deliverable', foreignKey: 'deliverableId' });
ContentStageEvent.belongsTo(User, { as: 'actor', foreignKey: 'userId' });

/* The assignee is a person, not a client record, so this points at Employee. */
ContentDeliverable.belongsTo(Employee, { as: 'assignee', foreignKey: 'assigneeId' });
Employee.hasMany(ContentDeliverable, { as: 'contentItems', foreignKey: 'assigneeId' });

/* Proposals sit upstream of the pipeline rather than inside it. */
Client.hasMany(ClientProposal, { as: 'proposals', foreignKey: 'clientId' });
ClientProposal.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

FinancialCategory.hasMany(FinancialTransaction, { as: 'transactions', foreignKey: 'categoryId' });
FinancialTransaction.belongsTo(FinancialCategory, { as: 'category', foreignKey: 'categoryId' });
FinancialTransaction.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });
FinancialTransaction.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });
FinancialTransaction.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById' });

Client.hasMany(Invoice, { as: 'invoices', foreignKey: 'clientId' });
Invoice.belongsTo(Client, { as: 'client', foreignKey: 'clientId' });
Invoice.belongsTo(Project, { as: 'project', foreignKey: 'projectId' });

Invoice.hasMany(InvoiceItem, { as: 'items', foreignKey: 'invoiceId', onDelete: 'CASCADE', hooks: true });
InvoiceItem.belongsTo(Invoice, { as: 'invoice', foreignKey: 'invoiceId' });

Invoice.hasMany(Payment, { as: 'payments', foreignKey: 'invoiceId', onDelete: 'CASCADE' });
Payment.belongsTo(Invoice, { as: 'invoice', foreignKey: 'invoiceId' });

/* -------------------------------------------------------------------------- */
/* Blog                                                                       */
/* -------------------------------------------------------------------------- */

BlogPost.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
User.hasMany(BlogPost, { as: 'posts', foreignKey: 'authorId' });
BlogPost.belongsTo(Media, { as: 'featuredImage', foreignKey: 'featuredMediaId' });

BlogPost.belongsToMany(BlogCategory, {
  ...postCategoriesThrough,
  as: 'categories',
  foreignKey: 'postId',
  otherKey: 'categoryId',
});
BlogCategory.belongsToMany(BlogPost, {
  ...postCategoriesThrough,
  as: 'posts',
  foreignKey: 'categoryId',
  otherKey: 'postId',
});

BlogPost.belongsToMany(BlogTag, {
  ...postTagsThrough,
  as: 'tags',
  foreignKey: 'postId',
  otherKey: 'tagId',
});
BlogTag.belongsToMany(BlogPost, {
  ...postTagsThrough,
  as: 'posts',
  foreignKey: 'tagId',
  otherKey: 'postId',
});

/* -------------------------------------------------------------------------- */
/* Leads & audit                                                              */
/* -------------------------------------------------------------------------- */

ContactInquiry.belongsTo(Service, { as: 'service', foreignKey: 'serviceId' });
Service.hasMany(ContactInquiry, { as: 'inquiries', foreignKey: 'serviceId' });
ContactInquiry.belongsTo(User, { as: 'assignedTo', foreignKey: 'assignedToId' });
User.hasMany(ContactInquiry, { as: 'assignedInquiries', foreignKey: 'assignedToId' });

ActivityLog.belongsTo(User, { as: 'user', foreignKey: 'userId' });

/**
 * Eager-load allowlists.
 *
 * Anything reachable from a public route must be listed here explicitly. A
 * developer adding `include` outside these sets gets nothing, which is the
 * point: public inclusion has to be a deliberate act.
 */
export const PUBLIC_INCLUDES = Object.freeze({
  service: ['image'],
  project: ['client', 'service', 'cover', 'images', 'techStack'],
  projectCard: ['client', 'service', 'cover'],
  employee: ['department', 'photo'],
  clientLogo: ['logo'],
  testimonial: ['authorPhoto', 'client'],
  blogPost: ['author', 'featuredImage', 'categories', 'tags'],
  company: ['socialLinks', 'logo', 'favicon'],
  job: ['department'],
});

export default models;