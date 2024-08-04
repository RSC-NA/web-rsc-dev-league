-- MySQL dump 10.13  Distrib 8.0.33, for Linux (x86_64)
--
-- Host: localhost    Database: devleague
-- ------------------------------------------------------
-- Server version	8.0.33

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `StreamPlayerStats`
--

DROP TABLE IF EXISTS `StreamPlayerStats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=948 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `StreamPlayerStats2`
--

DROP TABLE IF EXISTS `StreamPlayerStats2`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `StreamTeamStats`
--

DROP TABLE IF EXISTS `StreamTeamStats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
) ENGINE=InnoDB AUTO_INCREMENT=193 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `StreamTeamStats2`
--

DROP TABLE IF EXISTS `StreamTeamStats2`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bad_trackers`
--

DROP TABLE IF EXISTS `bad_trackers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bad_trackers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tracker_link` varchar(255) NOT NULL,
  `sent_to_api` tinyint(1) NOT NULL DEFAULT '0',
  `date_pulled` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pulled_by` varchar(50) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `tracker_link_idx` (`tracker_link`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `combine_match_players`
--

DROP TABLE IF EXISTS `combine_match_players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combine_match_players` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_id` int unsigned NOT NULL,
  `rsc_id` varchar(10) NOT NULL,
  `team` varchar(15) NOT NULL,
  `start_mmr` int unsigned NOT NULL DEFAULT '0',
  `end_mmr` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=763 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `combine_matches`
--

DROP TABLE IF EXISTS `combine_matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combine_matches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `season` int unsigned NOT NULL,
  `lobby_user` varchar(50) NOT NULL DEFAULT '',
  `lobby_pass` varchar(50) NOT NULL DEFAULT '',
  `home_mmr` int unsigned NOT NULL,
  `away_mmr` int unsigned NOT NULL,
  `home_wins` int unsigned NOT NULL DEFAULT '0',
  `away_wins` int unsigned NOT NULL DEFAULT '0',
  `reported_rsc_id` varchar(10) DEFAULT NULL,
  `confirmed_rsc_id` varchar(10) DEFAULT NULL,
  `completed` tinyint unsigned NOT NULL DEFAULT '0',
  `cancelled` tinyint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=128 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `combine_replays`
--

DROP TABLE IF EXISTS `combine_replays`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combine_replays` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_id` int unsigned NOT NULL,
  `rsc_id` varchar(10) NOT NULL,
  `replay` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `match_idx` (`match_id`),
  KEY `player_idx` (`rsc_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `combine_settings`
--

DROP TABLE IF EXISTS `combine_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combine_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season` int unsigned NOT NULL,
  `active` tinyint NOT NULL DEFAULT '1',
  `live` tinyint NOT NULL DEFAULT '1',
  `tiermaker_url` varchar(255) NOT NULL,
  `k_factor` int unsigned NOT NULL DEFAULT '32',
  `min_series` int unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `combine_signups`
--

DROP TABLE IF EXISTS `combine_signups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `combine_signups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season` int unsigned NOT NULL,
  `rsc_id` varchar(10) NOT NULL,
  `discord_id` varchar(20) DEFAULT NULL,
  `signup_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `current_mmr` int unsigned NOT NULL,
  `active` tinyint NOT NULL DEFAULT '0',
  `rostered` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `rsc_id_idx` (`rsc_id`),
  KEY `lookup_idx` (`season`,`rsc_id`,`signup_dtg`)
) ENGINE=InnoDB AUTO_INCREMENT=1213 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contracts`
--

DROP TABLE IF EXISTS `contracts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contracts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(20) NOT NULL,
  `rsc_id` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL DEFAULT '',
  `mmr` int unsigned NOT NULL DEFAULT '0',
  `tier` varchar(10) NOT NULL DEFAULT '',
  `status` varchar(20) NOT NULL DEFAULT '',
  `active_2s` tinyint(1) NOT NULL DEFAULT '0',
  `active_3s` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `discord_id_idx` (`discord_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7160 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `league_settings`
--

DROP TABLE IF EXISTS `league_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `league_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season` int unsigned NOT NULL,
  `contract_url` varchar(255) NOT NULL,
  `amateur` tinyint NOT NULL DEFAULT '0',
  `contender` tinyint NOT NULL DEFAULT '0',
  `prospect` tinyint NOT NULL DEFAULT '0',
  `challenger` tinyint NOT NULL DEFAULT '0',
  `rival` tinyint NOT NULL DEFAULT '0',
  `veteran` tinyint NOT NULL DEFAULT '0',
  `elite` tinyint NOT NULL DEFAULT '0',
  `master` tinyint NOT NULL DEFAULT '0',
  `premier` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `matches`
--

DROP TABLE IF EXISTS `matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `matches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `match_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `season` int unsigned NOT NULL,
  `match_day` int unsigned NOT NULL,
  `home_team_id` int unsigned NOT NULL,
  `away_team_id` int unsigned NOT NULL,
  `lobby_user` varchar(50) NOT NULL DEFAULT '',
  `lobby_pass` varchar(50) NOT NULL DEFAULT '',
  `home_wins` int unsigned NOT NULL DEFAULT '0',
  `away_wins` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=34 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `player_ips`
--

DROP TABLE IF EXISTS `player_ips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `player_ips` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rsc_id` varchar(10) DEFAULT NULL,
  `nickname` varchar(255) NOT NULL,
  `discord_id` varchar(20) NOT NULL,
  `ip` varchar(18) DEFAULT NULL,
  `date_logged_in` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `players`
--

DROP TABLE IF EXISTS `players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `players` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `rsc_id` varchar(10) DEFAULT NULL,
  `nickname` varchar(255) NOT NULL,
  `discord_id` varchar(20) NOT NULL,
  `admin` tinyint NOT NULL DEFAULT '0',
  `tourney_admin` tinyint NOT NULL DEFAULT '0',
  `devleague_admin` tinyint NOT NULL DEFAULT '0',
  `stats_admin` tinyint NOT NULL DEFAULT '0',
  `combines_admin` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `discord_id_idx` (`discord_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8067 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `signups`
--

DROP TABLE IF EXISTS `signups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `signups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `player_id` int unsigned NOT NULL,
  `signup_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `season` int unsigned NOT NULL,
  `match_day` int unsigned NOT NULL,
  `active` tinyint NOT NULL DEFAULT '0',
  `rostered` tinyint NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=302 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `team_players`
--

DROP TABLE IF EXISTS `team_players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `team_players` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `team_id` int unsigned NOT NULL,
  `player_id` int unsigned NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=199 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `teams`
--

DROP TABLE IF EXISTS `teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teams` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `team_number` int unsigned NOT NULL,
  `tier` varchar(10) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tiermaker`
--

DROP TABLE IF EXISTS `tiermaker`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tiermaker` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `season` int unsigned NOT NULL,
  `discord_id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `rsc_id` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL DEFAULT '',
  `tier` varchar(10) NOT NULL DEFAULT '',
  `count` int unsigned DEFAULT NULL,
  `keeper` int unsigned DEFAULT NULL,
  `base_mmr` int unsigned NOT NULL DEFAULT '0',
  `effective_mmr` int unsigned NOT NULL DEFAULT '0',
  `current_mmr` int unsigned NOT NULL DEFAULT '0',
  `wins` int unsigned NOT NULL DEFAULT '0',
  `losses` int unsigned NOT NULL DEFAULT '0',
  `date_added` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `discord_id_idx` (`discord_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1284 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tournament_players`
--

DROP TABLE IF EXISTS `tournament_players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tournament_players` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `t_id` bigint unsigned NOT NULL,
  `player_id` bigint unsigned NOT NULL,
  `team_id` bigint unsigned DEFAULT NULL,
  `discord_id` varchar(20) NOT NULL,
  `tier` varchar(20) DEFAULT NULL,
  `cap_value` int unsigned NOT NULL DEFAULT '0',
  `mmr` int unsigned DEFAULT NULL,
  `tracker_link` varchar(255) DEFAULT NULL,
  `check_in_dtg` datetime DEFAULT NULL,
  `signup_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tournament_teams`
--

DROP TABLE IF EXISTS `tournament_teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tournament_teams` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `t_id` bigint unsigned NOT NULL,
  `name` varchar(20) NOT NULL,
  `checked_in` tinyint unsigned NOT NULL DEFAULT '0',
  `assigned` tinyint unsigned NOT NULL DEFAULT '0',
  `signup_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tournaments`
--

DROP TABLE IF EXISTS `tournaments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tournaments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `format` varchar(50) NOT NULL DEFAULT 'double elimination',
  `open` tinyint unsigned NOT NULL DEFAULT '0',
  `active` tinyint unsigned NOT NULL DEFAULT '0',
  `start_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `signup_close_dtg` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `team_size` int unsigned NOT NULL DEFAULT '3',
  `cap_type` varchar(15) NOT NULL DEFAULT 'tier points',
  `team_cap` int unsigned NOT NULL DEFAULT '14',
  `allow_external` tinyint unsigned NOT NULL DEFAULT '0',
  `description` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tracker_data`
--

DROP TABLE IF EXISTS `tracker_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tracker_data` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `psyonix_season` int unsigned NOT NULL,
  `tracker_link` varchar(255) NOT NULL,
  `rsc_id` varchar(10) NOT NULL,
  `threes_games_played` int unsigned DEFAULT NULL,
  `threes_rating` int unsigned DEFAULT NULL,
  `threes_season_peak` int unsigned DEFAULT NULL,
  `twos_games_played` int unsigned DEFAULT NULL,
  `twos_rating` int unsigned DEFAULT NULL,
  `twos_season_peak` int unsigned DEFAULT NULL,
  `ones_games_played` int unsigned DEFAULT NULL,
  `ones_rating` int unsigned DEFAULT NULL,
  `ones_season_peak` int unsigned DEFAULT NULL,
  `date_pulled` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pulled_by` varchar(50) NOT NULL DEFAULT '',
  `sent_to_api` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `tracker_link_idx` (`tracker_link`),
  KEY `date_pulled_idx` (`date_pulled`),
  KEY `date_player_idx` (`date_pulled`,`rsc_id`),
  KEY `rsc_idx` (`rsc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `trackers`
--

DROP TABLE IF EXISTS `trackers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trackers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `rsc_id` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL DEFAULT '',
  `tracker_link` varchar(255) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `bad` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `tracker_link_idx` (`tracker_link`),
  KEY `player_idx` (`name`,`rsc_id`),
  KEY `rsc_idx` (`rsc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
