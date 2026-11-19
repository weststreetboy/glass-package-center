# 玻璃套件中心 · Glass Package Center

一个玻璃拟态（Glassmorphism）风格的 **群晖 DSM 7 自建套件中心前端**。页面本身是纯静态单文件（无外部 CDN、双击即可打开）；放进容器后，内置的 Python 标准库服务会额外提供 **SPK 上传**、**打包目录自动扫描** 与 **DSM 套件来源协议**，新打的包不用重建镜像就能出现在页面和套件中心里。

> 数据源为本地 SSPKS-IMNKS 仓库中的真实 SPK，页面展示的版本、架构、DSM 要求、图标、大小均来自 SPK 内的 `INFO` 与图标文件。

---

## 一、它是什么

| 项目 | 说明 |
| --- | --- |
| 形态 | 单个 HTML 文件（`webroot/index.html`，约 470 KB），双击即可打开；容器内另有 Python 服务 |
| 现成镜像 | `ghcr.io/weststreetboy/glass-package-center:latest`（amd64 / arm64 双架构，公开免登录） |
| 技术栈 | Vite 6 + React 18 + TypeScript + GSAP + lucide-react；服务端仅用 Python 标准库 |
| 数据来源 | 构建期：`src/packages.data.ts`（内嵌兜底）+ `webroot/catalog.json`；运行期：`/data/registry.json`（上传与扫描结果） |
| 下载 | 指向 `/packages/` 内的真实 `.spk` 文件，上传的包同样走这个路由 |
| DSM 来源 | **容器即合规 SSPKS 源**：服务识别 `?unique=synology_...` 协议请求，按架构返回标准包清单，可直接被 DSM 套件中心添加（见 4.4） |
| 依赖 | 无 PHP、无数据库、无外部 CDN；Python 3.12 标准库即可运行 |

**已实现功能**

- 套件浏览：网格卡片 + 详情弹窗（版本 / 架构 / 最低 DSM / 渠道 / 来源）
- 筛选搜索：关键词、分类（网络 / 多媒体 / 工具 / 系统 / 开发 / 安全）、架构（x86_64 / armv8 / noarch）、渠道（稳定 / 测试）
- 一键下载：直接下载对应 `.spk` 安装包
- **DSM 套件来源**：容器直接作为合规来源被 DSM 添加（修复「无效的位置」）；清单按架构自动分发，下载链接动态适配 IP/端口/反代
- 套件来源页：展示当前站点地址，一键复制；地址可用 `?source=` 或页面内修改，无需重建镜像
- 明暗主题：跟随系统，可手动切换（右下角按钮）
- **设置面板**：实时调节玻璃材质（模糊、透明度、圆角、描边、反光等），对应页面上的「设置」
- **SPK 工作室**：左侧第二个「打包」入口，浏览器本地生成 DSM 7 的 `.spk`（INFO / package.tgz / 64+256 图标 / MD5 checksum），无需后端，文件不上传
- **上传套件**：右上角「上传」或列表右上角「上传套件」，拖入已打包好的 `.spk`，解析 INFO 与图标后**立刻**出现在列表与 DSM 来源中，无需重建镜像（见 4.5）
- **自动扫描**：把打包目录只读挂载到 `/import`，新生成的 `.spk` 每隔 `GPC_SCAN_INTERVAL` 秒自动收录
- **套件上下线**：详情弹窗一键「下线」，该套件立即从 DSM 套件来源清单移除（已安装的不受影响），页面仍保留并标注「已下线」，随时可一键恢复上线；状态存在 `data/state.json`，重启不丢
- **套件图标**：DSM 套件中心列表直接显示真实图标——清单的 `thumbnail` 指向 `/api/icon/<包名>`，服务从 SPK 内的 `PACKAGE_ICON*.PNG` 提取并缓存，不再显示占位图
- **免清缓存更新包**：清单里下载 `link` 带内容指纹（`?v=<md5前12位>`），同名 SPK 重新打包后 URL 随之变化，DSM 不会拿旧缓存去校验，避免反复重打包后出现「下载失败」（下载路由同时兼容不带查询串的旧链接）
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

> 注意：Web Station 是纯静态托管，页面能正常浏览下载，但**没有上传接口，也不能被 DSM 识别为套件来源**。需要这两项能力请用方案 A / C 的容器部署。

### 方案 C：自己构建镜像 / Container Manager 项目（可选）

适用于要改代码或改页面后自行重建镜像的场景。镜像基于 `python:3.12-alpine`，服务端为 `server/app.py`（仅标准库），已内置 SPA 回退、附件下载头、Range 支持、gzip 与安全头。

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

> 数据卷说明：镜像构建时把 `webroot/` 与 `server/` 拷入容器。**上传的安装包写到 `/data`**，必须挂持久卷，否则 `docker compose down` 后重建容器会丢：
>
> ```yaml
>     volumes:
>       - ./data:/data
>       - /volume1/docker/spk-studio/builds:/import:ro   # 可选：自动扫描
> ```
>
> 只想临时改页面、不想重建镜像时，可额外挂载 `./webroot:/app/webroot:ro`。

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

> 该设置只保存在当前浏览器，不影响其他设备，也不写回镜像。它只决定「套件来源」页**展示**的地址，与 DSM 实际握手无关；DSM 握手由容器内的 `server/app.py` 完成，见 4.4。

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

> 也可以单独重建 DSM 清单（例如只调整了包文件）：`python3 scripts/build-dsm-index.py`。这些静态清单里的下载链接用 `__DSM_ORIGIN__` 占位符，供纯静态托管场景自行替换；**容器部署时不会用到它们**——服务会按请求的 `Host` 实时生成清单，换 IP、换端口、加反代都无需改文件。

> 当前收录 7 个套件（HelloPkg、LocalDemo、MyApp、Crabapple 导航面板、SSPKS-IMNKS 套件中心 × 3 个架构）。运行时还可以通过页面上传或 `/import` 扫描继续追加，不必改数据文件。`daye-nav` 两个包各约 215 MB，超过 GitHub 单文件 100 MB 上限，未随仓库提交；需要时用上传功能加进去即可。

### 4.4 在 DSM 套件中心添加来源

**本容器本身就是一个合规的 DSM 套件来源**，无需另装 SSPKS/PHP 服务。容器内的服务会识别 DSM 的协议请求（`?unique=synology_...`）并返回标准包清单，所以直接用本容器地址即可——这正是修复「无效的位置」的关键。

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
- 容器日志：`docker logs glass-package-center`，确认 `监听 0.0.0.0:80` 已出现且没有异常堆栈。
- 地址是否为容器对外端口（`13801` 或你自定义的主机端口），不是 `8380` 默认值时以实际映射为准。
- 从 NAS 本机 curl 验证：`curl 'http://127.0.0.1:13801/?unique=synology_x86_64_test_Model&arch=x86_64&major=7&minor=2&build=64570&language=chs'` 应返回 `{"packages":[...]}`。

**原理**：原生 SSPKS 依赖 PHP（`synology_models` + `index.php`），本容器用 `server/app.py` 复刻了同一协议：按 `arch` 参数筛选套件、实时计算 MD5，并用请求的 `Host` / `X-Forwarded-Host` 拼出下载链接。因此换 IP、换端口、加反向代理都不用改任何清单文件。

### 4.5 上传已打包的 SPK / 打包目录自动同步

早期版本要在 NAS 上看到新套件，必须走「同步脚本 → 重新构建 → 推送 → GHCR 重建 → NAS 拉镜像」一整圈。现在有两条件内即时生效的通道：

**方式一：页面上传（任何设备都能用）**

1. 打开站点，点右上角 **上传**（或「全部套件」右侧的 **上传套件**）。
2. 把 `.spk` 拖进虚线框，或点击选择文件；支持最大 2 GB。
3. 点 **开始上传**。前端按 8 MB 分片发送，单片失败自动重试 3 次；全部到齐后服务端合并、解析 INFO 与 256px 图标，落盘到 `/data/packages/`，写入 `/data/registry.json`。
4. 完成后页面列表、详情弹窗、以及 DSM 套件来源会**立刻**看到这个包，无需重启容器、无需重建镜像。

上传的包会带「本地导入」标记；在详情弹窗底部可以「从套件中心移除」（同时删除文件）。内置套件不可移除。

**方式二：挂载打包目录自动扫描**

把打包输出目录只读挂进容器的 `/import`：

```yaml
    volumes:
      - ./data:/data
      - /volume1/docker/spk-studio/builds:/import:ro
    environment:
      - GPC_SCAN_INTERVAL=30     # 每 30 秒扫一次；0 表示只在启动时扫一次
```

之后 SPK 工作室（或任何工具）在该目录下生成的 `.spk`，会在下一次扫描时自动出现。同一套件的多个历史版本只展示最高版本，因此反复构建不会堆出一堆旧卡。

**相关环境变量**

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `GPC_DATA_DIR` | `/data` | 上传包与登记表的持久化目录，**必须挂卷** |
| `GPC_IMPORT_DIRS` | `/import` | 自动扫描目录，冒号分隔（Windows 本地调试用分号） |
| `GPC_SCAN_INTERVAL` | `30` | 扫描间隔秒数，`0` 关闭定时扫描 |
| `GPC_MAX_UPLOAD_MB` | `2048` | 单包上传上限（页面自动分片，脚本直传也受此限制） |
| `GPC_ADMIN_TOKEN` | 空 | 设置后，上传 / 删除 / 手动扫描需带上该令牌（页面会显示令牌输入框） |
| `GPC_PUBLIC_URL` | 空（按请求头） | 清单里 `link`/`thumbnail` 的对外前缀，如 `http://192.168.50.4:13801`。**DSM 显示图标但点安装提示「下载失败」时，务必设为 DSM 实际可访问的地址**。下载 link 另带 `?v=<内容指纹>` 自动绕过 DSM 包缓存 |

**接口**（便于脚本化，不需要页面）

```bash
# 上传
curl -X POST --data-binary @my-package.spk \
  'http://192.168.50.4:13801/api/upload?name=my-package.spk'

# 大包分片上传（页面自动走这条链路；id 自定义，index 从 0 开始）
curl -X POST --data-binary @part-0.bin \
  'http://192.168.50.4:13801/api/upload/chunk?name=my-package.spk&id=up123&index=0&total=2'
curl -X POST --data-binary @part-1.bin \
  'http://192.168.50.4:13801/api/upload/chunk?name=my-package.spk&id=up123&index=1&total=2'
curl -X POST \
  'http://192.168.50.4:13801/api/upload/finish?name=my-package.spk&id=up123&total=2'

# 查看当前列表
curl http://192.168.50.4:13801/api/packages

# 立即触发一次目录扫描
curl -X POST http://192.168.50.4:13801/api/scan

# 删除本地上传的包
curl -X DELETE http://192.168.50.4:13801/api/packages/my-package.spk

# 下线（从 DSM 套件来源移除，页面保留）
curl -X POST -H 'Content-Type: application/json' -d '{"online":false}' \
  http://192.168.50.4:13801/api/packages/my-package.spk/status

# 重新上线
curl -X POST -H 'Content-Type: application/json' -d '{"online":true}' \
  http://192.168.50.4:13801/api/packages/my-package.spk/status

# 套件图标（DSM 清单 thumbnail 指向这里）
curl -o icon.png http://192.168.50.4:13801/api/icon/my-package.spk
```

---

## 五、常见问题

| 问题 | 原因 / 处理 |
| --- | --- |
| 打开页面空白 | 用了仓库根的 `index.html`（那是 Vite 源，含 `/src/main.tsx`，不能直接双击）。请打开 `webroot/index.html`。 |
| 下载 SPK 404 | `packages/` 目录没和 `index.html` 放在同级，或 nginx 未挂载该目录。检查路径大小写。 |
| 下载变成直接打开 | 服务端未生效（例如仍用旧 nginx 镜像）。确认镜像已更新为 `python:3.12-alpine` 版本。 |
| 点「上传」提示是静态页面 | 页面是以 `file://` 或纯静态托管（方案 B）打开的，没有 `/api` 接口。上传需要容器部署；Web Station 场景请改用容器，或继续用 4.3 的脚本方式。 |
| 上传成功但重启后消失 | `/data` 没挂持久卷。在 compose 里加 `- ./data:/data` 后重建容器。 |
| 上传提示「不是有效的 DSM 套件」 | 文件里没有 `INFO`（或 `package.tgz` 里也没有）。确认是 DSM 打包工具产出的 `.spk`，而不是改了扩展名的 tar/zip。 |
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
│   ├── PackageUpload.tsx       # 上传弹窗（拖拽 / 进度 / 结果）
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
│   ├── catalog.json            # 内置套件目录（运行时服务的基线数据）
│   ├── packages/*.spk          # 下载包
│   └── dsm/*.json              # 静态 DSM 清单（无服务时也可直接托管）
├── server/
│   └── app.py                  # 运行时服务：上传 / 扫描 / 动态 DSM 清单
├── container-manager/          # ★ 图形界面导入项目（GHCR 镜像版）
│   ├── docker-compose.yml      #   只下载这一个文件即可，无需命令
│   └── README.md               #   三步部署 / 更新 / 挂载说明
└── deploy/
    ├── Dockerfile
    └── docker-compose.yml
```

---

## 七、许可

本项目为自托管演示用途。套件本身的许可归各自作者所有，页面仅为展示与下载入口。
