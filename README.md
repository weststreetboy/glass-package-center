# 玻璃套件中心 · Glass Package Center

一个玻璃拟态（Glassmorphism）风格的 **群晖 DSM 7 自建套件中心前端**。纯静态单文件页面，数据内嵌、无后端、无外部 CDN 依赖，可直接丢进群晖 Web Station，或用 Docker / Container Manager 一键托管。

> 数据源为本地 SSPKS-IMNKS 仓库中的真实 SPK，页面展示的版本、架构、DSM 要求、图标、大小均来自 SPK 内的 `INFO` 与图标文件。

---

## 一、它是什么

| 项目 | 说明 |
| --- | --- |
| 形态 | 单个 HTML 文件（`webroot/index.html`，约 305 KB），双击即可打开 |
| 现成镜像 | `ghcr.io/weststreetboy/glass-package-center:latest`（amd64 / arm64 双架构，公开免登录） |
| 技术栈 | Vite 6 + React 18 + TypeScript + GSAP + lucide-react |
| 数据来源 | `src/packages.data.ts`（由脚本从真实 SPK 生成，内嵌进单文件） |
| 下载 | 指向同级 `packages/` 目录内的真实 `.spk` 文件 |
| DSM 来源 | **容器即合规 SSPKS 源**：nginx 识别 `?unique=synology_...` 协议请求并返回标准包清单，可直接被 DSM 套件中心添加（见 4.4） |
| 依赖 | 无 PHP、无数据库、无外部 CDN；静态清单 + nginx 复刻 SSPKS 协议 |

**已实现功能**

- 套件浏览：网格卡片 + 详情弹窗（版本 / 架构 / 最低 DSM / 渠道 / 来源）
- 筛选搜索：关键词、分类（网络 / 多媒体 / 工具 / 系统 / 开发 / 安全）、架构（x86_64 / armv8 / noarch）、渠道（稳定 / 测试）
- 一键下载：直接下载对应 `.spk` 安装包
- **DSM 套件来源**：容器直接作为合规来源被 DSM 添加（修复「无效的位置」）；清单按架构自动分发，下载链接动态适配 IP/端口/反代
- 套件来源页：展示当前站点地址，一键复制；地址可用 `?source=` 或页面内修改，无需重建镜像
- 明暗主题：跟随系统，可手动切换（右下角按钮）
- **设置面板**：实时调节玻璃材质（模糊、透明度、圆角、描边、反光等），对应页面上的「设置」
- **SPK 工作室**：左侧第二个「打包」入口，浏览器本地生成 DSM 7 的 `.spk`（INFO / package.tgz / 64+256 图标 / MD5 checksum），无需后端，文件不上传
- 响应式：桌面Dock导航 / 移动Rail导航，适配手机与平板

---

## 二、群晖部署（DSM 7）

提供三条路径。**最省事用方案 A（直接拉取我发布的现成镜像，其中「项目导入」连命令都不用敲）；不装 Docker 用方案 B；想自己改代码构建用方案 C。**

### 方案 A：直接拉取已发布镜像（★ 推荐，零构建）

镜像已发布到公开仓库 `ghcr.io/weststreetboy/glass-package-center`，**amd64 / arm64 双架构**，群晖 Intel 与 ARM 机型通用，拉取无需登录。

镜像地址：

```
ghcr.io/weststreetboy/glass-package-center:latest
```

**A1 · Container Manager 图形界面**

1. DSM → **Container Manager → 注册表**，确认 ghcr.io 可访问（首次可在「注册表 → 新增」里选 GitHub 直接拉取公开镜像，无需填密钥）。
2. **容器 → 新增**，镜像来源填上面的地址，标签选 `latest`。
3. 端口设置：本机端口填 `8380`，容器端口 `80`（TCP）。
4. 命名如 `glass-package-center`，勾选「向导完成后启动」，应用。
5. 浏览器打开 `http://<群晖IP>:8380/`。

**A2 · Container Manager 项目导入（★ 最省事，连命令都不用敲）**

仓库里的 `container-manager/` 目录已备好一个只引用 GHCR 镜像的 `docker-compose.yml`，用它导入项目即可，Container Manager 会自动拉镜像并启动。

1. 从仓库下载 **`container-manager/docker-compose.yml` 这一个文件**（不用下载整个仓库）。
2. 在 NAS 上新建文件夹，例如 `/volume1/docker/gpc/`，把文件放进去，文件名保持 `docker-compose.yml`。
3. **Container Manager → 项目 → 新增**：项目路径选刚建的文件夹，来源选「使用现有的 docker-compose.yml」，勾选启动后创建项目。
4. 完成后访问 `http://<群晖IP>:8380/`。端口被占用就先编辑文件，把 `"8380:80"` 的左侧改成未占用端口。

> 更新：项目页选中该项目 → **重新部署 / 更新**（重新拉取 `latest`）。详细步骤与可选挂载见 `container-manager/README.md`。

**A3 · SSH 命令行（最快）**

```bash
# 拉取镜像（自动选对应架构）
sudo docker pull ghcr.io/weststreetboy/glass-package-center:latest

# 启动容器：8380 是对外端口，可改成你想要的
sudo docker run -d \
  --name glass-package-center \
  --restart unless-stopped \
  -p 8380:80 \
  ghcr.io/weststreetboy/glass-package-center:latest

# 验证
sudo docker ps | grep glass-package-center
```

> 更新镜像：
> ```bash
> sudo docker pull ghcr.io/weststreetboy/glass-package-center:latest
> sudo docker stop glass-package-center && sudo docker rm glass-package-center
> sudo docker run -d --name glass-package-center --restart unless-stopped \
>   -p 8380:80 ghcr.io/weststreetboy/glass-package-center:latest
> ```
>
> 若拉不到：确认 NAS 能访问 ghcr.io（部分网络环境需配置代理或 DNS）。镜像为公开包，正常情况下无需 `docker login`。

---

### 方案 B：Web Station（无需 Docker）

1. 群晖 **控制面板 → Web Station → 网页服务**，确认已启用，PHP 选任意版本即可（本页是纯静态，用不到 PHP）。
2. 通过 File Station 在 `web` 共享文件夹下新建目录，例如 `web/package-center`。
3. 把仓库中 **`webroot/` 目录下的全部内容** 上传进去，最终结构应为：

   ```
   /web/package-center/
   ├── index.html
   └── packages/
       ├── HelloPkg_noarch-7.0_1.0.0-0001.spk
       ├── LOCAL-DEMO-1.0.0-x86_64.spk
       ├── sspksrepo_noarch-7.0_1.1.0-0001.spk
       └── sspksrepo_x86_64-7.0_1.1.0-0001.spk
   ```

4. **Web Station → 网页服务 → 新增**，选择「静态网站」，文档根目录指向 `web/package-center`，HTTP 端口填 `8380`（或任意未占用端口）。
5. 浏览器打开 `http://<群晖IP>:8380/`。若根目录不是首页，访问 `http://<群晖IP>:8380/index.html`。

> 想用 HTTPS / 域名：在 **控制面板 → 登录门户 → 高级 → 反向代理服务器** 新增规则，把域名（如 `pkg.example.com`）反代到 `http://localhost:8380`，再在域名上套 Let's Encrypt 证书即可。

### 方案 C：自己构建镜像 / Container Manager 项目（可选）

适用于要改代码或改页面后自行重建镜像的场景。镜像基于 `nginx:1.27-alpine`，已配好 SPA 回退、SPK 附件下载头、gzip 与安全头。

> 若只是部署现成页面，**用方案 A 即可，跳过本节**。本节构建的镜像与已发布的 GHCR 镜像功能相同。

**C1 · Container Manager 图形界面**

1. DSM **Container Manager → 项目 → 新增**。
2. 项目路径：选择包含本仓库的文件夹（`docker-compose.yml` 位于 `deploy/` 子目录）。
3. 来源：选「使用现有的 docker-compose.yml」，指向 `deploy/docker-compose.yml`。
4. 端口冲突时，把 `deploy/docker-compose.yml` 中 `"8380:80"` 左侧改成未占用端口（右侧 `80` 勿动）。
5. 勾选「启动后创建项目」。构建完成后访问 `http://<群晖IP>:8380/`。

**C2 · SSH 命令行**

```bash
# 1) 把仓库放到群晖，例如 /volume6/docker/glass-package-center
cd /volume6/docker/glass-package-center

# 2) 调整对外端口（按需）
sed -i 's/8380:80/9000:80/' deploy/docker-compose.yml   # 示例：改成 9000 端口

# 3) 构建并后台启动
sudo docker compose -f deploy/docker-compose.yml up -d --build

# 4) 查看状态 / 日志
sudo docker ps | grep glass-package-center
sudo docker logs -f glass-package-center

# 5) 更新后重建
sudo docker compose -f deploy/docker-compose.yml down
sudo docker compose -f deploy/docker-compose.yml up -d --build
```

> 数据卷说明：镜像在构建时把 `webroot/` 拷入容器。若希望改页面/换 SPK 后**不重建镜像**，可改用挂载方式——把 `deploy/docker-compose.yml` 的 `image/build` 段替换为：
>
> ```yaml
>   glass-package-center:
>     image: nginx:1.27-alpine
>     container_name: glass-package-center
>     restart: unless-stopped
>     ports:
>       - "8380:80"
>     volumes:
>       - ../webroot:/usr/share/nginx/html:ro
>       - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
> ```
>
> 这样把文件放进 `webroot/` 即刷新生效；nginx 配置改后需 `docker compose restart`。

---

## 三、本地开发

需要 Node.js 18+。

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 构建到 dist/
npm run build

# 打包为单文件 webroot/index.html
node scripts/build-standalone.mjs
```

构建产物关系：

```
src/*.tsx,*.ts  --npm run build-->  dist/  --node scripts/build-standalone.mjs-->  webroot/index.html
```

`vite.config.ts` 已配置 `cssCodeSplit: false` 且样式由 React 内联，因此单文件脚本只需内联 JS，无外部 CSS 文件。

---

## 四、设置与数据修改

### 4.1 页面设置项

右上角「设置」按钮打开玻璃材质面板，可实时调节：模糊强度、背景透明度、圆角、描边、反光/高光、阴影等。仅影响当前浏览器，刷新后恢复默认（不写入存储）。

### 4.2 修改套件来源地址（无需重建镜像）

来源地址出现在「套件来源」页与复制按钮中。优先级从高到低：

1. **页面内直接修改（最简单）**：打开「套件来源」页 → 点「修改」→ 填入你的真实 SSPKS 地址 → 点「保存」（或按回车）。立即生效并写入本浏览器，刷新后依然保留。点「重置」恢复到当前站点地址。
2. **链接参数**：访问下面的地址，来源立即生效并写入本浏览器的 localStorage，参数会自动从地址栏移除。

   ```
   http://<群晖IP>:8380/?source=https%3A%2F%2Fpkg.example.com%2Fsspks%2F
   ```

   `source` 的值要做 URL 编码（`https://` → `https%3A%2F%2F`）。不带协议时按 `http://` 处理，仅允许 http / https。

3. **本机记忆**：上一次设置的值会一直保留。
4. **自动识别（默认）**：没有任何设置时，页面自动把当前访问地址作为来源（例如 NAS 上打开 `http://192.168.1.10:8380/`，来源页就显示这个地址）。仅本地 `file://` 双击打开时回退到代码里的演示地址。
5. **代码兜底值**：`src/packages.data.ts` 末尾的 `export const SOURCE = {...}` 的 `url` 字段。需要修改出厂兜底值时，改这里，或重新生成数据时传环境变量：

   ```bash
   DSM_SOURCE_URL=https://pkg.example.com/sspks/ python3 scripts/sync-packages.py
   npm run build && node scripts/build-standalone.mjs
   ```

> 该设置只保存在当前浏览器，不影响其他设备，也不写回镜像。它只决定「套件来源」页**展示**的地址，与 DSM 实际握手无关；DSM 握手由服务端 nginx 完成，见 4.4。

### 4.3 从你的 SSPKS 源重新生成套件数据

```bash
# 单个目录
PACKAGES_DIR=/volume1/sspks/packages \
DSM_SOURCE_URL=https://pkg.example.com/sspks/ \
python3 scripts/sync-packages.py

# 多个目录（逗号分隔，递归扫描），并过滤超过 100 MB 的大包
PACKAGES_DIR=/volume1/sspks/packages,/volume1/build/_local \
MAX_SIZE_MB=100 \
python3 scripts/sync-packages.py

# 重新构建单文件
npm run build && node scripts/build-standalone.mjs
```

脚本会：递归扫描所有 `.spk` → 按「包名 + 版本 + 架构 + 体积」去重（正式 `packages/` 优先）→ 过滤超过 `MAX_SIZE_MB` 的大包 → 解析 `INFO` 与图标 → 生成 `src/packages.data.ts` → 复制 SPK 到 `webroot/packages/` 与根目录 `packages/` → **自动调用 `build-dsm-index.py` 重建 DSM 来源清单**（`webroot/dsm/*.json`）。

已存在的套件会**保留** `packages.data.ts` 中人工整理的中文名称、描述与分类，新套件则用内置中文兜底，不会被英文覆盖。

> 也可以单独重建 DSM 清单（例如只调整了包文件）：`python3 scripts/build-dsm-index.py`。清单里的下载链接用 `__DSM_ORIGIN__` 占位符，由 nginx 在响应时替换成实际访问的 `协议://主机:端口`，因此换 IP、换端口、加反代都无需改清单。

> 当前收录 6 个套件（HelloPkg、LocalDemo、MyApp、SSPKS-IMNKS 套件中心 × 3 个架构）。`daye-nav` 两个包各约 215 MB，超过 GitHub 单文件 100 MB 上限，已被体积过滤排除；如需收录请使用外链托管或 Git LFS。

### 4.4 在 DSM 套件中心添加来源

**本容器本身就是一个合规的 DSM 套件来源**，无需另装 SSPKS/PHP 服务。nginx 会识别 DSM 的协议请求（`?unique=synology_...`）并返回标准包清单，所以直接用本容器地址即可——这正是修复「无效的位置」的关键。

1. DSM 桌面 → **套件中心** → 右上角 **设置** → 「套件来源」→ **新增**。
2. 名称随意（如 `玻璃套件中心`），**来源地址填写本容器的访问地址**，例如：

   ```
   http://192.168.50.4:13801/
   ```

   结尾斜杠可有可无；不要加 `/index.html` 或 `/packages`。
3. 确定后通过校验，左侧「社群」标签下会出现来源中的套件（HelloPkg、LocalDemo、MyApp、SSPKS-IMNKS 套件中心）。
4. 若安装时报发布者不受信任：套件中心 → 设置 → 一般设置 → 信任层级选「**任何发行者**」。

**部署后自检**（在浏览器打开，能给出 JSON 即说明协议层生效）：

```
http://192.168.50.4:13801/dsm/synology-x86_64.json
```

若 DSM 仍提示「无效的位置」，按顺序排查：
- 版本是否为新镜像：`docker images | grep glass-package-center`，确认是本次更新后的版本；旧镜像是纯静态页，必然报无效。
- 容器日志：`docker logs glass-package-center`，确认 nginx 正常启动且配置已加载。
- 地址是否为容器对外端口（`13801` 或你自定义的主机端口），不是 `8380` 默认值时以实际映射为准。
- 从 NAS 本机 curl 验证：`curl 'http://127.0.0.1:13801/?unique=synology_x86_64_test_Model&arch=x86_64&major=7&minor=2&build=64570&language=chs'` 应返回 `{"packages":[...]}`。

**原理**：原生 SSPKS 依赖 PHP（`synology_models` + `index.php`），本容器用静态清单 + nginx `map`/`sub_filter` 复刻了同一协议，因此不再需要 PHP 后端。清单按架构分为 noarch / x86_64 / armv8 三份，由 `arch` 参数自动分发。

---

## 五、常见问题

| 问题 | 原因 / 处理 |
| --- | --- |
| 打开页面空白 | 用了仓库根的 `index.html`（那是 Vite 源，含 `/src/main.tsx`，不能直接双击）。请打开 `webroot/index.html`。 |
| 下载 SPK 404 | `packages/` 目录没和 `index.html` 放在同级，或 nginx 未挂载该目录。检查路径大小写。 |
| 下载变成直接打开 | nginx 配置未生效。确认用了 `deploy/nginx.conf`（`Content-Disposition: attachment`）。 |
| 改了页面但没变化 | 首页设了 `no-cache`，仍不生效请强刷（Ctrl+F5）或重建镜像。 |
| 架构筛选不全 | `src/packages.data.ts` 的 `arch` 字段来自 SPK 的 `arch`；重跑 `sync-packages.py` 更新。 |
| Docker 构建失败 | 确认在仓库根目录执行，且 `webroot/` 与 `deploy/` 均存在；群晖 Docker 版本过低时升级 Container Manager。 |
| 拉取 GHCR 镜像失败 | 确认 NAS 可访问 ghcr.io（网络/DNS/代理）；公开镜像无需登录。可先在 SSH 试 `sudo docker pull ghcr.io/weststreetboy/glass-package-center:latest`。 |
| 项目导入后起不来 | 确认文件名就是 `docker-compose.yml`、且直接位于所选文件夹根目录（别藏在子目录）；端口冲突时改冒号左侧端口；确认 NAS 可访问 ghcr.io。 |
| 端口 8380 打不开 | 端口被占用或防火墙拦截。换 `-p 9000:80` 等未被占用端口，并在 DSM 防火墙放行。 |
| 添加来源提示「无效的位置」 | 镜像版本过旧（旧版是纯静态页，无法握手）。更新到含 DSM 协议层的新镜像；浏览器打开 `http://<地址>/dsm/synology-x86_64.json` 能返回 JSON 即正常。详见 4.4。 |

---

## 六、目录结构

```
glass-package-center/
├── index.html                  # Vite 源入口（勿直接双击）
├── package.json / package-lock.json
├── tsconfig.json / vite.config.ts
├── src/
│   ├── main.tsx                # 主题令牌、明暗切换、挂载
│   ├── PackagesWorkspace.tsx   # 主界面与交互
│   ├── SpkStudio.tsx           # SPK 工作室（前端打包界面）
│   ├── spkBuilder.ts           # USTAR tar / gzip / MD5 / INFO 生成
│   ├── gw-styles.ts            # 玻璃拟态样式
│   └── packages.data.ts        # 套件数据（脚本生成）
├── scripts/
│   ├── build-standalone.mjs    # 内联为单文件
│   ├── sync-packages.py        # 从 SPK 生成数据（自动联动 DSM 清单）
│   └── build-dsm-index.py      # 生成 DSM 协议清单 webroot/dsm/*.json
├── webroot/                    # ★ 可直接部署的成品
│   ├── index.html              # 单文件页面
│   ├── packages/*.spk          # 下载包
│   └── dsm/*.json              # DSM 套件来源协议清单（按架构分发）
├── container-manager/          # ★ 图形界面导入项目（GHCR 镜像版）
│   ├── docker-compose.yml      #   只下载这一个文件即可，无需命令
│   └── README.md               #   三步部署 / 更新 / 挂载说明
└── deploy/
    ├── Dockerfile
    ├── docker-compose.yml
    └── nginx.conf
```

---

## 七、许可

本项目为自托管演示用途。套件本身的许可归各自作者所有，页面仅为展示与下载入口。
