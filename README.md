# AI Builder App 工程模板

> 由 AI Builder 的 **app-creator-skill** 生成。改代码前请先读该 Skill 的 `SKILL.md` 与 `references/` 下的规范。

一个工程、两套 UI、一套设计 token，产出两个互不依赖的目录：

| 入口 | 界面 | 面向 | 构建产物 |
| --- | --- | --- | --- |
| [`index.html`](./index.html) → [`src/app/`](./src/app) | App UI（移动端 H5） | App 壳的 WebView | `dist/client/web/**`（与 `capsule/` 一起构成壳侧 bundle，打进 APK） |
| [`admin.html`](./admin.html) → [`src/admin/`](./src/admin) | Admin UI（PC 优先 + 响应式） | 浏览器访问 | `dist/admin/**`（整目录拷到静态服务器） |

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173/            → App UI
                   # http://127.0.0.1:5173/admin.html  → 管理后台
npm run typecheck  # 类型门禁（构建不含类型检查，两条都要跑）
npm run build      # 产物：dist/client/（壳侧 bundle 内容）、dist/admin/（Admin UI 站点）
npm run build:client # 只交付 APK 时用：只出 dist/client/，跳过 Admin（省一整个 vite 进程）
npm run build:admin  # 只重建后台时用：只出 dist/admin/，跳过 App UI
npm run deps       # 依赖自愈：沙箱回收后 node_modules 丢失时按需重装（dev/build/typecheck 已自动前置）
```

预览插件（`stepai-vite-config`）已配好：`npm run dev` 时提供元素点选定位、预览运行时与错误收集；`npm run build` 不会把任何调试代码打进产物。

> **`npm run build` / `build:client` / `build:admin` 怎么选？** 判据是**这次交付要不要这个产物**，
> 不是"工程里有没有后台页面"：要发布静态站点（`/index.html` + `/admin/` 一起上线）→ `npm run build`；
> 只打 APK（平台只取 `dist/client/`）→ `npm run build:client`；只重建后台 → `npm run build:admin`。
> 后两条**互不碰对方的产物目录**（`build:client` 不构建也不删除 `dist/admin/`，`build:admin` 反之），
> 是否还需要另一半由调用方决定；`build:admin` 在工程没有后台三件套时直接失败，不会静默跳过。
> 详见 Skill 的 `references/09-deployment.md` §1.1.1。

开发前请先读 [AGENTS.md](./AGENTS.md)——它写清了改代码时必须同步维护的东西（`capsule/`、`permissions`、版本号等）。

## 工程里现在有什么

初始只有**一页占位页**（[`src/app/pages/HomePage.tsx`](./src/app/pages/HomePage.tsx)、
[`src/admin/pages/HomePage.tsx`](./src/admin/pages/HomePage.tsx)，带 `@scaffold-placeholder` 标记）——
它只保证“能跑起来”。**交付前必须按需求替换**（门禁 **G47** 会检查标记是否还在）：页面、导航、数据都从需求来。

需要参考实现时，去 Skill 的 `assets/demo-pages/`（单页参考：列表 / 详情 / 后台表格…）与
`assets/scenario-samples/`（电商 / 小游戏场景增量）**按需取用**——参考不是需求，拷进去的要改造成用户要的样子。

## 构建产物与部署

`npm run build` 产出**两个互不依赖**的目录，各自单独部署：

```
dist/client/              # = <applicationId>/ 的内容，打进 APK
├── manifest.json         # 由 capsule/manifest.json 复制而来
├── signing/              # capsule.p12 + capsule.properties
├── icon/                 # 桌面图标（capsule/icon/ 存在时才有）
├── functions/            # 原子能力契约与脚本（manifest 声明 appFunctions 时由 capsule/functions/ 复制）
└── web/                  # App UI 构建产物（manifest.entry 指向 web/index.html）
    ├── index.html
    └── assets/           # 带内容 hash

dist/admin/               # Admin UI 静态站点，整目录拷到静态服务器
├── index.html            # 构建末尾由 admin.html 重命名而来
└── assets/
```

- **App UI 打进 APK**：`dist/client/` 整体（含 `manifest.json` / `signing/` / `icon/` / `web/`）
  打包成 `<applicationId>.bundle` 交给壳工程出 APK。`dist/client/` 里少了 `signing/` 会让 APK 构建失败。
- **Admin UI 独立部署**：`dist/admin/` 整个目录拷到静态服务器即可（nginx 用默认 `index index.html`）。
- 两个目录之间**没有任何相互引用**（两次独立的单入口构建，不共享 chunk），所以可以各走各的部署流程。
- 两个入口都用 `HashRouter`，路由在 `#` 之后 → **静态部署不需要任何 rewrite / fallback**。
- `base: './'` 让产物可挂在**任意子路径**下（壳内页面跑在 `/aiapp/web/index.html`）。
- bundle 打包与出 APK 的完整流程见 **builder-app-packaging** skill（由平台执行，Agent 只需产出 `dist/client/`）；
  缓存与 nginx 参考配置见 app-creator-skill 的 `references/09-deployment.md`。

## 目录结构

```
capsule/                     壳侧交付信息（构建时复制进 dist/client/）
├── manifest.json            applicationId / name / version / versionCode / entry / permissions
├── signing/                 capsule.p12 + capsule.properties（.p12 不进版本库，构建时自动生成调试证书）
└── icon/                    桌面图标 XML
scripts/
├── build.mjs                npm run build 入口：依赖自愈 → 并行两次 vite build → 收尾（不含类型检查）
├── finalize-build.mjs       构建收尾：校验 manifest、拼装 dist/client/、重命名 dist/admin/index.html
└── gen-debug-signing.mjs    生成调试签名证书
src/
├── app/                     App UI（移动端）
│   ├── App.tsx              路由表
│   ├── layout/AppShell.tsx  内容区 +（页面声明标题时才出现的）顶栏；导航按需求再加
│   ├── layout/PageTitle.tsx 页面级 chrome 注册（usePageTitle() 顶栏标题 / useTopBleed() 顶部穿透；都不声明则无顶栏）
│   ├── layout/TopBleedScrim.tsx 穿透页的状态栏渐变垫底（随正文滚入渐显；AppShell 自动挂载）
│   ├── pages/               页面
│   └── components/          仅 App UI 用的组件
├── admin/                   管理后台（PC）
│   ├── App.tsx
│   ├── layout/AdminShell.tsx
│   └── pages/
└── shared/                  两套 UI 共用
    ├── api/                 数据访问层（原生 request → fetch；带 mock 的完整示例见 Skill 的 demo-pages）
    ├── bridge/              原生能力封装（业务只用 index.ts）
    ├── hooks/               useAsync / useBridgeTask
    ├── lib/                 cn / storage / format
    ├── native/              原生运行态（系统信息、安全区、网络）
    ├── styles/              tokens.css（唯一色值来源）+ globals.css
    └── ui/                  基础组件
```

## 铁律（改代码时不要违反）

1. **颜色只写在 [`src/shared/styles/tokens.css`](./src/shared/styles/tokens.css)**，组件里禁止出现 `#hex` / `rgb(...)` 字面值；
   也**不要**写 `dark:` 变体——本工程只有一套配色（门禁 G10）。
2. **原生能力只通过 [`@/shared/bridge`](./src/shared/bridge/index.ts) 调用**，不要在业务代码里直接 `window.capsule`。
3. **新页面必须挂到路由表**（[`src/app/App.tsx`](./src/app/App.tsx) / [`src/admin/App.tsx`](./src/admin/App.tsx)），不要在组件里内联定义页面。
4. **`app/` 与 `admin/` 不互相引用**，共享逻辑下沉到 [`shared/`](./src/shared)；两个产物也必须能各自单独部署。
5. 新增依赖前先看 app-creator-skill 的 `references/01-tech-stack.md`，Vite 必须停在 6.x。
6. **所有依赖与静态资源必须本地化，禁止引用线上第三方 CDN**：图片/字体/音频先下载到 [`src/assets/`](./src/assets) 再 `import`，JS 库用 `npm install`；
   HTML/CSS 里不允许出现 `<script src="https://...">`、`@import url(https://...)` 这类外链。
   唯一的例外是壳提供的桥接 SDK `/sdk/capsule.js`（跟随当前页面主机：测试包 `appassets.t-stepos.com`，线上包 `appassets.stepaos.com`，**禁止改成写死的旧主机名**）：
   它**不静态写在源 [index.html](./index.html) 里**（浏览器 / 平台预览会 404），由构建期插件（[`vite.config.ts`](./vite.config.ts) 的 `capsuleSdkInjectPlugin`）在构建 App UI 时注入产物 HTML（Admin UI 不带）。
7. **预览环境的原生能力兜底只存在于 dev，真机不许有告警**：`dev` 下的缺口上报已内置在
   [`src/shared/bridge/dev-report.ts`](./src/shared/bridge/dev-report.ts)（由 [`index.ts`](./src/shared/bridge/index.ts) 统一调用），
   业务代码**不要**自己写这类兜底或告警。
8. **改了原生能力调用就要同步 [`capsule/manifest.json`](./capsule/manifest.json) 的 `permissions`**，
   改了版本就要同步 `version` / `versionCode` 与 `src/shared/config/app.ts` 的 `APP_VERSION`。
   详见 [AGENTS.md](./AGENTS.md) §2 / §3。

## 与原生的关系

- 真机：页面依赖壳提供的 `capsule.js`（产物 HTML 里由构建期注入 `<script src="/sdk/capsule.js">`，跟随当前页面主机），`invokeNative()` 直达原生；
  原生能力探测通过就走真实实现，**不会有任何告警**。
- 浏览器 / 平台预览：SDK 不可达，自动降级到 [`src/shared/bridge/mock.ts`](./src/shared/bridge/mock.ts) 里的 mock 实现，页面不会白屏。
- **预览里的缺口会提示到 DevServer 终端**：`npm run dev` 时如果调用了"没有 mock 实现"的原生能力，终端会打印
  `[native] ⚠ 原生能力缺口`，同时页面控制台有一条 `console.warn`，提醒你**该能力必须到 App 壳（真机）内验证**；
  命中的是模拟实现时会打印 `ℹ 预览环境提示`（返回的是假数据）。同一条信息只提示一次，不会刷屏。
  用 App 壳连本 DevServer 做**真机预览**时壳会提供 SDK、走 native，不会出现这些提示；
  若那时仍看到提示，说明壳没提供 SDK（多半用的不是支持端能力的壳）。
- 能力清单与调用规范见 **capsule-native-api** skill。
- 存储、相机、定位、蓝牙等能力需要**先同意隐私协议**（由壳统一管控），未同意时调用会失败并归一到
  `BridgeError.code === 'privacy'`；`useBridgeTask` 已经把这个分支提示成人话。
