ALTER TABLE `quality_inspection_types` ADD `alertStatus` enum('active','paused') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_inspection_types` ADD `alertPausedAt` varchar(10);--> statement-breakpoint
ALTER TABLE `quality_inspection_types` ADD `alertPauseReason` text;--> statement-breakpoint
ALTER TABLE `quality_notification_settings` ADD `isAlertPaused` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quality_notification_settings` ADD `alertPausedAt` varchar(10);--> statement-breakpoint
ALTER TABLE `quality_notification_settings` ADD `alertPauseReason` text;