CREATE TABLE players (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`nickname` VARCHAR(255) NOT NULL,
	`discord_id` VARCHAR(20) NOT NULL,
	`admin` TINYINT NOT NULL DEFAULT 0,
	PRIMARY KEY(`id`),
	INDEX `discord_id_idx` (`discord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE signups (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`player_id` INT UNSIGNED NOT NULL,
	`signup_dtg` DATETIME NOT NULL DEFAULT now(),
	`season` INT UNSIGNED NOT NULL,
	`match_day` INT UNSIGNED NOT NULL,
	`active` TINYINT NOT NULL DEFAULT 0,
	`rostered` TINYINT NOT NULL DEFAULT 0,
	`status` varchar(20) not null default ''
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teams (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`team_number`INT UNSIGNED NOT NULL,
	`tier` VARCHAR(10) NOT NULL,
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE team_players (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`team_id` INT UNSIGNED NOT NULL,
	`player_id` INT UNSIGNED NOT NULL,
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE matches (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`match_dtg` DATETIME NOT NULL DEFAULT NOW(),
	`season` INT UNSIGNED NOT NULL,
	`match_day` INT UNSIGNED NOT NULL,
	`home_team_id` INT UNSIGNED NOT NULL,
	`away_team_id` INT UNSIGNED NOT NULL,
	`lobby_user` VARCHAR(50) NOT NULL DEFAULT '',
	`lobby_pass` VARCHAR(50) NOT NULL DEFAULT '',
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE league_settings (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`season` INT UNSIGNED NOT NULL,
	`contract_url` VARCHAR(255) NOT NULL, 
	`amateur` TINYINT NOT NULL DEFAULT 0,
	`contender` TINYINT NOT NULL DEFAULT 0,
	`prospect` TINYINT NOT NULL DEFAULT 0,
	`challenger` TINYINT NOT NULL DEFAULT 0,
	`rival` TINYINT NOT NULL DEFAULT 0,
	`veteran` TINYINT NOT NULL DEFAULT 0,
	`elite` TINYINT NOT NULL DEFAULT 0,
	`master` TINYINT NOT NULL DEFAULT 0,
	`premier` TINYINT NOT NULL DEFAULT 0,
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE contracts (
	`id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
	`discord_id` VARCHAR(20) NOT NULL,
	`rsc_id` VARCHAR(10) NOT NULL,
	`name` VARCHAR(100) NOT NULL DEFAULT '',
	`mmr` INT UNSIGNED NOT NULL DEFAULT 0,
	`tier` VARCHAR(10) NOT NULL DEFAULT '',
	`status` VARCHAR(20) NOT NULL DEFAULT '',
	PRIMARY KEY(`id`),
	INDEX `discord_id_idx` (`discord_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;