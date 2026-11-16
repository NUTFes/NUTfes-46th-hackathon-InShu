CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`photo_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `edits` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`kind` text NOT NULL,
	`finding_ids` text NOT NULL,
	`drink` text,
	`result_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`previous_key` text,
	`previous_findings` text NOT NULL,
	`reverted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`box` text NOT NULL,
	`reason` text NOT NULL,
	`confidence` real NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `findings_photo_idx` ON `findings` (`photo_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`original_key` text NOT NULL,
	`current_key` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`risk_score` integer,
	`rules_snapshot` text DEFAULT '[]' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`detected_at` text,
	`edited_at` text,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `photos_batch_idx` ON `photos` (`batch_id`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`treatment` text NOT NULL,
	`weight` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`slack_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`is_lead` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_slack_user_id_unique` ON `staff` (`slack_user_id`);--> statement-breakpoint
CREATE TABLE `usage` (
	`staff_id` text NOT NULL,
	`date` text NOT NULL,
	`replace_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`staff_id`, `date`),
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
