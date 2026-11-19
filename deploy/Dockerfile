# 玻璃套件中心 · 运行时镜像
#
# 与早期纯静态版本的区别：容器里跑一个 Python 标准库服务，
# 除了托管页面与安装包，还能接收上传的 .spk、定时扫描挂载目录，
# 并动态生成 DSM 套件来源清单（链接地址按实际访问域名拼装）。
FROM python:3.12-alpine

LABEL org.opencontainers.image.title="glass-package-center" \
      org.opencontainers.image.description="Glassmorphism package center for Synology DSM 7, with runtime SPK upload" \
      org.opencontainers.image.source="https://github.com/weststreetboy/glass-package-center"

ENV PYTHONUNBUFFERED=1 \
    GPC_PORT=80 \
    GPC_DATA_DIR=/data \
    GPC_IMPORT_DIRS=/import

WORKDIR /app

COPY server/ /app/server/
COPY webroot/ /app/webroot/

# /data 存放上传的安装包与登记表（建议挂载持久卷）
# /import 为可选的自动扫描目录，把打包目录只读挂进来即可
RUN mkdir -p /data/packages /import

VOLUME ["/data"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD sh -c "wget -q --spider http://127.0.0.1:${GPC_PORT:-80}/api/health || exit 1"

CMD ["python", "-u", "server/app.py"]
