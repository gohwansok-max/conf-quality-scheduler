CREATE TABLE `quality_inspection_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`intervalMonths` int NOT NULL,
	`lastManufactureDate` varchar(10),
	`testItems` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_inspection_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_notification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingId` int NOT NULL,
	`inspectionTypeId` int,
	`idempotencyKey` varchar(180) NOT NULL,
	`alertDate` varchar(10) NOT NULL,
	`alertLevel` enum('overdue','urgent','test') NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`message` text NOT NULL,
	`telegramMessageId` varchar(64),
	`errorMessage` text,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_notification_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_notification_logs_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `quality_notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`telegramChatId` varchar(64),
	`warningDays` int NOT NULL DEFAULT 14,
	`alertHourKst` int NOT NULL DEFAULT 9,
	`scheduleCronTaskUid` varchar(65),
	`isScheduleEnabled` boolean NOT NULL DEFAULT false,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_notification_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_notification_settings_owner_unique` UNIQUE(`ownerId`),
	CONSTRAINT `quality_notification_settings_task_unique` UNIQUE(`scheduleCronTaskUid`)
);
