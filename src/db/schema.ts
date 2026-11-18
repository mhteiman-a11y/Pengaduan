import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Master Roles Table (RBAC)
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // 'citizen' | 'verifier' | 'admin' | 'viewer'
  name: text('name').notNull(),
  description: text('description').notNull(),
});

// 2. Master Service Types (Managed by System Admin)
export const serviceTypes = pgTable('service_types', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  slaDays: integer('sla_days').notNull().default(3),
  requiredDocs: text('required_docs').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Users Table (Linked with Firebase Auth UID, Citizen NIK & PIC Access Control)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(), // Firebase Auth UID for authenticated accounts
  name: text('name').notNull(),
  nik: text('nik').unique(), // 16-digit Indonesian National ID
  phone: text('phone'),
  email: text('email').notNull(),
  roleId: integer('role_id')
    .references(() => roles.id)
    .notNull()
    .default(1),
  password: text('password'), // Optional scrypt hash for internal staff records
  isActive: boolean('is_active').notNull().default(true),
  isPic: boolean('is_pic').notNull().default(false),
  allowedFeatures: text('allowed_features').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Complaints & Population Data Requests Table
export const complaints = pgTable('complaints', {
  id: serial('id').primaryKey(),
  ticketNumber: text('ticket_number').notNull().unique(), // e.g., SDK-202611-0001
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  serviceType: text('service_type').notNull(),
  description: text('description').notNull(),
  filePath: text('file_path'),
  fileOriginalName: text('file_original_name'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'IN_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4b. Persistent Complaint File Attachments (Stored in PostgreSQL so files survive restarts)
export const complaintAttachments = pgTable('complaint_attachments', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  contentBase64: text('content_base64').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. Verifications Table (ASN Decisions, Rejections & Booking Dates)
export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  complaintId: integer('complaint_id')
    .references(() => complaints.id, { onDelete: 'cascade' })
    .notNull(),
  adminId: integer('admin_id')
    .references(() => users.id)
    .notNull(),
  action: text('action').notNull(), // 'IN_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED'
  reason: text('reason'),
  bookingDate: date('booking_date'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// 6. Notifications Table (WhatsApp & Email Dispatch Log)
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  complaintId: integer('complaint_id').references(() => complaints.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(), // 'WHATSAPP' | 'EMAIL'
  recipient: text('recipient').notNull(),
  messageContent: text('message_content').notNull(),
  statusSent: text('status_sent').notNull().default('SENT'), // 'QUEUED' | 'SENT' | 'FAILED'
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// 7. Audit Logs Table (Immutable Security & Action Trail)
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entityName: text('entity_name').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Drizzle Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  complaints: many(complaints),
  verifications: many(verifications),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  applicant: one(users, {
    fields: [complaints.userId],
    references: [users.id],
  }),
  attachment: one(complaintAttachments, {
    fields: [complaints.id],
    references: [complaintAttachments.complaintId],
  }),
  verifications: many(verifications),
  notifications: many(notifications),
}));

export const complaintAttachmentsRelations = relations(
  complaintAttachments,
  ({ one }) => ({
    complaint: one(complaints, {
      fields: [complaintAttachments.complaintId],
      references: [complaints.id],
    }),
  })
);

export const verificationsRelations = relations(verifications, ({ one }) => ({
  complaint: one(complaints, {
    fields: [verifications.complaintId],
    references: [complaints.id],
  }),
  admin: one(users, {
    fields: [verifications.adminId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  complaint: one(complaints, {
    fields: [notifications.complaintId],
    references: [complaints.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
