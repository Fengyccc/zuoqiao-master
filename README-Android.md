# 左桥大师 · Android 打包指南

把 Taro H5 版「左桥大师」打包成 Android APK（WebView 壳），通过浏览器链接下载安装。

技术链路：`Taro build:h5`（前端）→ `Capacitor`（WebView 壳）→ `Gradle`（编译 APK）。

---

## 环境现状（本机已就绪 ✓）

本机 Android 打包环境已装好，日常直接打包即可：

| 组件 | 路径 |
|---|---|
| Android Studio（IDE） | `D:\Android\AndroidStudio` |
| Temurin JDK 21（构建用） | `D:\Android\jdk-21` |
| Android SDK（含 API 36） | `D:\Android\Sdk` |

两个**关键坑**（已配置好，勿改回）：

1. **必须用 JDK 21 构建**，不能用 Android Studio 自带的 JBR（那是 JDK 25，会让 Gradle 8.14.3 报 `Unsupported class file major version 69`）。已通过 `android/gradle.properties` 的 `org.gradle.java.home` 固定指向 `D:/Android/jdk-21`。
2. **项目路径 `D:\ai\左桥大师` 含中文**，AGP 默认拒绝构建，已在 `gradle.properties` 加 `android.overridePathCheck=true` 跳过。若以后个别工具链仍因中文路径报错，需把项目移到纯英文目录。

---

## 一、一次性环境准备（换机器 / 重装时参考）

本机目前 **没有 Android SDK、没有 Gradle，Java 是 JDK 8**（Capacitor 8 需要 JDK 17 或 21）。装一次即可。

### 1. 安装 Android Studio（推荐，一步到位）

下载并安装 **Android Studio**（自带 JDK 21 的 JBR + SDK Manager）：

- 官网：<https://developer.android.com/studio>

装好后打开一次 Android Studio → 按提示完成 SDK 安装。默认会装最新 SDK 平台；本工程需要 **Android SDK Platform 36（Android 16）**，若缺，在
`Settings → Languages & Frameworks → Android SDK → SDK Platforms` 里勾选 API 36 并安装。

### 2. 设置 `JAVA_HOME`

让命令行能找到 JDK（指向 Android Studio 自带的 JBR 即可）：

- 路径（默认安装）：`C:\Program Files\Android\Android Studio\jbr`
- 设置方法：`系统属性 → 高级 → 环境变量`，新建/编辑 `JAVA_HOME`，值填上面路径；并把 `%JAVA_HOME%\bin` 加到 `Path`。

验证（新开一个终端）：

```bash
java -version      # 应显示 17 或 21，不是 1.8
```

> 或者也可以单独装 JDK 17/21（如 Temurin：<https://adoptium.net>），并把 `JAVA_HOME` 指向它。二选一即可。

---

## 二、打包（日常使用）

在项目根目录，任选其一：

```bash
# 方式 A：npm 脚本（推荐）
npm run build:android:debug

# 方式 B：双击 / 命令行运行 bat
build-android.bat debug
```

三条命令等价：构建 H5 → 同步到 Android 工程 → Gradle 编译。

**产物位置：**

```
android\app\build\outputs\apk\debug\app-debug.apk
```

这个 APK 即可直接安装、分享。

---

## 三、分发：用浏览器链接下载安装

1. 把 `app-debug.apk` 上传到任意**支持直链下载**的地方：
   - **GitHub Releases**（免费、稳定、直链，推荐）
   - 对象存储：腾讯云 COS / 阿里云 OSS（配公开读，拿到 `https://...apk` 直链）
   - 蓝奏云等网盘（注意：部分网盘需 App 打开，不适合「浏览器直接下载」）
2. 拿到直链后，手机浏览器打开 → 下载 APK。
3. 首次安装会提示「未知来源应用」→ 允许安装即可（系统设置里勾选「允许安装未知应用」）。

> 注意：**debug 签名**的 APK 在同一台电脑上反复构建签名一致，可覆盖升级；但换电脑后 debug 签名会变，需先卸载再装。若要**长期跨机器稳定升级**，请用下方 release 签名。

---

## 四、（可选）Release 签名：长期稳定分发

### 1. 生成 keystore（只需一次）

```bash
keytool -genkey -v -keystore zq-release.keystore -alias zq -keyalg RSA -keysize 2048 -validity 10000
```

按提示设密码，记下 `storePassword` / `keyPassword` / `alias`。

### 2. 在 `android/app/build.gradle` 的 `android { }` 内加签名配置

```gradle
signingConfigs {
    release {
        storeFile file("../../zq-release.keystore")
        storePassword "你的密码"
        keyAlias "zq"
        keyPassword "你的密码"
    }
}
```

并在 `buildTypes.release` 里加 `signingConfig signingConfigs.release`。

### 3. 打包

```bash
npm run build:android:release
# 或 build-android.bat release
```

产物：`android\app\build\outputs\apk\release\app-release.apk`（已签名，可直接分发，跨机器可覆盖升级）。

> ⚠️ keystore 与密码务必妥善保存、不要提交到公开仓库；丢失后无法对同一包名签名，只能换包名。

---

## 五、（可选）换应用图标

默认是 Capacitor 占位图标。替换两种方式：

- **简单**：替换 `android/app/src/main/res/` 下 `mipmap-*` 各密度目录里的 `ic_launcher.png`、`ic_launcher_round.png`（mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi）。
- **推荐**：Android Studio 里右键 `app → New → Image Asset`，选一张 1024×1024 源图，自动生成全套图标（含自适应图标）。

---

## 六、改版本号 / 应用名

- 应用显示名：`android/app/src/main/res/values/strings.xml` 的 `app_name`。
- 版本号：`android/app/build.gradle` 的 `versionCode`（整数，递增用于升级）与 `versionName`（显示用）。
- 包名：`capacitor.config.ts` 的 `appId`（改后需 `npx cap sync android`）。

---

## 常见问题

- **`gradlew.bat` 报 `Unsupported class file major version`**：JAVA_HOME 还指向 JDK 8，换成 JDK 17/21。
- **报 SDK 找不到 / `Failed to find target with hash string android-36`**：SDK Manager 里装 Android 16（API 36）。
- **改前端代码后 APK 没变化**：先 `npm run build:h5` 再打包；微信端另有「清除缓存」坑（见项目 memory）。
