-- V1__init.sql
-- TraderOS initial schema
-- Run once on first application start via Flyway

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255),
    broker_pref   VARCHAR(50),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─── REPORTS ─────────────────────────────────────────────
-- One report = one broker file upload for one financial year
CREATE TABLE reports (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker_name VARCHAR(50)  NOT NULL,   -- 'zerodha' | 'groww' | 'upstox' | 'dhan'
    fy          VARCHAR(10)  NOT NULL,   -- '2024-25'
    file_path   VARCHAR(500),
    status      VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─── TRADES ──────────────────────────────────────────────
-- Individual trade rows parsed from the broker file
CREATE TABLE trades (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id   UUID         NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    segment     VARCHAR(30)  NOT NULL,   -- 'fno_futures' | 'fno_options' | 'intraday' | 'delivery'
    symbol      VARCHAR(100),
    trade_date  DATE,
    buy_price   DECIMAL(15,4),
    sell_price  DECIMAL(15,4),
    quantity    INTEGER,
    pnl         DECIMAL(15,4),           -- positive = profit, negative = loss
    turnover    DECIMAL(15,4),           -- absolute |pnl| for F&O
    is_squared  BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ─── TAX SUMMARIES ───────────────────────────────────────
-- Computed output from the Python engine — one row per report
CREATE TABLE tax_summaries (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id           UUID         UNIQUE NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    fno_turnover        DECIMAL(15,2),
    intraday_turnover   DECIMAL(15,2),
    delivery_turnover   DECIMAL(15,2),
    net_fno_pnl         DECIMAL(15,2),
    net_intraday_pnl    DECIMAL(15,2),
    net_delivery_pnl    DECIMAL(15,2),
    audit_required      BOOLEAN,
    audit_reason        TEXT,
    itr_form            VARCHAR(10),
    advance_tax_q1      DECIMAL(15,2),
    advance_tax_q2      DECIMAL(15,2),
    advance_tax_q3      DECIMAL(15,2),
    advance_tax_q4      DECIMAL(15,2),
    deductible_expenses DECIMAL(15,2),
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─── JOBS ────────────────────────────────────────────────
-- Tracks async processing status for each upload
CREATE TABLE jobs (
    id           UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID      NOT NULL REFERENCES users(id),
    report_id    UUID      NOT NULL REFERENCES reports(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|processing|done|failed
    error_msg    TEXT,
    started_at   TIMESTAMP,
    completed_at TIMESTAMP
);

-- ─── INDEXES ─────────────────────────────────────────────
CREATE INDEX idx_reports_user_id   ON reports(user_id);
CREATE INDEX idx_trades_report_id  ON trades(report_id);
CREATE INDEX idx_trades_segment    ON trades(segment);
CREATE INDEX idx_jobs_report_id    ON jobs(report_id);
CREATE INDEX idx_jobs_status       ON jobs(status);