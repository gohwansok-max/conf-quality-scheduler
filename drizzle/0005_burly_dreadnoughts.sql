CREATE TABLE `quality_notification_time_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`timeKst` varchar(5) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_notification_time_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_notification_time_slots_owner_time_unique` UNIQUE(`ownerId`,`timeKst`),
	CONSTRAINT `quality_notification_time_slots_task_unique` UNIQUE(`scheduleCronTaskUid`)
);
