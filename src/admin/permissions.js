const { getDatabase } = require('../db/database');
const config = require('../config');

const ROLES = {
  OWNER: 'owner',
  FINANCE: 'finance',
  MODERATOR: 'moderator',
  SUPPORT: 'support'
};

const PERMISSIONS = {
  // dashboard
  VIEW_DASHBOARD: [ROLES.OWNER, ROLES.FINANCE, ROLES.MODERATOR, ROLES.SUPPORT],
  // users
  VIEW_USERS: [ROLES.OWNER, ROLES.FINANCE, ROLES.MODERATOR, ROLES.SUPPORT],
  EDIT_BALANCE: [ROLES.OWNER, ROLES.FINANCE],
  VIEW_PAYMENTS: [ROLES.OWNER, ROLES.FINANCE],
  // gifts & catalog
  MANAGE_CATALOG: [ROLES.OWNER, ROLES.MODERATOR],
  MANAGE_ORDERS: [ROLES.OWNER, ROLES.FINANCE, ROLES.MODERATOR],
  RETRY_DELIVERIES: [ROLES.OWNER, ROLES.FINANCE, ROLES.MODERATOR],
  // referrals & rewards
  MANAGE_REFERRALS: [ROLES.OWNER, ROLES.MODERATOR],
  MANAGE_CHANNELS: [ROLES.OWNER, ROLES.MODERATOR],
  MANAGE_REWARDS: [ROLES.OWNER, ROLES.MODERATOR],
  MANAGE_GAMES: [ROLES.OWNER, ROLES.MODERATOR],
  // advertising
  MANAGE_ADS: [ROLES.OWNER, ROLES.MODERATOR],
  // support
  MANAGE_TICKETS: [ROLES.OWNER, ROLES.SUPPORT, ROLES.MODERATOR],
  // system
  BROADCAST: [ROLES.OWNER],
  MANAGE_ADMINS: [ROLES.OWNER],
  MANAGE_SETTINGS: [ROLES.OWNER],
  VIEW_AUDIT: [ROLES.OWNER]
};

function getAdmin(userId, db = getDatabase()) {
  const numId = Number(userId);
  if (config.adminIds.includes(numId)) {
    return { id: numId, role: ROLES.OWNER, username: 'root_owner' };
  }
  return db.get(`SELECT * FROM admins WHERE id = ?`, [numId]);
}

function hasPermission(userId, actionKey, db = getDatabase()) {
  const admin = getAdmin(userId, db);
  if (!admin) return false;
  if (admin.role === ROLES.OWNER) return true;

  const allowedRoles = PERMISSIONS[actionKey];
  if (!allowedRoles) return false;
  return allowedRoles.includes(admin.role);
}

function recordAuditLog({ adminId, action, targetType = null, targetId = null, details = null }, db = getDatabase()) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      Number(adminId),
      action,
      targetType ? String(targetType) : null,
      targetId ? String(targetId) : null,
      details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null,
      now
    ]
  );
}

module.exports = {
  ROLES,
  PERMISSIONS,
  getAdmin,
  hasPermission,
  recordAuditLog
};
