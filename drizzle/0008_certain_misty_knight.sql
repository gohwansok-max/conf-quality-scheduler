CREATE TABLE `quality_certificate_number_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`prefix` varchar(40) NOT NULL DEFAULT 'KOENF-QC',
	`sequenceDigits` int NOT NULL DEFAULT 3,
	`lastIssuedYear` int NOT NULL DEFAULT 0,
	`lastIssuedSequence` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_certificate_number_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_certificate_number_rules_owner_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
CREATE TABLE `quality_product_manufacture_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`productId` int NOT NULL,
	`manufactureDate` varchar(10) NOT NULL,
	`previousManufactureDate` varchar(10),
	`memo` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_product_manufacture_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_product_manufacture_records_owner_product_created` UNIQUE(`ownerId`,`productId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `quality_telegram_recipient_scopes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`recipientId` int NOT NULL,
	`scopeType` enum('inspection_type','product') NOT NULL,
	`scopeId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_telegram_recipient_scopes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_telegram_recipient_scope_unique` UNIQUE(`recipientId`,`scopeType`,`scopeId`)
);
--> statement-breakpoint
CREATE TABLE `quality_telegram_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`telegramChatId` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_telegram_recipients_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_telegram_recipients_owner_name_unique` UNIQUE(`ownerId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `quality_notification_logs` ADD `recipientId` int;