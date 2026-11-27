# 春日部邮局

小新主题博客。访客页面和站主写作台都由本项目提供，使用原生 JavaScript 和 CSS。配套的 Java 项目负责数据、媒体文件和站主身份验证。

## 本地运行

1. 在配套的 `blog` 项目中按其 README 启动 MySQL 和 Spring Boot。已有站主的 Windows 开发环境可运行 `.\start-local.ps1`。默认可用 `http://127.0.0.1:8091/api/v1/settings` 检查接口。
2. 在本目录使用 Node.js 18.11 或更高版本运行 `npm start`，也可以运行 `node server.mjs`。项目无需安装依赖。
3. 打开[博客首页](http://127.0.0.1:5173/)，从页脚「站主写作台」进入管理区，也可以直接打开[写作台](http://127.0.0.1:5173/admin/)。使用后端已有的站主账号登录。

如需更换端口，在 PowerShell 设置当前终端的环境变量后启动。

```powershell
$env:PORT = '5180'
$env:BACKEND_ORIGIN = 'http://127.0.0.1:8092'
npm start
```

## 路由与接口

本地服务默认只监听回环地址。`server.mjs` 在前端提供访客页、写作台和静态文件。它只把 `/api/` 和 `/media/` 转发给 Java，并保留浏览器的 Host、Origin 和会话 Cookie。后端停用时，数据请求返回 HTTP 502。

首页「当地天气」由访客浏览器直接向 GeoJS 查询网络出口所在的城市，再以保留一位小数的经纬度向 Open-Meteo 获取当前天气。使用代理时可能显示出口城市。卡片展示摄氏气温、中文天况和数据对应的当地时间。天气结果在当前页面内存中复用 15 分钟，也可以手动刷新。博客数据库不保存访客 IP 或位置。[GeoJS 城市定位](https://www.geojs.io/docs/v1/endpoints/geo/) · [Open-Meteo 当前天气](https://open-meteo.com/en/docs)

页首的「晴天 / 雪天」控制邮局插画和页面配色，首次访问默认为晴天。选择保存在当前浏览器，在访客页和写作台之间共享。雪天的飘雪仅出现在首页插画内，并遵循系统的「减少动态效果」设置。两种外观下，天气卡都按访客网络出口展示实际天气。[晴天预览](verification/season-sun.jpg) · [雪天预览](verification/season-snow.jpg) · [手机雪天预览](verification/season-snow-mobile.jpg)

个人非商业博客可使用此免密钥的天气服务，数据以 CC BY 4.0 授权。卡片在读数旁标注来源，并将 WMO 天气代码转换为中文和图标。商业部署请按提供方条款配置适用的服务。[天气数据许可](https://open-meteo.com/en/licence) · [接口使用条款](https://open-meteo.com/en/terms)

| 浏览器入口 | 作用 |
| --- | --- |
| `/`、`/articles`、`/projects`、`/tools`、`/about` | 访问博客与内容详情。文章和作品详情使用分类路径加 slug，工具详情为 `/catalog/tools/{slug}`。 |
| `/admin/` | 登录后查看内容数量、最近编辑的文章，或撰写新稿。 |
| `/admin/articles`、`/admin/projects`、`/admin/tools` | 内容列表与回收站。进入 `/new` 新建，进入 `/{id}` 编辑。文章初次保存后自动保存草稿，发布前会等待保存完成。 |
| `/admin/categories`、`/admin/media`、`/admin/settings` | 分类增删改、媒体上传和可见性管理、站点设置。 |

写作台通过 `/api/v1/admin/session` 使用服务端 HttpOnly 会话。管理写请求带 `X-Blog-Request: 1`。编辑器读取服务端版本号，遇到 409 可逐字段核对修改。发布后的文章由站主显式保存。

部署时可直接使用本项目的 Node 服务。若使用其他静态服务器，请按 `server.mjs` 的匹配规则将访客页面指向 `public/index.html`，将写作台页面指向 `public/studio.html`，并把两个业务路径代理至 Java。工具的外部入口使用完整网址，独立的站内工具须由前端托管在对应路径。运行 `npm test` 可验证两个页面入口、深链接与旧资源的 404。

## 已执行的联调

2026-11-26 在本机以两套隔离的 Spring Boot、MySQL 环境验收。第一套使用后端建表脚本的初始状态。第二套通过写作台 API 新建并发布验收内容，浏览器通过前端同源入口读取。日常开发库未参与这次测试。

| 检查 | 实际结果 |
| --- | --- |
| 初始数据 | MySQL 有 5 项设置，文章、分类、作品和工具均为 0 条。公开设置接口返回站名「我的个人网站」、时区 Asia/Shanghai、每页 10 条。首页显示空信箱，关于页请求返回 404。 |
| 搜索与翻页 | 验收库有 2 篇常规文章，另有独立关于页。每页设为 1 后，按分类请求第 2 页得到 HTTP 200、业务码 0000、total=2、id=1、coverMediaId=1。浏览器显示《春日部来信：阅读与筛选验收》。生活类型、精确标签、分类和关键词组合命中同一篇。 |
| 媒体与正文 | 封面通过真实上传与公开流程产生，下载的 296372 字节与上传文件的 SHA-256 一致。浏览器解码图片，渲染 Markdown 标题、加粗和列表，保留正文中的原始 HTML 标签为可见文字。 |
| 作品、工具、身份 | 开发中及 Java 组合筛选命中 1 个作品。工具目录的启动按钮打开接口指定的入口。独立页存在时显示正文。写作台实测登录、会话 Cookie、查询身份与退出，退出后的身份查询返回 401。 |
| 访客交互 | 桌面和手机浏览器验证了搜索弹窗、键盘打开与关闭、提交、浏览器返回、类型切换、盖戳后刷新、缺失内容和直达刷新。首页在 320、390、520、768、1024、1440 像素宽度均未产生横向滚动，目录另测 360 像素。 |
| 时间设置 | 实际后台分别保存 Asia/Shanghai 和 UTC+08:00，首页与带发布时间的正文均正常加载。 |

[桌面首页](verification/home-desktop.jpg) · [手机首页](verification/home-mobile.jpg) · [带真实上传封面的文章详情](verification/article-detail.jpg)

### 独立写作台验收

使用移除网页资源后重新打包的 Java 服务、独立 MySQL 和 Edge 浏览器联调。测试仅写入临时库。实测 Java 的 `/`、`/index.html`、`/admin/`、`/admin/index.html` 均返回 404，前端的访客入口与写作台深链接返回各自的本地 HTML。

本机 MySQL 8.0.13 在从空库执行项目建表脚本、追加管理员头像外键时返回 1067。验收库改在建表时声明相同的循环外键，随后通过 `information_schema.referential_constraints` 核对其指向 `media_asset`。此次前端迁移未改动业务库及其建表脚本。

| 流程 | 浏览器、接口与数据库结果 |
| --- | --- |
| 写作与发布 | 在写作台新建文章，首存后自动保存到版本 1，点击发布后匿名访客可读取正文和标签；下线后公开详情返回 404。重新发布后 MySQL 行为 `id=2, slug=post-office-regression, status=PUBLISHED, visibility=PUBLIC, version=5`，标题与公开详情一致。 |
| 并发与身份 | 两个编辑页面实际触发 409，合并后服务端同时保留了另一页的标题和本页正文。会话过期后，原页面重新登录保留了未提交的标题；保存后在访客页可见。主动退出后身份接口返回 401。 |
| 管理 | 作品和工具走通创建、发布、下线、回收、恢复。重复分类标识返回 409，非法时区返回 400，表单保留输入。公开 WebP 下载的 87,792 字节与上传一致，改回私密后匿名请求返回 404。媒体库选择、Markdown 插入与封面引用均成功。 |
| 布局 | 检查了桌面登录页、工作台与编辑器，以及 360 和 390 像素宽度下的管理界面。 |

[站主登录](verification/studio-login.jpg) · [工作台](verification/studio-desk.jpg) · [文章编辑](verification/studio-editor.jpg) · [手机编辑](verification/studio-mobile.jpg)
