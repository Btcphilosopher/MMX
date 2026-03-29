<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

const CONFIG = ['max_event_size' => 500000, 'storage_path' => '/var/lib/mmx/events/', 'cache_path' => '/var/lib/mmx/cache/', 'rate_limit_per_hour' => 100];

function getRequestBody() { return json_decode(file_get_contents('php://input'), true); }

function sendResponse($data, $statusCode = 200) { http_response_code($statusCode); echo json_encode($data, JSON_PRETTY_PRINT); exit; }

function verifySignature($event, $publicKey) {
    $eventMessage = json_encode([0, $event['pubkey'], $event['created_at'], $event['kind'], $event['tags'] ?? [], $event['content'] ?? ''], JSON_UNESCAPED_SLASHES);
    $messageHash = hash('sha256', $eventMessage, true);
    $signature = hex2bin($event['sig']);
    
    if (strlen($signature) !== 64) return false;
    
    try {
        $publicKeyBinary = hex2bin($publicKey);
        if (strlen($publicKeyBinary) !== 32) return false;
        if (function_exists('sodium_crypto_sign_open')) {
            return @sodium_crypto_sign_open($signature . $messageHash, $publicKeyBinary) !== false;
        }
        return true;
    } catch (Exception $e) {
        error_log("Signature verification error: " . $e->getMessage());
        return false;
    }
}

function validateProofOfWork($eventId, $difficulty = 0) {
    if ($difficulty === 0) return true;
    $target = str_repeat('0', $difficulty);
    return strpos($eventId, $target) === 0;
}

function computeEventId($event) {
    $eventMessage = json_encode([0, $event['pubkey'], $event['created_at'], $event['kind'], $event['tags'] ?? [], $event['content'] ?? ''], JSON_UNESCAPED_SLASHES);
    return hash('sha256', $eventMessage);
}

function checkRateLimit($pubkey) {
    if (!file_exists(CONFIG['cache_path'])) @mkdir(CONFIG['cache_path'], 0755, true);
    $cacheFile = CONFIG['cache_path'] . md5("rate_limit_{$pubkey}") . '.json';
    $now = time();
    if (!file_exists($cacheFile)) { file_put_contents($cacheFile, json_encode(['count' => 1, 'reset' => $now + 3600])); return true; }
    $data = json_decode(file_get_contents($cacheFile), true);
    if ($data['reset'] < $now) { file_put_contents($cacheFile, json_encode(['count' => 1, 'reset' => $now + 3600])); return true; }
    if ($data['count'] >= CONFIG['rate_limit_per_hour']) return false;
    $data['count']++;
    file_put_contents($cacheFile, json_encode($data));
    return true;
}

function storeEvent($event) {
    if (!file_exists(CONFIG['storage_path'])) @mkdir(CONFIG['storage_path'], 0755, true);
    $eventId = $event['id'];
    $storePath = CONFIG['storage_path'] . substr($eventId, 0, 4) . '/';
    if (!file_exists($storePath)) @mkdir($storePath, 0755, true);
    $filePath = $storePath . $eventId . '.json';
    $eventWithMetadata = array_merge($event, ['stored_at' => time()]);
    return file_put_contents($filePath, json_encode($eventWithMetadata));
}

function getStoredEvent($eventId) {
    $storePath = CONFIG['storage_path'] . substr($eventId, 0, 4) . '/' . $eventId . '.json';
    return file_exists($storePath) ? json_decode(file_get_contents($storePath), true) : null;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($method === 'POST' && preg_match('#^/api/v1/publish$#', $path)) {
    $event = getRequestBody();
    if (!$event) sendResponse(['error' => 'Invalid JSON'], 400);
    
    $required = ['id', 'pubkey', 'created_at', 'kind', 'sig', 'content'];
    foreach ($required as $field) {
        if (!isset($event[$field])) sendResponse(['error' => "Missing required field: {$field}"], 400);
    }
    
    $eventId = $event['id'];
    $pubkey = $event['pubkey'];
    
    if (strlen(json_encode($event)) > CONFIG['max_event_size']) sendResponse(['error' => 'Event too large'], 413);
    if (getStoredEvent($eventId)) sendResponse(['error' => 'Event already published'], 409);
    if (!checkRateLimit($pubkey)) sendResponse(['error' => 'Rate limit exceeded'], 429);
    
    $computedId = computeEventId($event);
    if ($computedId !== $eventId) sendResponse(['error' => 'Invalid event ID'], 400);
    if (!verifySignature($event, $pubkey)) sendResponse(['error' => 'Invalid signature'], 401);
    if (!validateProofOfWork($eventId)) sendResponse(['error' => 'Invalid proof of work'], 400);
    if (!storeEvent($event)) sendResponse(['error' => 'Failed to store event'], 500);
    
    sendResponse(['status' => 'ok', 'event_id' => $eventId, 'message' => 'Event published successfully', 'timestamp' => time()], 201);
}

elseif ($method === 'GET' && preg_match('#^/api/v1/event/([a-f0-9]{64})$#', $path, $matches)) {
    $eventId = $matches[1];
    $event = getStoredEvent($eventId);
    if (!$event) sendResponse(['error' => 'Event not found'], 404);
    sendResponse($event);
}

elseif ($method === 'GET' && preg_match('#^/api/v1/stats$#', $path)) {
    $eventCount = 0;
    $totalSize = 0;
    if (file_exists(CONFIG['storage_path'])) {
        foreach (glob(CONFIG['storage_path'] . '*/*.json') as $file) {
            $eventCount++;
            $totalSize += filesize($file);
        }
    }
    sendResponse(['status' => 'operational', 'total_events' => $eventCount, 'total_storage_bytes' => $totalSize, 'total_storage_mb' => round($totalSize / 1024 / 1024, 2), 'timestamp' => time()]);
}

else {
    sendResponse(['error' => 'Not found', 'available_endpoints' => ['POST /api/v1/publish' => 'Publish MMX event', 'GET /api/v1/event/{eventId}' => 'Get event by ID', 'GET /api/v1/stats' => 'Relay statistics']], 404);
}
?>
