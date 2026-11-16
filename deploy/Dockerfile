# 玻璃套件中心 · 静态站点镜像
# 基于 nginx alpine，把 webroot/ 里的单文件页面与 SPK 下载包直接托管。
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="glass-package-center" \
      org.opencontainers.image.description="Glassmorphism package center for Synology DSM 7" \
      org.opencontainers.image.source="https://github.com/weststreetboy/glass-package-center"

# 删除默认站点，放入自定义配置与站点文件
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY webroot/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
