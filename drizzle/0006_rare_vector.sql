CREATE TABLE `quality_monthly_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`reportMonth` varchar(7) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`storageKey` varchar(600) NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_monthly_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_monthly_reports_owner_month_unique` UNIQUE(`ownerId`,`reportMonth`)
);
