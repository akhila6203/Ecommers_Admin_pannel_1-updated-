USE lms;

ALTER TABLE integration_settings
ADD COLUMN IF NOT EXISTS whatsapp_api_url VARCHAR(500) DEFAULT 'https://api.360messenger.com/v2/sendMessage';

ALTER TABLE integration_settings
ADD COLUMN IF NOT EXISTS whatsapp_sender VARCHAR(50) DEFAULT '';

ALTER TABLE integration_settings
ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(255) DEFAULT '';

ALTER TABLE integration_settings
MODIFY whatsapp_provider VARCHAR(50) DEFAULT '360messenger';

UPDATE integration_settings
SET whatsapp_provider = '360messenger'
WHERE whatsapp_provider IS NULL
   OR whatsapp_provider = ''
   OR whatsapp_provider IN ('360dialog', 'meta');