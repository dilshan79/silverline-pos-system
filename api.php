<?php
/**
 * Silverline POS Backend REST API & Database Handler
 * Path: C:\xampp\htdocs\Silver_pos\api.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, Origin, X-Requested-With, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

require_once __DIR__ . '/auth_lib.php';

// Database Connection (SQLite fallback / PDO setup)
$dbFile = __DIR__ . '/silver_pos.db';
try {
    $pdo = new PDO("sqlite:" . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => 'DB Connection Failed: ' . $e->getMessage()]);
    exit;
}

function addColumnIfMissing($pdo, $table, $column, $type) {
    $cols = array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(), 'name');
    if (!in_array($column, $cols)) {
        $pdo->exec("ALTER TABLE $table ADD COLUMN $column $type");
    }
}

// Load one sale with its lines, in the shape the POS prints
function loadSale($pdo, $sale) {
    $stmt = $pdo->prepare("SELECT item_code AS code, item_name AS name, qty, unit_price AS price, discount, discount_label, total FROM sale_items WHERE sale_id = ? ORDER BY id ASC");
    $stmt->execute([$sale['id']]);
    $sale['items'] = $stmt->fetchAll();
    return $sale;
}

function openCashSession($pdo, $terminal) {
    $stmt = $pdo->prepare("SELECT * FROM cash_sessions WHERE terminal = ? AND status = 'Open' ORDER BY id DESC LIMIT 1");
    $stmt->execute([$terminal]);
    return $stmt->fetch();
}

// Float plus cash sales on this terminal since the float was entered.
// Uses the bill total, not the tendered amount, because change is handed back.
function getNextInvoiceInfo($pdo, $terminal) {
    $terminalDigit = preg_replace('/\D/', '', $terminal) ?: '1';
    $session = openCashSession($pdo, $terminal);
    
    // When shift is closed after Z-Reading (or before opening float), bill number resets to 1
    if (!$session) {
        $invNo = 'INMW' . $terminalDigit . '0000001';
        return [
            'invoice_no' => $invNo,
            'seq' => 1,
            'session_id' => 0,
            'terminal' => $terminal
        ];
    }

    $sessionId = (int)$session['id'];
    $startSaleId = (int)$session['start_sale_id'];

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE terminal = ? AND id > ?");
    $stmt->execute([$terminal, $startSaleId]);
    $seq = (int)$stmt->fetchColumn() + 1;

    $invNo = 'INMW' . $terminalDigit . str_pad($seq, 7, '0', STR_PAD_LEFT);
    return [
        'invoice_no' => $invNo,
        'seq' => $seq,
        'session_id' => $sessionId,
        'terminal' => $terminal
    ];
}

function cashInHand($pdo, $session) {
    $stmt = $pdo->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS amt FROM sales WHERE terminal = ? AND payment_method = 'Cash' AND id > ?");
    $stmt->execute([$session['terminal'], $session['start_sale_id']]);
    $cashRow = $stmt->fetch();

    // Check card sales across Visa, MasterCard, Amex and generic Card
    $stmtCard = $pdo->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS amt FROM sales WHERE terminal = ? AND payment_method IN ('Card', 'Visa', 'MasterCard', 'Amex') AND id > ?");
    $stmtCard->execute([$session['terminal'], $session['start_sale_id']]);
    $cardRow = $stmtCard->fetch();

    // Also include cash portions of Split sales in cash calculation
    $stmtSplit = $pdo->prepare("SELECT payment_details FROM sales WHERE terminal = ? AND payment_method = 'Split' AND id > ?");
    $stmtSplit->execute([$session['terminal'], $session['start_sale_id']]);
    $splitCashTotal = 0;
    while ($sp = $stmtSplit->fetch()) {
        $pObj = json_decode($sp['payment_details'] ?? '{}', true);
        if (!empty($pObj['cashAmount'])) {
            $splitCashTotal += (float)$pObj['cashAmount'];
        }
    }

    $stmtIn = $pdo->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amt FROM cash_transactions WHERE session_id = ? AND type IN ('paid_in', 'float_add')");
    $stmtIn->execute([$session['id']]);
    $inRow = $stmtIn->fetch();

    $stmtOut = $pdo->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amt FROM cash_transactions WHERE session_id = ? AND type = 'paid_out'");
    $stmtOut->execute([$session['id']]);
    $outRow = $stmtOut->fetch();

    $float = (float)$session['opening_float'];
    $cashSales = (float)($cashRow['amt'] ?? 0) + $splitCashTotal;
    $cardSales = (float)($cardRow['amt'] ?? 0);
    $paidIn = (float)($inRow['amt'] ?? 0);
    $paidOut = (float)($outRow['amt'] ?? 0);

    return [
        'session_id' => (int)$session['id'],
        'terminal' => $session['terminal'],
        'cashier' => $session['cashier'],
        'opened_at' => $session['opened_at'],
        'opening_float' => $float,
        'cash_sales_count' => (int)($cashRow['cnt'] ?? 0),
        'cash_sales_total' => round($cashSales, 2),
        'card_sales_count' => (int)($cardRow['cnt'] ?? 0),
        'card_sales_total' => round($cardSales, 2),
        'paid_in_total' => round($paidIn, 2),
        'paid_out_total' => round($paidOut, 2),
        'expected_cash' => round($float + $cashSales + $paidIn - $paidOut, 2),
        'counted_cash' => isset($session['counted_cash']) && $session['counted_cash'] !== null ? (float)$session['counted_cash'] : null,
        'difference' => isset($session['difference']) && $session['difference'] !== null ? (float)$session['difference'] : null,
        'status' => $session['status'] ?? 'Open',
        'closed_at' => $session['closed_at'] ?? null
    ];
}

// Initialize tables if missing
function initDB($pdo) {
    initUserTables($pdo);

    $pdo->exec("CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT,
        category TEXT,
        cost REAL,
        price REAL,
        stock INTEGER,
        track_imei INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active'
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_no TEXT UNIQUE,
        subtotal REAL,
        discount REAL,
        total REAL,
        tendered REAL,
        payment_method TEXT,
        cashier TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        item_code TEXT,
        item_name TEXT,
        qty INTEGER,
        unit_price REAL,
        total REAL,
        FOREIGN KEY (sale_id) REFERENCES sales(id)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS suspended_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suspend_no TEXT UNIQUE,
        items_json TEXT,
        bill_discount_json TEXT,
        total REAL,
        cashier TEXT,
        terminal TEXT,
        status TEXT DEFAULT 'Suspended',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        recalled_at DATETIME
    )");

    // One row per till shift: opening float in, counted cash out
    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        terminal TEXT,
        cashier TEXT,
        opening_float REAL,
        start_sale_id INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Open',
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        cash_sales_count INTEGER,
        cash_sales_total REAL,
        expected_cash REAL,
        counted_cash REAL,
        difference REAL
    )");

    // Drawer cash transactions: additional float, paid in, paid out
    $pdo->exec("CREATE TABLE IF NOT EXISTS cash_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        terminal TEXT,
        cashier TEXT,
        type TEXT,
        amount REAL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // Older databases were created before these columns existed
    addColumnIfMissing($pdo, 'suspended_bills', 'bill_discount_json', 'TEXT');
    addColumnIfMissing($pdo, 'sales', 'discount_label', 'TEXT');
    addColumnIfMissing($pdo, 'sale_items', 'discount', 'REAL DEFAULT 0');
    addColumnIfMissing($pdo, 'sale_items', 'discount_label', 'TEXT');
    addColumnIfMissing($pdo, 'sales', 'terminal', 'TEXT');
    addColumnIfMissing($pdo, 'sales', 'salesman', "TEXT DEFAULT 'N/D'");
    addColumnIfMissing($pdo, 'sales', 'location', "TEXT DEFAULT 'Silverline Super and Mobile - Kandy Rd, Mawathagama'");
    addColumnIfMissing($pdo, 'sales', 'session_id', 'INTEGER DEFAULT 0');
    addColumnIfMissing($pdo, 'sales', 'daily_inv_seq', 'INTEGER DEFAULT 1');
    addColumnIfMissing($pdo, 'cash_sessions', 'z_reading_no', 'INTEGER DEFAULT 0');
    addColumnIfMissing($pdo, 'sales', 'payment_details', 'TEXT');
    addColumnIfMissing($pdo, 'sales', 'customer', "TEXT DEFAULT 'Cash Customer'");

    // Categories & Subcategories tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        category_name TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    addColumnIfMissing($pdo, 'items', 'subcategory', "TEXT DEFAULT ''");
    addColumnIfMissing($pdo, 'items', 'cost', "REAL DEFAULT 0");
    addColumnIfMissing($pdo, 'items', 'status', "TEXT DEFAULT 'Active'");

    // Inventory tables
    $pdo->exec("CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        status TEXT DEFAULT 'Active'
    )");
    $pdo->exec("INSERT OR IGNORE INTO locations (code, name, address, phone, status) VALUES
        ('MW', 'Bravo Bus Stand', 'Bravo Bus Stand, Badulla', '0552221101', 'Active'),
        ('SH', 'Fair Road', 'Fair Road, Badulla', '0552221100', 'Active'),
        ('SS', 'Super & Mobile', 'Super Market, Bandarawela', '0572221102', 'Active')");

    $pdo->exec("CREATE TABLE IF NOT EXISTS item_imeis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_code TEXT NOT NULL,
        imei_number TEXT UNIQUE NOT NULL,
        location_code TEXT DEFAULT 'MW',
        status TEXT DEFAULT 'In Stock',
        sold_invoice_no TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS stock_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_no TEXT UNIQUE NOT NULL,
        from_location TEXT NOT NULL,
        to_location TEXT NOT NULL,
        status TEXT DEFAULT 'Completed',
        items_json TEXT NOT NULL,
        total_qty INTEGER DEFAULT 1,
        notes TEXT,
        created_by TEXT DEFAULT 'Admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS stock_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_no TEXT NOT NULL,
        location_code TEXT DEFAULT 'MW',
        item_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        system_stock INTEGER NOT NULL,
        physical_count INTEGER NOT NULL,
        variance INTEGER NOT NULL,
        cost_impact REAL DEFAULT 0,
        reason TEXT,
        audited_by TEXT DEFAULT 'Admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    initUserTables($pdo);

    // Seed default items if table is empty
    $stmt = $pdo->query("SELECT COUNT(*) FROM items");
    if ($stmt->fetchColumn() == 0) {
        $seedItems = [
            ['101005', 'Samsung A03s 64GB', 'Phones', 65000, 72900, 6, 1],
            ['101003', 'Samsung M02 32GB', 'Phones', 28000, 31900, 0, 1],
            ['101004', 'Redmi 12 128GB', 'Phones', 52000, 58500, 2, 1],
            ['101002', '7W LED Bulb', 'Accessories', 140, 250, 40, 0],
            ['101006', 'Fast Charger', 'Accessories', 1200, 1800, 12, 0],
            ['101007', 'Back Cover', 'Accessories', 300, 600, 30, 0],
            ['100102', 'CCTV 4-cam Install', 'Services', 25000, 35000, 99, 0],
            ['100101', 'Dialog TV Install', 'Services', 3000, 4500, 99, 0]
        ];

        $insert = $pdo->prepare("INSERT INTO items (code, name, category, cost, price, stock, track_imei) VALUES (?, ?, ?, ?, ?, ?, ?)");
        foreach ($seedItems as $item) {
            $insert->execute($item);
        }
    }
}

initDB($pdo);

const ROLES_ALL = ['Super Admin', 'Admin', 'Owner', 'Manager', 'Cashier', 'Technician'];
const ROLES_POS = ['Super Admin', 'Admin', 'Owner', 'Manager', 'Cashier'];
const ROLES_INVENTORY = ['Super Admin', 'Admin', 'Owner', 'Manager'];
const ROLES_ADMIN = ['Super Admin', 'Admin', 'Owner'];

// Router Action Handler
$action = $_GET['action'] ?? '';

// Authentication Gate: All actions except 'login' require a valid authenticated session
$authUser = null;
if ($action !== 'login') {
    $authUser = requireAuthUser($pdo);
}

switch ($action) {
    case 'login':
        $input = json_decode(file_get_contents('php://input'), true);
        $username = trim($input['username'] ?? '');
        $password = $input['password'] ?? '';
        if ($username === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Username and password are required.']);
            exit;
        }
        try {
            $user = findUserByLogin($pdo, $username, $password);
            if (!$user) {
                error_log("POS login failed for username '$username'");
                http_response_code(401);
                echo json_encode(['status' => 'error', 'message' => 'Invalid username or password.']);
                exit;
            }
            $token = createSession($pdo, $user['id']);
            echo json_encode(['status' => 'success', 'token' => $token, 'user' => publicUser($user)]);
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Who is logged in. The POS calls this on load so the bar shows current data from the users table.
    case 'me':
        echo json_encode(['status' => 'success', 'user' => publicUser($authUser)]);
        break;

    case 'logout':
        endSession($pdo, bearerToken());
        echo json_encode(['status' => 'success']);
        break;

    case 'get_items':
        $search = trim($_GET['search'] ?? '');
        $category = trim($_GET['category'] ?? '');
        $subcategory = trim($_GET['subcategory'] ?? '');
        try {
            $sql = "SELECT id, code, name, category, category AS categoryName, subcategory, cost, price, stock, track_imei, (track_imei = 1) AS trackImei, status FROM items WHERE 1=1";
            $params = [];
            if ($search !== '') {
                $sql .= " AND (name LIKE ? OR code LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }
            if ($category !== '' && $category !== 'All') {
                $sql .= " AND category = ?";
                $params[] = $category;
            }
            if ($subcategory !== '' && $subcategory !== 'All') {
                $sql .= " AND subcategory = ?";
                $params[] = $subcategory;
            }
            $sql .= " ORDER BY id DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $items]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'lookup_barcode_or_imei':
        $query = trim($_GET['query'] ?? $_POST['query'] ?? '');
        if ($query === '') {
            echo json_encode(['status' => 'error', 'message' => 'Query is required']);
            exit;
        }

        try {
            // 1. Try exact match on items.code
            $stmt = $pdo->prepare("SELECT id, code, name, category, category AS categoryName, subcategory, cost, price, stock, track_imei, (track_imei = 1) AS trackImei, status FROM items WHERE UPPER(code) = UPPER(?) LIMIT 1");
            $stmt->execute([$query]);
            $item = $stmt->fetch();

            if ($item) {
                echo json_encode([
                    'status' => 'success',
                    'match_type' => 'code',
                    'data' => [
                        'item' => $item,
                        'imei' => null
                    ]
                ]);
                exit;
            }

            // 2. Try match on item_imeis.imei_number
            $imeiStmt = $pdo->prepare("SELECT ii.imei_number, i.id, i.code, i.name, i.category, i.category AS categoryName, i.subcategory, i.cost, i.price, i.stock, i.track_imei, (i.track_imei = 1) AS trackImei, i.status 
                                       FROM item_imeis ii 
                                       JOIN items i ON ii.item_code = i.code 
                                       WHERE UPPER(ii.imei_number) = UPPER(?) LIMIT 1");
            $imeiStmt->execute([$query]);
            $imeiRow = $imeiStmt->fetch();

            if ($imeiRow) {
                $imeiNum = $imeiRow['imei_number'];
                unset($imeiRow['imei_number']);
                echo json_encode([
                    'status' => 'success',
                    'match_type' => 'imei',
                    'data' => [
                        'item' => $imeiRow,
                        'imei' => $imeiNum
                    ]
                ]);
                exit;
            }

            // 3. Try partial match on items (code or name)
            $likeStmt = $pdo->prepare("SELECT id, code, name, category, category AS categoryName, subcategory, cost, price, stock, track_imei, (track_imei = 1) AS trackImei, status FROM items WHERE code LIKE ? OR name LIKE ? ORDER BY (code = ?) DESC LIMIT 1");
            $likeStmt->execute(["%$query%", "%$query%", $query]);
            $likeItem = $likeStmt->fetch();

            if ($likeItem) {
                echo json_encode([
                    'status' => 'success',
                    'match_type' => 'search',
                    'data' => [
                        'item' => $likeItem,
                        'imei' => null
                    ]
                ]);
                exit;
            }

            echo json_encode(['status' => 'not_found', 'message' => "No item found for barcode or IMEI: $query"]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'save_item':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        if (!$input) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload']);
            exit;
        }

        $code = trim($input['code'] ?? '');
        $name = trim($input['name'] ?? '');
        $category = trim($input['category'] ?? $input['categoryName'] ?? 'General');
        $subcategory = trim($input['subcategory'] ?? '');
        $cost = (float)($input['cost'] ?? 0);
        $price = (float)($input['price'] ?? 0);
        $stock = (int)($input['stock'] ?? 0);
        $trackImei = (!empty($input['trackImei']) || !empty($input['track_imei'])) ? 1 : 0;
        $status = trim($input['status'] ?? 'Active');
        $id = !empty($input['id']) ? (int)$input['id'] : null;

        if ($code === '' || $name === '') {
            echo json_encode(['status' => 'error', 'message' => 'Item code and name are required']);
            exit;
        }

        try {
            $existingId = null;
            if ($id) {
                $existingId = $id;
            } else {
                $check = $pdo->prepare("SELECT id FROM items WHERE code = ?");
                $check->execute([$code]);
                $existingId = $check->fetchColumn();
            }

            if ($existingId) {
                $stmt = $pdo->prepare("UPDATE items SET code = ?, name = ?, category = ?, subcategory = ?, cost = ?, price = ?, stock = ?, track_imei = ?, status = ? WHERE id = ?");
                $stmt->execute([$code, $name, $category, $subcategory, $cost, $price, $stock, $trackImei, $status, $existingId]);
                $finalId = $existingId;
            } else {
                $stmt = $pdo->prepare("INSERT INTO items (code, name, category, subcategory, cost, price, stock, track_imei, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$code, $name, $category, $subcategory, $cost, $price, $stock, $trackImei, $status]);
                $finalId = $pdo->lastInsertId();
            }

            $stmt = $pdo->prepare("SELECT id, code, name, category, category AS categoryName, subcategory, cost, price, stock, track_imei, (track_imei = 1) AS trackImei, status FROM items WHERE id = ?");
            $stmt->execute([$finalId]);
            $saved = $stmt->fetch();
            echo json_encode(['status' => 'success', 'data' => $saved]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'delete_item':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        $code = trim($input['code'] ?? $_GET['code'] ?? '');

        try {
            if ($id > 0) {
                $pdo->prepare("DELETE FROM items WHERE id = ?")->execute([$id]);
            } else if ($code !== '') {
                $pdo->prepare("DELETE FROM items WHERE code = ?")->execute([$code]);
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Item ID or Code is required']);
                exit;
            }
            echo json_encode(['status' => 'success', 'message' => 'Item deleted']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_categories':
        try {
            $stmt = $pdo->query("SELECT c.*,
                (SELECT COUNT(*) FROM items i WHERE i.category = c.name) AS item_count,
                (SELECT COUNT(*) FROM subcategories sc WHERE sc.category_name = c.name) AS subcategory_count
                FROM categories c ORDER BY c.name ASC");
            $cats = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $cats]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'save_category':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $name = trim($input['name'] ?? '');
        $description = trim($input['description'] ?? '');
        $id = !empty($input['id']) ? (int)$input['id'] : null;

        if ($name === '') {
            echo json_encode(['status' => 'error', 'message' => 'Category name is required']);
            exit;
        }

        try {
            if ($id) {
                $stmt = $pdo->prepare("SELECT name FROM categories WHERE id = ?");
                $stmt->execute([$id]);
                $old = $stmt->fetchColumn();

                $stmt = $pdo->prepare("UPDATE categories SET name = ?, description = ? WHERE id = ?");
                $stmt->execute([$name, $description, $id]);
                if ($old && $old !== $name) {
                    $pdo->prepare("UPDATE subcategories SET category_name = ? WHERE category_name = ?")->execute([$name, $old]);
                    $pdo->prepare("UPDATE items SET category = ? WHERE category = ?")->execute([$name, $old]);
                }
            } else {
                $stmt = $pdo->prepare("INSERT INTO categories (name, description) VALUES (?, ?)");
                $stmt->execute([$name, $description]);
                $id = $pdo->lastInsertId();
            }
            echo json_encode(['status' => 'success', 'id' => $id, 'name' => $name, 'description' => $description]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'delete_category':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Category ID is required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT name FROM categories WHERE id = ?");
            $stmt->execute([$id]);
            $catName = $stmt->fetchColumn();
            if ($catName) {
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM items WHERE category = ?");
                $cntStmt->execute([$catName]);
                $itemCount = (int)$cntStmt->fetchColumn();
                if ($itemCount > 0) {
                    echo json_encode(['status' => 'error', 'message' => "Cannot delete '$catName' because $itemCount item(s) are assigned to it. Please reassign or delete items first."]);
                    exit;
                }
                $pdo->prepare("DELETE FROM subcategories WHERE category_name = ?")->execute([$catName]);
                $pdo->prepare("DELETE FROM categories WHERE id = ?")->execute([$id]);
            }
            echo json_encode(['status' => 'success', 'message' => 'Category deleted']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_subcategories':
        $category = $_GET['category'] ?? '';
        $categoryId = !empty($_GET['category_id']) ? (int)$_GET['category_id'] : 0;
        try {
            $sql = "SELECT sc.*,
                (SELECT COUNT(*) FROM items i WHERE i.subcategory = sc.name) AS item_count
                FROM subcategories sc WHERE 1=1";
            $params = [];
            if ($category !== '' && $category !== 'All') {
                $sql .= " AND sc.category_name = ?";
                $params[] = $category;
            } else if ($categoryId > 0) {
                $sql .= " AND sc.category_id = ?";
                $params[] = $categoryId;
            }
            $sql .= " ORDER BY sc.category_name ASC, sc.name ASC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $subcats = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $subcats]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'save_subcategory':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $name = trim($input['name'] ?? '');
        $categoryName = trim($input['category_name'] ?? '');
        $categoryId = !empty($input['category_id']) ? (int)$input['category_id'] : 0;
        $description = trim($input['description'] ?? '');
        $id = !empty($input['id']) ? (int)$input['id'] : null;

        if ($name === '' || $categoryName === '') {
            echo json_encode(['status' => 'error', 'message' => 'Parent Category and Subcategory name are required']);
            exit;
        }

        try {
            if (!$categoryId) {
                $cId = $pdo->prepare("SELECT id FROM categories WHERE name = ?");
                $cId->execute([$categoryName]);
                $categoryId = (int)$cId->fetchColumn();
            }

            if ($id) {
                $stmt = $pdo->prepare("SELECT name FROM subcategories WHERE id = ?");
                $stmt->execute([$id]);
                $old = $stmt->fetchColumn();

                $stmt = $pdo->prepare("UPDATE subcategories SET category_id = ?, category_name = ?, name = ?, description = ? WHERE id = ?");
                $stmt->execute([$categoryId, $categoryName, $name, $description, $id]);
                if ($old && $old !== $name) {
                    $pdo->prepare("UPDATE items SET subcategory = ? WHERE subcategory = ?")->execute([$name, $old]);
                }
            } else {
                $stmt = $pdo->prepare("INSERT INTO subcategories (category_id, category_name, name, description) VALUES (?, ?, ?, ?)");
                $stmt->execute([$categoryId, $categoryName, $name, $description]);
                $id = $pdo->lastInsertId();
            }
            echo json_encode(['status' => 'success', 'id' => $id, 'name' => $name, 'category_name' => $categoryName, 'description' => $description]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'delete_subcategory':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $id = (int)($input['id'] ?? $_GET['id'] ?? 0);
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Subcategory ID is required']);
            exit;
        }
        try {
            $stmt = $pdo->prepare("SELECT name FROM subcategories WHERE id = ?");
            $stmt->execute([$id]);
            $subcatName = $stmt->fetchColumn();
            if ($subcatName) {
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM items WHERE subcategory = ?");
                $cntStmt->execute([$subcatName]);
                $itemCount = (int)$cntStmt->fetchColumn();
                if ($itemCount > 0) {
                    echo json_encode(['status' => 'error', 'message' => "Cannot delete '$subcatName' because $itemCount item(s) are assigned to it. Please reassign items first."]);
                    exit;
                }
                $pdo->prepare("DELETE FROM subcategories WHERE id = ?")->execute([$id]);
            }
            echo json_encode(['status' => 'success', 'message' => 'Subcategory deleted']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'create_sale':
        requireRole($pdo, ROLES_POS);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);

        if (!$input || empty($input['items'])) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid sale data payload']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            $total = $input['total'] ?? 0;
            $subtotal = $input['subtotal'] ?? $total;
            $billDiscount = $input['discount'] ?? 0;
            $tendered = $input['tendered'] ?? $total;
            $pm = $input['payment_method'] ?? 'Cash';
            $cashier = !empty($authUser['full_name']) ? $authUser['full_name'] : ($input['cashier'] ?? $authUser['username']);
            $salesman = $input['salesman'] ?? 'N/D';
            $terminal = $input['terminal'] ?? '#1';
            $terminalDigit = preg_replace('/\D/', '', $terminal) ?: '1';
            $location = $input['location'] ?? 'Silverline Super and Mobile - Kandy Rd, Mawathagama';

            // Find current active session for this terminal
            $session = openCashSession($pdo, $terminal);
            if ($session) {
                $sessionId = (int)$session['id'];
                $startSaleId = (int)$session['start_sale_id'];
            } else {
                // If a sale is created without an open float, count from last closed session's end
                $lastClosedStmt = $pdo->prepare("SELECT id FROM cash_sessions WHERE terminal = ? AND status = 'Closed' ORDER BY id DESC LIMIT 1");
                $lastClosedStmt->execute([$terminal]);
                $lastClosedId = $lastClosedStmt->fetchColumn();
                if ($lastClosedId) {
                    $startSaleStmt = $pdo->prepare("SELECT COALESCE(MAX(id), 0) FROM sales WHERE terminal = ? AND session_id = ?");
                    $startSaleStmt->execute([$terminal, $lastClosedId]);
                    $startSaleId = (int)$startSaleStmt->fetchColumn();
                } else {
                    $startSaleId = 0;
                }
                $sessionId = 0;
            }

            // Invoice number reset per session/shift:
            $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM sales WHERE terminal = ? AND id > ?");
            $cntStmt->execute([$terminal, $startSaleId]);
            $seqInShift = (int)$cntStmt->fetchColumn() + 1;

            $invNo = 'INMW' . $terminalDigit . str_pad($seqInShift, 7, '0', STR_PAD_LEFT);

            $paymentDetails = !empty($input['payment_details']) ? (is_string($input['payment_details']) ? $input['payment_details'] : json_encode($input['payment_details'])) : null;
            $customer = $input['customer'] ?? 'Cash Customer';

            $stmt = $pdo->prepare("INSERT INTO sales (invoice_no, subtotal, discount, discount_label, total, tendered, payment_method, cashier, salesman, location, terminal, session_id, daily_inv_seq, payment_details, customer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$invNo, $subtotal, $billDiscount, $input['discount_label'] ?? null, $total, $tendered, $pm, $cashier, $salesman, $location, $terminal, $sessionId, $seqInShift, $paymentDetails, $customer]);
            $saleId = $pdo->lastInsertId();

            $itemStmt = $pdo->prepare("INSERT INTO sale_items (sale_id, item_code, item_name, qty, unit_price, discount, discount_label, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stockUpdate = $pdo->prepare("UPDATE items SET stock = stock - ? WHERE code = ?");

            foreach ($input['items'] as $item) {
                $lineDiscount = $item['discount'] ?? 0;
                $lineTotal = $item['qty'] * $item['price'] - $lineDiscount;
                $itemStmt->execute([$saleId, $item['code'], $item['name'], $item['qty'], $item['price'], $lineDiscount, $item['discount_label'] ?? null, $lineTotal]);
                $stockUpdate->execute([$item['qty'], $item['code']]);
            }

            $created = $pdo->query("SELECT created_at FROM sales WHERE id = " . (int)$saleId)->fetchColumn();
            $pdo->commit();

            // Next sequential invoice number for this terminal
            $nextInvNo = 'INMW' . $terminalDigit . str_pad($seqInShift + 1, 7, '0', STR_PAD_LEFT);

            echo json_encode([
                'status' => 'success',
                'invoice_no' => $invNo,
                'next_invoice_no' => $nextInvNo,
                'sale_id' => $saleId,
                'created_at' => $created,
                'salesman' => $salesman,
                'terminal' => $terminal,
                'location' => $location
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Find a completed bill for a reprint.
    // ?last=1                     the most recent bill
    // ?ref=INMW1000014 or 1000014 a bill number, with or without the prefix
    // ?ref=2026.03.25.1000014     a date and bill number
    // tz = browser getTimezoneOffset(), so the date matches the shop's local day
    case 'get_sale':
        try {
            if (!empty($_GET['last'])) {
                $sale = $pdo->query("SELECT * FROM sales ORDER BY id DESC LIMIT 1")->fetch();
                if (!$sale) {
                    echo json_encode(['status' => 'error', 'message' => 'No bills found yet']);
                    exit;
                }
                echo json_encode(['status' => 'success', 'data' => loadSale($pdo, $sale)]);
                break;
            }

            $ref = strtoupper(trim($_GET['ref'] ?? ''));
            $date = null;
            $num = $ref;
            if (preg_match('/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})[.\-\/ ](.+)$/', $ref, $m)) {
                $date = sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]);
                $num = trim($m[4]);
            }
            if (!preg_match('/^[A-Z0-9]+$/', $num)) {
                echo json_encode(['status' => 'error', 'message' => "Not a valid bill number: $ref"]);
                exit;
            }

            $sql = "SELECT * FROM sales WHERE (invoice_no = ? OR invoice_no LIKE ?)";
            $params = [$num, '%' . $num];
            if ($date) {
                $offset = -(int)($_GET['tz'] ?? 0);
                $sql .= " AND DATE(created_at, ?) = ?";
                $params[] = $offset . ' minutes';
                $params[] = $date;
            }
            $stmt = $pdo->prepare($sql . " ORDER BY id DESC LIMIT 50");
            $stmt->execute($params);

            // Keep only exact matches: the full number, or the number without its letter prefix
            $matches = array_values(array_filter($stmt->fetchAll(), function ($s) use ($num) {
                return $s['invoice_no'] === $num || preg_replace('/^[A-Z]+/', '', $s['invoice_no']) === $num;
            }));

            if (count($matches) === 0) {
                $where = $date ? " on $date" : '';
                echo json_encode(['status' => 'error', 'message' => "Bill $num not found$where"]);
            } elseif (count($matches) > 1) {
                echo json_encode(['status' => 'error', 'message' => count($matches) . " bills match $num. Add the date: YYYY.MM.DD.$num"]);
            } else {
                echo json_encode(['status' => 'success', 'data' => loadSale($pdo, $matches[0])]);
            }
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Current shift for a terminal: float and cash in hand so far
    case 'cash_status':
        try {
            $terminal = $_GET['terminal'] ?? '#1';
            $session = openCashSession($pdo, $terminal);
            $invInfo = getNextInvoiceInfo($pdo, $terminal);
            $data = $session ? cashInHand($pdo, $session) : null;
            if ($data) {
                $data['next_invoice_no'] = $invInfo['invoice_no'];
                $data['daily_inv_seq'] = $invInfo['seq'];
            }

            // Salesmen list from users table
            $salesmenStmt = $pdo->query("SELECT full_name FROM users WHERE status = 'Active' ORDER BY id ASC");
            $salesmen = array_column($salesmenStmt->fetchAll(), 'full_name');
            if (!in_array('Kasun', $salesmen)) $salesmen[] = 'Kasun';
            if (!in_array('N/D', $salesmen)) array_unshift($salesmen, 'N/D');

            $userLocCode = !empty($authUser['location_code']) ? strtoupper(trim($authUser['location_code'])) : 'MW';
            $locStmt = $pdo->prepare("SELECT code, name, address, phone FROM locations WHERE UPPER(code) = ? LIMIT 1");
            $locStmt->execute([$userLocCode]);
            $locRow = $locStmt->fetch();
            $locName = $locRow ? $locRow['name'] : ($userLocCode === 'SH' ? 'Fair Road' : ($userLocCode === 'SS' ? 'Super & Mobile' : 'Bravo Bus Stand'));
            $locDisplay = str_contains($locName, "($userLocCode)") ? $locName : "$locName ($userLocCode)";
            $locationAddress = $locRow['address'] ?? 'Badulla';
            $locationPhone = $locRow['phone'] ?? '0552221101';

            echo json_encode([
                'status' => 'success',
                'data' => $data,
                'next_invoice_no' => $invInfo['invoice_no'],
                'daily_inv_seq' => $invInfo['seq'],
                'salesmen' => $salesmen,
                'location' => $locDisplay,
                'location_code' => $userLocCode,
                'location_address' => $locationAddress,
                'location_phone' => $locationPhone,
                'user' => publicUser($authUser)
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_pos_meta':
        try {
            $terminal = $_GET['terminal'] ?? '#1';
            $invInfo = getNextInvoiceInfo($pdo, $terminal);
            $salesmenStmt = $pdo->query("SELECT full_name FROM users WHERE status = 'Active' ORDER BY id ASC");
            $salesmen = array_column($salesmenStmt->fetchAll(), 'full_name');
            if (!in_array('Kasun', $salesmen)) $salesmen[] = 'Kasun';
            if (!in_array('N/D', $salesmen)) array_unshift($salesmen, 'N/D');

            $userLocCode = !empty($authUser['location_code']) ? strtoupper(trim($authUser['location_code'])) : 'MW';
            $locStmt = $pdo->prepare("SELECT code, name, address, phone FROM locations WHERE UPPER(code) = ? LIMIT 1");
            $locStmt->execute([$userLocCode]);
            $locRow = $locStmt->fetch();
            $locName = $locRow ? $locRow['name'] : ($userLocCode === 'SH' ? 'Fair Road' : ($userLocCode === 'SS' ? 'Super & Mobile' : 'Bravo Bus Stand'));
            $locDisplay = str_contains($locName, "($userLocCode)") ? $locName : "$locName ($userLocCode)";
            $locationAddress = $locRow['address'] ?? 'Badulla';
            $locationPhone = $locRow['phone'] ?? '0552221101';

            echo json_encode([
                'status' => 'success',
                'terminal' => $terminal,
                'terminals' => ['#1', '#2', '#3'],
                'location' => $locDisplay,
                'location_code' => $userLocCode,
                'location_address' => $locationAddress,
                'location_phones' => $locationPhone,
                'salesmen' => $salesmen,
                'next_invoice_no' => $invInfo['invoice_no'],
                'daily_inv_seq' => $invInfo['seq'],
                'user' => publicUser($authUser)
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Enter the opening float or add additional float cash.
    case 'open_float':
        requireRole($pdo, ROLES_POS);
        $input = json_decode(file_get_contents('php://input'), true);
        $amount = $input['amount'] ?? null;
        $terminal = $input['terminal'] ?? '#1';
        $isAddition = !empty($input['is_addition']);
        $reason = $input['reason'] ?? ($isAddition ? 'Additional Float Added' : 'Opening Float');
        $effectiveCashier = !empty($authUser['full_name']) ? $authUser['full_name'] : ($input['cashier'] ?? $authUser['username']);

        if (!is_numeric($amount) || $amount < 0) {
            echo json_encode(['status' => 'error', 'message' => 'Float must be 0 or more']);
            exit;
        }

        try {
            $session = openCashSession($pdo, $terminal);
            if ($session) {
                if ($isAddition) {
                    $pdo->prepare("INSERT INTO cash_transactions (session_id, terminal, cashier, type, amount, reason) VALUES (?, ?, ?, 'float_add', ?, ?)")
                        ->execute([$session['id'], $terminal, $effectiveCashier, $amount, $reason]);
                } else {
                    $pdo->prepare("UPDATE cash_sessions SET opening_float = ? WHERE id = ?")->execute([$amount, $session['id']]);
                }
            } else {
                $lastSale = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) FROM sales")->fetchColumn();
                $pdo->prepare("INSERT INTO cash_sessions (terminal, cashier, opening_float, start_sale_id) VALUES (?, ?, ?, ?)")
                    ->execute([$terminal, $effectiveCashier, $amount, $lastSale]);
            }
            echo json_encode(['status' => 'success', 'data' => cashInHand($pdo, openCashSession($pdo, $terminal)), 'message' => $isAddition ? 'Added to drawer float' : 'Opening float saved']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Paid In / Paid Out / Drawer Cash Adjustments
    case 'cash_transaction':
        requireRole($pdo, ROLES_POS);
        $input = json_decode(file_get_contents('php://input'), true);
        $amount = $input['amount'] ?? null;
        $terminal = $input['terminal'] ?? '#1';
        $type = $input['type'] ?? 'paid_in'; // 'paid_in', 'paid_out', 'float_add'
        $reason = trim($input['reason'] ?? '');
        $effectiveCashier = !empty($authUser['full_name']) ? $authUser['full_name'] : ($input['cashier'] ?? $authUser['username']);

        if (!is_numeric($amount) || $amount <= 0) {
            echo json_encode(['status' => 'error', 'message' => 'Amount must be greater than 0']);
            exit;
        }
        if (empty($reason)) {
            $reason = ($type === 'paid_out') ? 'Petty Cash Out' : 'Cash In Drawer';
        }

        try {
            $session = openCashSession($pdo, $terminal);
            if (!$session) {
                echo json_encode(['status' => 'error', 'message' => 'No open till session. Enter Float Cash first.']);
                exit;
            }
            $pdo->prepare("INSERT INTO cash_transactions (session_id, terminal, cashier, type, amount, reason) VALUES (?, ?, ?, ?, ?, ?)")
                ->execute([$session['id'], $terminal, $effectiveCashier, $type, $amount, $reason]);

            echo json_encode(['status' => 'success', 'data' => cashInHand($pdo, $session), 'message' => ucfirst(str_replace('_', ' ', $type)) . ' recorded successfully']);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Close the shift with the cash the cashier counted in the drawer
    case 'close_cash':
        requireRole($pdo, ROLES_POS);
        $input = json_decode(file_get_contents('php://input'), true);
        $counted = $input['counted'] ?? null;
        $terminal = $input['terminal'] ?? '#1';

        if (!is_numeric($counted) || $counted < 0) {
            echo json_encode(['status' => 'error', 'message' => 'Counted cash must be 0 or more']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            $session = openCashSession($pdo, $terminal);
            if (!$session) {
                $pdo->rollBack();
                echo json_encode(['status' => 'error', 'message' => "No open float on terminal $terminal. Enter Float Cash first."]);
                exit;
            }
            $summary = cashInHand($pdo, $session);
            $summary['counted_cash'] = round((float)$counted, 2);
            $summary['difference'] = round($summary['counted_cash'] - $summary['expected_cash'], 2);

            // Z-Reading running number
            $closedCount = (int)$pdo->query("SELECT COUNT(*) FROM cash_sessions WHERE status = 'Closed'")->fetchColumn();
            $zReadingNo = 864 + $closedCount + 1;
            $summary['z_reading_no'] = $zReadingNo;

            // Last invoice number of this closed session
            $lastInvStmt = $pdo->prepare("SELECT invoice_no FROM sales WHERE terminal = ? AND id > ? ORDER BY id DESC LIMIT 1");
            $lastInvStmt->execute([$terminal, (int)$session['start_sale_id']]);
            $lastInv = $lastInvStmt->fetchColumn() ?: ('INMW' . (preg_replace('/\D/', '', $terminal) ?: '1') . '0000000');
            $summary['last_invoice_no'] = $lastInv;

            $pdo->prepare("UPDATE cash_sessions SET status = 'Closed', closed_at = CURRENT_TIMESTAMP, cash_sales_count = ?, cash_sales_total = ?, expected_cash = ?, counted_cash = ?, difference = ?, z_reading_no = ? WHERE id = ?")
                ->execute([$summary['cash_sales_count'], $summary['cash_sales_total'], $summary['expected_cash'], $summary['counted_cash'], $summary['difference'], $zReadingNo, $session['id']]);
            $summary['closed_at'] = $pdo->query("SELECT closed_at FROM cash_sessions WHERE id = " . (int)$session['id'])->fetchColumn();
            $pdo->commit();

            // Next invoice number is RESET to 1 for the next shift/day!
            $terminalDigit = preg_replace('/\D/', '', $terminal) ?: '1';
            $resetInvoiceNo = 'INMW' . $terminalDigit . '0000001';

            echo json_encode([
                'status' => 'success',
                'data' => $summary,
                'next_invoice_no' => $resetInvoiceNo,
                'reset_invoice_no' => $resetInvoiceNo
            ]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'suspend_bill':
        requireRole($pdo, ROLES_POS);
        $input = json_decode(file_get_contents('php://input'), true);

        if (!$input || empty($input['items'])) {
            echo json_encode(['status' => 'error', 'message' => 'Cannot suspend an empty bill']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            $effectiveCashier = !empty($authUser['full_name']) ? $authUser['full_name'] : ($input['cashier'] ?? $authUser['username']);
            $stmt = $pdo->prepare("INSERT INTO suspended_bills (items_json, bill_discount_json, total, cashier, terminal) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                json_encode($input['items']),
                json_encode($input['bill_discount'] ?? null),
                $input['total'] ?? 0,
                $effectiveCashier,
                $input['terminal'] ?? '#1'
            ]);
            $id = $pdo->lastInsertId();
            $suspendNo = 'SUS' . str_pad($id, 6, '0', STR_PAD_LEFT);
            $pdo->prepare("UPDATE suspended_bills SET suspend_no = ? WHERE id = ?")->execute([$suspendNo, $id]);
            $created = $pdo->query("SELECT created_at FROM suspended_bills WHERE id = " . (int)$id)->fetchColumn();
            $pdo->commit();
            echo json_encode(['status' => 'success', 'suspend_no' => $suspendNo, 'created_at' => $created]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'list_suspended':
        try {
            $stmt = $pdo->query("SELECT suspend_no, items_json, bill_discount_json, total, cashier, terminal, created_at FROM suspended_bills WHERE status = 'Suspended' ORDER BY id DESC");
            $rows = array_map(function ($r) {
                $r['items'] = json_decode($r['items_json'], true);
                $r['bill_discount'] = json_decode($r['bill_discount_json'] ?? 'null', true);
                unset($r['items_json'], $r['bill_discount_json']);
                return $r;
            }, $stmt->fetchAll());
            echo json_encode(['status' => 'success', 'data' => $rows]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'recall_bill':
        requireRole($pdo, ROLES_POS);
        $input = json_decode(file_get_contents('php://input'), true);
        $suspendNo = strtoupper(trim($input['suspend_no'] ?? ''));

        try {
            $stmt = $pdo->prepare("SELECT items_json, bill_discount_json, total, status FROM suspended_bills WHERE suspend_no = ?");
            $stmt->execute([$suspendNo]);
            $bill = $stmt->fetch();

            if (!$bill) {
                echo json_encode(['status' => 'error', 'message' => "Suspended bill $suspendNo not found"]);
                exit;
            }
            if ($bill['status'] !== 'Suspended') {
                echo json_encode(['status' => 'error', 'message' => "Bill $suspendNo was already recalled"]);
                exit;
            }

            // Only one terminal can recall a bill: the status check is part of the update
            $upd = $pdo->prepare("UPDATE suspended_bills SET status = 'Recalled', recalled_at = CURRENT_TIMESTAMP WHERE suspend_no = ? AND status = 'Suspended'");
            $upd->execute([$suspendNo]);
            if ($upd->rowCount() === 0) {
                echo json_encode(['status' => 'error', 'message' => "Bill $suspendNo was already recalled"]);
                exit;
            }

            echo json_encode(['status' => 'success', 'suspend_no' => $suspendNo, 'items' => json_decode($bill['items_json'], true), 'bill_discount' => json_decode($bill['bill_discount_json'] ?? 'null', true), 'total' => (float)$bill['total']]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'dashboard_summary':
        requireRole($pdo, ROLES_ADMIN);
        try {
            $todaySales = $pdo->query("SELECT SUM(total) FROM sales WHERE DATE(created_at) = DATE('now')")->fetchColumn() ?: 0;
            $totalJobs = 4; // Mocked service pool count
            $lowStock = $pdo->query("SELECT COUNT(*) FROM items WHERE stock < 3")->fetchColumn() ?: 0;

            echo json_encode([
                'status' => 'success',
                'data' => [
                    'today_sales' => (float)$todaySales,
                    'low_stock_count' => (int)$lowStock,
                    'jobs_in_pool' => $totalJobs
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Shift data for POS cashier reports (X-Reading, Z-Reading, Item-Wise, Discounts, Paid In/Out, Cards, Suspended)
    case 'cashier_reports_data':
        requireRole($pdo, ROLES_POS);
        $terminal = $_GET['terminal'] ?? '#1';
        try {
            $session = openCashSession($pdo, $terminal);
            if (!$session) {
                $lastStmt = $pdo->prepare("SELECT * FROM cash_sessions WHERE terminal = ? ORDER BY id DESC LIMIT 1");
                $lastStmt->execute([$terminal]);
                $session = $lastStmt->fetch();
            }
            $summary = $session ? cashInHand($pdo, $session) : null;
            $sessionId = $session ? (int)$session['id'] : 0;
            $startSaleId = $session ? (int)$session['start_sale_id'] : 0;

            // Shift item-wise sales
            $itemStmt = $pdo->prepare("SELECT si.item_code, si.item_name, SUM(si.qty) AS total_qty, SUM(si.total) AS total_amount 
                FROM sale_items si 
                JOIN sales s ON si.sale_id = s.id 
                WHERE s.terminal = ? AND s.id > ? 
                GROUP BY si.item_code, si.item_name 
                ORDER BY total_amount DESC");
            $itemStmt->execute([$terminal, $startSaleId]);
            $itemWise = $itemStmt->fetchAll();

            // Total discounts in this shift
            $discStmt = $pdo->prepare("SELECT COUNT(*) AS total_count, COALESCE(SUM(discount), 0) AS total_discount FROM sales WHERE terminal = ? AND id > ? AND discount > 0");
            $discStmt->execute([$terminal, $startSaleId]);
            $discountSummary = $discStmt->fetch();

            // Line discounts
            $lineDiscStmt = $pdo->prepare("SELECT COUNT(*) AS line_count, COALESCE(SUM(si.discount), 0) AS line_discount FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.terminal = ? AND s.id > ? AND si.discount > 0");
            $lineDiscStmt->execute([$terminal, $startSaleId]);
            $lineDisc = $lineDiscStmt->fetch();

            // Cash transactions for this session (paid in / paid out / float additions)
            $transStmt = $pdo->prepare("SELECT type, amount, reason, created_at FROM cash_transactions WHERE session_id = ? ORDER BY id ASC");
            $transStmt->execute([$sessionId]);
            $transactions = $transStmt->fetchAll();

            $paidInList = array_values(array_filter($transactions, fn($t) => in_array($t['type'], ['paid_in', 'float_add'])));
            $paidOutList = array_values(array_filter($transactions, fn($t) => $t['type'] === 'paid_out'));

            // Card sales (Visa, MasterCard, Amex, Card)
            $cardStmt = $pdo->prepare("SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS amt FROM sales WHERE terminal = ? AND id > ? AND payment_method IN ('Card', 'Visa', 'MasterCard', 'Amex')");
            $cardStmt->execute([$terminal, $startSaleId]);
            $cardSales = $cardStmt->fetch();

            // Full payments breakdown across all payment methods
            $pmStmt = $pdo->prepare("SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total_amount FROM sales WHERE terminal = ? AND id > ? GROUP BY payment_method ORDER BY total_amount DESC");
            $pmStmt->execute([$terminal, $startSaleId]);
            $paymentsBreakdown = $pmStmt->fetchAll();

            // Suspended bills
            $suspStmt = $pdo->query("SELECT suspend_no, total, cashier, created_at, items_json FROM suspended_bills WHERE status = 'Suspended' ORDER BY id DESC");
            $suspendedList = $suspStmt->fetchAll();
            foreach ($suspendedList as &$sb) {
                $sb['items_count'] = count(json_decode($sb['items_json'] ?? '[]', true));
                unset($sb['items_json']);
            }

            echo json_encode([
                'status' => 'success',
                'data' => [
                    'session' => $summary,
                    'item_wise' => $itemWise,
                    'discounts' => [
                        'bill_count' => (int)($discountSummary['total_count'] ?? 0),
                        'bill_total' => (float)($discountSummary['total_discount'] ?? 0),
                        'line_count' => (int)($lineDisc['line_count'] ?? 0),
                        'line_total' => (float)($lineDisc['line_discount'] ?? 0),
                        'total' => (float)($discountSummary['total_discount'] ?? 0) + (float)($lineDisc['line_discount'] ?? 0)
                    ],
                    'paid_in' => $paidInList,
                    'paid_out' => $paidOutList,
                    'card_sales' => [
                        'count' => (int)($cardSales['cnt'] ?? 0),
                        'amount' => (float)($cardSales['amt'] ?? 0)
                    ],
                    'payments_breakdown' => $paymentsBreakdown,
                    'suspended' => $suspendedList
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Sales Summary Report (with daily date breakdown)
    case 'report_sales':
        requireRole($pdo, ROLES_ADMIN);
        $from = $_GET['from'] ?? date('Y-m-01');
        $to = $_GET['to'] ?? date('Y-m-d');
        try {
            $stmt = $pdo->prepare("SELECT DATE(s.created_at) as date, COUNT(DISTINCT s.id) as invoices, 
                                          COALESCE(SUM(s.total), 0) as revenue,
                                          COALESCE(SUM(s.discount), 0) as discount,
                                          COALESCE(SUM(CASE WHEN s.payment_method = 'Cash' THEN s.total ELSE 0 END), 0) as cash_total,
                                          COALESCE(SUM(CASE WHEN s.payment_method = 'Card' THEN s.total ELSE 0 END), 0) as card_total,
                                          COALESCE(SUM(si.qty * COALESCE(i.cost, 0)), 0) as total_cost
                                   FROM sales s
                                   LEFT JOIN sale_items si ON s.id = si.sale_id
                                   LEFT JOIN items i ON si.item_code = i.code
                                   WHERE DATE(s.created_at) BETWEEN ? AND ?
                                   GROUP BY DATE(s.created_at)
                                   ORDER BY date DESC");
            $stmt->execute([$from, $to]);
            $rows = $stmt->fetchAll();

            $totalRevenue = 0; $totalCost = 0; $totalInvoices = 0; $totalDiscounts = 0;
            $cashTotal = 0; $cardTotal = 0;
            foreach ($rows as &$r) {
                $r['invoices'] = (int)$r['invoices'];
                $r['revenue'] = round((float)$r['revenue'], 2);
                $r['discount'] = round((float)$r['discount'], 2);
                $r['total_cost'] = round((float)$r['total_cost'], 2);
                $r['profit'] = round($r['revenue'] - $r['total_cost'], 2);
                $r['cash_total'] = round((float)$r['cash_total'], 2);
                $r['card_total'] = round((float)$r['card_total'], 2);

                $totalRevenue += $r['revenue'];
                $totalCost += $r['total_cost'];
                $totalInvoices += $r['invoices'];
                $totalDiscounts += $r['discount'];
                $cashTotal += $r['cash_total'];
                $cardTotal += $r['card_total'];
            }

            echo json_encode([
                'status' => 'success',
                'data' => [
                    'summary' => [
                        'totalSales' => round($totalRevenue, 2),
                        'totalCost' => round($totalCost, 2),
                        'grossProfit' => round($totalRevenue - $totalCost, 2),
                        'totalInvoices' => $totalInvoices,
                        'totalDiscounts' => round($totalDiscounts, 2),
                        'cashTotal' => round($cashTotal, 2),
                        'cardTotal' => round($cardTotal, 2)
                    ],
                    'data' => $rows
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Inventory Valuation & Movement Report
    case 'report_inventory':
        requireRole($pdo, ROLES_ADMIN);
        try {
            $stmt = $pdo->query("SELECT code, name, category, cost, price, stock, (stock * cost) as stock_cost, (stock * price) as retail_val FROM items ORDER BY category ASC, name ASC");
            $items = $stmt->fetchAll();
            $totalItems = count($items);
            $totalStock = 0; $totalCostVal = 0; $totalRetailVal = 0; $lowStockCount = 0;
            foreach ($items as &$it) {
                $it['cost'] = (float)$it['cost'];
                $it['price'] = (float)$it['price'];
                $it['stock'] = (int)$it['stock'];
                $it['stock_cost'] = round((float)$it['stock_cost'], 2);
                $it['retail_val'] = round((float)$it['retail_val'], 2);
                $totalStock += $it['stock'];
                $totalCostVal += $it['stock_cost'];
                $totalRetailVal += $it['retail_val'];
                if ($it['stock'] < 3) $lowStockCount++;
            }
            echo json_encode([
                'status' => 'success',
                'data' => [
                    'summary' => [
                        'totalItems' => $totalItems,
                        'totalUnits' => $totalStock,
                        'totalCost' => round($totalCostVal, 2),
                        'retailValue' => round($totalRetailVal, 2),
                        'potentialMargin' => round($totalRetailVal - $totalCostVal, 2),
                        'lowStock' => $lowStockCount
                    ],
                    'data' => $items
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Profit & Loss Report
    case 'report_profit_loss':
        requireRole($pdo, ROLES_ADMIN);
        $from = $_GET['from'] ?? date('Y-m-01');
        $to = $_GET['to'] ?? date('Y-m-d');
        try {
            $stmt = $pdo->prepare("SELECT DATE(s.created_at) as date,
                                          COALESCE(SUM(s.total), 0) as revenue,
                                          COALESCE(SUM(s.discount), 0) as discounts,
                                          COALESCE(SUM(si.qty * COALESCE(i.cost, 0)), 0) as cogs
                                   FROM sales s
                                   LEFT JOIN sale_items si ON s.id = si.sale_id
                                   LEFT JOIN items i ON si.item_code = i.code
                                   WHERE DATE(s.created_at) BETWEEN ? AND ?
                                   GROUP BY DATE(s.created_at)
                                   ORDER BY date DESC");
            $stmt->execute([$from, $to]);
            $rows = $stmt->fetchAll();

            $totRev = 0; $totCogs = 0; $totDisc = 0;
            foreach ($rows as &$r) {
                $r['revenue'] = round((float)$r['revenue'], 2);
                $r['discounts'] = round((float)$r['discounts'], 2);
                $r['cogs'] = round((float)$r['cogs'], 2);
                $r['gross_profit'] = round($r['revenue'] - $r['cogs'], 2);
                $r['margin_pct'] = $r['revenue'] > 0 ? round(($r['gross_profit'] / $r['revenue']) * 100, 1) : 0;
                $totRev += $r['revenue'];
                $totCogs += $r['cogs'];
                $totDisc += $r['discounts'];
            }
            $grossProfit = round($totRev - $totCogs, 2);
            $marginPct = $totRev > 0 ? round(($grossProfit / $totRev) * 100, 1) : 0;

            echo json_encode([
                'status' => 'success',
                'data' => [
                    'summary' => [
                        'totalSales' => round($totRev, 2),
                        'totalCost' => round($totCogs, 2),
                        'grossProfit' => $grossProfit,
                        'marginPct' => $marginPct,
                        'totalDiscounts' => round($totDisc, 2)
                    ],
                    'data' => $rows
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Tax & VAT Report
    case 'report_tax':
        requireRole($pdo, ROLES_ADMIN);
        $from = $_GET['from'] ?? date('Y-m-01');
        $to = $_GET['to'] ?? date('Y-m-d');
        try {
            $stmt = $pdo->prepare("SELECT DATE(created_at) as date, COUNT(*) as invoices, COALESCE(SUM(total), 0) as gross_total FROM sales WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY date DESC");
            $stmt->execute([$from, $to]);
            $rows = $stmt->fetchAll();
            $totGross = 0;
            $vatRate = 0.18; // Sri Lanka VAT standard 18%
            foreach ($rows as &$r) {
                $gross = round((float)$r['gross_total'], 2);
                $net = round($gross / (1 + $vatRate), 2);
                $vat = round($gross - $net, 2);
                $r['gross'] = $gross;
                $r['net'] = $net;
                $r['vat'] = $vat;
                $totGross += $gross;
            }
            $totalNet = round($totGross / (1 + $vatRate), 2);
            $totalVat = round($totGross - $totalNet, 2);
            echo json_encode([
                'status' => 'success',
                'data' => [
                    'summary' => [
                        'grossTotal' => round($totGross, 2),
                        'netTaxable' => round($totalNet, 2),
                        'vatTotal' => round($totalVat, 2),
                        'vatRate' => 18,
                        'totalSales' => round($totGross, 2),
                        'totalCost' => round($totalNet, 2),
                        'grossProfit' => round($totalVat, 2)
                    ],
                    'data' => $rows
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // Top Selling Items Report
    case 'report_top_items':
        requireRole($pdo, ROLES_ADMIN);
        $from = $_GET['from'] ?? date('Y-m-01');
        $to = $_GET['to'] ?? date('Y-m-d');
        $limit = (int)($_GET['limit'] ?? 10);
        try {
            $stmt = $pdo->prepare("SELECT si.item_code, si.item_name, COALESCE(i.category, 'General') as category,
                                          SUM(si.qty) as total_qty, SUM(si.total) as total_revenue
                                   FROM sale_items si
                                   JOIN sales s ON si.sale_id = s.id
                                   LEFT JOIN items i ON si.item_code = i.code
                                   WHERE DATE(s.created_at) BETWEEN ? AND ?
                                   GROUP BY si.item_code, si.item_name
                                   ORDER BY total_qty DESC LIMIT ?");
            $stmt->execute([$from, $to, $limit]);
            $rows = $stmt->fetchAll();
            $totalRev = array_sum(array_column($rows, 'total_revenue'));
            $totalUnits = array_sum(array_column($rows, 'total_qty'));
            echo json_encode([
                'status' => 'success',
                'data' => [
                    'summary' => [
                        'totalRevenue' => round((float)$totalRev, 2),
                        'totalUnitsSold' => (int)$totalUnits,
                        'totalItemsTracked' => count($rows),
                        'totalSales' => round((float)$totalRev, 2),
                        'totalCost' => (int)$totalUnits,
                        'grossProfit' => count($rows)
                    ],
                    'data' => $rows
                ]
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    // -------------------------------------------------------------
    // INVENTORY SUB-MODULE ENDPOINTS: Stock Balance, IMEI, Count, TOG
    // -------------------------------------------------------------

    case 'get_locations':
        try {
            $stmt = $pdo->query("SELECT * FROM locations WHERE status = 'Active' ORDER BY code ASC");
            $locs = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $locs]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_stock_balance':
        $search = trim($_GET['search'] ?? '');
        $category = trim($_GET['category'] ?? '');
        $statusFilter = trim($_GET['stock_status'] ?? 'All'); // All, low, out, instock
        try {
            $sql = "SELECT id, code, name, category, subcategory, cost, price, stock, track_imei, (track_imei = 1) AS trackImei, status FROM items WHERE 1=1";
            $params = [];
            if ($search !== '') {
                $sql .= " AND (name LIKE ? OR code LIKE ? OR subcategory LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }
            if ($category !== '' && $category !== 'All') {
                $sql .= " AND category = ?";
                $params[] = $category;
            }
            if ($statusFilter === 'low') {
                $sql .= " AND stock > 0 AND stock <= 3";
            } else if ($statusFilter === 'out') {
                $sql .= " AND stock <= 0";
            } else if ($statusFilter === 'instock') {
                $sql .= " AND stock > 0";
            }
            $sql .= " ORDER BY category ASC, name ASC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $items = $stmt->fetchAll();

            $totalUnits = 0;
            $totalCostVal = 0;
            $totalRetailVal = 0;
            $lowStockCount = 0;
            $outOfStockCount = 0;

            foreach ($items as &$item) {
                $st = (int)($item['stock'] ?? 0);
                $c = (float)($item['cost'] ?? 0);
                $p = (float)($item['price'] ?? 0);

                $item['total_cost'] = round($st * $c, 2);
                $item['total_retail'] = round($st * $p, 2);
                $item['margin_potential'] = round(($st * $p) - ($st * $c), 2);

                $totalUnits += $st;
                $totalCostVal += ($st * $c);
                $totalRetailVal += ($st * $p);

                if ($st <= 0) $outOfStockCount++;
                else if ($st <= 3) $lowStockCount++;
            }

            echo json_encode([
                'status' => 'success',
                'summary' => [
                    'totalItems' => count($items),
                    'totalUnits' => $totalUnits,
                    'totalCostValue' => round($totalCostVal, 2),
                    'totalRetailValue' => round($totalRetailVal, 2),
                    'potentialProfit' => round($totalRetailVal - $totalCostVal, 2),
                    'lowStockCount' => $lowStockCount,
                    'outOfStockCount' => $outOfStockCount
                ],
                'data' => $items
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'adjust_stock':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $code = trim($input['code'] ?? '');
        $newStock = isset($input['new_stock']) ? (int)$input['new_stock'] : null;
        $qtyDelta = isset($input['qty_delta']) ? (int)$input['qty_delta'] : null;
        $reason = trim($input['reason'] ?? 'Manual Stock Adjustment');
        $user = trim($input['user'] ?? 'Admin');

        if (!$code) {
            echo json_encode(['status' => 'error', 'message' => 'Item code is required']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("SELECT id, name, stock, cost FROM items WHERE code = ?");
            $stmt->execute([$code]);
            $item = $stmt->fetch();
            if (!$item) {
                echo json_encode(['status' => 'error', 'message' => 'Item not found']);
                exit;
            }

            $oldStock = (int)$item['stock'];
            if ($newStock !== null) {
                $finalStock = $newStock;
                $variance = $newStock - $oldStock;
            } else if ($qtyDelta !== null) {
                $finalStock = $oldStock + $qtyDelta;
                $variance = $qtyDelta;
            } else {
                echo json_encode(['status' => 'error', 'message' => 'Provide new_stock or qty_delta']);
                exit;
            }

            if ($finalStock < 0) $finalStock = 0;

            $pdo->prepare("UPDATE items SET stock = ? WHERE code = ?")->execute([$finalStock, $code]);

            // Record audit log
            $costImpact = round($variance * (float)$item['cost'], 2);
            $auditNo = 'ADJ-' . date('YmdHis');
            $logStmt = $pdo->prepare("INSERT INTO stock_audits (audit_no, location_code, item_code, item_name, system_stock, physical_count, variance, cost_impact, reason, audited_by) VALUES (?, 'MW', ?, ?, ?, ?, ?, ?, ?, ?)");
            $logStmt->execute([$auditNo, $code, $item['name'], $oldStock, $finalStock, $variance, $costImpact, $reason, $user]);

            echo json_encode([
                'status' => 'success',
                'message' => "Stock updated from $oldStock to $finalStock",
                'code' => $code,
                'old_stock' => $oldStock,
                'new_stock' => $finalStock,
                'variance' => $variance
            ]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_imeis':
        $search = trim($_GET['search'] ?? '');
        $status = trim($_GET['status'] ?? 'All');
        $itemCode = trim($_GET['item_code'] ?? '');
        $location = trim($_GET['location'] ?? 'All');
        try {
            $sql = "SELECT im.*, i.name as item_name, i.category, i.subcategory, i.price
                    FROM item_imeis im
                    LEFT JOIN items i ON im.item_code = i.code
                    WHERE 1=1";
            $params = [];
            if ($search !== '') {
                $sql .= " AND (im.imei_number LIKE ? OR im.item_code LIKE ? OR i.name LIKE ? OR im.sold_invoice_no LIKE ?)";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
                $params[] = "%$search%";
            }
            if ($status !== '' && $status !== 'All') {
                $sql .= " AND im.status = ?";
                $params[] = $status;
            }
            if ($itemCode !== '') {
                $sql .= " AND im.item_code = ?";
                $params[] = $itemCode;
            }
            if ($location !== '' && $location !== 'All') {
                $sql .= " AND im.location_code = ?";
                $params[] = $location;
            }
            $sql .= " ORDER BY im.id DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $rows]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'save_imei':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $itemCode = trim($input['item_code'] ?? '');
        $imei = trim($input['imei_number'] ?? '');
        $location = trim($input['location_code'] ?? 'MW');
        $status = trim($input['status'] ?? 'In Stock');
        $id = !empty($input['id']) ? (int)$input['id'] : null;

        if (!$itemCode || !$imei) {
            echo json_encode(['status' => 'error', 'message' => 'Item code and IMEI number are required']);
            exit;
        }

        try {
            if ($id) {
                $stmt = $pdo->prepare("UPDATE item_imeis SET item_code = ?, imei_number = ?, location_code = ?, status = ? WHERE id = ?");
                $stmt->execute([$itemCode, $imei, $location, $status, $id]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO item_imeis (item_code, imei_number, location_code, status) VALUES (?, ?, ?, ?)");
                $stmt->execute([$itemCode, $imei, $location, $status]);
                // If adding in-stock, ensure item is marked track_imei
                $pdo->prepare("UPDATE items SET track_imei = 1 WHERE code = ?")->execute([$itemCode]);
            }
            echo json_encode(['status' => 'success', 'message' => "IMEI $imei saved successfully"]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'save_stock_audit':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $audits = $input['audits'] ?? [];
        $location = trim($input['location_code'] ?? 'MW');
        $auditedBy = trim($input['audited_by'] ?? 'Admin');

        if (empty($audits)) {
            echo json_encode(['status' => 'error', 'message' => 'No audit lines provided']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            $auditNo = 'AUD-' . date('Ymd-His');
            $insertAudit = $pdo->prepare("INSERT INTO stock_audits (audit_no, location_code, item_code, item_name, system_stock, physical_count, variance, cost_impact, reason, audited_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $updateStock = $pdo->prepare("UPDATE items SET stock = ? WHERE code = ?");

            $adjustedCount = 0;
            $totalCostImpact = 0;

            foreach ($audits as $line) {
                $code = trim($line['code'] ?? $line['item_code'] ?? '');
                $name = trim($line['name'] ?? $line['item_name'] ?? '');
                $sysStock = (int)($line['systemStock'] ?? $line['system_stock'] ?? 0);
                $physCount = (int)($line['physicalCount'] ?? $line['physical_count'] ?? 0);
                $var = $physCount - $sysStock;
                $unitCost = (float)($line['cost'] ?? 0);
                $costImpact = round($var * $unitCost, 2);
                $reason = trim($line['reason'] ?? 'Periodic Stock Audit');

                if ($code !== '') {
                    $insertAudit->execute([$auditNo, $location, $code, $name, $sysStock, $physCount, $var, $costImpact, $reason, $auditedBy]);
                    if ($var !== 0) {
                        $updateStock->execute([$physCount, $code]);
                        $adjustedCount++;
                        $totalCostImpact += $costImpact;
                    }
                }
            }

            $pdo->commit();
            echo json_encode([
                'status' => 'success',
                'audit_no' => $auditNo,
                'items_audited' => count($audits),
                'items_adjusted' => $adjustedCount,
                'total_cost_impact' => round($totalCostImpact, 2)
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_stock_audits':
        try {
            $stmt = $pdo->query("SELECT * FROM stock_audits ORDER BY id DESC LIMIT 100");
            $rows = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $rows]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'get_stock_transfers':
        try {
            $stmt = $pdo->query("SELECT st.*,
                                        fl.name as from_location_name,
                                        tl.name as to_location_name
                                 FROM stock_transfers st
                                 LEFT JOIN locations fl ON st.from_location = fl.code
                                 LEFT JOIN locations tl ON st.to_location = tl.code
                                 ORDER BY st.id DESC");
            $transfers = $stmt->fetchAll();
            foreach ($transfers as &$tr) {
                $tr['items'] = json_decode($tr['items_json'] ?? '[]', true);
            }
            echo json_encode(['status' => 'success', 'data' => $transfers]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'create_stock_transfer':
        requireRole($pdo, ROLES_INVENTORY);
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);

        $fromLoc = trim($input['from_location'] ?? 'MW');
        $toLoc = trim($input['to_location'] ?? 'SH');
        $items = $input['items'] ?? [];
        $notes = trim($input['notes'] ?? '');
        $createdBy = trim($input['created_by'] ?? 'Admin');

        if ($fromLoc === $toLoc) {
            echo json_encode(['status' => 'error', 'message' => 'Source and destination locations cannot be the same']);
            exit;
        }

        if (empty($items)) {
            echo json_encode(['status' => 'error', 'message' => 'At least one item is required for transfer']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            // Generate sequential transfer number
            $todayPrefix = 'TOG-' . date('Ymd');
            $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM stock_transfers WHERE transfer_no LIKE ?");
            $cntStmt->execute(["$todayPrefix%"]);
            $seq = (int)$cntStmt->fetchColumn() + 1;
            $transferNo = $todayPrefix . '-' . str_pad($seq, 4, '0', STR_PAD_LEFT);

            $totalQty = 0;
            $stockDeduct = $pdo->prepare("UPDATE items SET stock = CASE WHEN stock >= ? THEN stock - ? ELSE 0 END WHERE code = ?");
            $imeiMove = $pdo->prepare("UPDATE item_imeis SET location_code = ? WHERE imei_number = ?");

            foreach ($items as &$itm) {
                $qty = (int)($itm['qty'] ?? 1);
                $code = $itm['code'] ?? '';
                $totalQty += $qty;

                // Deduct stock from source warehouse
                $stockDeduct->execute([$qty, $qty, $code]);

                // If specific IMEI was selected, transfer its branch
                if (!empty($itm['imei'])) {
                    $imeiMove->execute([$toLoc, $itm['imei']]);
                }
            }

            $stmt = $pdo->prepare("INSERT INTO stock_transfers (transfer_no, from_location, to_location, status, items_json, total_qty, notes, created_by) VALUES (?, ?, ?, 'Completed', ?, ?, ?, ?)");
            $stmt->execute([$transferNo, $fromLoc, $toLoc, json_encode($items), $totalQty, $notes, $createdBy]);
            $transferId = $pdo->lastInsertId();

            $pdo->commit();

            echo json_encode([
                'status' => 'success',
                'transfer_no' => $transferNo,
                'id' => $transferId,
                'total_qty' => $totalQty,
                'message' => "Transfer $transferNo dispatched successfully!"
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    default:
        echo json_encode([
            'status' => 'online',
            'system' => 'Silverline POS Backend API',
            'version' => '1.0.0',
            'available_actions' => ['login', 'me', 'logout', 'get_items', 'create_sale', 'get_sale', 'cash_status', 'open_float', 'close_cash', 'cash_transaction', 'cashier_reports_data', 'suspend_bill', 'list_suspended', 'recall_bill', 'dashboard_summary', 'report_sales', 'report_inventory', 'report_profit_loss', 'report_tax', 'report_top_items']
        ]);
        break;
}
