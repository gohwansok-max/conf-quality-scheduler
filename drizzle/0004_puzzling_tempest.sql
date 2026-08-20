ALTER TABLE `quality_products` ADD `intervalMonths` int DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_products` ADD `lastManufactureDate` varchar(10);--> statement-breakpoint
ALTER TABLE `quality_products` ADD `productionStatus` enum('active','stopped') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_products` ADD `productionStoppedAt` varchar(10);--> statement-breakpoint
ALTER TABLE `quality_products` ADD `productionStopReason` text;--> statement-breakpoint
ALTER TABLE `quality_products` ADD `alertStatus` enum('active','paused') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_products` ADD `alertPausedAt` varchar(10);--> statement-breakpoint
ALTER TABLE `quality_products` ADD `alertPauseReason` text;