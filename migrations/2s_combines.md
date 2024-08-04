
ALTER TABLE `players` ADD `combines_admin_2s` TINYINT NOT NULL DEFAULT 0 AFTER `combines_admin`;

ALTER TABLE `tiermaker` ADD `league` INT UNSIGNED NOT NULL DEFAULT 3 AFTER `season`;
ALTER TABLE `combine_settings` ADD `league` INT UNSIGNED NOT NULL DEFAULT 3 AFTER `season`;
ALTER TABLE `combine_matches` ADD `league` INT UNSIGNED NOT NULL DEFAULT 3 AFTER `season`;
ALTER TABLE `combine_signups` ADD `league` INT UNSIGNED NOT NULL DEFAULT 3 AFTER `season`;
