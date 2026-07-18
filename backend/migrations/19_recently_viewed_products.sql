CREATE TABLE IF NOT EXISTS recently_viewed_products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    store_id BIGINT UNSIGNED NOT NULL,

    customer_id BIGINT UNSIGNED NULL,

    session_id VARCHAR(191) NULL,

    product_id BIGINT UNSIGNED NOT NULL,

    viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    INDEX idx_recent_store_customer (
        store_id,
        customer_id,
        viewed_at
    ),

    INDEX idx_recent_store_session (
        store_id,
        session_id,
        viewed_at
    ),

    INDEX idx_recent_product (
        product_id
    ),

    UNIQUE KEY uq_recent_customer_product (
        store_id,
        customer_id,
        product_id
    ),

    UNIQUE KEY uq_recent_session_product (
        store_id,
        session_id,
        product_id
    )
);