# Container Manager 项目文件（GHCR 镜像版）

这个目录只有一个文件：`docker-compose.yml`。它**直接引用已发布的 GHCR 镜像**——不用构建、不用命令行、不用登录。

## 三步部署

1. **下载**：从仓库下载 `container-manager/docker-compose.yml` 这**一个文件**即可，不用下载整个仓库。
2. **放好**：在群晖上新建文件夹，例如 `/volume1/docker/gpc/`，把文件放进去，文件名保持 `docker-compose.yml` 不变。
3. **导入**：**Container Manager → 项目 → 新增** → 项目路径选这个文件夹 → 来源选「使用现有的 docker-compose.yml」→ 勾选启动 → 完成。

容器会自动拉取 `ghcr.io/weststreetboy/glass-package-center:latest` 并启动。浏览器打开 `http://<群晖IP>:8380/`。

> 镜像是公开的双架构包（amd64 + arm64），Intel 和 ARM 群晖都支持，无需 `docker login`。

## 常用调整

**端口冲突**：编辑 `docker-compose.yml`，把 `ports` 里的 `8380:80` 改成 `9000:80`（只改冒号左侧），保存后重新部署项目。

**更新到最新版**：在 Container Manager 的项目页选中本项目 → **重新部署 / 更新**（会重新拉取 `latest` 标签）。或 SSH 执行：

```bash
cd /volume1/docker/gpc
sudo docker compose pull
sudo docker compose up -d
```

**换页面 / 换 SPK 但不重建镜像**：取消文件末尾 `volumes` 段的注释，并在同目录建立：

```
/volume1/docker/gpc/
├── docker-compose.yml
└── webroot/
    ├── index.html
    └── packages/*.spk
```

## 说明

- 容器名：`glass-package-center`，异常退出自动重启。
- 站点根目录：`/usr/share/nginx/html/`，SPK 下载目录：`/usr/share/nginx/html/packages/`。
- 完整说明（Web Station、自建镜像、数据修改、FAQ）见仓库根目录 `README.md`。
