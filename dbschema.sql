CREATE TABLE tournaments (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`title` VARCHAR(255) NOT NULL,
	`format` varchar(50) not null default 'double elimination', /* single elimination, double elimination, swiss, round robin */
	`open` tinyint(1) unsigned not null default 0, 
	`active` tinyint(1) unsigned not null default 0, 
	`start_dtg` DATETIME NOT NULL DEFAULT now(),
	`signup_close_dtg` DATETIME NOT NULL DEFAULT now(),
	`team_size` int unsigned not null default 3,
	`team_cap` int unsigned not null default 14,
	`allow_external` tinyint(1) unsigned not null default 0, /* external players */
	`description` TEXT,
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tournament_teams (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`t_id` BIGINT(11) UNSIGNED NOT NULL,
	`name` VARCHAR(20) NOT NULL,
	`checked_in` tinyint(1) unsigned not null default 0, 
	`assigned` tinyint(1) unsigned not null default 0, 
	`signup_dtg` DATETIME NOT NULL DEFAULT now(),
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tournament_players (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`t_id` BIGINT(11) UNSIGNED NOT NULL,
	`player_id` BIGINT(11) UNSIGNED NOT NULL,
	`team_id` BIGINT(11) UNSIGNED,
	`discord_id` VARCHAR(20) NOT NULL,
	`name` VARCHAR(20) NOT NULL,
	`rsc_id` VARCHAR(10),
	`tier` VARCHAR(20) NOT NULL,
	`cap_value` INT UNSIGNED NOT NULL DEFAULT 0,
	`mmr` INT UNSIGNED,
	`tracker_link` VARCHAR(255) NOT NULL,
	`signup_dtg` DATETIME NOT NULL DEFAULT now(),
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE trackers (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`rsc_id` VARCHAR(10) NOT NULL,
	`name` VARCHAR(100) NOT NULL DEFAULT '',
	`tracker_link` VARCHAR(255) NOT NULL,
	`active` tinyint(1) NOT NULL DEFAULT 1,
	`bad` tinyint(1) NOT NULL DEFAULT 0,
	PRIMARY KEY(`id`),
	INDEX `tracker_link_idx` (`tracker_link`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tracker_data (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`psyonix_season` INT UNSIGNED NOT NULL,
	`tracker_link` VARCHAR(255) NOT NULL,
	`rsc_id` VARCHAR(10) NOT NULL,
	`threes_games_played` INT UNSIGNED,
	`threes_rating` INT UNSIGNED,
	`threes_season_peak` INT UNSIGNED,
	`twos_games_played` INT UNSIGNED,
	`twos_rating` INT UNSIGNED,
	`twos_season_peak` INT UNSIGNED,
	`ones_games_played` INT UNSIGNED,
	`ones_rating` INT UNSIGNED,
	`ones_season_peak` INT UNSIGNED,
	`date_pulled` DATETIME NOT NULL DEFAULT now(),
	`pulled_by` VARCHAR(50) NOT NULL DEFAULT '',
	`sent_to_api` tinyint(1) not null default 0,
	PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bad_trackers (
	`id` BIGINT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
	`tracker_link` VARCHAR(255) NOT NULL,
	`sent_to_api` tinyint(1) not null default 0,
	`date_pulled` DATETIME NOT NULL DEFAULT now(),
	`pulled_by` VARCHAR(50) NOT NULL DEFAULT '',
	PRIMARY KEY(`id`),
	INDEX `tracker_link_idx` (`tracker_link`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
	`status` varchar(20) not null default '',
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

/* API STUFF */
CREATE TABLE `StreamTeamStats` (
	`Id` int NOT NULL AUTO_INCREMENT,
	`Season` int DEFAULT NULL,
	`Franchise` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`TeamName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Tier` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Wins` int DEFAULT NULL,
	`Loss` int DEFAULT NULL,
	`WinPct` decimal(8,2) DEFAULT NULL,
	`Rank` int DEFAULT NULL,
	`GM` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Conference` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Division` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`GamesPlayed` int DEFAULT NULL,
	`ShotPct` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Points` int DEFAULT NULL,
	`Goals` int DEFAULT NULL,
	`Assists` int DEFAULT NULL,
	`Saves` int DEFAULT NULL,
	`Shots` int DEFAULT NULL,
	`GoalDiff` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`OppShotPct` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`OppPoints` int DEFAULT NULL,
	`OppGoals` int DEFAULT NULL,
	`OppAssists` int DEFAULT NULL,
	`OppSaves` int DEFAULT NULL,
	`OppShots` int DEFAULT NULL,
	PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `StreamTeamStats2` (
	`Id` int NOT NULL AUTO_INCREMENT,
	`Season` int DEFAULT NULL,
	`Franchise` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`TeamName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Tier` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Wins` int DEFAULT NULL,
	`Loss` int DEFAULT NULL,
	`WinPct` decimal(8,2) DEFAULT NULL,
	`Rank` int DEFAULT NULL,
	`GM` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Conference` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Division` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`GamesPlayed` int DEFAULT NULL,
	`ShotPct` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`Points` int DEFAULT NULL,
	`Goals` int DEFAULT NULL,
	`Assists` int DEFAULT NULL,
	`Saves` int DEFAULT NULL,
	`Shots` int DEFAULT NULL,
	`GoalDiff` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`OppShotPct` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`OppPoints` int DEFAULT NULL,
	`OppGoals` int DEFAULT NULL,
	`OppAssists` int DEFAULT NULL,
	`OppSaves` int DEFAULT NULL,
	`OppShots` int DEFAULT NULL,
	PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `StreamPlayerStats` (
	`Id` int NOT NULL AUTO_INCREMENT,
	`Season` int DEFAULT NULL,
	`Tier` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`TeamName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`PlayerName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`GP` int DEFAULT NULL,
	`GW` int DEFAULT NULL,
	`GL` int DEFAULT NULL,
	`WPct` decimal(8,2) DEFAULT NULL,
	`MVPs` int DEFAULT NULL,
	`Pts` int DEFAULT NULL,
	`Goals` int DEFAULT NULL,
	`Assists` int DEFAULT NULL,
	`Saves` int DEFAULT NULL,
	`Shots` int DEFAULT NULL,
	`ShotPct` decimal(8,2) DEFAULT NULL,
	`PPG` decimal(8,2) DEFAULT NULL,
	`GPG` decimal(8,2) DEFAULT NULL,
	`APG` decimal(8,2) DEFAULT NULL,
	`SvPG` decimal(8,2) DEFAULT NULL,
	`SoPG` decimal(8,2) DEFAULT NULL,
	`Cycles` int DEFAULT NULL,
	`HatTricks` int DEFAULT NULL,
	`Playmakers` int DEFAULT NULL,
	`Saviors` int DEFAULT NULL,
	PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `StreamPlayerStats2` (
	`Id` int NOT NULL AUTO_INCREMENT,
	`Season` int DEFAULT NULL,
	`Tier` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`TeamName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`PlayerName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
	`GP` int DEFAULT NULL,
	`GW` int DEFAULT NULL,
	`GL` int DEFAULT NULL,
	`WPct` decimal(8,2) DEFAULT NULL,
	`MVPs` int DEFAULT NULL,
	`Pts` int DEFAULT NULL,
	`Goals` int DEFAULT NULL,
	`Assists` int DEFAULT NULL,
	`Saves` int DEFAULT NULL,
	`Shots` int DEFAULT NULL,
	`ShotPct` decimal(8,2) DEFAULT NULL,
	`PPG` decimal(8,2) DEFAULT NULL,
	`GPG` decimal(8,2) DEFAULT NULL,
	`APG` decimal(8,2) DEFAULT NULL,
	`SvPG` decimal(8,2) DEFAULT NULL,
	`SoPG` decimal(8,2) DEFAULT NULL,
	`Cycles` int DEFAULT NULL,
	`HatTricks` int DEFAULT NULL,
	`Playmakers` int DEFAULT NULL,
	`Saviors` int DEFAULT NULL,
	PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
