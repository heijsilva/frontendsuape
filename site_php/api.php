<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/config.php';

function proxy_request(string $method, string $url, array $headers = [], ?string $body = null): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 90,
    ]);

    if ($headers) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        curl_close($ch);
        return [500, ['Content-Type: application/json'], json_encode(['erro' => $error ?: 'Falha no proxy'], JSON_UNESCAPED_UNICODE)];
    }

    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 200;
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE) ?: 0;
    $rawHeaders = substr($response, 0, $headerSize);
    $bodyOut = substr($response, $headerSize);
    curl_close($ch);

    $forwardHeaders = [];
    foreach (preg_split('/\r\n|\r|\n/', (string) $rawHeaders) as $line) {
        if (str_contains($line, ':')) {
            [$name, $value] = array_map('trim', explode(':', $line, 2));
            if (!in_array(strtolower($name), ['transfer-encoding', 'content-length', 'connection', 'date', 'server'], true)) {
                $forwardHeaders[] = $name . ': ' . $value;
            }
        }
    }

    return [$status, $forwardHeaders, $bodyOut];
}

$target = API_BASE_URL;
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$query = $_SERVER['QUERY_STRING'] ?? '';
$targetUrl = $query !== '' ? $target . '?' . $query : $target;

if ($method === 'GET') {
    [$status, $headers, $body] = proxy_request('GET', $targetUrl);
    http_response_code($status);
    foreach ($headers as $header) {
        header($header);
    }
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo $body;
    exit;
}

$input = file_get_contents('php://input');
$contentType = $_SERVER['CONTENT_TYPE'] ?? 'application/json; charset=utf-8';
$headers = ['Content-Type: ' . $contentType];

[$status, $forwardHeaders, $body] = proxy_request($method, $targetUrl, $headers, $input !== false ? $input : '');
http_response_code($status);
foreach ($forwardHeaders as $header) {
    header($header);
}
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}
echo $body;

