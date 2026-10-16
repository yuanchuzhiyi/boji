# 薄肌计划 · 安卓 App 构建说明

## 已产出

- **APK（可直接安装）**：`薄肌计划-v1.0.0-debug.apk`（3.3MB，debug 签名，minSdk 26 / Android 8.0+）
- 源码工程：`android/`（Gradle + AGP 8.5.2，纯 WebView 壳，无 Capacitor）

## 装到手机

```bash
# 方式一：数据线 + adb
~/Library/Android/sdk/platform-tools/adb install -r 薄肌计划-v1.0.0-debug.apk

# 方式二：把 apk 传到手机，点开安装（需允许未知来源）
```

## 架构

```
MainActivity (Java)
  └─ WebView 加载 https://appassets.androidplatform.net/assets/www/index.html
       （WebViewAssetLoader，本地资源以 https origin 提供）
  └─ 页面直连 api.stepfun.com（该接口已允许跨域，Authorization 头预检通过）
  └─ localStorage 持久化：API Key + 全部业务数据都在本机
  └─ onShowFileChooser：体检报告上传（相册 + 拍照，FileProvider 授权）
  └─ 返回键：先让页面关弹窗（window.__bojiBack），再走 WebView 历史
  └─ UA 追加 BojiPlanApp → 页面自动隐藏模拟状态栏/手势条
```

## 改网页后重新出包

```bash
cd ~/Code/zhx/boji
./sync-web-to-app.sh          # 同步 index.html 进 assets
cd android
./gradlew assembleDebug       # 或 Android Studio 里点 Run
# 产物: android/app/build/outputs/apk/debug/app-debug.apk
```

## 用 Android Studio 打开

直接 Open `android/` 目录即可（Gradle 8.7 + AGP 8.5.2 + JDK 17， wrapper 已配好）。
`local.properties` 里的 sdk.dir 按你机器实际路径改。

## 发布正式版

1. Android Studio → Generate Signed Bundle/APK，建一个上传 keystore
2. `app/build.gradle` 里加 signingConfigs，`buildTypes.release` 引用
3. minifyEnabled 打开时确认 proguard 规则（WebView + JS 接口无需特殊规则）

## 已知边界

- 无 Capacitor/无 Kotlin，纯壳：后续要原生能力（通知、后台、健康数据同步）再引入
- 相机拍照上传体检报告需要相机权限（运行时申请）
- API Key 存在 WebView localStorage，卸载 App 即清除
