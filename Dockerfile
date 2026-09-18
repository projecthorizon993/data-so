# Static frontend (nginx) — tiny, cached, CDN-ready.
FROM nginx:1.27-alpine AS web
COPY index.html /usr/share/nginx/html/index.html
COPY assets /usr/share/nginx/html/assets
COPY config.json chat.template.json manifest.webmanifest sw.js robots.txt /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
