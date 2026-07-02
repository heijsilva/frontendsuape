<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/config.php';

$page = isset($page) && is_string($page) && $page !== '' ? $page : 'Obras';
$title = SITE_TITLE . ' - ' . $page;
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0f1729">
  <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="assets/css/app.css">
</head>
<body
  data-page="<?= htmlspecialchars($page, ENT_QUOTES, 'UTF-8') ?>"
  data-api-base="<?= htmlspecialchars(API_BASE_URL, ENT_QUOTES, 'UTF-8') ?>"
  data-upload-base="<?= htmlspecialchars(UPLOAD_BASE_URL, ENT_QUOTES, 'UTF-8') ?>"
  data-apk-url="<?= htmlspecialchars(APK_DOWNLOAD_URL, ENT_QUOTES, 'UTF-8') ?>"
>
  <div id="app-shell" class="suape-shell">
    <div class="suape-loading">
      <div class="spinner-border text-warning" role="status"></div>
      <p class="mt-3 mb-0">Carregando Suape RDO...</p>
    </div>
  </div>

  <div id="modal-root"></div>
  <div id="assistant-root"></div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="assets/js/app.js"></script>
</body>
</html>

