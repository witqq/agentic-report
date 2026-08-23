FROM nginx:alpine

COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
RUN find /usr/share/nginx/html -type d -exec chmod 755 {} + \
  && find /usr/share/nginx/html -type f -exec chmod 644 {} +

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD wget -qO- http://127.0.0.1/release.json >/dev/null || exit 1
