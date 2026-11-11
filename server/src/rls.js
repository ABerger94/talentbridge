'use strict';
// Row-level security rules, ported from base44/entities/*.jsonc and evaluated
// server-side on every entity operation.
//
// A rule is a list of branches ($or). A branch passes when ALL its conditions
// pass. Condition forms:
//   { role: 'job_seeker' }              -> user.role equals
//   { created_by_id: 'self' }           -> record.created_by_id === user.id
//   { dataField: 'employer_user_id', eq: 'self' }
//                                       -> record[field] === user.id
//   { dataField: 'seeker_profile_id', eq: 'userData' }
//                                       -> record[field] === user.data[field]
//   { dataField: 'status', eqValue: 'active' }
//                                       -> record[field] === literal
// (Record fields live at the top level of the record object, like Base44's.)
//
// Fixes vs the Base44 originals (owner lockouts):
//   - SeekerProfile create: admin branch added (was job_seeker-only, which
//     permanently blocked the owner/admin account from creating a profile).
//   - JobApplication create: admin branch added for the same reason.
//   - Invitation create: admin branch added for the same reason.

const RULES = {
  SeekerProfile: {
    create: [
      { created_by_id: 'self', role: 'job_seeker' },
      { role: 'admin' },
    ],
    read: [
      { created_by_id: 'self' },
      { role: 'employer' },
      { role: 'admin' },
    ],
    update: [{ created_by_id: 'self' }, { role: 'admin' }],
    delete: [{ created_by_id: 'self' }, { role: 'admin' }],
  },
  Job: {
    create: [{ role: 'employer' }, { role: 'admin' }],
    read: [
      { dataField: 'status', eqValue: 'active' },
      { created_by_id: 'self' },
      { role: 'admin' },
    ],
    update: [{ created_by_id: 'self' }, { role: 'admin' }],
    delete: [{ created_by_id: 'self' }, { role: 'admin' }],
  },
  JobApplication: {
    create: [
      { created_by_id: 'self', role: 'job_seeker' },
      { role: 'admin' },
    ],
    read: [
      { created_by_id: 'self' },
      { dataField: 'employer_user_id', eq: 'self' },
      { role: 'admin' },
    ],
    update: [
      { created_by_id: 'self' },
      { dataField: 'employer_user_id', eq: 'self' },
      { role: 'admin' },
    ],
    delete: [{ created_by_id: 'self' }, { role: 'admin' }],
  },
  Invitation: {
    create: [{ role: 'employer' }, { role: 'admin' }],
    read: [
      { created_by_id: 'self' },
      { dataField: 'seeker_profile_id', eq: 'userData' },
      { role: 'admin' },
    ],
    update: [
      { created_by_id: 'self' },
      { dataField: 'seeker_profile_id', eq: 'userData' },
      { role: 'admin' },
    ],
    delete: [{ created_by_id: 'self' }, { role: 'admin' }],
  },
};

function branchPassesSafe(branch, user, record) {
  // Anonymous callers can only satisfy pure literal-value branches
  // (e.g. Job read: status === 'active').
  if (!user) {
    const keys = Object.keys(branch);
    const literalOnly = keys.every((k) => k === 'dataField' || k === 'eqValue') && 'eqValue' in branch;
    if (!literalOnly) return false;
    return !!record && record[branch.dataField] === branch.eqValue;
  }
  const keys = Object.keys(branch);
  for (const key of keys) {
    if (key === 'eq' || key === 'eqValue') continue; // handled with dataField
    if (key === 'role') {
      if (user.role !== branch.role) return false;
    } else if (key === 'created_by_id') {
      if (record && record.created_by_id !== user.id) return false;
    } else if (key === 'dataField') {
      const field = branch.dataField;
      const actual = record ? record[field] : undefined;
      let expected;
      if (branch.eq === 'self') expected = user.id;
      else if (branch.eq === 'userData') expected = user.data?.[field];
      else if ('eqValue' in branch) expected = branch.eqValue;
      if (actual !== expected) return false;
    }
  }
  return true;
}

function can(entity, op, user, record) {
  const rule = RULES[entity]?.[op];
  if (!rule) return false;
  return rule.some((branch) => branchPassesSafe(branch, user, record));
}

module.exports = { can, RULES };
