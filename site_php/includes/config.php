<?php
declare(strict_types=1);

const SITE_TITLE = 'Suape RDO';
const API_BASE_URL = 'https://ki6.com.br/hackathon-suape-api-php/api.php';
const UPLOAD_BASE_URL = 'https://ki6.com.br/hackathon-suape-api-php/upload.php';
const APK_DOWNLOAD_URL = 'https://ki6.com.br/hackathon-suape-api-php/data/suape.apk';

function site_menu_items(): array
{
    return [
        ['name' => 'Obras', 'icon' => 'fa-user-gear'],
        ['name' => 'RDO', 'icon' => 'fa-file-lines'],
        ['name' => 'Aprovacoes', 'icon' => 'fa-square-check'],
        ['name' => 'Midias', 'icon' => 'fa-image'],
        ['name' => 'Mapa', 'icon' => 'fa-map-location-dot'],
        ['name' => 'Graficos', 'icon' => 'fa-chart-column'],
        ['name' => 'Relatorio PDF', 'icon' => 'fa-file-pdf'],
        ['name' => 'Assinaturas', 'icon' => 'fa-signature'],
        ['name' => 'Log de erros', 'icon' => 'fa-circle-exclamation'],
    ];
}

