<?php
/**
 * Create a POS user, or reset an existing user's password and role.
 * Command line only:
 *   php create_user.php <username> "<Full Name>" "<Role>" [location_code]
 * The password is read from the POS_NEW_PASSWORD environment variable if set,
 * otherwise it is asked for on the terminal. It is never passed as an argument.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/auth_lib.php';

if ($argc < 4) {
    fwrite(STDERR, "Usage: php create_user.php <username> \"<Full Name>\" \"<Role>\" [location_code]\n");
    fwrite(STDERR, "Roles: " . implode(', ', POS_ROLES) . "\n");
    exit(1);
}

[, $username, $fullName, $role] = $argv;
$location = $argv[4] ?? 'MW';

if (!in_array($role, POS_ROLES, true)) {
    fwrite(STDERR, "Unknown role '$role'. Use one of: " . implode(', ', POS_ROLES) . "\n");
    exit(1);
}

$password = getenv('POS_NEW_PASSWORD');
if ($password === false || $password === '') {
    echo "Password for $username: ";
    $password = rtrim((string)fgets(STDIN), "\r\n");
}
if (strlen($password) < 6) {
    fwrite(STDERR, "Password must be at least 6 characters.\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . __DIR__ . '/silver_pos.db');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
initUserTables($pdo);

$hash = password_hash($password, PASSWORD_DEFAULT);
$pdo->prepare("INSERT INTO users (username, password_hash, full_name, role, location_code) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name,
    role = excluded.role, location_code = excluded.location_code, status = 'Active'")
    ->execute([$username, $hash, $fullName, $role, $location]);

echo "Saved user '$username' as $role at $location.\n";
