CREATE TABLE `health_certificate_notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`healthCertificateId` int NOT NULL,
	`recipientId` int,
	`idempotencyKey` varchar(180) NOT NULL,
	`alertDate` varchar(10) NOT NULL,
	`alertLevel` enum('overdue','urgent','test') NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`message` text NOT NULL,
	`telegramMessageId` varchar(64),
	`errorMessage` text,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `health_certificate_notification_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `health_certificate_notification_logs_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `health_certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`employeeName` varchar(120) NOT NULL,
	`department` varchar(120),
	`issuedAt` varchar(10) NOT NULL,
	`expiresAt` varchar(10) NOT NULL,
	`validityMonths` int NOT NULL DEFAULT 12,
	`warningDays` int NOT NULL DEFAULT 30,
	`alertStatus` enum('active','paused') NOT NULL DEFAULT 'active',
	`alertPausedAt` varchar(10),
	`alertPauseReason` text,
	`employmentStatus` enum('active','inactive') NOT NULL DEFAULT 'active',
	`inactiveAt` varchar(10),
	`inactiveReason` text,
	`fileName` varchar(255),
	`storageKey` varchar(600),
	`contentType` varchar(120),
	`fileSize` int,
	`memo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `health_certificates_id` PRIMARY KEY(`id`),
	CONSTRAINT `health_certificates_owner_employee_unique` UNIQUE(`ownerId`,`employeeName`)
);
--> statement-breakpoint
ALTER TABLE `quality_telegram_recipients` ADD `receivesHealthAlerts` boolean DEFAULT true NOT NULL;