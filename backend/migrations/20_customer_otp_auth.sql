-- ============================================================
-- LM Shopping Mall - Customer OTP auth & WhatsApp integration fields
-- ============================================================

USE lms;

CREATE TABLE IF NOT EXISTS `customer_otps` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `phone` varchar(20) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `otp_hash` varchar(255) NOT NULL,
  `purpose` enum('register','forgot_password') NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `is_used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_customer_otps_store_phone` (`store_id`, `phone`),
  KEY `idx_customer_otps_purpose` (`purpose`),
  KEY `idx_customer_otps_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `phone_verified` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `email_verified` tinyint(1) NOT NULL DEFAULT 0;
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `reset_token` varchar(255) DEFAULT NULL;
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `reset_token_expires_at` datetime DEFAULT NULL;

ALTER TABLE `integration_settings` ADD COLUMN IF NOT EXISTS `whatsapp_provider` varchar(50) DEFAULT '360dialog';
ALTER TABLE `integration_settings` ADD COLUMN IF NOT EXISTS `whatsapp_template_name` varchar(255) DEFAULT '';
