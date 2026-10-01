-- ============================================================
-- Silverline POS Comprehensive Production Database Schema
-- Location: C:\xampp\htdocs\Silver_pos\schema.sql
-- Compatible with MySQL / MariaDB (phpMyAdmin) & SQLite
-- ============================================================

CREATE DATABASE IF NOT EXISTS silver_pos;
USE silver_pos;

-- ------------------------------------------------------------
-- 1. LOCATIONS / BRANCHES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 2. USERS & ROLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'Cashier', -- Owner, Cashier, Technician, Manager
    location_code VARCHAR(20) DEFAULT 'MW',
    two_factor_enabled TINYINT(1) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 3. ITEM CATEGORIES & BRANDS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 4. ITEMS & PRODUCTS MASTER
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category_name VARCHAR(100) DEFAULT 'General',
    brand_name VARCHAR(100) DEFAULT '',
    cost DECIMAL(10,2) DEFAULT 0.00,
    price DECIMAL(10,2) DEFAULT 0.00,
    stock INT DEFAULT 0,
    track_imei TINYINT(1) DEFAULT 0,
    warranty_months INT DEFAULT 0,
    reorder_level INT DEFAULT 5,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 5. IMEI / SERIAL NUMBER TRACKING
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_imeis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_code VARCHAR(50) NOT NULL,
    imei_number VARCHAR(100) UNIQUE NOT NULL,
    location_code VARCHAR(20) DEFAULT 'MW',
    status VARCHAR(20) DEFAULT 'In Stock', -- In Stock, Sold, RMA, Transferred
    sold_invoice_no VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_code) REFERENCES items(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 6. CUSTOMERS CRM & LOYALTY
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    customer_type VARCHAR(50) DEFAULT 'Retail', -- Retail, Credit, Wholesale
    credit_limit DECIMAL(10,2) DEFAULT 0.00,
    balance DECIMAL(10,2) DEFAULT 0.00,
    loyalty_points INT DEFAULT 0,
    loyalty_tier VARCHAR(50) DEFAULT 'Silver',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 7. SUPPLIERS MANAGEMENT
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    balance DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 8. SALES HEADERS (INVOICES)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    order_no VARCHAR(50) UNIQUE NOT NULL,
    location_code VARCHAR(20) DEFAULT 'MW',
    terminal_no VARCHAR(10) DEFAULT '#1',
    customer_phone VARCHAR(50) DEFAULT 'Cash Customer',
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    discount DECIMAL(10,2) DEFAULT 0.00,
    total DECIMAL(10,2) DEFAULT 0.00,
    tendered DECIMAL(10,2) DEFAULT 0.00,
    balance DECIMAL(10,2) DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'Cash', -- Cash, Card, Cheque, Credit, Split
    cashier_username VARCHAR(50) DEFAULT 'Rashmika',
    salesman_username VARCHAR(50) DEFAULT 'N/D',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 9. SALE LINE ITEMS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    item_code VARCHAR(50) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    imei_number VARCHAR(100) DEFAULT NULL,
    qty INT DEFAULT 1,
    unit_price DECIMAL(10,2) DEFAULT 0.00,
    total DECIMAL(10,2) DEFAULT 0.00,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 10. RETURNS & EXCHANGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_no VARCHAR(50) UNIQUE NOT NULL,
    original_invoice_no VARCHAR(50) NOT NULL,
    return_type VARCHAR(50) DEFAULT 'Customer Return', -- Customer Return, Exchange, Warranty Claim, Supplier RMA
    reason TEXT,
    refund_method VARCHAR(50) DEFAULT 'Cash',
    total_refund DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 11. PURCHASE ORDERS & GRN (GOODS RECEIVED NOTES)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    po_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(150) NOT NULL,
    location_code VARCHAR(20) DEFAULT 'MW',
    status VARCHAR(50) DEFAULT 'Sent', -- Draft, Sent, Received, Cancelled
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grn (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grn_no VARCHAR(50) UNIQUE NOT NULL,
    po_no VARCHAR(50),
    supplier_invoice_no VARCHAR(50),
    supplier_name VARCHAR(150) NOT NULL,
    total_cost DECIMAL(10,2) DEFAULT 0.00,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 12. SERVICE JOBS & DISPATCH POOL
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_no VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    service_type VARCHAR(100) NOT NULL, -- Dialog TV, 4G Antenna, CCTV, Repair
    package_type VARCHAR(100) DEFAULT 'Basic',
    address TEXT,
    technician_username VARCHAR(50) DEFAULT NULL,
    status VARCHAR(50) DEFAULT 'Pool', -- Pool, Assigned, In Progress, Completed, Closed
    advance_payment DECIMAL(10,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 13. REPAIRS & JOB CARDS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repair_job_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_card_no VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    device_model VARCHAR(100) NOT NULL,
    imei_or_serial VARCHAR(100),
    fault_description TEXT,
    accessories_included TEXT,
    under_warranty TINYINT(1) DEFAULT 0,
    estimated_cost DECIMAL(10,2) DEFAULT 0.00,
    advance_amount DECIMAL(10,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Received', -- Received, Diagnosing, Waiting Parts, Ready, Delivered
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 14. ACCOUNTS LEDGER & CHEQUES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    account_type VARCHAR(50) NOT NULL, -- Customer, Supplier, Bank
    account_name VARCHAR(150) NOT NULL,
    document_no VARCHAR(50),
    debit DECIMAL(10,2) DEFAULT 0.00,
    credit DECIMAL(10,2) DEFAULT 0.00,
    balance DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cheques (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cheque_no VARCHAR(50) UNIQUE NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    cheque_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payee_or_payer VARCHAR(150) NOT NULL,
    type VARCHAR(20) DEFAULT 'Received', -- Received, Issued
    status VARCHAR(50) DEFAULT 'Received', -- Received, Deposited, Cleared, Returned
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 15. SUSPENDED (ON HOLD) BILLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suspended_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    suspend_no VARCHAR(50) UNIQUE,
    items_json TEXT NOT NULL, -- [{code, name, qty, price}]
    total DECIMAL(10,2) DEFAULT 0.00,
    cashier VARCHAR(50) DEFAULT 'Rashmika',
    terminal VARCHAR(10) DEFAULT '#1',
    status VARCHAR(20) DEFAULT 'Suspended', -- Suspended, Recalled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recalled_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- INITIAL SEED DATA
-- ============================================================
INSERT INTO locations (code, name, address, phone) VALUES
('SH', 'Fair Road', 'Fair Road, Badulla', '0552221100'),
('MW', 'Bravo Bus Stand', 'Bravo Bus Stand, Badulla', '0552221101'),
('SS', 'Super & Mobile', 'Super Market, Bandarawela', '0572221102');

INSERT INTO users (username, password_hash, full_name, role, location_code) VALUES
('dilshan', 'owner_pass_hash', 'Dilshan (Owner)', 'Owner', 'MW'),
('rashmika', 'cashier_pass_hash', 'Rashmika', 'Cashier', 'MW'),
('kasun', 'tech_pass_hash', 'Kasun', 'Technician', 'MW');

INSERT INTO categories (name) VALUES ('Phones'), ('Accessories'), ('Services'), ('Reload'), ('Bill Payments');
INSERT INTO brands (name) VALUES ('Samsung'), ('Xiaomi'), ('Singer'), ('Dialog');

INSERT INTO items (code, name, category_name, brand_name, cost, price, stock, track_imei) VALUES 
('101005', 'Samsung A03s 64GB', 'Phones', 'Samsung', 65000.00, 72900.00, 6, 1),
('101003', 'Samsung M02 32GB', 'Phones', 'Samsung', 28000.00, 31900.00, 0, 1),
('101004', 'Redmi 12 128GB', 'Phones', 'Xiaomi', 52000.00, 58500.00, 2, 1),
('101002', '7W LED Bulb', 'Accessories', 'Singer', 140.00, 250.00, 40, 0),
('101006', 'Fast Charger', 'Accessories', 'Samsung', 1200.00, 1800.00, 12, 0),
('101007', 'Back Cover', 'Accessories', 'General', 300.00, 600.00, 30, 0),
('100102', 'CCTV 4-cam Install', 'Services', 'General', 25000.00, 35000.00, 99, 0),
('100101', 'Dialog TV Install', 'Services', 'Dialog', 3000.00, 4500.00, 99, 0);

INSERT INTO item_imeis (item_code, imei_number, location_code, status) VALUES
('101005', '356910008821', 'SH', 'Sold'),
('101005', '356910007710', 'MW', 'In Stock');

INSERT INTO customers (phone, name, customer_type, balance, loyalty_tier) VALUES
('0702256233', 'Mr Acman', 'Retail', 0.00, 'Silver'),
('0703885240', 'Mr Gamage', 'Credit', 12500.00, 'Gold');

INSERT INTO suppliers (name, contact_person, phone) VALUES
('Singer Sri Lanka', 'Mr. Perera', '0112300000'),
('Mobil King', 'Mr. Nimal', '0771234567');
