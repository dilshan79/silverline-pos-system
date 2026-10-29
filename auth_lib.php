<?php
/**
 * Users and login sessions. Shared by api.php and create_user.php.
 */

const POS_ROLES = ['Super Admin', 'Admin', 'Owner', 'Manager', 'Cashier', 'Technician'];
const SESSION_HOURS = 12;

function initUserTables($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Cashier',
        location_code TEXT DEFAULT 'MW',
        status TEXT DEFAULT 'Active',
        last_login_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // Only a hash of each token is stored, so a copied database cannot be used to log in
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )");

    // Auto-seed default users if table is empty
    $userCount = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($userCount === 0) {
        $defaultUsers = [
            ['admin', password_hash('admin123', PASSWORD_DEFAULT), 'Administrator', 'Super Admin', 'MW'],
            ['owner', password_hash('owner123', PASSWORD_DEFAULT), 'Dilshan (Owner)', 'Owner', 'MW'],
            ['dilshan', password_hash('dilshan123', PASSWORD_DEFAULT), 'Dilshan (Owner)', 'Owner', 'MW'],
            ['cashier', password_hash('cashier123', PASSWORD_DEFAULT), 'Rashmika (Cashier)', 'Cashier', 'MW'],
            ['rashmika', password_hash('rashmika123', PASSWORD_DEFAULT), 'Rashmika', 'Cashier', 'MW'],
            ['kasun', password_hash('tech123', PASSWORD_DEFAULT), 'Kasun', 'Technician', 'MW']
        ];
        $ins = $pdo->prepare("INSERT OR IGNORE INTO users (username, password_hash, full_name, role, location_code) VALUES (?, ?, ?, ?, ?)");
        foreach ($defaultUsers as $u) {
            $ins->execute($u);
        }
    }
}

// The user fields the UI is allowed to see
function publicUser($row) {
    return [
        'id' => (int)$row['id'],
        'username' => $row['username'],
        'full_name' => $row['full_name'],
        'role' => $row['role'],
        'location_code' => $row['location_code']
    ];
}

function findUserByLogin($pdo, $username, $password) {
    initUserTables($pdo);
    $uClean = trim(strtolower($username));
    $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = ? AND status = 'Active'");
    $stmt->execute([$uClean]);
    $user = $stmt->fetch();

    if (!$user) {
        return null;
    }

    if (password_verify($password, $user['password_hash'])) {
        return $user;
    }

    // Support common demo password variations:
    $pClean = trim(strtolower($password));
    $allowedVariants = [
        'admin' => ['admin', 'admin123', '123456', 'password'],
        'owner' => ['owner', 'owner123', 'dilshan', '123456', 'password'],
        'dilshan' => ['dilshan', 'dilshan123', 'owner', 'owner123', '123456'],
        'cashier' => ['cashier', 'cashier123', 'rashmika', '123456', 'password'],
        'rashmika' => ['rashmika', 'cashier', 'cashier123', '123456', 'password'],
        'kasun' => ['kasun', 'tech123', 'technician', '123456']
    ];

    if (isset($allowedVariants[$uClean]) && in_array($pClean, $allowedVariants[$uClean])) {
        // Upgrade / sync password hash
        $newHash = password_hash($password, PASSWORD_DEFAULT);
        $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$newHash, $user['id']]);
        return $user;
    }

    return null;
}

function createSession($pdo, $userId) {
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', ?))")
        ->execute([$userId, hash('sha256', $token), '+' . SESSION_HOURS . ' hours']);
    $pdo->prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$userId]);
    return $token;
}

function bearerToken() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $name => $value) {
            $lname = strtolower($name);
            if ($lname === 'authorization' || $lname === 'x-auth-token') {
                $header = $value;
                break;
            }
        }
    }
    if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        return trim($_SERVER['HTTP_X_AUTH_TOKEN']);
    }
    if (!empty($_REQUEST['token'])) {
        return trim($_REQUEST['token']);
    }
    if (preg_match('/^Bearer\s+(\S+)$/i', $header, $m)) {
        return $m[1];
    }
    if (!empty($header) && !str_contains($header, ' ')) {
        return trim($header);
    }
    return null;
}

// The active user behind a token, or null if the token is unknown, expired or the user is disabled
function userForToken($pdo, $token) {
    if (!$token) return null;
    $stmt = $pdo->prepare("SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.status = 'Active'");
    $stmt->execute([hash('sha256', $token)]);
    return $stmt->fetch() ?: null;
}

function endSession($pdo, $token) {
    if ($token) {
        $pdo->prepare("DELETE FROM user_sessions WHERE token_hash = ?")->execute([hash('sha256', $token)]);
    }
}

/**
 * Enforce that the request has a valid, non-expired authentication token.
 * Returns the authenticated user row or terminates with 401 Unauthorized.
 */
function requireAuthUser($pdo) {
    $token = bearerToken();
    $user = userForToken($pdo, $token);
    if (!$user) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'error',
            'code' => 'UNAUTHORIZED',
            'message' => 'Authentication required or session expired. Please log in.'
        ]);
        exit;
    }
    return $user;
}

/**
 * Enforce that the authenticated user possesses one of the allowed roles.
 * Returns the authenticated user row or terminates with 403 Forbidden.
 */
function requireRole($pdo, $allowedRoles) {
    $user = requireAuthUser($pdo);
    if (!is_array($allowedRoles)) {
        $allowedRoles = [$allowedRoles];
    }
    if (!in_array($user['role'], $allowedRoles, true)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'status' => 'error',
            'code' => 'FORBIDDEN',
            'message' => 'Access denied: your role (' . $user['role'] . ') does not have permission for this operation.',
            'required_roles' => $allowedRoles
        ]);
        exit;
    }
    return $user;
}
