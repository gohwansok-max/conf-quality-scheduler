import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const qualityInspectionTypes = mysqlTable("quality_inspection_types", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  intervalMonths: int("intervalMonths").notNull(),
  lastManufactureDate: varchar("lastManufactureDate", { length: 10 }),
  testItems: text("testItems").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  productionStatus: mysqlEnum("productionStatus", ["active", "stopped"]).default("active").notNull(),
  productionStoppedAt: varchar("productionStoppedAt", { length: 10 }),
  productionStopReason: text("productionStopReason"),
  alertStatus: mysqlEnum("alertStatus", ["active", "paused"]).default("active").notNull(),
  alertPausedAt: varchar("alertPausedAt", { length: 10 }),
  alertPauseReason: text("alertPauseReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const qualityProducts = mysqlTable(
  "quality_products",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    inspectionTypeId: int("inspectionTypeId").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    intervalMonths: int("intervalMonths").default(2).notNull(),
    lastManufactureDate: varchar("lastManufactureDate", { length: 10 }),
    isActive: boolean("isActive").default(true).notNull(),
    productionStatus: mysqlEnum("productionStatus", ["active", "stopped"]).default("active").notNull(),
    productionStoppedAt: varchar("productionStoppedAt", { length: 10 }),
    productionStopReason: text("productionStopReason"),
    alertStatus: mysqlEnum("alertStatus", ["active", "paused"]).default("active").notNull(),
    alertPausedAt: varchar("alertPausedAt", { length: 10 }),
    alertPauseReason: text("alertPauseReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("quality_products_owner_type_name_unique").on(table.ownerId, table.inspectionTypeId, table.name)]
);

export const qualityProductManufactureRecords = mysqlTable(
  "quality_product_manufacture_records",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    productId: int("productId").notNull(),
    manufactureDate: varchar("manufactureDate", { length: 10 }).notNull(),
    previousManufactureDate: varchar("previousManufactureDate", { length: 10 }),
    memo: varchar("memo", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("quality_product_manufacture_records_owner_product_created").on(table.ownerId, table.productId, table.createdAt)]
);

export const qualityCertificates = mysqlTable("quality_certificates", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  inspectionTypeId: int("inspectionTypeId").notNull(),
  productId: int("productId"),
  certificateNumber: varchar("certificateNumber", { length: 120 }),
  inspectionDate: varchar("inspectionDate", { length: 10 }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  storageKey: varchar("storageKey", { length: 600 }).notNull(),
  contentType: varchar("contentType", { length: 120 }).notNull(),
  fileSize: int("fileSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const qualityCertificateNumberRules = mysqlTable(
  "quality_certificate_number_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    prefix: varchar("prefix", { length: 40 }).default("KOENF-QC").notNull(),
    sequenceDigits: int("sequenceDigits").default(3).notNull(),
    lastIssuedYear: int("lastIssuedYear").default(0).notNull(),
    lastIssuedSequence: int("lastIssuedSequence").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("quality_certificate_number_rules_owner_unique").on(table.ownerId)]
);

export const qualityMonthlyReports = mysqlTable(
  "quality_monthly_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    reportMonth: varchar("reportMonth", { length: 7 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 600 }).notNull(),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("quality_monthly_reports_owner_month_unique").on(table.ownerId, table.reportMonth)]
);

export const qualityNotificationSettings = mysqlTable(
  "quality_notification_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    telegramChatId: varchar("telegramChatId", { length: 64 }),
    warningDays: int("warningDays").default(14).notNull(),
    alertHourKst: int("alertHourKst").default(9).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    isScheduleEnabled: boolean("isScheduleEnabled").default(false).notNull(),
    isAlertPaused: boolean("isAlertPaused").default(false).notNull(),
    alertPausedAt: varchar("alertPausedAt", { length: 10 }),
    alertPauseReason: text("alertPauseReason"),
    lastRunAt: timestamp("lastRunAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("quality_notification_settings_owner_unique").on(table.ownerId),
    uniqueIndex("quality_notification_settings_task_unique").on(table.scheduleCronTaskUid),
  ]
);

export const qualityNotificationTimeSlots = mysqlTable(
  "quality_notification_time_slots",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    timeKst: varchar("timeKst", { length: 5 }).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("quality_notification_time_slots_owner_time_unique").on(table.ownerId, table.timeKst),
    uniqueIndex("quality_notification_time_slots_task_unique").on(table.scheduleCronTaskUid),
  ]
);

export const qualityTelegramRecipients = mysqlTable(
  "quality_telegram_recipients",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    telegramChatId: varchar("telegramChatId", { length: 64 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    receivesHealthAlerts: boolean("receivesHealthAlerts").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("quality_telegram_recipients_owner_name_unique").on(table.ownerId, table.name)]
);

export const qualityTelegramRecipientScopes = mysqlTable(
  "quality_telegram_recipient_scopes",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    recipientId: int("recipientId").notNull(),
    scopeType: mysqlEnum("scopeType", ["inspection_type", "product"]).notNull(),
    scopeId: int("scopeId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("quality_telegram_recipient_scope_unique").on(table.recipientId, table.scopeType, table.scopeId)]
);

export const qualityNotificationLogs = mysqlTable(
  "quality_notification_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    settingId: int("settingId").notNull(),
    recipientId: int("recipientId"),
    inspectionTypeId: int("inspectionTypeId"),
    idempotencyKey: varchar("idempotencyKey", { length: 180 }).notNull(),
    alertDate: varchar("alertDate", { length: 10 }).notNull(),
    alertLevel: mysqlEnum("alertLevel", ["overdue", "urgent", "test", "report"]).notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
    message: text("message").notNull(),
    telegramMessageId: varchar("telegramMessageId", { length: 64 }),
    errorMessage: text("errorMessage"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("quality_notification_logs_idempotency_unique").on(table.idempotencyKey),
  ]
);

export const healthCertificates = mysqlTable(
  "health_certificates",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    employeeName: varchar("employeeName", { length: 120 }).notNull(),
    department: varchar("department", { length: 120 }),
    issuedAt: varchar("issuedAt", { length: 10 }).notNull(),
    expiresAt: varchar("expiresAt", { length: 10 }).notNull(),
    validityMonths: int("validityMonths").default(12).notNull(),
    warningDays: int("warningDays").default(30).notNull(),
    alertStatus: mysqlEnum("alertStatus", ["active", "paused"]).default("active").notNull(),
    alertPausedAt: varchar("alertPausedAt", { length: 10 }),
    alertPauseReason: text("alertPauseReason"),
    employmentStatus: mysqlEnum("employmentStatus", ["active", "inactive"]).default("active").notNull(),
    inactiveAt: varchar("inactiveAt", { length: 10 }),
    inactiveReason: text("inactiveReason"),
    fileName: varchar("fileName", { length: 255 }),
    storageKey: varchar("storageKey", { length: 600 }),
    contentType: varchar("contentType", { length: 120 }),
    fileSize: int("fileSize"),
    memo: text("memo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("health_certificates_owner_employee_unique").on(table.ownerId, table.employeeName)]
);

export const healthCertificateNotificationLogs = mysqlTable(
  "health_certificate_notification_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    healthCertificateId: int("healthCertificateId").notNull(),
    recipientId: int("recipientId"),
    idempotencyKey: varchar("idempotencyKey", { length: 180 }).notNull(),
    alertDate: varchar("alertDate", { length: 10 }).notNull(),
    alertLevel: mysqlEnum("alertLevel", ["overdue", "urgent", "test"]).notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
    message: text("message").notNull(),
    telegramMessageId: varchar("telegramMessageId", { length: 64 }),
    errorMessage: text("errorMessage"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("health_certificate_notification_logs_idempotency_unique").on(table.idempotencyKey)]
);

export type QualityInspectionType = typeof qualityInspectionTypes.$inferSelect;
export type QualityNotificationSetting = typeof qualityNotificationSettings.$inferSelect;
export type QualityNotificationTimeSlot = typeof qualityNotificationTimeSlots.$inferSelect;
export type QualityNotificationLog = typeof qualityNotificationLogs.$inferSelect;
export type QualityProduct = typeof qualityProducts.$inferSelect;
export type QualityCertificate = typeof qualityCertificates.$inferSelect;
export type QualityMonthlyReport = typeof qualityMonthlyReports.$inferSelect;
export type QualityProductManufactureRecord = typeof qualityProductManufactureRecords.$inferSelect;
export type QualityCertificateNumberRule = typeof qualityCertificateNumberRules.$inferSelect;
export type QualityTelegramRecipient = typeof qualityTelegramRecipients.$inferSelect;
export type QualityTelegramRecipientScope = typeof qualityTelegramRecipientScopes.$inferSelect;
export type HealthCertificate = typeof healthCertificates.$inferSelect;
export type HealthCertificateNotificationLog = typeof healthCertificateNotificationLogs.$inferSelect;
