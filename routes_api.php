<?php

use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\Pos\InvoiceController;
use App\Controllers\Pos\PaymentController;
use App\Controllers\Pos\ReturnController;
use App\Controllers\Pos\HeldBillController;
use App\Controllers\Inventory\ItemController;
use App\Controllers\Inventory\CategoryController;
use App\Controllers\Inventory\BrandController;
use App\Controllers\Inventory\StockController;
use App\Controllers\Inventory\ItemSerialController;
use App\Controllers\Inventory\StockCountController;
use App\Controllers\Inventory\StockAdjustmentController;
use App\Controllers\Inventory\TransferOfGoodsController;
use App\Controllers\Purchasing\PurchaseOrderController;
use App\Controllers\Purchasing\GrnController;
use App\Controllers\Purchasing\PurchaseReturnController;
use App\Controllers\Accounts\LedgerController;
use App\Controllers\Accounts\AgingReportController;
use App\Controllers\Accounts\VoucherController;
use App\Controllers\Accounts\ChequeController;
use App\Controllers\Accounts\BankReconcileController;
use App\Controllers\Service\ServiceJobController;
use App\Controllers\Service\ServiceTypeController;
use App\Controllers\Service\TechnicianController;
use App\Controllers\Service\RepairController;
use App\Controllers\Customers\CustomerController;
use App\Controllers\Customers\LoyaltyController;
use App\Controllers\Customers\GiftVoucherController;
use App\Controllers\Reports\ReportController;
use App\Controllers\Admin\UserController;
use App\Controllers\Admin\RoleController;
use App\Controllers\Admin\SettingController;
use App\Controllers\Admin\AuditLogController;
use App\Middleware\AuthMiddleware;
use App\Middleware\RoleMiddleware;

/** @var App\Core\Router $router */

// Auth Routes
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->get('/api/auth/me', [AuthController::class, 'me'], [AuthMiddleware::class]);

// Dashboard
$router->get('/api/dashboard', [DashboardController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/dashboard/summary', [DashboardController::class, 'summary'], [AuthMiddleware::class]);
$router->get('/api/dashboard/recent-sales', [DashboardController::class, 'recentSales'], [AuthMiddleware::class]);
$router->get('/api/dashboard/low-stock', [DashboardController::class, 'lowStock'], [AuthMiddleware::class]);

// POS Routes
$router->get('/api/pos/invoices', [InvoiceController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/pos/invoices', [InvoiceController::class, 'store'], [AuthMiddleware::class]);
$router->post('/api/pos/payments', [PaymentController::class, 'store'], [AuthMiddleware::class]);
$router->post('/api/pos/returns', [ReturnController::class, 'store'], [AuthMiddleware::class]);
$router->get('/api/pos/held-bills', [HeldBillController::class, 'index'], [AuthMiddleware::class]);

// Inventory Routes
$router->get('/api/inventory/items', [ItemController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/inventory/items', [ItemController::class, 'store'], [AuthMiddleware::class]);
$router->get('/api/inventory/categories', [CategoryController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/inventory/brands', [BrandController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/inventory/stock', [StockController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/inventory/serials', [ItemSerialController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/inventory/stock-count', [StockCountController::class, 'store'], [AuthMiddleware::class]);
$router->post('/api/inventory/transfer', [TransferOfGoodsController::class, 'store'], [AuthMiddleware::class]);

// Direct Inventory Aliases (called by InventoryService)
$router->get('/api/items', [ItemController::class, 'index']);
$router->post('/api/items', [ItemController::class, 'store']);
$router->get('/api/items/{id}', [ItemController::class, 'show']);
$router->get('/api/categories', [CategoryController::class, 'index']);
$router->get('/api/stock', [StockController::class, 'index']);


// Purchasing Routes
$router->get('/api/purchasing/orders', [PurchaseOrderController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/purchasing/orders', [PurchaseOrderController::class, 'store'], [AuthMiddleware::class]);
$router->get('/api/purchasing/grn', [GrnController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/purchasing/grn', [GrnController::class, 'store'], [AuthMiddleware::class]);
$router->post('/api/purchasing/returns', [PurchaseReturnController::class, 'store'], [AuthMiddleware::class]);

// Accounts Routes
$router->get('/api/accounts/ledgers', [LedgerController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/accounts/aging', [AgingReportController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/accounts/vouchers', [VoucherController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/accounts/cheques', [ChequeController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/accounts/reconcile', [BankReconcileController::class, 'index'], [AuthMiddleware::class]);

// Service Routes
$router->get('/api/service/jobs', [ServiceJobController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/service/jobs', [ServiceJobController::class, 'store'], [AuthMiddleware::class]);
$router->get('/api/service/types', [ServiceTypeController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/service/technicians', [TechnicianController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/service/repairs', [RepairController::class, 'index'], [AuthMiddleware::class]);

// Customers Routes
$router->get('/api/customers', [CustomerController::class, 'index'], [AuthMiddleware::class]);
$router->post('/api/customers', [CustomerController::class, 'store'], [AuthMiddleware::class]);
$router->get('/api/customers/loyalty', [LoyaltyController::class, 'index'], [AuthMiddleware::class]);
$router->get('/api/customers/vouchers', [GiftVoucherController::class, 'index'], [AuthMiddleware::class]);

// Reports
$router->get('/api/reports', [ReportController::class, 'index'], [AuthMiddleware::class]);

// Admin Routes
$router->get('/api/admin/users', [UserController::class, 'index']);
$router->get('/api/admin/roles', [RoleController::class, 'index']);
$router->get('/api/admin/settings', [SettingController::class, 'index']);
$router->get('/api/admin/audit-logs', [AuditLogController::class, 'index']);

// Direct User Management Routes (used by AdminService & UsersComponent)
$router->get('/api/users', [UserController::class, 'index']);
$router->post('/api/users', [UserController::class, 'store']);
$router->get('/api/users/{id}', [UserController::class, 'show']);
$router->put('/api/users/{id}', [UserController::class, 'update']);
$router->delete('/api/users/{id}', [UserController::class, 'destroy']);

// Locations Routes
$router->get('/api/locations', function(App\Core\Request $req, App\Core\Response $res) {
    try {
        $db = App\Config\Database::getConnection();
        $locs = $db->query("SELECT code, name, address, phone FROM locations")->fetchAll();
        $res->json(['status' => 'success', 'data' => $locs]);
    } catch (\Exception $e) {
        $res->json(['status' => 'success', 'data' => [
            ['code' => 'MW', 'name' => 'Bravo Bus Stand (MW)', 'address' => 'Bravo Bus Stand, Badulla', 'phone' => '0552221101'],
            ['code' => 'SH', 'name' => 'Fair Road (SH)', 'address' => 'Fair Road, Badulla', 'phone' => '0552221100'],
            ['code' => 'SS', 'name' => 'Super & Mobile (SS)', 'address' => 'Super Market, Bandarawela', 'phone' => '0572221102']
        ]]);
    }
});

// Roles Routes
$router->get('/api/roles', [RoleController::class, 'index']);

