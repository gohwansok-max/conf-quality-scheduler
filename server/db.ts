import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  healthCertificateNotificationLogs,
  healthCertificates,
  qualityCertificates,
  qualityCertificateNumberRules,
  qualityInspectionTypes,
  qualityMonthlyReports,
  qualityNotificationLogs,
  qualityNotificationSettings,
  qualityNotificationTimeSlots,
  qualityProductManufactureRecords,
  qualityProducts,
  qualityTelegramRecipientScopes,
  qualityTelegramRecipients,
  users,
} from "../drizzle/schema";
import { DEFAULT_INSPECTION_TYPES } from "./qualityScheduleCore";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listInspectionTypes(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(qualityInspectionTypes).where(eq(qualityInspectionTypes.ownerId, ownerId));
  if (existing.length === 0) {
    await db.insert(qualityInspectionTypes).values(
      DEFAULT_INSPECTION_TYPES.map(item => ({ ...item, ownerId }))
    );
  }
  return db.select().from(qualityInspectionTypes).where(eq(qualityInspectionTypes.ownerId, ownerId)).orderBy(asc(qualityInspectionTypes.id));
}

export async function createInspectionType(ownerId: number, input: {
  name: string;
  intervalMonths: number;
  lastManufactureDate?: string | null;
  testItems: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(qualityInspectionTypes).values({
    ownerId,
    name: input.name,
    intervalMonths: input.intervalMonths,
    lastManufactureDate: input.lastManufactureDate ?? null,
    testItems: input.testItems,
  });
  return result[0].insertId;
}

export async function updateInspectionType(ownerId: number, id: number, input: {
  lastManufactureDate?: string | null;
  name?: string;
  intervalMonths?: number;
  testItems?: string;
  isActive?: boolean;
  productionStatus?: "active" | "stopped";
  productionStoppedAt?: string | null;
  productionStopReason?: string | null;
  alertStatus?: "active" | "paused";
  alertPausedAt?: string | null;
  alertPauseReason?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ownershipFilter = and(eq(qualityInspectionTypes.id, id), eq(qualityInspectionTypes.ownerId, ownerId));
  const item = (await db.select().from(qualityInspectionTypes).where(ownershipFilter).limit(1))[0];
  if (!item || item.ownerId !== ownerId) throw new Error("Inspection type not found");
  await db.update(qualityInspectionTypes).set(input).where(ownershipFilter);
  return { ...item, ...input };
}

export async function listProducts(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(qualityProducts).where(eq(qualityProducts.ownerId, ownerId)).orderBy(asc(qualityProducts.name));
}

export async function createProduct(ownerId: number, input: { inspectionTypeId: number; name: string; intervalMonths?: number; lastManufactureDate?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const type = (await db.select().from(qualityInspectionTypes).where(and(eq(qualityInspectionTypes.id, input.inspectionTypeId), eq(qualityInspectionTypes.ownerId, ownerId))).limit(1))[0];
  if (!type) throw new Error("Inspection type not found");
  const result = await db.insert(qualityProducts).values({
    ownerId,
    inspectionTypeId: input.inspectionTypeId,
    name: input.name,
    intervalMonths: input.intervalMonths ?? 2,
    lastManufactureDate: input.lastManufactureDate ?? null,
  });
  return result[0].insertId;
}

export async function updateProduct(ownerId: number, id: number, input: {
  intervalMonths?: number;
  lastManufactureDate?: string | null;
  productionStatus?: "active" | "stopped";
  productionStoppedAt?: string | null;
  productionStopReason?: string | null;
  alertStatus?: "active" | "paused";
  alertPausedAt?: string | null;
  alertPauseReason?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const filter = and(eq(qualityProducts.id, id), eq(qualityProducts.ownerId, ownerId));
  const product = (await db.select().from(qualityProducts).where(filter).limit(1))[0];
  if (!product) throw new Error("Product not found");
  await db.update(qualityProducts).set(input).where(filter);
  return { ...product, ...input };
}

export async function recordProductManufactureDate(ownerId: number, input: { productId: number; manufactureDate: string; memo?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const filter = and(eq(qualityProducts.id, input.productId), eq(qualityProducts.ownerId, ownerId));
  const product = (await db.select().from(qualityProducts).where(filter).limit(1))[0];
  if (!product) throw new Error("Product not found");
  if (product.lastManufactureDate === input.manufactureDate) return { product, recorded: false };
  await db.update(qualityProducts).set({ lastManufactureDate: input.manufactureDate }).where(filter);
  const result = await db.insert(qualityProductManufactureRecords).values({ ownerId, productId: input.productId, manufactureDate: input.manufactureDate, previousManufactureDate: product.lastManufactureDate, memo: input.memo?.trim() || null });
  return { product: { ...product, lastManufactureDate: input.manufactureDate }, recordId: Number(result[0].insertId), recorded: true };
}

export async function recordProductManufactureDates(ownerId: number, entries: Array<{ productId: number; manufactureDate: string; memo?: string | null }>) {
  const results = [];
  for (const entry of entries) results.push(await recordProductManufactureDate(ownerId, entry));
  return results;
}

export async function listProductManufactureRecords(ownerId: number, limit = 24) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(qualityProductManufactureRecords).where(eq(qualityProductManufactureRecords.ownerId, ownerId)).orderBy(desc(qualityProductManufactureRecords.createdAt)).limit(limit);
}

export async function listCertificates(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(qualityCertificates).where(eq(qualityCertificates.ownerId, ownerId)).orderBy(desc(qualityCertificates.createdAt));
}

export type HealthCertificateInput = {
  employeeName: string;
  department?: string | null;
  issuedAt: string;
  expiresAt: string;
  validityMonths: number;
  warningDays: number;
  memo?: string | null;
};

export async function listHealthCertificates(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(healthCertificates).where(eq(healthCertificates.ownerId, ownerId)).orderBy(asc(healthCertificates.employeeName));
}

export async function getHealthCertificate(ownerId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(healthCertificates).where(and(eq(healthCertificates.ownerId, ownerId), eq(healthCertificates.id, id))).limit(1))[0];
}

export async function createHealthCertificate(ownerId: number, input: HealthCertificateInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(healthCertificates).values({ ownerId, ...input, department: input.department?.trim() || null, memo: input.memo?.trim() || null });
  return Number(result[0].insertId);
}

export async function updateHealthCertificate(ownerId: number, id: number, input: Partial<HealthCertificateInput & {
  alertStatus: "active" | "paused";
  alertPausedAt: string | null;
  alertPauseReason: string | null;
  employmentStatus: "active" | "inactive";
  inactiveAt: string | null;
  inactiveReason: string | null;
  fileName: string | null;
  storageKey: string | null;
  contentType: string | null;
  fileSize: number | null;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = await getHealthCertificate(ownerId, id);
  if (!current) throw new Error("Health certificate not found");
  await db.update(healthCertificates).set(input).where(and(eq(healthCertificates.ownerId, ownerId), eq(healthCertificates.id, id)));
  return { ...current, ...input };
}

export async function deleteHealthCertificate(ownerId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(healthCertificateNotificationLogs).where(and(eq(healthCertificateNotificationLogs.ownerId, ownerId), eq(healthCertificateNotificationLogs.healthCertificateId, id)));
  await db.delete(healthCertificates).where(and(eq(healthCertificates.ownerId, ownerId), eq(healthCertificates.id, id)));
}

export async function listHealthCertificateNotificationLogs(ownerId: number, limit = 30) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(healthCertificateNotificationLogs).where(eq(healthCertificateNotificationLogs.ownerId, ownerId)).orderBy(desc(healthCertificateNotificationLogs.createdAt)).limit(limit);
}

export async function getHealthCertificateNotificationLog(idempotencyKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(healthCertificateNotificationLogs).where(eq(healthCertificateNotificationLogs.idempotencyKey, idempotencyKey)).limit(1))[0];
}

export async function createHealthCertificateNotificationLog(input: typeof healthCertificateNotificationLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(healthCertificateNotificationLogs).values(input);
  return Number(result[0].insertId);
}

export async function updateHealthCertificateNotificationLog(id: number, input: Partial<typeof healthCertificateNotificationLogs.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(healthCertificateNotificationLogs).set(input).where(eq(healthCertificateNotificationLogs.id, id));
}

export async function getLatestCertificatesByProduct(ownerId: number) {
  const certificates = await listCertificates(ownerId);
  const latest = new Map<number, (typeof certificates)[number]>();
  for (const certificate of certificates) {
    if (!certificate.productId) continue;
    const current = latest.get(certificate.productId);
    const certificateDate = certificate.inspectionDate ?? certificate.createdAt.toISOString().slice(0, 10);
    const currentDate = current ? (current.inspectionDate ?? current.createdAt.toISOString().slice(0, 10)) : "";
    if (!current || certificateDate > currentDate || (certificateDate === currentDate && certificate.createdAt > current.createdAt)) latest.set(certificate.productId, certificate);
  }
  return latest;
}

export async function createCertificate(ownerId: number, input: Omit<typeof qualityCertificates.$inferInsert, "ownerId">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const type = (await db.select().from(qualityInspectionTypes).where(and(eq(qualityInspectionTypes.id, input.inspectionTypeId), eq(qualityInspectionTypes.ownerId, ownerId))).limit(1))[0];
  if (!type) throw new Error("Inspection type not found");
  if (input.productId) {
    const product = (await db.select().from(qualityProducts).where(and(eq(qualityProducts.id, input.productId), eq(qualityProducts.ownerId, ownerId))).limit(1))[0];
    if (!product || product.inspectionTypeId !== input.inspectionTypeId) throw new Error("Product not found");
  }
  const result = await db.insert(qualityCertificates).values({ ...input, ownerId });
  return result[0].insertId;
}

export async function getCertificateNumberRule(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  let rule = (await db.select().from(qualityCertificateNumberRules).where(eq(qualityCertificateNumberRules.ownerId, ownerId)).limit(1))[0];
  if (!rule) {
    await db.insert(qualityCertificateNumberRules).values({ ownerId });
    rule = (await db.select().from(qualityCertificateNumberRules).where(eq(qualityCertificateNumberRules.ownerId, ownerId)).limit(1))[0];
  }
  return rule!;
}

export async function updateCertificateNumberRule(ownerId: number, input: { prefix?: string; sequenceDigits?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await getCertificateNumberRule(ownerId);
  await db.update(qualityCertificateNumberRules).set(input).where(eq(qualityCertificateNumberRules.ownerId, ownerId));
  return getCertificateNumberRule(ownerId);
}

function certificateNumberFor(rule: Awaited<ReturnType<typeof getCertificateNumberRule>>, issueDate: string, sequence: number) {
  const year = Number(issueDate.slice(0, 4));
  const prefix = rule.prefix.trim().replace(/-+$/g, "") || "KOENF-QC";
  return `${prefix}-${year}-${String(sequence).padStart(rule.sequenceDigits, "0")}`;
}

export async function suggestCertificateNumber(ownerId: number, issueDate: string) {
  const rule = await getCertificateNumberRule(ownerId);
  const year = Number(issueDate.slice(0, 4));
  const sequence = rule.lastIssuedYear === year ? rule.lastIssuedSequence + 1 : 1;
  return { number: certificateNumberFor(rule, issueDate, sequence), rule };
}

export async function issueCertificateNumber(ownerId: number, issueDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rule = await getCertificateNumberRule(ownerId);
  const year = Number(issueDate.slice(0, 4));
  const sequence = rule.lastIssuedYear === year ? rule.lastIssuedSequence + 1 : 1;
  await db.update(qualityCertificateNumberRules).set({ lastIssuedYear: year, lastIssuedSequence: sequence }).where(eq(qualityCertificateNumberRules.id, rule.id));
  return certificateNumberFor(rule, issueDate, sequence);
}

export async function getMonthlyReport(ownerId: number, reportMonth: string) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  return (await database.select().from(qualityMonthlyReports).where(and(eq(qualityMonthlyReports.ownerId, ownerId), eq(qualityMonthlyReports.reportMonth, reportMonth))).limit(1))[0];
}

export async function listMonthlyReports(ownerId: number, limit = 12) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  return database.select().from(qualityMonthlyReports).where(eq(qualityMonthlyReports.ownerId, ownerId)).orderBy(desc(qualityMonthlyReports.reportMonth)).limit(limit);
}

export async function createMonthlyReport(ownerId: number, input: { reportMonth: string; fileName: string; storageKey: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const result = await database.insert(qualityMonthlyReports).values({ ownerId, ...input });
  return result[0].insertId;
}

export async function getNotificationSettings(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  let settings = (await db.select().from(qualityNotificationSettings).where(eq(qualityNotificationSettings.ownerId, ownerId)).limit(1))[0];
  if (!settings) {
    await db.insert(qualityNotificationSettings).values({ ownerId });
    settings = (await db.select().from(qualityNotificationSettings).where(eq(qualityNotificationSettings.ownerId, ownerId)).limit(1))[0];
  }
  return settings!;
}

export async function updateNotificationSettings(ownerId: number, input: {
  warningDays?: number;
  alertHourKst?: number;
  telegramChatId?: string | null;
  scheduleCronTaskUid?: string | null;
  isScheduleEnabled?: boolean;
  isAlertPaused?: boolean;
  alertPausedAt?: string | null;
  alertPauseReason?: string | null;
  lastRunAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await getNotificationSettings(ownerId);
  await db.update(qualityNotificationSettings).set(input).where(eq(qualityNotificationSettings.ownerId, ownerId));
  return getNotificationSettings(ownerId);
}

export async function getSettingsByCronTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(qualityNotificationSettings).where(eq(qualityNotificationSettings.scheduleCronTaskUid, taskUid)).limit(1))[0];
}

export async function listNotificationTimeSlots(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.select().from(qualityNotificationTimeSlots).where(eq(qualityNotificationTimeSlots.ownerId, ownerId)).orderBy(asc(qualityNotificationTimeSlots.timeKst));
}

export async function createNotificationTimeSlot(ownerId: number, input: { timeKst: string; scheduleCronTaskUid?: string | null; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(qualityNotificationTimeSlots).values({ ownerId, ...input });
  return result[0].insertId;
}

export async function updateNotificationTimeSlot(ownerId: number, id: number, input: { scheduleCronTaskUid?: string | null; isActive?: boolean; timeKst?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(qualityNotificationTimeSlots).set(input).where(and(eq(qualityNotificationTimeSlots.id, id), eq(qualityNotificationTimeSlots.ownerId, ownerId)));
}

export async function deleteNotificationTimeSlot(ownerId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(qualityNotificationTimeSlots).where(and(eq(qualityNotificationTimeSlots.id, id), eq(qualityNotificationTimeSlots.ownerId, ownerId)));
}

export async function getNotificationTimeSlotByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(qualityNotificationTimeSlots).where(eq(qualityNotificationTimeSlots.scheduleCronTaskUid, taskUid)).limit(1))[0];
}

type TelegramRecipientScopeInput = { scopeType: "inspection_type" | "product"; scopeId: number };

export async function listTelegramRecipients(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const recipients = await db.select().from(qualityTelegramRecipients).where(eq(qualityTelegramRecipients.ownerId, ownerId)).orderBy(asc(qualityTelegramRecipients.name));
  const scopes = await db.select().from(qualityTelegramRecipientScopes).where(eq(qualityTelegramRecipientScopes.ownerId, ownerId));
  return recipients.map(recipient => ({ ...recipient, scopes: scopes.filter(scope => scope.recipientId === recipient.id) }));
}

export async function createTelegramRecipient(ownerId: number, input: { name: string; telegramChatId: string; isActive?: boolean; receivesHealthAlerts?: boolean; scopes: TelegramRecipientScopeInput[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(qualityTelegramRecipients).values({ ownerId, name: input.name, telegramChatId: input.telegramChatId, isActive: input.isActive ?? true, receivesHealthAlerts: input.receivesHealthAlerts ?? true });
  const recipientId = Number(result[0].insertId);
  const uniqueScopes = Array.from(new Map(input.scopes.map(scope => [`${scope.scopeType}:${scope.scopeId}`, scope])).values());
  if (uniqueScopes.length) await db.insert(qualityTelegramRecipientScopes).values(uniqueScopes.map(scope => ({ ownerId, recipientId, ...scope })));
  return recipientId;
}

export async function updateTelegramRecipient(ownerId: number, id: number, input: { name?: string; telegramChatId?: string; isActive?: boolean; receivesHealthAlerts?: boolean; scopes?: TelegramRecipientScopeInput[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const recipient = (await db.select().from(qualityTelegramRecipients).where(and(eq(qualityTelegramRecipients.id, id), eq(qualityTelegramRecipients.ownerId, ownerId))).limit(1))[0];
  if (!recipient) throw new Error("Telegram recipient not found");
  const { scopes, ...changes } = input;
  if (Object.keys(changes).length) await db.update(qualityTelegramRecipients).set(changes).where(eq(qualityTelegramRecipients.id, id));
  if (scopes) {
    await db.delete(qualityTelegramRecipientScopes).where(and(eq(qualityTelegramRecipientScopes.ownerId, ownerId), eq(qualityTelegramRecipientScopes.recipientId, id)));
    const uniqueScopes = Array.from(new Map(scopes.map(scope => [`${scope.scopeType}:${scope.scopeId}`, scope])).values());
    if (uniqueScopes.length) await db.insert(qualityTelegramRecipientScopes).values(uniqueScopes.map(scope => ({ ownerId, recipientId: id, ...scope })));
  }
}

export async function deleteTelegramRecipient(ownerId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(qualityTelegramRecipientScopes).where(and(eq(qualityTelegramRecipientScopes.ownerId, ownerId), eq(qualityTelegramRecipientScopes.recipientId, id)));
  await db.delete(qualityTelegramRecipients).where(and(eq(qualityTelegramRecipients.ownerId, ownerId), eq(qualityTelegramRecipients.id, id)));
}

export async function listNotificationLogs(ownerId: number, limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const settings = await getNotificationSettings(ownerId);
  return db.select().from(qualityNotificationLogs).where(eq(qualityNotificationLogs.settingId, settings.id)).orderBy(desc(qualityNotificationLogs.createdAt)).limit(limit);
}

export async function getNotificationLogByIdempotencyKey(idempotencyKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return (await db.select().from(qualityNotificationLogs).where(eq(qualityNotificationLogs.idempotencyKey, idempotencyKey)).limit(1))[0];
}

export async function createNotificationLog(input: typeof qualityNotificationLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(qualityNotificationLogs).values(input);
  return result[0].insertId;
}

export async function updateNotificationLog(id: number, input: Partial<typeof qualityNotificationLogs.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(qualityNotificationLogs).set(input).where(eq(qualityNotificationLogs.id, id));
}
