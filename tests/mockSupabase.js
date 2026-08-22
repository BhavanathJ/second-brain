// In-memory Supabase mock. Mirrors the Postgres semantics the services
// rely on: row defaults, unique-constraint errors (code 23505), filter
// operators (eq/is/gt/gte/lt/lte/in/contains), ordering, insert/update/
// delete row returns, and the `habits(...)` join used by the calendar.
//
// It is NOT a full Postgres clone - it implements exactly the surface the
// codebase exercises. Inserted into require.cache so services' `require
// ('../config/supabase')` resolves to this instead of the real client.

const crypto = require('crypto');

const NOW = () => new Date().toISOString();

const DEFAULTS = {
  users: {},
  profiles: { created_at: NOW },
  refresh_tokens: {},
  settings: { timezone: () => 'Asia/Kolkata', theme: () => 'light', week_starts_on: () => 0, updated_at: NOW },
  tasks: {
    status: () => 'pending', urgent: () => false, important: () => false,
    due_at: () => null, deleted_at: () => null, created_at: NOW, updated_at: NOW,
  },
  notes: {
    tags: () => [], converted_task_id: () => null, deleted_at: () => null,
    created_at: NOW, updated_at: NOW,
  },
  habits: { target_per_week: () => 7, deleted_at: () => null, created_at: NOW },
  habit_logs: { completed: () => false, created_at: NOW },
  calendar_events: { ends_at: () => null, location: () => null, deleted_at: () => null, created_at: NOW },
  reminders: {
    entity_type: () => null, entity_id: () => null, is_done: () => false,
    deleted_at: () => null, created_at: NOW,
  },
  bin_entries: { deleted_at: NOW, auto_purge_at: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() },
};

// [col, col] composite keys. id is implicitly unique everywhere.
const UNIQUES = {
  users: [['email']],
  settings: [['profile_id']],
  habit_logs: [['habit_id', 'log_date']],
};

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.selectExpr = null;
    this.selectCalled = false;
    this.countOpts = null;
    this.filters = [];
    this.orderBy = null;
    this.limitN = null;
    this.mode = 'many'; // 'many' | 'maybeSingle' | 'single'
    this.verb = 'select';
    this.insertRow = null;
    this.updateFields = null;
  }

  select(expr, opts) { this.selectExpr = expr; this.selectCalled = true; this.countOpts = opts || null; return this; }
  eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this; }
  is(col, val) { this.filters.push({ col, op: 'is', val }); return this; }
  neq(col, val) { this.filters.push({ col, op: 'neq', val }); return this; }
  gt(col, val) { this.filters.push({ col, op: 'gt', val }); return this; }
  gte(col, val) { this.filters.push({ col, op: 'gte', val }); return this; }
  lt(col, val) { this.filters.push({ col, op: 'lt', val }); return this; }
  lte(col, val) { this.filters.push({ col, op: 'lte', val }); return this; }
  in(col, vals) { this.filters.push({ col, op: 'in', val: vals }); return this; }
  contains(col, vals) { this.filters.push({ col, op: 'contains', val: vals }); return this; }
  order(col, { ascending = true } = {}) { this.orderBy = { col, ascending }; return this; }
  limit(n) { this.limitN = n; return this; }
  maybeSingle() { this.mode = 'maybeSingle'; return this; }
  single() { this.mode = 'single'; return this; }

  insert(row) { this.verb = 'insert'; this.insertRow = row || {}; return this; }
  update(fields) { this.verb = 'update'; this.updateFields = fields || {}; return this; }
  delete() { this.verb = 'delete'; return this; }

  then(resolve, reject) {
    try {
      resolve(this._run());
    } catch (err) {
      reject(err);
    }
  }

  _matches(row) {
    for (const f of this.filters) {
      const actual = row[f.col];
      switch (f.op) {
        case 'eq': if (actual !== f.val) return false; break;
        case 'is':
          if (f.val === null) { if (actual !== null && actual !== undefined) return false; }
          else if (f.val === true || f.val === false) { if (actual !== f.val) return false; }
          else if (actual !== f.val) return false;
          break;
        case 'neq': if (actual === f.val) return false; break;
        case 'gt': if (!(actual > f.val)) return false; break;
        case 'gte': if (!(actual >= f.val)) return false; break;
        case 'lt': if (!(actual < f.val)) return false; break;
        case 'lte': if (!(actual <= f.val)) return false; break;
        case 'in': if (!(Array.isArray(f.val) && f.val.includes(actual))) return false; break;
        case 'contains':
          if (!Array.isArray(actual) || !Array.isArray(f.val)) return false;
          if (!f.val.every(v => actual.includes(v))) return false;
          break;
      }
    }
    return true;
  }

  _project(row) {
    const joinMatch = this.selectExpr ? this.selectExpr.match(/habits\(([^)]+)\)/) : null;
    const out = {};

    if (!this.selectExpr || this.selectExpr === '*') {
      Object.assign(out, row);
    } else {
      let expr = this.selectExpr;
      if (joinMatch) expr = expr.replace(/,\s*habits\([^)]*\)/, '');
      if (expr.includes('*')) Object.assign(out, row);
      for (const c of expr.split(',').map(s => s.trim()).filter(Boolean)) {
        if (c !== '*') out[c] = row[c];
      }
    }

    // '*, habits(id, title, target_per_week)' join - nest the parent habit.
    if (joinMatch && this.table === 'habit_logs' && row.habit_id != null) {
      const habit = this.db.habits.find(h => h.id === row.habit_id);
      if (habit) {
        out.habits = { id: habit.id, title: habit.title, target_per_week: habit.target_per_week };
      }
    }
    return out;
  }

  _uniqueViolation(row) {
    const checks = UNIQUES[this.table] || [];
    for (const key of checks) {
      const hits = this.db[this.table].some(existing =>
        key.every(col => existing[col] === row[col])
      );
      if (hits) {
        const err = new Error(`duplicate key value violates unique constraint "${this.table}_${key.join('_')}"`);
        err.code = '23505';
        return err;
      }
    }
    return null;
  }

  _run() {
    if (this.verb === 'insert') {
      const row = { ...this.insertRow };
      row.id = row.id || crypto.randomUUID();
      for (const [col, val] of Object.entries(DEFAULTS[this.table] || {})) {
        if (row[col] === undefined) row[col] = val();
      }
      const violation = this._uniqueViolation(row);
      if (violation) throw violation;
      this.db[this.table].push(row);
      if (this.mode === 'single' || this.mode === 'maybeSingle') {
        return { data: this._project(row), error: null };
      }
      return { data: null, error: null }; // insert without .select()
    }

    if (this.verb === 'update') {
      const matches = this.db[this.table].filter(r => this._matches(r));
      const updated = [];
      for (const r of matches) Object.assign(r, this.updateFields), updated.push(r);
      if (this.mode === 'maybeSingle' || this.mode === 'single') {
        return { data: updated.length ? this._project(updated[0]) : null, error: null };
      }
      if (this.selectCalled) {
        return { data: updated.map(r => this._project(r)), error: null };
      }
      return { data: null, error: null };
    }

    if (this.verb === 'delete') {
      const matches = this.db[this.table].filter(r => this._matches(r));
      const removed = matches.slice();
      for (const r of matches) {
        const idx = this.db[this.table].indexOf(r);
        if (idx !== -1) this.db[this.table].splice(idx, 1);
      }
      if (this.mode === 'maybeSingle' || this.mode === 'single') {
        return { data: removed.length ? this._project(removed[0]) : null, error: null };
      }
      if (this.selectCalled) return { data: removed.map(r => this._project(r)), error: null };
      return { data: null, error: null };
    }

    // select
    let rows = this.db[this.table].filter(r => this._matches(r));
    if (this.orderBy) {
      const { col, ascending } = this.orderBy;
      rows = rows.slice().sort((a, b) => {
        if (a[col] == null) return 1;
        if (b[col] == null) return -1;
        const cmp = a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);

    if (this.countOpts && this.countOpts.head) {
      return { count: rows.length, data: null, error: null };
    }
    if (this.mode === 'maybeSingle' || this.mode === 'single') {
      return { data: rows.length ? this._project(rows[0]) : null, error: null };
    }
    return { data: rows.map(r => this._project(r)), error: null };
  }
}

function makeClient() {
  return {
    _db: {
      users: [], profiles: [], refresh_tokens: [], settings: [], tasks: [],
      notes: [], habits: [], habit_logs: [], calendar_events: [], reminders: [], bin_entries: [],
    },
    from(table) { return new Query(this._db, table); },
    // Direct seeding helper for tests (applies defaults + id).
    seed(table, row) {
      const r = { ...(row || {}) };
      r.id = r.id || crypto.randomUUID();
      for (const [col, val] of Object.entries(DEFAULTS[table] || {})) {
        if (r[col] === undefined) r[col] = val();
      }
      const violation = new Query(this._db, table)._uniqueViolation(r);
      if (violation) throw violation;
      this._db[table].push(r);
      return r;
    },
  };
}

module.exports = makeClient();
