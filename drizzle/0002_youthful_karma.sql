CREATE TABLE `quality_certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`inspectionTypeId` int NOT NULL,
	`productId` int,
	`certificateNumber` varchar(120),
	`inspectionDate` varchar(10),
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(600) NOT NULL,
	`contentType` varchar(120) NOT NULL,
	`fileSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_certificates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`inspectionTypeId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_products_owner_type_name_unique` UNIQUE(`ownerId`,`inspectionTypeId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `quality_inspection_types` ADD `productionStatus` enum('active','stopped') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_inspection_types` ADD `productionStoppedAt` varchar(10);--> statement-breakpoint
ALTER TABLE `quality_inspection_types` ADD `productionStopReason` text;