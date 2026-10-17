# 薄肌计划 BojiPlan 🦾

> **碳基服务器，AI 掌舵。** 把「薄肌 / 搏击 / 大水 / 大睡 / 先开图再出兵 / 先自由后财富 / 少消费多创造」这套认知体系，变成一个每天替你盯着身体、资产、决策的 AI Agent——机器人「小薄」（可改名）。

一个工程、一套 UI、一套设计 token（深空灰底 + 荧光绿主色），产物打进 APK：

| 入口 | 界面 | 面向 | 构建产物 |
| --- | --- | --- | --- |
| [`index.html`](./index.html) → [`src/app/`](./src/app) | App UI（移动端 H5） | App 壳的 WebView | `dist/client/web/**`（与 `capsule/` 一起构成壳侧 bundle，打进 APK） |

本工程**不含管理后台**（按需能力，未启用即无 `admin.html` / `src/admin/` / `vite.config.admin.ts` 三件套）。

## 功能概览

- **💬 AI 掌舵对话**：真实大模型驱动（OpenAI 兼容接口直连 StepFun 开放平台），流式输出、思维链实时可见、StepSearch 联网搜索（带来源卡片）、长期记忆自动提炼入库；未接入 Key 时由本地剧本引擎兜底（打卡确认 / 决策剧本 / 理论问答）。
- **📊 掌舵面板**：饮水 / 睡眠 / 训练 / 创造四指标环、一周训练计划（AI 生成，写到组数×次数与组间休息秒数，器械硬约束）、AI 掌舵日报、碳基服务器负载率、近 7 日睡眠图、一键打卡。
- **🩺 健康**：体检报告拍照 / 相册上传 → AI 视觉解读出异常清单（名称 / 系统 / 等级 / 指标备注）；身体数据快照（身高 / 体重 / 体脂 + BMI 分级）与体重 × 体脂双轴曲线。
- **💰 资产**：只记「某一时刻的总资产 / 总负债」，总资产 / 总负债 / 净资产三线曲线按快照时间生长，点曲线上的点可回改。
- **🗓️ 训练计划**：先采集器械条件写入硬约束，再结合身体数据生成；生成后即固定，可手动编辑。
- **🧠 记忆**：长期记忆库（分类 / 来源 / 重要度 / 搜索）+ 饮食记录（自动带时间）+ 备忘录（待办勾选）。
- **⏳ 生命倒计时**：生日 + 预期寿命 → 剩余天数 + 时:分:秒秒级跳动 + 人生进度条。

**所有个人数据只存本机**（localStorage，Key: `boji_plan_v1`），零后端、零数据上报。

## AI 接入（自带 Key）

所有 AI 能力（对话 / 计划生成 / 体检解读）通过**用户自己的 StepFun 开放平台 API Key** 直连官方接口：

1. 登录 [platform.stepfun.com](https://platform.stepfun.com) 创建 API Key；
2. App 内「我的 → API 接入」填入 Key（只存本机 localStorage，不经过任何服务器）；
3. 「测试连接」通过后即可使用；模型列表从 `/v1/models` 动态拉取（6 小时缓存）。

网络双轨：优先 `fetch` 直连（保留 SSE 流式）；真机 WebView 拦截时自动回落到壳代发的 `request`（非流式）。

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173/  → App UI
npm run typecheck  # 类型门禁（构建不含类型检查，两条都要跑）
npm run build      # 产物：dist/client/（壳侧 bundle 内容）
npm run build:client # 只交付 APK 时用：只出 dist/client/，跳过 Admin
npm run deps       # 依赖自愈：沙箱回收后 node_modules 丢失时按需重装（dev/build/typecheck 已自动前置）
```

预览插件（`stepai-vite-config`）已配好：`npm run dev` 时提供元素点选定位、预览运行时与错误收集；`npm run build` 不会把任何调试代码打进产物。

> **`npm run build` / `build:client` 怎么选？** 判据是**这次交付要不要 Admin 产物**：本工程无后台，打 APK 用 `npm run build:client` 即可；`npm run build` 也会跳过不存在的 Admin 构建。

开发前请先读 [AGENTS.md](./AGENTS.md)——它写清了改代码时必须同步维护的东西（`capsule/`、`permissions`、版本号等）。

## 构建产物与部署

```
dist/client/              # = <applicationId>/ 的内容，打进 APK
├── manifest.json         # 由 capsule/manifest.json 复制而来
├── signing/              # capsule.p12 + capsule.properties
├── icon/                 # 桌面图标（capsule/icon/ 存在时才有）
├── functions/            # 原子能力契约与脚本（manifest 声明 appFunctions 时由 capsule/functions/ 复制）
└── web/                  # App UI 构建产物（manifest.entry 指向 web/index.html）
    ├── index.html
    └── assets/           # 带内容 hash
```

- **App UI 打进 APK**：`dist/client/` 整体（含 `manifest.json` / `signing/` / `icon/` / `web/`）
  打包成 `<applicationId>.bundle` 交给壳工程出 APK。`dist/client/` 里少了 `signing/` 会让 APK 构建失败。
- 入口用 `HashRouter`，路由在 `#` 之后 → 静态部署不需要任何 rewrite / fallback；
  `base: './'` 让产物可挂在任意子路径下（壳内页面跑在 `/aiapp/web/index.html`）。
- bundle 打包与出 APK 的完整流程见 **builder-app-packaging** skill（由平台执行，Agent 只需产出 `dist/client/`）；
  缓存与 nginx 参考配置见 app-creator-skill 的 `references/09-deployment.md`。

## 目录结构

```
capsule/                     壳侧交付信息（构建时复制进 dist/client/）
├── manifest.json            applicationId / name / version / versionCode / entry / permissions
├── signing/                 capsule.p12 + capsule.properties（.p12 不进版本库，构建时自动生成调试证书）
└── icon/                    桌面图标 XML（机器人「小薄」自适应图标）
scripts/
├── build.mjs                npm run build 入口：依赖自愈 → 并行 vite build → 收尾（不含类型检查）
├── finalize-build.mjs       构建收尾：校验 manifest、拼装 dist/client/
└── gen-debug-signing.mjs    生成调试签名证书
src/
├── app/                     App UI（移动端）
│   ├── App.tsx              路由表（六个一级 Tab：对话 / 掌舵 / 记忆 / 资产 / 健康 / 我的）
│   ├── layout/AppShell.tsx  内容区 +（页面声明标题时才出现的）顶栏 + 底部 Tab 导航
│   ├── layout/PageTitle.tsx 页面级 chrome 注册（usePageTitle() 顶栏标题 / useTopBleed() 顶部穿透）
│   ├── layout/TopBleedScrim.tsx 穿透页的状态栏渐变垫底（随正文滚入渐显；AppShell 自动挂载）
│   ├── pages/               ChatPage / DashPage / MemoryPage / AssetPage / HealthPage / MePage
│   ├── components/          ModelPickerDialog（模型选择弹层）
│   ├── lib/                 stepfun.ts（StepFun API 客户端）/ script.ts（本地意图识别 + 剧本引擎）/ text.ts / image.ts
│   └── store/               boji.ts（全局状态仓库）+ seed.ts（种子数据）
└── shared/                  基础能力（本工程仅 App UI 使用）
    ├── api/                 数据访问层（原生 request → fetch）
    ├── bridge/              原生能力封装（业务只用 index.ts）
    ├── hooks/               useAsync / useBridgeTask
    ├── lib/                 cn / storage / format
    ├── native/              原生运行态（系统信息、安全区、网络）
    ├── styles/              tokens.css（唯一色值来源）+ globals.css
    └── ui/                  基础组件 + BotFace / charts（手写 SVG 图表）
```

## 铁律（改代码时不要违反）

1. **颜色只写在 [`src/shared/styles/tokens.css`](./src/shared/styles/tokens.css)**，组件里禁止出现 `#hex` / `rgb(...)` 字面值；
   也**不要**写 `dark:` 变体——本工程只有一套配色（深色，门禁 G10）。
2. **原生能力只通过 [`@/shared/bridge`](./src/shared/bridge/index.ts) 调用**，不要在业务代码里直接 `window.capsule`。
3. **新页面必须挂到路由表**（[`src/app/App.tsx`](./src/app/App.tsx)），不要在组件里内联定义页面。
4. 新增依赖前先看 app-creator-skill 的 `references/01-tech-stack.md`，Vite 必须停在 6.x。
5. **所有依赖与静态资源必须本地化，禁止引用线上第三方 CDN**：图片/字体/音频先下载到 [`src/assets/`](./src/assets) 再 `import`，JS 库用 `npm install`。
   唯一的例外是壳提供的桥接 SDK `/sdk/capsule.js`（跟随当前页面主机：测试包 `appassets.t-stepos.com`，线上包 `appassets.stepaos.com`）：
   它**不静态写在源 [index.html](./index.html) 里**（浏览器 / 平台预览会 404），由构建期插件（[`vite.config.ts`](./vite.config.ts) 的 `capsuleSdkInjectPlugin`）在构建 App UI 时注入产物 HTML。
6. **预览环境的原生能力兜底只存在于 dev，真机不许有告警**：`dev` 下的缺口上报已内置在
   [`src/shared/bridge/dev-report.ts`](./src/shared/bridge/dev-report.ts)，业务代码**不要**自己写这类兜底或告警。
7. **改了原生能力调用就要同步 [`capsule/manifest.json`](./capsule/manifest.json) 的 `permissions`**，
   改了版本就要同步 `version` / `versionCode` 与 `src/shared/config/app.ts` 的 `APP_VERSION`。
   详见 [AGENTS.md](./AGENTS.md) §2 / §3。

## 与原生的关系

- 真机：页面依赖壳提供的 `capsule.js`（产物 HTML 里由构建期注入 `<script src="/sdk/capsule.js">`，跟随当前页面主机），`invokeNative()` 直达原生；
  原生能力探测通过就走真实实现，**不会有任何告警**。
- 浏览器 / 平台预览：SDK 不可达，自动降级到 [`src/shared/bridge/mock.ts`](./src/shared/bridge/mock.ts) 里的 mock 实现，页面不会白屏。
- **预览里的缺口会提示到 DevServer 终端**：`npm run dev` 时如果调用了"没有 mock 实现"的原生能力，终端会打印
  `[native] ⚠ 原生能力缺口`，同时页面控制台有一条 `console.warn`，提醒你**该能力必须到 App 壳（真机）内验证**；
  命中的是模拟实现时会打印 `ℹ 预览环境提示`（返回的是假数据）。
- 能力清单与调用规范见 **capsule-native-api** skill。
- 存储、相机、定位等能力需要**先同意隐私协议**（由壳统一管控），未同意时调用会失败并归一到
  `BridgeError.code === 'privacy'`；`useBridgeTask` 已经把这个分支提示成人话。

## 数据与隐私

所有个人数据（API Key、记忆、打卡、体检、资产、身体、计划）仅存于设备 localStorage，无自建服务器、无数据上报；卸载即清除。API Key 由用户自行在 StepFun 开放平台创建并直连官方接口。

理论体系出自公开访谈（孙宇晨 × 邵艾伦），为个人观点合集，非投资 / 医学建议；AI 输出的训练计划与健康解读不构成专业意见。
