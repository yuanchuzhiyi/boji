# 薄肌计划 BojiPlan 🦾

> **碳基服务器，AI 掌舵。** 把孙宇晨 × 邵艾伦那场 5 小时访谈里的流行认知体系（薄肌 / 搏击 / 大水 / 大睡 / 先开图再出兵 / 先自由后财富 / 少消费多创造），变成一个每天替你盯着身体、资产、决策的 AI Agent。

基于阶跃星辰 **StepCode（step-5-preview）** 构建。

---

## 这是什么

一个安卓 App（附网页预览版）：机器人「小薄」（可改名）背后是真实大模型，作为你的日常掌舵 Agent——每天看你的打卡数据给建议，记住你说过的事，按你的身体数据和器械条件生成一周训练计划，帮你读体检报告，盯你的净资产曲线，还有一条生命倒计时提醒你时间有限。

**所有个人数据只存在你自己设备上，零后端。**

## 功能一览

| 模块 | 内容 |
|---|---|
| 💬 AI 掌舵对话 | 真实模型驱动、长期记忆注入、StepSearch 联网搜索（带来源）、流式输出 |
| 📊 每日打卡 | 饮水 / 睡眠 / 搏击 / 薄肌 / 创造，指标环 + AI 掌舵日报 + 服务器负载 |
| 🩺 健康 | 体检报告拍照上传 → AI 总结疾病/异常清单；身体数据快照（身高/体重/体脂/BMI）+ 双轴曲线 |
| 💰 资产 | 总资产/总负债快照 + 三线曲线（按录入时间） |
| 🗓️ 训练计划 | 按器械条件 + 身体数据 AI 生成，写到组数×次数/组间休息/退阶，默认折叠可编辑 |
| 🧠 记忆 | 长期记忆库 + 饮食记录（自动带时间）+ 备忘录 |
| ⏳ 生命倒计时 | 生日 + 预期寿命 → 剩余天数 + 时:分:秒 + 人生进度条 |

## 目录结构

```
boji-plan/index.html      # 全部业务代码（单文件 Web App，零依赖）
android/                  # 安卓壳工程（Gradle + WebView）
hackathon-doc/            # 黑客松作品介绍（网页版）
黑客松作品介绍.md          # 黑客松作品介绍（Markdown，可粘飞书）
BOJI-README.md            # 后端/构建历史说明
ANDROID-BUILD.md          # 安卓构建与安装指南
sync-web-to-app.sh        # 网页改动 → 同步进安卓工程
薄肌计划-v1.0.0-debug.apk # 可直接安装的 APK（Android 8.0+）
```

## 快速开始

### 用 App

```bash
adb install -r 薄肌计划-v1.0.0-debug.apk
```

安装后进「我的 → API 接入」，填入 StepFun 开放平台的 API Key（[platform.stepfun.com](https://platform.stepfun.com) 登录后创建），即可启用全部 AI 能力。

### 跑网页版

浏览器直接打开 `boji-plan/index.html`。

### 改代码后重新出包

```bash
./sync-web-to-app.sh                    # 同步网页进安卓工程
cd android
ANDROID_HOME=~/Library/Android/sdk ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

详见 [ANDROID-BUILD.md](ANDROID-BUILD.md)。

## 技术要点

- **架构**：单文件 Web App（HTML/CSS/JS 零依赖）→ 直连 StepFun OpenAI 兼容 API → localStorage 持久化；安卓壳用 WebViewAssetLoader 以 https origin 加载本地资源
- **AI 掌舵 = 提示词工程**：每次请求动态注入人设、访谈理论、用户资料、今日数据、长期记忆、健康档案、身体快照六层上下文
- **自研标记协议**：模型以 `[[MEMORY:分类|内容]]` 等标记行输出结构化数据，前端解析入库——不用向量库/后端实现 Agent 持久记忆
- **Function Calling**：`/v1/search` 封装为 web_search 工具，两轮工具循环实现自主联网检索
- **多模态**：体检报告图片压缩后以 image_url 送模型，四层容错解析 JSON
- **推理模型适配**：不设 max_tokens、流式思维链可视化、`reasoning_effort: low` 分场景调控、HTTP 200 探针式连通性测试
- **图表**：全部手写 SVG（指标环 / 双轴曲线 / 资产三线 / 进度条）

## 演示

- 网页预览：<https://p-901e666ece7cbf10d530352e7bb6982a.preview.stepcloud.com>
- 作品介绍：<https://p-aab92ab3d59d1ade30ba6bc54078f521.preview.stepcloud.com>

## 免责声明

理论体系出自公开访谈，为个人观点合集，非投资 / 医学建议；AI 输出的训练计划与健康解读不构成专业意见。

## License

MIT
