<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/config.php';

function curl_forward_upload(array $post, array $files): array
{
    $ch = curl_init(UPLOAD_BASE_URL);
    $payload = $post;

    foreach ($files as $key => $file) {
        if (!isset($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            continue;
        }
        $payload[$key] = new CURLFile(
            $file['tmp_name'],
            $file['type'] ?? 'application/octet-stream',
            $file['name'] ?? basename($file['tmp_name'])
        );
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 120,
    ]);

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        return [500, ['Content-Type: application/json'], json_encode(['erro' => $error ?: 'Falha no upload'], JSON_UNESCAPED_UNICODE)];
    }

    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 200;
    curl_close($ch);
    return [$status, ['Content-Type: application/json; charset=utf-8'], $response];
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'POST');
if ($method !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['erro' => 'Metodo nao permitido'], JSON_UNESCAPED_UNICODE);
    exit;
}

[$status, $headers, $body] = curl_forward_upload($_POST, $_FILES);
http_response_code($status);
foreach ($headers as $header) {
    header($header);
}
echo $body;

