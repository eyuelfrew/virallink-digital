/**
 * Model definitions.
 *
 * A declarative description of every table: columns, indexes, and whether the
 * model is soft-deleted. This file is pure data — it imports nothing from the
 * rest of the application and touches no database connection.
 *
 * The registry in `index.js` turns each entry into a live Sequelize model.
 * Keeping the two apart means a definition can be read, reviewed or diffed
 * without following the association graph.
 */

import { DataTypes } from 'sequelize';
import {
  ROLES,
  CLIENT_STATUS,
  CLIENT_SOURCE,
  PROJECT_STATUS,
  INQUIRY_STATUS,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  PAYMENT_METHOD,
  INVOICE_STATUS,
  EMPLOYMENT_STATUS,
  SHAREHOLDER_STATUS,
  SHARE_CLASS,
  ACTIVITY_ACTION,
  MEDIA_KIND,
  TASK_STATUS,
  TASK_PRIORITY,
  DELIVERABLE_TYPE,
  METRIC_PLATFORM,
  METRIC_SOURCE,
  CONTENT_STAGE,
  PROPOSAL_STATUS,
  valuesOf,
} from '../shared/enums.js';

/** Column factories, so each entry below stays readable. */
const pk = () => ({ type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true });

/**
 * Monetary column.
 *
 * DECIMAL(14,2) — never a float, never an integer count of currency units.
 * Sequelize returns these as strings; the service layer converts to integer
 * cents before doing any arithmetic.
 */
const money = () => ({ type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 });

const booleanDefault = (defaultValue) => ({ type: DataTypes.BOOLEAN, allowNull: false, defaultValue });

const orderIndex = () => ({ type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });

const shortText = () => ({ type: DataTypes.STRING(191), allowNull: true, defaultValue: null });

const longText = () => ({ type: DataTypes.TEXT, allowNull: true, defaultValue: null });

const optionalDate = (type = DataTypes.DATE) => ({ type, allowNull: true, defaultValue: null });

/**
 * The definition map.
 *
 * `options.indexes` lists compound and single-column indexes. Field names are
 * model attribute names (camelCase); the registry converts them to column names,
 * because Sequelize passes model-level index definitions to MySQL untranslated.
 *
 * `paranoid: true` adds soft deletion via a deleted_at column. It is declared as a
 * sibling of `options`, not inside it — the registry reads it from here.
 */
export const definitions = {
  /* ================================================================== */
  /* Identity and access control                                          */
  /* ================================================================== */

  Permission: {
    tableName: 'permissions',
    fields: {
      id: pk(),
      /** Permission keys are the contract between the shared RBAC map and the API middleware. */
      key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      description: shortText(),
      group: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'general' },
    },
    options: { indexes: [{ fields: ['group'] }] },
  },

  Role: {
    tableName: 'roles',
    fields: {
      id: pk(),
      key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: shortText(),
      /** System roles are seeded and referenced in code, so they are not editable. */
      isSystem: booleanDefault(false),
    },
  },

  User: {
    tableName: 'users',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      /** bcrypt digest only. Plaintext passwords are never persisted. */
      passwordHash: { type: DataTypes.STRING(120), allowNull: false },
      isActive: booleanDefault(true),
      lastLoginAt: optionalDate(),
      /**
       * Incremented on a password change. Access tokens carry the value they were
       * issued with, so older ones stop validating immediately.
       */
      tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lockedUntil: optionalDate(),
      passwordChangedAt: optionalDate(),
      /**
       * The employee record this account signs in as — the bridge between
       * "who may sign in" and "who tasks are assigned to". Nullable:
       * administrators need no employee record. Deleted employees unlink
       * themselves (FK ON DELETE SET NULL) rather than taking the account with them.
       */
      employeeId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /**
       * Role for granular permissions. Null for SUPER_ADMIN/ADMIN who have all permissions.
       * When set, this role determines the user's capabilities alongside the role's permissions.
       */
      role: { type: DataTypes.STRING(60), allowNull: true, defaultValue: null },
    },
    options: {
      indexes: [{ fields: ['email'] }, { fields: ['isActive'] }, { fields: ['employeeId'] }],
    },
    paranoid: true,
  },

  /**
   * Refresh tokens, persisted so a session can be revoked server-side.
   * cPanel has no shared session store, so this table is what makes "log out",
   * "log out everywhere" and "invalidated by a password change" work.
   */
  RefreshToken: {
    tableName: 'refresh_tokens',
    fields: {
      id: pk(),
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      /** The jti claim of the refresh JWT, so one token cannot be replayed. */
      tokenId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: optionalDate(),
      userAgent: shortText(),
      ip: shortText(),
    },
    options: {
      indexes: [{ fields: ['userId'] }, { fields: ['tokenId'] }, { fields: ['expiresAt'] }],
    },
  },

  /* ================================================================== */
  /* Company profile and branding                                        */
  /* ================================================================== */

  Company: {
    // Singleton: one row holds the company profile.
    tableName: 'companies',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(191), allowNull: false },
      legalName: shortText(),
      shortDescription: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      description: longText(),
      mission: longText(),
      vision: longText(),
      values: longText(),
      foundedDate: optionalDate(DataTypes.DATEONLY),
      /** Business registration details support Organization/LocalBusiness schema. */
      registrationNumber: shortText(),
      taxIdentifier: shortText(),
      addressLine1: shortText(),
      addressLine2: shortText(),
      city: shortText(),
      region: shortText(),
      country: shortText(),
      postalCode: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
      latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true, defaultValue: null },
      longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true, defaultValue: null },
      phone: { type: DataTypes.STRING(60), allowNull: true, defaultValue: null },
      secondaryPhone: shortText(),
      email: { type: DataTypes.STRING(191), allowNull: true, defaultValue: null },
      website: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
      logoMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      faviconMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      openingHours: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      metaTitle: shortText(),
      metaDescription: { type: DataTypes.STRING(400), allowNull: true, defaultValue: null },
    },
    options: { indexes: [{ fields: ['name'] }] },
  },

  SocialLink: {
    tableName: 'social_links',
    fields: {
      id: pk(),
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      platform: { type: DataTypes.STRING(60), allowNull: false },
      label: shortText(),
      url: { type: DataTypes.STRING(255), allowNull: false },
      displayOrder: orderIndex(),
    },
    options: { indexes: [{ fields: ['companyId', 'displayOrder'] }] },
    paranoid: true,
  },

  /**
   * Administrator-managed figures.
   * Nothing appears on the homepage until explicitly published, which is what
   * prevents invented statistics from ever reaching a visitor.
   */
  CompanyStat: {
    tableName: 'company_stats',
    fields: {
      id: pk(),
      companyId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: false },
      value: { type: DataTypes.STRING(60), allowNull: false },
      description: { type: DataTypes.STRING(300), allowNull: true, defaultValue: null },
      icon: shortText(),
      displayOrder: orderIndex(),
      isPublished: booleanDefault(false),
    },
    options: { indexes: [{ fields: ['companyId', 'isPublished', 'displayOrder'] }] },
  },

  Testimonial: {
    tableName: 'testimonials',
    fields: {
      id: pk(),
      authorName: { type: DataTypes.STRING(160), allowNull: false },
      authorPosition: shortText(),
      authorCompany: shortText(),
      authorPhotoMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      body: { type: DataTypes.TEXT, allowNull: false },
      rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true, defaultValue: null },
      isPublished: booleanDefault(false),
      displayOrder: orderIndex(),
    },
    options: { indexes: [{ fields: ['isPublished', 'displayOrder'] }] },
    paranoid: true,
  },

  /* ================================================================== */
  /* People                                                              */
  /* ================================================================== */

  Department: {
    tableName: 'departments',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      displayOrder: orderIndex(),
    },
  },

  Employee: {
    tableName: 'employees',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(160), allowNull: false },
      position: shortText(),
      departmentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      biography: longText(),
      photoMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /**
       * Admin-only columns. The public serialiser uses an allowlist that excludes
       * these three, so staff contact details never reach the website.
       */
      email: { type: DataTypes.STRING(191), allowNull: true, defaultValue: null },
      phone: { type: DataTypes.STRING(60), allowNull: true, defaultValue: null },
      linkedinUrl: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
      employmentStatus: {
        type: DataTypes.ENUM(...valuesOf(EMPLOYMENT_STATUS)),
        allowNull: false,
        defaultValue: EMPLOYMENT_STATUS.ACTIVE,
      },
      joinedAt: optionalDate(DataTypes.DATEONLY),
      displayOrder: orderIndex(),
      /** An employee is hidden from the website until an administrator opts them in. */
      isPublic: booleanDefault(false),
    },
    options: {
      indexes: [{ fields: ['isPublic', 'displayOrder'] }, { fields: ['employmentStatus'] }],
    },
    paranoid: true,
  },

  /**
   * Shareholders.
   *
   * Confidential by design: there is no public API endpoint for this model at
   * all, and the website never queries it. Ownership data exists only for
   * SUPER_ADMIN and FINANCE roles.
   */
  Shareholder: {
    tableName: 'shareholders',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(160), allowNull: false },
      shareClass: {
        type: DataTypes.ENUM(...valuesOf(SHARE_CLASS)),
        allowNull: false,
        defaultValue: SHARE_CLASS.ORDINARY,
      },
      shareCount: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      ownershipPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      joinedAt: optionalDate(DataTypes.DATEONLY),
      status: {
        type: DataTypes.ENUM(...valuesOf(SHAREHOLDER_STATUS)),
        allowNull: false,
        defaultValue: SHAREHOLDER_STATUS.ACTIVE,
      },
      notes: longText(),
      /** Self-reference, so a holding entity can appear as a shareholder. */
      parentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    },
    options: { indexes: [{ fields: ['status'] }] },
    paranoid: true,
  },

  /* ================================================================== */
  /* Clients                                                             */
  /* ================================================================== */

  Client: {
    tableName: 'clients',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(191), allowNull: false },
      contactPerson: shortText(),
      email: { type: DataTypes.STRING(191), allowNull: true, defaultValue: null },
      phone: { type: DataTypes.STRING(60), allowNull: true, defaultValue: null },
      website: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
      industry: shortText(),
      addressLine1: shortText(),
      city: shortText(),
      country: shortText(),
      status: {
        type: DataTypes.ENUM(...valuesOf(CLIENT_STATUS)),
        allowNull: false,
        defaultValue: CLIENT_STATUS.PROSPECT,
      },
      source: {
        type: DataTypes.ENUM(...valuesOf(CLIENT_SOURCE)),
        allowNull: true,
        defaultValue: null,
      },
      notes: longText(),
      logoMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** Only opted-in clients appear on the public /clients page. */
      isPublic: booleanDefault(false),
      contractValue: money(),
    },
    options: {
      indexes: [{ fields: ['status'] }, { fields: ['name'] }, { fields: ['isPublic'] }],
    },
    paranoid: true,
  },

  /** Dated internal notes, so the CRM keeps a history rather than one summary. */
  ClientNote: {
    tableName: 'client_notes',
    fields: {
      id: pk(),
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      body: { type: DataTypes.TEXT, allowNull: false },
    },
    options: { indexes: [{ fields: ['clientId', 'createdAt'] }] },
  },

  ClientCommunication: {
    tableName: 'client_communications',
    fields: {
      id: pk(),
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      type: {
        type: DataTypes.ENUM('call', 'email', 'meeting', 'other'),
        allowNull: false,
        defaultValue: 'call',
      },
      subject: shortText(),
      body: longText(),
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    options: { indexes: [{ fields: ['clientId', 'occurredAt'] }] },
  },

  /* ================================================================== */
  /* Media                                                               */
  /* ================================================================== */

  /**
   * Media records. Files live on disk or in object storage; only keys,
   * dimensions and metadata are stored here.
   *
   * width and height are kept so the layout can reserve space before an image
   * loads, which is what keeps cumulative layout shift near zero.
   */
  Media: {
    tableName: 'media',
    fields: {
      id: pk(),
      /** Storage key such as 2026/01/aBc123.webp. The public URL is derived from it. */
      key: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      url: { type: DataTypes.STRING(500), allowNull: false },
      kind: {
        type: DataTypes.ENUM(...valuesOf(MEDIA_KIND)),
        allowNull: false,
        defaultValue: MEDIA_KIND.IMAGE,
      },
      mimeType: { type: DataTypes.STRING(120), allowNull: false },
      width: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      height: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      sizeBytes: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      altText: { type: DataTypes.STRING(300), allowNull: true, defaultValue: null },
      title: { type: DataTypes.STRING(300), allowNull: true, defaultValue: null },
      caption: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      /** Inline 20px preview generated at upload time, for blur-up placeholders. */
      blurDataUrl: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
      uploadedById: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      folder: { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
    },
    options: { indexes: [{ fields: ['kind'] }, { fields: ['folder'] }] },
    paranoid: true,
  },

  /* ================================================================== */
  /* Public content                                                      */
  /* ================================================================== */

  Service: {
    tableName: 'services',
    fields: {
      id: pk(),
      title: { type: DataTypes.STRING(191), allowNull: false },
      /** SEO-friendly URL segment, unique across the table. */
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      summary: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      description: longText(),
      /** Lucide icon name. Arbitrary markup is never stored or rendered. */
      icon: shortText(),
      imageMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** Lets a specific offering sit under a broader category. */
      parentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      displayOrder: orderIndex(),
      isPublished: booleanDefault(false),
      metaTitle: shortText(),
      metaDescription: { type: DataTypes.STRING(400), allowNull: true, defaultValue: null },
      /** JSON array of {question, answer}, rendered as FAQPage schema. */
      faq: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
    },
    options: {
      indexes: [{ fields: ['slug'], unique: true }, { fields: ['isPublished', 'displayOrder'] }],
    },
    paranoid: true,
  },

  Project: {
    tableName: 'projects',
    fields: {
      id: pk(),
      title: { type: DataTypes.STRING(191), allowNull: false },
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      serviceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      summary: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      description: longText(),
      challenge: longText(),
      solution: longText(),
      results: longText(),
      /** JSON array of technology names. */
      technologies: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      projectUrl: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
      coverMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      status: {
        type: DataTypes.ENUM(...valuesOf(PROJECT_STATUS)),
        allowNull: false,
        defaultValue: PROJECT_STATUS.IN_PROGRESS,
      },
      isFeatured: booleanDefault(false),
      isPublished: booleanDefault(false),
      publishedAt: optionalDate(),
      startedAt: optionalDate(DataTypes.DATEONLY),
      completedAt: optionalDate(DataTypes.DATEONLY),
      /** Drives the "needs attention" panel on the dashboard. */
      deadlineAt: optionalDate(DataTypes.DATEONLY),
      displayOrder: orderIndex(),
      metaTitle: shortText(),
      metaDescription: { type: DataTypes.STRING(400), allowNull: true, defaultValue: null },
    },
    options: {
      indexes: [
        { fields: ['slug'], unique: true },
        { fields: ['isPublished', 'isFeatured'] },
        { fields: ['clientId'] },
        { fields: ['serviceId'] },
        { fields: ['status'] },
        { fields: ['isPublished', 'publishedAt'] },
      ],
    },
    paranoid: true,
  },

  ProjectImage: {
    tableName: 'project_images',
    fields: {
      id: pk(),
      projectId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      mediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      caption: { type: DataTypes.STRING(300), allowNull: true, defaultValue: null },
      displayOrder: orderIndex(),
    },
    options: { indexes: [{ fields: ['projectId', 'displayOrder'] }] },
  },

  Technology: {
    tableName: 'technologies',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    },
  },

  /* ================================================================== */
  /* Careers                                                             */
  /* ================================================================== */

  Job: {
    tableName: 'jobs',
    fields: {
      id: pk(),
      title: { type: DataTypes.STRING(191), allowNull: false },
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      departmentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      employmentType: shortText(),
      location: shortText(),
      isRemote: booleanDefault(false),
      summary: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      description: { type: DataTypes.TEXT, allowNull: false },
      requirements: longText(),
      applyEmail: { type: DataTypes.STRING(191), allowNull: true, defaultValue: null },
      applyUrl: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
      isPublished: booleanDefault(false),
      /** A role past this date drops off the careers page automatically. */
      closesAt: optionalDate(DataTypes.DATEONLY),
      displayOrder: orderIndex(),
    },
    options: { indexes: [{ fields: ['isPublished', 'displayOrder'] }] },
    paranoid: true,
  },

  /* ================================================================== */
  /* Tasks                                                               */
  /* ================================================================== */

  /*
   * Internal work items. Deliberately never exposed through the public API or
   * any serializer in serializers/public.js — this is staff workload, not
   * marketing content, and a task title can name a client or a deadline that
   * should not be crawlable.
   *
   * The optional links are plain columns rather than associations on the
   * assignment side: a task should still open if the client or project it
   * referenced is later deleted, and a soft-deleted row must not take the task
   * with it.
   */
  Task: {
    tableName: 'tasks',
    fields: {
      id: pk(),
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: longText(),
      status: { type: DataTypes.ENUM(...valuesOf(TASK_STATUS)), allowNull: false, defaultValue: TASK_STATUS.TODO },
      priority: { type: DataTypes.ENUM(...valuesOf(TASK_PRIORITY)), allowNull: false, defaultValue: TASK_PRIORITY.MEDIUM },
      /** The staff member responsible (legacy Employee). Not a foreign key, so the row survives deletion. */
      assigneeId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** The user responsible (modern User-based assignment). Takes precedence over assigneeId when set. */
      assigneeUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      projectId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      dueDate: optionalDate(DataTypes.DATEONLY),
      /** Stamped when status first becomes done, so "closed this month" is a query. */
      completedAt: optionalDate(),
    },
    options: {
      indexes: [
        // The board's default query: open tasks, most urgent and nearest due first.
        { fields: ['status', 'priority'] },
        { fields: ['assigneeId', 'status'] },
        { fields: ['dueDate'] },
      ],
    },
    paranoid: true,
  },

  /* ================================================================== */
  /* Client reporting                                                    */
  /* ================================================================== */

  /*
   * Two tables, deliberately split.
   *
   * content_deliverables is *what we produced*: "a June reel for Acme". That is
   * the count a client asks about first ("how many videos did you make me this
   * month"), so it is a row in its own right rather than an attribute of a metric.
   *
   * content_metrics is *how it performed*: views, likes and comments for one
   * deliverable in one month on one platform. Folding these together would make
   * "videos produced" and "videos with views" the same number, and the two rarely
   * are — content is often delivered late and accrues views afterwards.
   *
   * `month` is a zero-padded CHAR(7) string, not a DATE. Grouping on a string is
   * exact, sorts chronologically, and cannot shift a bucket across a month
   * boundary through a timezone. The zod schema validates it as a real YYYY-MM.
   */
  ContentDeliverable: {
    tableName: 'content_deliverables',
    fields: {
      id: pk(),
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(191), allowNull: false },
      type: { type: DataTypes.ENUM(...valuesOf(DELIVERABLE_TYPE)), allowNull: false, defaultValue: DELIVERABLE_TYPE.VIDEO },
      platform: { type: DataTypes.ENUM(...valuesOf(METRIC_PLATFORM)), allowNull: false, defaultValue: METRIC_PLATFORM.OTHER },
      /** Where it was published. Null while the work exists but is not live yet. */
      url: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      publishedAt: optionalDate(),
      /** Only set when we actually host the file; most rows leave this null. */
      mediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      notes: longText(),

      /* ---- Production pipeline -------------------------------------- */
      /*
       * `stage` defaults to posted, not idea. Rows created before the pipeline
       * existed were logged as finished work, so defaulting them to 'idea' would
       * fill the board with a backlog that never existed.
       */
      stage: {
        type: DataTypes.ENUM(...valuesOf(CONTENT_STAGE)),
        allowNull: false,
        defaultValue: CONTENT_STAGE.POSTED,
      },
      /** The day the crew is booked. A cost, fixed in advance. */
      shootDate: optionalDate(DataTypes.DATEONLY),
      /** When it is planned to go live, as distinct from when it did. */
      scheduledFor: optionalDate(DataTypes.DATEONLY),
      assigneeId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /**
       * How many times this came back from the client. Null means it was never
       * sent for approval, which is not the same as sent once and accepted first
       * time — the difference matters when reporting an approval rate.
       */
      revisionCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      /** One field per pipeline step so later material never overwrites earlier. */
      idea: longText(),
      brainstormNotes: longText(),
      scriptBody: longText(),
      approvalNotes: longText(),
    },
    options: {
      indexes: [
        // The report's core query: everything for one client in one month.
        { fields: ['clientId', 'publishedAt'] },
        { fields: ['clientId', 'type'] },
        // The board's primary query: open work, by stage, soonest shoot first.
        { fields: ['stage', 'shootDate'] },
        { fields: ['scheduledFor'] },
      ],
    },
    paranoid: true,
  },

  /*
   * Append-only history of stage changes.
   *
   * This exists because current state cannot answer "how long does approval
   * take" — once a card has moved on, its previous timestamps are gone. Every move
   * writes a row recording when it entered the new stage, so cycle time per stage
   * is a GROUP BY rather than a reconstruction.
   *
   * No `deletedAt`: this is a record of what happened, and a change to it cannot
   * be silently undone by a stray delete.
   */
  ContentStageEvent: {
    tableName: 'content_stage_events',
    fields: {
      id: pk(),
      deliverableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      fromStage: { type: DataTypes.ENUM(...valuesOf(CONTENT_STAGE)), allowNull: true, defaultValue: null },
      toStage: { type: DataTypes.ENUM(...valuesOf(CONTENT_STAGE)), allowNull: false },
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** Why it moved. Essential on a return from approval. */
      note: longText(),
    },
    options: {
      // Cycle time is "time spent in toStage", so this index serves every
      // stage-duration figure the weekly report shows.
      indexes: [{ fields: ['toStage', 'createdAt'] }, { fields: ['deliverableId'] }],
    },
  },

  /*
   * An idea pack or proposal put to a client. Upstream of the pipeline rather than
   * part of it: an accepted proposal becomes content, a draft one is only a
   * document. Keeping it separate stops "we pitched this" cluttering the board.
   */
  ClientProposal: {
    tableName: 'client_proposals',
    fields: {
      id: pk(),
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(191), allowNull: false },
      summary: longText(),
      /** What is being proposed, e.g. "4 videos + 8 stories per month". */
      scope: longText(),
      status: {
        type: DataTypes.ENUM(...valuesOf(PROPOSAL_STATUS)),
        allowNull: false,
        defaultValue: PROPOSAL_STATUS.DRAFT,
      },
      value: { type: DataTypes.DECIMAL(14, 2), allowNull: true, defaultValue: null },
      proposedStart: optionalDate(DataTypes.DATEONLY),
      /** When the client answered. Null while still awaiting a decision. */
      respondedAt: optionalDate(),
    },
    options: { indexes: [{ fields: ['clientId', 'status'] }] },
    paranoid: true,
  },

  ContentMetric: {
    tableName: 'content_metrics',
    fields: {
      id: pk(),
      deliverableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      /** 'YYYY-MM'. Zero padded so lexical order is chronological order. */
      month: { type: DataTypes.STRING(7), allowNull: false },
      platform: { type: DataTypes.ENUM(...valuesOf(METRIC_PLATFORM)), allowNull: false, defaultValue: METRIC_PLATFORM.OTHER },
      /**
       * Nullable rather than defaulting to 0, so the report can distinguish "not
       * measured" from "measured and genuinely zero" — which is the first question
       * a client asks about a blank figure.
       */
      views: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      likes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      comments: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      shares: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      /** Decimal, not integer: 12.5 hours of watch time is an ordinary figure. */
      watchHours: { type: DataTypes.DECIMAL(12, 2), allowNull: true, defaultValue: null },
      /** `manual` today; `api` reserved for a future platform sync. */
      source: { type: DataTypes.ENUM(...valuesOf(METRIC_SOURCE)), allowNull: false, defaultValue: METRIC_SOURCE.MANUAL },
    },
    options: {
      // One row per deliverable per month per platform. Enforced by the database
      // as well as the service, so two staff saving at once cannot double-count.
      indexes: [{ fields: ['deliverableId', 'month', 'platform'], unique: true }],
    },
    paranoid: true,
  },

  /* ================================================================== */
  /* Finance                                                             */
  /* ================================================================== */

  FinancialCategory: {
    tableName: 'financial_categories',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      /** Categories are typed, so income and expense lists stay separate. */
      type: { type: DataTypes.ENUM(...valuesOf(TRANSACTION_TYPE)), allowNull: false },
      isSystem: booleanDefault(false),
    },
    options: { indexes: [{ fields: ['type', 'name'] }] },
    paranoid: true,
  },

  FinancialTransaction: {
    tableName: 'financial_transactions',
    fields: {
      id: pk(),
      type: { type: DataTypes.ENUM(...valuesOf(TRANSACTION_TYPE)), allowNull: false },
      amount: money(),
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'ETB' },
      categoryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      projectId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      description: { type: DataTypes.STRING(500), allowNull: false },
      transactionDate: { type: DataTypes.DATEONLY, allowNull: false },
      paymentMethod: {
        type: DataTypes.ENUM(...valuesOf(PAYMENT_METHOD)),
        allowNull: true,
        defaultValue: null,
      },
      reference: shortText(),
      status: {
        type: DataTypes.ENUM(...valuesOf(TRANSACTION_STATUS)),
        allowNull: false,
        defaultValue: TRANSACTION_STATUS.COMPLETED,
      },
      notes: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
      createdById: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    },
    options: {
      // Ordered to match the dashboard's date-range aggregation.
      indexes: [
        { fields: ['transactionDate'] },
        { fields: ['type', 'status', 'transactionDate'] },
        { fields: ['clientId'] },
        { fields: ['categoryId'] },
      ],
    },
    paranoid: true,
  },

  Invoice: {
    tableName: 'invoices',
    fields: {
      id: pk(),
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      projectId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      invoiceNumber: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      issueDate: { type: DataTypes.DATEONLY, allowNull: false },
      dueDate: optionalDate(DataTypes.DATEONLY),
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'ETB' },
      taxRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      /**
       * Denormalised totals. Recalculated inside the same transaction that writes
       * the line items, so an invoice is never left with a stale total.
       */
      subtotal: money(),
      taxAmount: money(),
      total: money(),
      paidAmount: money(),
      status: {
        type: DataTypes.ENUM(...valuesOf(INVOICE_STATUS)),
        allowNull: false,
        defaultValue: INVOICE_STATUS.DRAFT,
      },
      notes: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
      createdById: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    },
    options: {
      indexes: [
        { fields: ['invoiceNumber'], unique: true },
        { fields: ['clientId'] },
        { fields: ['status'] },
        { fields: ['dueDate'] },
      ],
    },
    paranoid: true,
  },

  InvoiceItem: {
    tableName: 'invoice_items',
    fields: {
      id: pk(),
      invoiceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false },
      quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      unitPrice: money(),
      /** Computed from quantity × unitPrice in integer cents. */
      lineTotal: money(),
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    options: { indexes: [{ fields: ['invoiceId', 'position'] }] },
  },

  Payment: {
    tableName: 'payments',
    fields: {
      id: pk(),
      invoiceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      amount: money(),
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'ETB' },
      paymentMethod: {
        type: DataTypes.ENUM(...valuesOf(PAYMENT_METHOD)),
        allowNull: true,
        defaultValue: null,
      },
      reference: shortText(),
      paidAt: { type: DataTypes.DATEONLY, allowNull: false },
      notes: { type: DataTypes.STRING(1000), allowNull: true, defaultValue: null },
      createdById: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    },
    options: { indexes: [{ fields: ['invoiceId'] }, { fields: ['paidAt'] }] },
    paranoid: true,
  },

  /* ================================================================== */
  /* Blog                                                                */
  /* ================================================================== */

  BlogCategory: {
    tableName: 'blog_categories',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    },
    options: { indexes: [{ fields: ['slug'] }] },
    paranoid: true,
  },

  BlogTag: {
    tableName: 'blog_tags',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    },
    options: { indexes: [{ fields: ['slug'] }] },
    paranoid: true,
  },

  BlogPost: {
    tableName: 'blog_posts',
    fields: {
      id: pk(),
      title: { type: DataTypes.STRING(191), allowNull: false },
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      excerpt: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
      content: { type: DataTypes.TEXT, allowNull: false },
      featuredMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      authorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** Draft posts are invisible to the public API and never in the sitemap. */
      status: { type: DataTypes.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
      publishedAt: optionalDate(),
      metaTitle: shortText(),
      metaDescription: { type: DataTypes.STRING(400), allowNull: true, defaultValue: null },
    },
    options: {
      indexes: [{ fields: ['slug'], unique: true }, { fields: ['status', 'publishedAt'] }],
    },
    paranoid: true,
  },

  /* ================================================================== */
  /* Leads and audit                                                     */
  /* ================================================================== */

  /**
   * Public form submissions.
   *
   * ipHash is a salted HMAC of the submitter's address: enough to spot a spam
   * campaign, not enough to identify an individual. The raw address is never
   * stored.
   */
  ContactInquiry: {
    tableName: 'contact_inquiries',
    fields: {
      id: pk(),
      name: { type: DataTypes.STRING(160), allowNull: false },
      email: { type: DataTypes.STRING(191), allowNull: false },
      phone: { type: DataTypes.STRING(60), allowNull: true, defaultValue: null },
      company: shortText(),
      subject: shortText(),
      serviceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM(...valuesOf(INQUIRY_STATUS)),
        allowNull: false,
        defaultValue: INQUIRY_STATUS.NEW,
      },
      isRead: booleanDefault(false),
      isArchived: booleanDefault(false),
      assignedToId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      notes: longText(),
      ipHash: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
      /** Heuristic score set at intake. High-scoring rows are hidden from the default view. */
      spamScore: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      utmSource: shortText(),
      utmMedium: shortText(),
      utmCampaign: shortText(),
      referrer: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    },
    options: {
      // Matches the admin inbox's default query.
      indexes: [
        { fields: ['isArchived', 'status', 'isRead', 'createdAt'] },
        { fields: ['createdAt'] },
        { fields: ['email'] },
        { fields: ['spamScore'] },
      ],
    },
    paranoid: true,
  },

  /**
   * Audit trail. Append-only: no soft delete, and rows are aged out by the
   * retention job rather than removed by hand.
   */
  ActivityLog: {
    tableName: 'activity_logs',
    fields: {
      id: pk(),
      /** Nullable: a failed sign-in from an unknown email has no user. */
      userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      userEmail: { type: DataTypes.STRING(191), allowNull: true, defaultValue: null },
      action: { type: DataTypes.STRING(60), allowNull: false },
      entity: { type: DataTypes.STRING(60), allowNull: false },
      entityId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** Redacted JSON diff of the changed fields. Never holds secrets. */
      metadata: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
      ip: shortText(),
      userAgent: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
    },
    options: {
      indexes: [
        { fields: ['entity', 'entityId'] },
        { fields: ['userId'] },
        { fields: ['action'] },
        { fields: ['createdAt'] },
      ],
    },
  },
};

export { ROLES, ACTIVITY_ACTION, MEDIA_KIND };
export const helpers = { pk, money, booleanDefault, orderIndex, shortText, longText, optionalDate };
export default definitions;