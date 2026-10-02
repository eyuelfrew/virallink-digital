You are a senior full-stack engineer, product designer, UX designer, SEO specialist, and software architect.

I want you to build a production-quality website and internal company management platform for a digital marketing company.

DO NOT treat this as a simple landing-page project.

The system has two major parts:

1. PUBLIC COMPANY WEBSITE
2. PRIVATE ADMIN / COMPANY MANAGEMENT PLATFORM

The public website must be highly SEO-optimized, extremely fast, responsive, visually polished, modern, trustworthy, and conversion-focused.

The admin platform must allow the company's authorized administrators to manage the company's information, employees, shareholders, clients, services, portfolio/projects, financial information, activities, and other business data.

==================================================
1. TECHNOLOGY STACK
==================================================

Frontend:
- Next.js
- JavaScript (NOT TypeScript)
- Tailwind CSS
- Modern reusable React components
- Use the latest stable Next.js architecture available in the project
- Prefer Server Components where appropriate
- Client Components only where interactivity requires them

UI:
- Use a high-quality modern UI library where it makes sense
- Prefer shadcn/ui + Radix primitives if compatible
- Lucide React for icons
- Framer Motion / Motion for carefully used animations
- Do NOT over-animate the website
- The design must feel like a serious digital marketing/technology company

Backend:
- Node.js
- Express.js
- MySQL
- Sequelize ORM

Authentication:
- Secure admin authentication
- Session/JWT-based authentication as appropriate
- Passwords must be hashed securely
- Never store plaintext passwords
- Role-based authorization

Infrastructure:
- Nginx reverse proxy ready
- Environment-variable based configuration
- Production-ready error handling
- Logging
- Security headers
- CORS configuration
- Rate limiting
- Input validation
- Database migrations
- Seed scripts

==================================================
2. BRAND / DESIGN
==================================================

I have attached the company's existing logo.

Use the attached logo as the primary branding reference.

Do NOT redesign the logo.

Extract the visual language from the logo:
- colors
- contrast
- visual character
- typography direction
- professional tone

The website should feel:

- premium
- modern
- trustworthy
- corporate
- technically sophisticated
- Ethiopian/local-business aware but internationally professional
- clean
- confident
- conversion-oriented

Avoid:
- generic AI-looking websites
- excessive gradients
- excessive glassmorphism
- template-looking layouts
- huge unnecessary animations
- clutter
- stock-photo-heavy design
- fake statistics
- fake testimonials
- fake clients
- fake awards

If information does not exist yet, build the structure so administrators can add it later.

==================================================
3. PUBLIC WEBSITE
==================================================

Create a complete company website with at least:

/

Home

/about

/services

/services/[slug]

/portfolio

/portfolio/[slug]

/clients

/team

/blog

/blog/[slug]

/contact

/careers

/privacy

/terms

The exact routes can be improved if you have a better architecture.

The homepage should include sections such as:

- Hero
- Company introduction
- Core services
- Why choose us
- Selected portfolio/projects
- Clients/partners
- Company statistics
- Team preview
- Testimonials if available
- CTA
- Contact section
- Footer

IMPORTANT:

Do not hard-code business information throughout the frontend.

Public content such as:

- company information
- services
- employees
- portfolio
- clients
- testimonials
- blog posts
- statistics
- contact information

should be designed so that it can eventually come from the backend/database.

==================================================
4. SEO IS A MAJOR REQUIREMENT
==================================================

SEO must be treated as a first-class feature.

Implement:

- dynamic metadata
- title templates
- meta descriptions
- canonical URLs
- Open Graph metadata
- Twitter/X metadata
- sitemap.xml
- robots.txt
- structured data / JSON-LD
- Organization schema
- LocalBusiness schema where appropriate
- Service schema where appropriate
- Article schema for blog articles
- BreadcrumbList schema
- proper semantic HTML
- correct heading hierarchy
- image alt text
- optimized images
- clean URLs
- internal linking
- SEO-friendly slugs

The website must be optimized for searches related to the company's actual services and location.

DO NOT keyword-stuff.

SEO content should sound natural and useful to humans.

The admin area MUST NOT be indexed.

==================================================
5. ADMIN URL
==================================================

The admin application must be accessible through:

/admin-teftef

Examples:

/admin-teftef/login
/admin-teftef/dashboard
/admin-teftef/employees
/admin-teftef/shareholders
/admin-teftef/clients
/admin-teftef/services
/admin-teftef/portfolio
/admin-teftef/finances
/admin-teftef/activities
/admin-teftef/settings

The admin route should NOT appear in:

- sitemap.xml
- public navigation
- public internal links
- structured data
- search-engine-indexable content

Add:

X-Robots-Tag: noindex, nofollow

and/or appropriate page-level robots metadata for admin pages.

Also configure robots.txt appropriately.

IMPORTANT:

NOINDEX IS NOT SECURITY.

The admin routes must still require authentication.

Unauthenticated users must be redirected to:

/admin-teftef/login

Never rely on obscurity of the URL for security.

==================================================
6. ADMIN DASHBOARD
==================================================

Build a professional dashboard.

Dashboard should show useful business metrics such as:

- total clients
- active clients
- total projects
- active projects
- completed projects
- employees
- shareholders
- monthly revenue
- monthly expenses
- outstanding payments
- recent activities
- recent client inquiries
- recent portfolio updates
- upcoming deadlines

Use charts only where they actually help.

Possible charts:

- revenue over time
- expenses over time
- profit over time
- project status
- client growth
- leads/inquiries
- service distribution

Use a clean dashboard layout.

==================================================
7. COMPANY MANAGEMENT
==================================================

Create CRUD management for:

COMPANY PROFILE

Fields can include:

- company name
- legal name
- logo
- favicon
- description
- mission
- vision
- values
- founded date
- address
- phone
- email
- website
- social media
- business registration information where appropriate

==================================================
8. EMPLOYEES
==================================================

Admin must be able to:

- create employee
- edit employee
- deactivate employee
- delete/archive employee
- upload profile photo
- assign position
- assign department
- set employment status
- set joining date
- add biography
- add social links
- control whether employee appears publicly

Possible fields:

- name
- position
- department
- biography
- photo
- email
- phone
- LinkedIn
- status
- joined_at
- display_order
- is_public

Do not expose private employee information publicly.

==================================================
9. SHAREHOLDERS
==================================================

Create a private shareholder management system.

Fields may include:

- shareholder name
- ownership percentage
- number of shares
- share class
- joined date
- status
- notes

IMPORTANT:

Shareholder information is private by default.

Do NOT expose financial ownership information on the public website unless an administrator explicitly marks something as public.

==================================================
10. CLIENTS
==================================================

Create a client CRM-style module.

Admin can:

- create client
- edit client
- archive client
- view client details
- track projects
- track communications
- track invoices/payments
- add notes

Fields:

- company/person name
- contact person
- email
- phone
- address
- industry
- website
- status
- source
- notes
- created_at

==================================================
11. SERVICES
==================================================

Services must be database-driven.

Admin can:

- create service
- edit service
- publish/unpublish
- reorder services
- assign icon
- add description
- add SEO title
- add SEO description
- add slug
- upload images

Examples might include:

- Digital Marketing
- Social Media Marketing
- SEO
- Web Development
- Branding
- Content Creation
- Paid Advertising
- Graphic Design

Do not assume these exact services are offered.

Make them configurable from the admin dashboard.

==================================================
12. PORTFOLIO / PROJECTS
==================================================

Create a complete portfolio management system.

Admin can:

- create project
- edit project
- publish/unpublish
- archive project
- upload images
- assign client
- assign service
- add project description
- add results
- add technologies/tools
- add project URL
- set featured status
- control ordering

Fields:

- title
- slug
- client
- category/service
- description
- challenge
- solution
- results
- technologies
- images
- project_url
- featured
- published
- published_at

Portfolio pages should have excellent SEO.

==================================================
13. FINANCE MODULE
==================================================

Create a private financial management module.

DO NOT expose this data publicly.

Support:

- income
- expenses
- invoices
- payments
- outstanding balances
- financial categories
- transaction history

Possible transaction fields:

- type
- amount
- currency
- category
- description
- client
- project
- transaction date
- payment method
- reference
- status
- notes

Dashboard should calculate:

- total income
- total expenses
- net profit
- outstanding invoices
- monthly financial summaries

IMPORTANT:

Use Decimal/DECIMAL database types for monetary values.

Do NOT use JavaScript floating-point numbers for financial calculations where precision matters.

==================================================
14. ACTIVITY / AUDIT LOG
==================================================

Create an activity log.

Track actions such as:

- login
- logout
- create
- update
- delete
- publish
- unpublish
- financial changes
- client changes
- employee changes
- portfolio changes

Store:

- user
- action
- entity
- entity_id
- timestamp
- IP where appropriate
- metadata

Admin should be able to search/filter activity logs.

Sensitive information must not be logged unnecessarily.

==================================================
15. CONTACT / LEADS
==================================================

Public website should have a contact form.

Store inquiries in the database.

Admin should be able to:

- view inquiry
- mark unread/read
- change status
- assign inquiry
- add notes
- archive inquiry

Statuses:

- new
- contacted
- qualified
- converted
- closed

Add server-side validation and rate limiting.

Protect against spam.

==================================================
16. BLOG / CONTENT MANAGEMENT
==================================================

Create a lightweight CMS.

Admin can create:

- blog posts
- categories
- tags
- featured image
- SEO title
- SEO description
- slug
- content
- author
- publish date
- draft/published status

Public blog pages must be SEO-friendly.

Generate Article structured data.

==================================================
17. DATABASE ARCHITECTURE
==================================================

Use MySQL + Sequelize.

Design proper normalized models.

Potential models:

User
Role
Permission
Company
Employee
Shareholder
Client
Service
PortfolioProject
PortfolioImage
Testimonial
BlogPost
BlogCategory
BlogTag
ContactInquiry
FinancialTransaction
Invoice
Payment
ActivityLog
SocialLink
Media

Do not blindly create all models if some are unnecessary.

Define:

- primary keys
- foreign keys
- indexes
- unique constraints
- timestamps
- soft deletion where appropriate
- relationships

Use Sequelize migrations.

Do NOT rely on:

sequelize.sync({ alter: true })

for production database management.

Use proper migrations.

==================================================
18. AUTHORIZATION
==================================================

Implement role-based access control.

At minimum:

SUPER_ADMIN
ADMIN
EDITOR
FINANCE

Permissions should determine what each role can access.

For example:

SUPER_ADMIN:
everything

ADMIN:
company, employees, clients, services, portfolio, content

EDITOR:
services, portfolio, blog, public content

FINANCE:
financial data and financial reports

Do not trust frontend authorization.

Every sensitive API endpoint must enforce authorization on the backend.

==================================================
19. API ARCHITECTURE
==================================================

Use a clean REST API.

Example:

/api/v1/auth
/api/v1/company
/api/v1/employees
/api/v1/shareholders
/api/v1/clients
/api/v1/services
/api/v1/portfolio
/api/v1/blog
/api/v1/contact
/api/v1/finance
/api/v1/activity
/api/v1/dashboard

Use:

- controllers
- services
- routes
- middleware
- validators
- models

Do not put everything into one huge server.js/index.js file.

==================================================
20. SECURITY
==================================================

Implement:

- Helmet
- CORS
- rate limiting
- request validation
- parameterized queries through Sequelize
- secure authentication
- password hashing
- secure cookies where applicable
- CSRF protection where appropriate
- file upload validation
- file type validation
- file size limits
- authorization middleware
- error handling
- production-safe logging

Never expose:

- database passwords
- JWT secrets
- API keys
- Firebase credentials
- SMTP credentials
- financial private information

in frontend code.

==================================================
21. MEDIA / IMAGE MANAGEMENT
==================================================

Images will be used heavily for:

- portfolio
- employees
- blog
- company branding

Create a clean media architecture.

Do not store large binary images directly inside MySQL.

Store media files using an appropriate storage layer and keep URLs/metadata in MySQL.

The architecture should make it easy to later move from local storage to S3-compatible storage or another object-storage provider.

==================================================
22. PERFORMANCE
==================================================

The public website must be fast.

Optimize:

- images
- fonts
- JavaScript bundles
- server rendering
- caching
- database queries
- API calls

Avoid unnecessary client-side JavaScript.

Avoid loading the entire admin system into the public website bundle.

Public pages should be optimized for Core Web Vitals.

==================================================
23. RESPONSIVE DESIGN
==================================================

The website must work beautifully on:

- mobile
- tablet
- laptop
- desktop
- large screens

Mobile design is NOT an afterthought.

The admin dashboard must also be usable on smaller screens.

==================================================
24. ACCESSIBILITY
==================================================

Implement:

- semantic HTML
- keyboard navigation
- proper labels
- accessible forms
- appropriate contrast
- alt text
- focus states
- ARIA only when necessary

==================================================
25. ERROR / EMPTY / LOADING STATES
==================================================

Every application section needs proper:

- loading state
- skeleton state where useful
- empty state
- error state
- success feedback
- confirmation dialogs for destructive actions

Do not leave blank screens.

==================================================
26. PROJECT STRUCTURE
==================================================

Create a maintainable architecture.

Frontend should have clear separation between:

- app/routes
- components
- UI
- layouts
- services/API clients
- hooks
- utilities
- constants
- SEO
- admin components

Backend should have:

- routes
- controllers
- services
- middleware
- models
- migrations
- seeders
- validators
- config
- utils

==================================================
27. ENVIRONMENT VARIABLES
==================================================

Create:

.env.example

Never hard-code secrets.

Example:

DATABASE_URL=
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=

JWT_SECRET=

NEXT_PUBLIC_API_URL=

STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=

etc.

==================================================
28. DEPLOYMENT
==================================================

The architecture should be ready for:

Ubuntu VPS
Nginx
Node.js
MySQL
Redis if needed
PM2 or Docker

Example production architecture:

Internet
↓
Nginx
↓
Next.js
↓
Node.js API
↓
MySQL

Redis may be added for:

- caching
- rate limiting
- sessions
- queues

Do not add Redis where it provides no meaningful benefit.

==================================================
29. SEO + ADMIN SEPARATION
==================================================

Public pages should be crawlable.

Admin pages must be private and non-indexable.

Do NOT accidentally expose:

- employee private information
- shareholder information
- financial information
- internal activity logs
- client private information
- admin API responses

through public routes.

The API must also enforce authorization.

==================================================
30. DATA-DRIVEN PUBLIC WEBSITE
==================================================

This is extremely important.

The public website should automatically reflect data managed through the admin dashboard.

Example:

Admin creates:

Service:
"Search Engine Optimization"

↓

Public website automatically shows:

/services/search-engine-optimization

Admin creates:

Portfolio:
"ABC Company Website Redesign"

↓

Public website automatically shows:

/portfolio/abc-company-website-redesign

Admin publishes employee:

↓

Team page displays that employee.

Admin changes company phone number:

↓

Public contact information updates.

Do not duplicate this data manually in frontend source files.

==================================================
31. UI QUALITY
==================================================

The UI should look like a professionally designed agency website.

Think:

- premium digital agency
- modern SaaS quality
- excellent typography
- strong visual hierarchy
- thoughtful spacing
- subtle motion
- beautiful cards
- excellent navigation
- professional dashboard
- polished tables
- powerful filtering
- responsive forms

Do NOT make every section a card.

Do NOT use gradients everywhere.

Do NOT use excessive rounded corners.

Do NOT use generic dashboard templates without adapting them.

==================================================
32. DEVELOPMENT PROCESS
==================================================

Do NOT generate the entire application as one giant response.

Work incrementally.

PHASE 1:
Architecture and project setup.

PHASE 2:
Database models and migrations.

PHASE 3:
Backend API and authentication.

PHASE 4:
Admin dashboard.

PHASE 5:
Public website.

PHASE 6:
SEO.

PHASE 7:
Security.

PHASE 8:
Testing.

PHASE 9:
Production deployment.

After each phase:

- explain what was created
- show the file structure
- provide exact commands
- identify what should be tested
- fix errors before continuing

==================================================
33. IMPORTANT CODING RULES
==================================================

Use JavaScript, NOT TypeScript.

Do not use placeholder implementations where production logic is expected.

Do not invent fake company data and present it as real.

Use seed/demo data only where necessary and clearly mark it as demo data.

Do not hard-code secrets.

Do not hard-code business content that should come from the database.

Do not create duplicate logic.

Do not create enormous components.

Keep components reusable.

Use clear naming.

Use proper error handling.

Use database transactions for operations that modify multiple related records.

Use pagination for large admin tables.

Use server-side filtering/searching for large datasets.

Use soft deletion where historical records need to remain available.

==================================================
34. FIRST TASK
==================================================

Before writing application code:

1. Inspect the attached company logo.
2. Analyze its visual identity.
3. Propose a professional design direction based on it.
4. Propose the complete architecture.
5. Propose the database ERD/model relationships.
6. Propose the frontend route structure.
7. Propose the backend API structure.
8. Propose the admin permission system.
9. Propose the SEO architecture.
10. Propose the production deployment architecture.

Then STOP.

Do not start generating hundreds of files immediately.

I want to review the architecture first.

After I approve the architecture, implement the project phase-by-phase.

The final result should feel like a real production company platform, not a coding demo or template.