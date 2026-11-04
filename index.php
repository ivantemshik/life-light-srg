<?php
// Главная страница на хостинге reg.ru отдаётся через PHP только ради защитных заголовков:
// статические файлы хостинг отдаёт без них. На Vercel заголовки задаёт vercel.json, этот файл туда не публикуется.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
readfile(__DIR__ . '/index.html');
