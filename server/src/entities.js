'use strict';
const crypto = require('crypto');
const { db } = require('./db');
const { can } = require('./rls');
const { authRequired, optionalAuth, getUserById } = require('./auth');

// Entities whose list/read endpoints anonymous visitors may call. RLS still
// decides which rows they see (Job: only status='active').
const PUBLIC_READ = ['Job'];

const ENTITIES = ['SeekerProfile', 'Job', 'JobApplication', 'Invitation'];

function rowToRecord(row) {
  if (!row) return null;
  return {
    ...JSON.parse(row.data || '{}'),
    id: row.id,
    created_by_id: row.created_by_id,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function getRecord(entity, id) {
  const row = db
    .prepare('SELECT * FROM records WHERE entity = ? AND id = ?')
    .get(entity, id);
  return rowToRecord(row);
}

function allRecords(entity) {
  return db
    .prepare('SELECT * FROM records WHERE entity = ? ORDER BY created_date DESC')
    .all(entity)
    .map(rowToRecord);
}

// Internal (service-role) access for backend functions — bypasses RLS the
// same way Base44's asServiceRole did. Only server code may call these.
const store = {
  get: getRecord,
  all: allRecords,
  filter(entity, criteria) {
    return allRecords(entity).filter((r) => matches(r, criteria));
  },
  create(entity, data, createdById) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO records (entity, id, created_by_id, created_date, updated_date, data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(entity, id, createdById || null, now, now, JSON.stringify(data || {}));
    return getRecord(entity, id);
  },
  update(entity, id, data) {
    const existing = getRecord(entity, id);
    if (!existing) return null;
    const { id: _id, created_by_id, created_date, updated_date, ...fields } = existing;
    const merged = { ...fields, ...(data || {}) };
    db.prepare('UPDATE records SET data = ?, updated_date = ? WHERE entity = ? AND id = ?').run(
      JSON.stringify(merged),
      new Date().toISOString(),
      entity,
      id
    );
    return getRecord(entity, id);
  },
  remove(entity, id) {
    db.prepare('DELETE FROM records WHERE entity = ? AND id = ?').run(entity, id);
  },
};

function matches(record, criteria) {
  for (const [key, value] of Object.entries(criteria || {})) {
    if (record[key] !== value) return false;
  }
  return true;
}

function registerEntityRoutes(app) {
  // Anonymous GETs are allowed for PUBLIC_READ entities only; everything else
  // (and every write) requires a valid session.
  app.use('/api/entities/:entity', (req, res, next) => {
    if (req.method === 'GET' && PUBLIC_READ.includes(req.params.entity)) {
      return optionalAuth(req, res, next);
    }
    return authRequired(req, res, next);
  });

  app.post('/api/entities/:entity', (req, res) => {
    const { entity } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const probe = { ...(req.body || {}), created_by_id: req.user.id };
    if (!can(entity, 'create', req.user, probe)) {
      return res.status(403).json({ error: `Permission denied for create operation on ${entity} entity` });
    }
    const body = { ...(req.body || {}) };
    if (entity === 'JobApplication') {
      // employer_user_id drives the employer's RLS read/update branch; derive
      // it from the job's owner server-side rather than trusting the client.
      const job = body.job_id ? getRecord('Job', body.job_id) : null;
      if (!job) return res.status(400).json({ error: 'job_id must reference an existing job' });
      body.employer_user_id = job.created_by_id || null;
    }
    const record = store.create(entity, body, req.user.id);
    // Keep user.data.seeker_profile_id current so Invitation read rules can
    // resolve {{user.data.seeker_profile_id}} like Base44 did.
    if (entity === 'SeekerProfile') {
      const userRow = getUserById(req.user.id);
      const data = JSON.parse(userRow.data || '{}');
      data.seeker_profile_id = record.id;
      db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), req.user.id);
    }
    res.json({ data: record });
  });

  app.get('/api/entities/:entity', (req, res) => {
    const { entity } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    let criteria = {};
    try {
      criteria = req.query.filter ? JSON.parse(req.query.filter) : {};
    } catch {
      return res.status(400).json({ error: 'Invalid filter' });
    }
    const limit = Math.min(parseInt(req.query.limit || '1000', 10) || 1000, 5000);
    const visible = store
      .filter(entity, criteria)
      .filter((r) => can(entity, 'read', req.user, r))
      .slice(0, limit);
    res.json({ data: visible });
  });

  app.get('/api/entities/:entity/:id', (req, res) => {
    const { entity, id } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const record = getRecord(entity, id);
    if (!record || !can(entity, 'read', req.user, record)) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ data: record });
  });

  app.put('/api/entities/:entity/:id', (req, res) => {
    const { entity, id } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const record = getRecord(entity, id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!can(entity, 'update', req.user, record)) {
      return res.status(403).json({ error: `Permission denied for update operation on ${entity} entity` });
    }
    res.json({ data: store.update(entity, id, req.body || {}) });
  });

  app.delete('/api/entities/:entity/:id', (req, res) => {
    const { entity, id } = req.params;
    if (!ENTITIES.includes(entity)) return res.status(404).json({ error: 'Unknown entity' });
    const record = getRecord(entity, id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (!can(entity, 'delete', req.user, record)) {
      return res.status(403).json({ error: `Permission denied for delete operation on ${entity} entity` });
    }
    store.remove(entity, id);
    res.json({ success: true });
  });
}

module.exports = { registerEntityRoutes, store };
