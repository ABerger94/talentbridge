'use strict';
// OpenAPI 3.1 description of the admin API an API key can use, served at
// GET /api/admin/openapi.json. Every operation states the permission
// (x-required-scope) it needs; apikeys.js enforces the same rules, and a
// test checks the two agree.
const { SCOPES } = require('./apikeys');

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const idParam = (name, description) => ({ name, in: 'path', required: true, schema: { type: 'string' }, description });
const query = (name, description, schema = { type: 'string' }) => ({ name, in: 'query', required: false, schema, description });
const body = (properties, required = []) => ({ required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } } });

// [method, path, scope, summary, description, extras]
const OPERATIONS = [
  ['get', '/api/admin/openapi.json', null, 'This API description', 'The list of everything an API key can do, with the permission each action needs.'],
  ['get', '/api/admin/overview', 'read', 'Site overview', 'Users by role and new signups, employer review counts, seeker profiles and Capability Graphs, active / pending / closed jobs, applications by status, job source health, and open errors. A good first call.'],
  ['get', '/api/admin/system', 'read', 'System health and activity', 'Configuration health (AI, email, storage, database, cron), counts, emails sent in the last 7 days, recent server errors, the last 200 audit log entries, and the last AI fairness check with patterns across runs. Add ?resolved=1 to include resolved errors.',
    { parameters: [query('resolved', 'Set to 1 to include resolved errors', { type: 'string', enum: ['1'] })] }],
  ['get', '/api/admin/employers', 'read', 'List employers', 'Employer accounts with company details, review status, trust signals and their roles.',
    { parameters: [query('status', 'Which employers (default pending)', { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'] })] }],
  ['post', '/api/admin/employers/{id}/decision', 'employers', 'Approve or reject an employer', 'Approving makes the employer’s held roles go live and emails them. Rejecting emails them too. Recorded in the audit log.',
    { parameters: [idParam('id', 'Employer user id')], requestBody: body({ decision: str('approve or reject', { enum: ['approve', 'reject'] }), note: str('Optional note to the employer (max 1000 characters)') }, ['decision']) }],
  ['get', '/api/admin/jobs', 'read', 'List jobs', 'Jobs posted on TalentBridge by default, newest first, with application counts.',
    { parameters: [
      query('origin', 'posted (default), imported or all', { type: 'string', enum: ['posted', 'imported', 'all'] }),
      query('status', 'Filter by status', { type: 'string', enum: ['active', 'closed', 'pending_review'] }),
      query('q', 'Search title or company'),
      query('page', 'Page number, from 1', { type: 'integer' }),
      query('per', 'Results per page (1-200, default 50)', { type: 'integer' }),
    ] }],
  ['post', '/api/admin/jobs/{id}/status', 'jobs', 'Close or reopen a job', 'Takes a posted role down (closed) or puts it back up (active). Closing needs a reason, kept in the audit log. Imported jobs follow their source, and roles awaiting employer approval go live when the employer is approved.',
    { parameters: [idParam('id', 'Job id')], requestBody: body({ status: str('active or closed', { enum: ['active', 'closed'] }), reason: str('Why (required when closing, max 500 characters)') }, ['status']) }],
  ['get', '/api/admin/users', 'read', 'List users', 'Accounts, newest first. Names and emails are hidden unless the key has the personal_data permission.',
    { parameters: [
      query('role', 'Filter by role', { type: 'string', enum: ['job_seeker', 'employer', 'admin'] }),
      query('q', 'Search email or name'),
      query('page', 'Page number, from 1', { type: 'integer' }),
      query('per', 'Results per page (1-200, default 50)', { type: 'integer' }),
    ] }],
  ['get', '/api/admin/incomplete-signups', 'read', 'Incomplete signups', 'People who started signing up but haven’t finished, with how far they got.'],
  ['post', '/api/admin/incomplete-signups/{id}/remind', 'operations', 'Send a signup reminder', 'Emails one person a reminder to finish signing up.', { parameters: [idParam('id', 'User id')] }],
  ['get', '/api/admin/reports', 'read', 'Reported messages', 'Messages people reported, newest first (up to 200).'],
  ['get', '/api/admin/audit', 'read', 'Audit log', 'Admin and system actions, newest first, including everything API keys changed (action api_key.request).',
    { parameters: [
      query('action', 'Exact action, or a prefix like "employer" or "jobs"'),
      query('since', 'ISO date-time; only entries after it'),
      query('limit', 'Max entries (1-500, default 100)', { type: 'integer' }),
    ] }],
  ['get', '/api/admin/job-sources', 'read', 'List job sources', 'Every source of imported jobs (company boards, job sites) with live listing counts and last run status, the available source types, and totals.'],
  ['post', '/api/admin/job-sources', 'job_sources', 'Add a job source', 'Checks the board exists before saving. Company boards (greenhouse, lever, ashby, workday, smartrecruiters, workable) take a token: the board name or the careers page address. Search sources (usajobs, adzuna, jooble, workable_search) take location and keyword fields instead.',
    { requestBody: body({
      kind: str('Source type', { enum: ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'workable', 'remotive', 'usajobs', 'adzuna', 'jooble', 'workable_search'] }),
      token: str('Company boards: board name or careers address, e.g. https://acme.wd5.myworkdayjobs.com/en-US/Careers'),
      name: str('Company or source name shown on listings'),
      max_jobs: { type: 'integer', description: 'Most listings to import (1-200, default 100)' },
      location: str('Search sources: location, e.g. Maryland'),
      keyword: str('usajobs: keyword'),
      keywords: str('jooble / workable_search: keywords'),
      where: str('adzuna: location'),
      what: str('adzuna: keywords'),
    }, ['kind']) }],
  ['put', '/api/admin/job-sources/{id}', 'job_sources', 'Change a job source', 'Turn a source on or off (off closes its listings), change its listing cap, or rename it.',
    { parameters: [idParam('id', 'Source id')], requestBody: body({ enabled: { type: 'boolean' }, max_jobs: { type: 'integer', description: '1-200' }, name: str('New name') }) }],
  ['delete', '/api/admin/job-sources/{id}', 'job_sources', 'Remove a job source', 'Removes the source and closes its listings.', { parameters: [idParam('id', 'Source id')] }],
  ['post', '/api/admin/job-sources/run', 'job_sources', 'Run job imports now', 'Imports from every enabled source (or the ones listed), within about 45 seconds. Sources left over run on the next call.',
    { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { source_ids: { type: 'array', items: { type: 'string' }, description: 'Only these sources' } } } } } } }],
  ['post', '/api/admin/alerts/run', 'operations', 'Send job alert emails now', 'Runs the job alert digest that normally runs daily.'],
  ['post', '/api/admin/errors/{signature}/resolve', 'operations', 'Mark a server error resolved', 'Use the signature from /api/admin/system errors.', { parameters: [idParam('signature', 'Error signature')] }],
  ['post', '/api/admin/storage/migrate', 'operations', 'Move stored files to the bucket', 'Moves up to 20 database-stored uploads into the configured storage bucket per call.'],
  ['post', '/api/admin/ai/fairness', 'operations', 'Run the AI fairness check', 'Scores identical made-up candidates that differ only by an identity hint, on match scores and Capability Graph depth levels. Uses 10 AI calls and takes up to a minute.',
    { requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { job_id: str('Role to test against (default: newest active role)') } } } } } }],
];

function spec() {
  const { appUrl } = require('./mailer');
  const paths = {};
  for (const [method, path, scope, summary, description, extra = {}] of OPERATIONS) {
    paths[path] = paths[path] || {};
    paths[path][method] = {
      summary,
      description: `${description}${scope ? `\n\nNeeds the "${scope}" permission.` : ''}`,
      'x-required-scope': scope,
      ...extra,
      responses: {
        200: { description: path === '/api/admin/openapi.json' ? 'This document' : 'Success. The result is in "data".' },
        400: { description: 'Invalid input: { "error": "..." }' },
        401: { description: 'Missing, unknown, revoked or expired key: { "error", "code" }' },
        403: { description: 'The key lacks the permission, or the action isn’t available to keys: { "error", "code" }' },
        429: { description: 'Rate limit reached; see the Retry-After header' },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'TalentBridge Admin API',
      version: '1.0.0',
      description: [
        'Manage TalentBridge as an admin from an AI agent or script.',
        '',
        'Authentication: send an admin API key as `Authorization: Bearer tb_admin_...`. Create keys in Admin → API keys; each is shown once.',
        'Permissions: each operation lists the permission it needs (x-required-scope). Anything not listed here is refused.',
        'Responses: success is `{ "data": ... }`; errors are `{ "error": "...", "code": "..." }`.',
        'Privacy: without the personal_data permission, names, emails and phone numbers come back as "[hidden]".',
        'Audit: every change a key makes is recorded in the audit log under the key’s name.',
        'Rate limit: 1200 requests an hour per key.',
      ].join('\n'),
    },
    servers: [{ url: appUrl('/').replace(/\/$/, '') }],
    components: {
      securitySchemes: { adminApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'tb_admin_...' } },
    },
    security: [{ adminApiKey: [] }],
    'x-scopes': Object.fromEntries(Object.entries(SCOPES).map(([k, v]) => [k, `${v.label}: ${v.detail}`])),
    paths,
  };
}

module.exports = { spec, OPERATIONS };
