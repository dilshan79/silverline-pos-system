<?php
/**
 * Silverline POS Backend REST API & Database Handler
 * Path: C:\xampp\htdocs\Silver_pos\api.php
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

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

// Initialize tables if missing
function initDB($pdo) {
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
        total REAL,
        cashier TEXT,
        terminal TEXT,
        status TEXT DEFAULT 'Suspended',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        recalled_at DATETIME
    )");

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

// Router Action Handler
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'get_items':
        try {
            $stmt = $pdo->query("SELECT * FROM items ORDER BY id ASC");
            $items = $stmt->fetchAll();
            echo json_encode(['status' => 'success', 'data' => $items]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'create_sale':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);

        if (!$input || empty($input['items'])) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid sale data payload']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            $invNo = 'INMW' . time();
            $total = $input['total'] ?? 0;
            $tendered = $input['tendered'] ?? $total;
            $pm = $input['payment_method'] ?? 'Cash';
            $cashier = $input['cashier'] ?? 'Rashmika';

            $stmt = $pdo->prepare("INSERT INTO sales (invoice_no, subtotal, discount, total, tendered, payment_method, cashier) VALUES (?, ?, 0, ?, ?, ?, ?)");
            $stmt->execute([$invNo, $total, $total, $tendered, $pm, $cashier]);
            $saleId = $pdo->lastInsertId();

            $itemStmt = $pdo->prepare("INSERT INTO sale_items (sale_id, item_code, item_name, qty, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)");
            $stockUpdate = $pdo->prepare("UPDATE items SET stock = stock - ? WHERE code = ?");

            foreach ($input['items'] as $item) {
                $lineTotal = $item['qty'] * $item['price'];
                $itemStmt->execute([$saleId, $item['code'], $item['name'], $item['qty'], $item['price'], $lineTotal]);
                $stockUpdate->execute([$item['qty'], $item['code']]);
            }

            $pdo->commit();
            echo json_encode(['status' => 'success', 'invoice_no' => $invNo, 'sale_id' => $saleId]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'suspend_bill':
        $input = json_decode(file_get_contents('php://input'), true);

        if (!$input || empty($input['items'])) {
            echo json_encode(['status' => 'error', 'message' => 'Cannot suspend an empty bill']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO suspended_bills (items_json, total, cashier, terminal) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                json_encode($input['items']),
                $input['total'] ?? 0,
                $input['cashier'] ?? 'Rashmika',
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
            $stmt = $pdo->query("SELECT suspend_no, items_json, total, cashier, terminal, created_at FROM suspended_bills WHERE status = 'Suspended' ORDER BY id DESC");
            $rows = array_map(function ($r) {
                $r['items'] = json_decode($r['items_json'], true);
                unset($r['items_json']);
                return $r;
            }, $stmt->fetchAll());
            echo json_encode(['status' => 'success', 'data' => $rows]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'recall_bill':
        $input = json_decode(file_get_contents('php://input'), true);
        $suspendNo = strtoupper(trim($input['suspend_no'] ?? ''));

        try {
            $stmt = $pdo->prepare("SELECT items_json, total, status FROM suspended_bills WHERE suspend_no = ?");
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

            echo json_encode(['status' => 'success', 'suspend_no' => $suspendNo, 'items' => json_decode($bill['items_json'], true), 'total' => (float)$bill['total']]);
        } catch (Exception $e) {
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        break;

    case 'dashboard_summary':
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

    default:
        echo json_encode([
            'status' => 'online',
            'system' => 'Silverline POS Backend API',
            'version' => '1.0.0',
            'available_actions' => ['get_items', 'create_sale', 'suspend_bill', 'list_suspended', 'recall_bill', 'dashboard_summary']
        ]);
        break;
}
