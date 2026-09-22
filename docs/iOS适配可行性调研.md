# 食光 iOS 适配可行性调研

- 调研日期：2026-09-23
- 调研基线：当前食光 V1.2.1 工作区，React + Vite + Capacitor 8.5.2。
- 调研方式：只读检查项目实现，对照 Capacitor 与 Apple 官方资料。
- 状态：技术可行性分析；尚未创建 iOS 工程、编译或进行 iPhone 真机验证。
- 本文不代表已启动 iOS 开发，不替代当前 Android 开发规范；正式实施时再同步产品需求、开发规划和构建说明。

## 1. 结论

**不需要更换技术栈或整体重写，但不能只换打包命令就交付功能完整的 iOS 应用。**

推荐保留 React + Vite + Capacitor，复用界面和 JavaScript 业务逻辑，为现有原生接口补齐 iOS 实现，再通过 Xcode 构建、签名和分发。

当前 APK 不能转换成 IPA。新增 iOS 工程也不会自动把 Android Java 插件翻译成 Swift。实际工作属于平台适配，主要投入在原生能力、系统交互和真机回归，而不是重写页面。

| 用户问题 | 调研结论 |
| --- | --- |
| 是否需要整体重构？ | 不需要。现有原生接口已经提供了可利用的平台边界，局部适配即可。 |
| 是否需要 Flutter、React Native 或 SwiftUI 重写？ | 当前需求没有足够理由，重写会扩大投入和回归范围。 |
| 能否沿用当前实现方式？ | 可以沿用 React + Vite + Capacitor，但必须补齐 iOS 原生实现。 |
| 能否直接重新打包？ | 当前不能。补齐适配后才能构建可用的 iOS 应用。 |
| 能否生成 iOS 安装包？ | 可以按分发方式构建并导出 IPA，但安装受 Apple 签名与分发机制约束。 |

## 2. 仓库证据与决定性限制

### 2.1 已具备跨平台前端基础

[package.json](../package.json) 中使用 React 19、Vite 8、Capacitor 8.5.2，目前包含 `@capacitor/android`，没有 `@capacitor/ios`；调研时工作区也没有 `ios/` 工程。

[capacitor.config.json](../capacitor.config.json) 指定 `dist` 为前端资源目录。Capacitor 官方支持 Android 与 iOS；iOS 使用 WKWebView 显示前端，通过 Swift／Objective-C 接入原生能力。[来源：Capacitor iOS](https://capacitorjs.com/docs/ios)

### 2.2 原生能力目前只有 Android 实现

[LocalDataPlugin.java](../android/app/src/main/java/com/shiguang/mealplanner/LocalDataPlugin.java) 暴露 15 个原生接口：

| 能力 | 接口 |
| --- | --- |
| 业务状态 | `loadState`、`saveState` |
| 普通偏好 | `getPreference`、`setPreference` |
| 敏感信息 | `getSecret`、`setSecret` |
| 图片 | `saveImage`、`readImage` |
| 网络 | `request` |
| 导出与分享 | `exportFile` |
| 提醒 | `reminderStatus`、`saveReminders`、`markWeekReviewed`、`consumeReminderLaunch`、`openNotificationSettings` |

[storage.js](../src/storage.js) 注册 `LocalData`，并通过 `Capacitor.isNativePlatform()` 决定是否调用原生接口。iOS 也属于原生平台，因此不会自动退回浏览器的 localStorage 分支。

如果仅新增 iOS 工程而没有注册对应插件，数据读取等原生调用会失败。[App.jsx](../src/App.jsx) 的状态读取失败分支会显示加载失败，不能据此交付正常使用的应用。该结论来自静态调用链分析，尚未在 iOS 上复现。

### 2.3 主要代码依据

| 文件 | 与 iOS 适配有关的职责 |
| --- | --- |
| [src/storage.js](../src/storage.js) | 状态、图片、偏好、密钥、请求、导出的原生调用边界 |
| [src/domain.js](../src/domain.js) | 菜单、采购、日期等共享业务规则 |
| [src/services.js](../src/services.js) | AI 请求结构、响应校验、备份格式与校验 |
| [src/sync.js](../src/sync.js) | WebDAV、冲突判断、条件写入、图片同步 |
| [src/reminders.js](../src/reminders.js) | 提醒规则、前端接口与浏览器实现 |
| [src/components/RecognitionPanel.jsx](../src/components/RecognitionPanel.jsx) | 拍照／相册入口、图片读取、识别草稿 |
| [src/styles/mobile.css](../src/styles/mobile.css) | 移动布局与已有 safe-area 处理 |
| [MainActivity.java](../android/app/src/main/java/com/shiguang/mealplanner/MainActivity.java) | Android 插件注册、返回键、键盘和生命周期 |
| [WeeklyReminders.java](../android/app/src/main/java/com/shiguang/mealplanner/WeeklyReminders.java) | Android 闹钟、通知、已查看状态和通知跳转 |

## 3. 功能复用与适配清单

以下为结合仓库实现得出的工程判断，不代表已经通过 iOS 验收。

| 模块 | 可以复用 | iOS 需要补齐或验证 |
| --- | --- | --- |
| 菜谱、点单、采购、周菜单、库存 | React 页面与主要交互 | iPhone 布局、键盘、触摸和字体 |
| 份数、采购合并、快照、历史复制 | JavaScript 业务逻辑 | 业务回归与日期边界 |
| 保质期参考、营养估算、周回顾 | 数据和计算逻辑 | 显示、日期及数据一致性 |
| AI 识别和草稿 | 提示词、请求格式、校验、草稿流程 | 原生网络、Keychain、图片格式 |
| 链接正文提取 | Mozilla Readability 与提取逻辑 | 请求行为；登录和反爬限制不会因迁移消失 |
| SQLite | JSON 状态格式、迁移和接口约定 | iOS SQLite 读写与事务 |
| 图片存储 | 图片引用和编码规则 | iOS 私有目录读写、格式与路径校验 |
| 普通设置 | 设置字段和上层接口 | UserDefaults 或 Preferences 插件 |
| API Key、WebDAV 密码 | 上层调用 | Keychain 存取与访问策略 |
| 坚果云同步 | 同步协议、冲突和恢复逻辑 | HTTP 方法、响应头、条件写入和失败行为 |
| 文件保存、分享 | PNG、JSON 等内容生成 | iOS 文件面板、分享面板、取消与返回状态 |
| 系统提醒 | 提醒时间、已查看等业务规则 | 本地通知、授权、调度、前后台与点击路由 |
| Android 返回键 | 业务关闭逻辑可参考 | Android 原生处理不能复用，需按 iOS 交互验证 |

页面和业务逻辑可以大量保留，但不提供未经度量的“复用率 90%”等精确比例。原生代码行数较少，也可能承担较高的可靠性验证成本。

## 4. 重点适配问题

### 4.1 数据保存与 Android 数据迁移

当前 SQLite 在 `app_state` 表中保存 JSON 状态，不是大量 Android 专属的复杂表结构。iOS 可以继续使用同一状态格式，保留现有业务迁移与校验逻辑。

建议：

- 结构化业务数据继续使用 SQLite，不以浏览器 localStorage 替代正式持久化。
- 图片保存在应用私有文件目录，继续维持现有图片引用约定。
- 普通偏好使用 UserDefaults 或 Capacitor Preferences。
- API Key 和 WebDAV 密码使用 Keychain，不复制 Android Keystore 密文。
- 使用现有 JSON 备份或 WebDAV 协议迁移业务数据，新设备重新配置凭据。

Capacitor Preferences 在 iOS 与 Android 上分别使用 UserDefaults 和 SharedPreferences；官方也说明其不适合作为大型本地数据库。Apple Keychain 用于安全保存密码和密钥等小块敏感数据。[Preferences 文档](https://capacitorjs.com/docs/apis/preferences)、[Keychain 文档](https://developer.apple.com/documentation/security/keychain-services)

验收要覆盖双向备份导入、图片恢复、历史菜单快照、损坏数据拒绝、写入失败保留旧数据，以及重启后状态完整。跨平台迁移应遵循现有备份字段范围，不额外承诺迁移本机草稿或所有偏好。

### 4.2 AI 与 WebDAV 网络

目前原生请求使用 Android OkHttp。iOS 可以用 `URLSession` 实现相同的请求／响应约定，继续由应用直接访问 AI 服务商和坚果云，无需因支持 iOS 新增后端。[Apple 网络请求文档](https://developer.apple.com/documentation/foundation/nsurlrequest)

必须保留并验证：

- WebDAV 的 `MKCOL`、`PUT`、`DELETE` 等实际使用方法和请求体。
- `ETag` 响应头，以及 `If-Match`、`If-None-Match` 条件写入。
- 与当前实现一致的响应头规范化，避免同步代码读取不到 `etag`。
- 禁止自动重定向、超时与错误返回语义。
- 失败时保留本地修改、冲突不能静默覆盖、凭据和业务正文不进入日志。

“能发出 HTTPS 请求”不足以证明同步适配完成，必须验证冲突、并发写入和失败恢复。

### 4.3 相机、相册和导出

当前识别入口使用 HTML 文件输入与 `capture`，通过 FileReader 读取图片，没有统一图片转码流程。Android 原生存图只接受 JPEG、PNG、WebP、GIF。

iPhone 上需要实测相机和相册返回的 MIME 类型、HEIC、图片方向、大图内存与取消流程。不能预先断言所有选图路径都会返回 HEIC，也不能假定系统一定自动转换成兼容格式。

先验证现有入口；若不能稳定满足要求，再接入 Capacitor Camera，并按实际调用能力配置相机／照片用途说明。官方 Camera 插件提供拍照和相册选图能力，并列出 iOS 配置要求。[Camera 文档](https://capacitorjs.com/docs/apis/camera)

PNG、JSON 和现有 HTML `.doc` 的生成逻辑可保留，但保存到文件、分享与取消结果需要 iOS 实现；文件在目标查看应用中的表现也需要验收。

### 4.4 系统提醒

Android 当前依赖 `AlarmManager`、广播接收器及 Activity 生命周期；iOS 应改为提前安排系统本地通知。Apple 系统可以在应用不运行或位于后台时展示已安排的通知，单纯的每周提醒不需要新增推送服务器。[Apple 本地通知文档](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)

不要照搬 Android 到点执行代码、读取状态再生成通知的机制。iOS 要明确通知内容和目标周如何预先确定、何时更新或取消，以及长时间不打开应用时的行为。

验收包括：

- 授权拒绝、关闭后重新开启、进入系统设置。
- 前台应用内提醒与后台通知不重复打扰。
- 已查看状态与待发送／已展示通知的协调。
- 点击通知打开对应周，尤其是旧通知和跨周场景。
- 时区、跨年、夏令时、进程终止后的行为。

系统通知的最终展示受系统与用户设置影响，不承诺绝对准点。现有 Android 提醒的验收结果不能证明 iOS 通知可靠。

### 4.5 iPhone 界面与生命周期

已有 CSS 使用 `safe-area-inset-*`，可以作为基础，但仍需验证顶部安全区域、底部 Home 指示区、中文键盘、弹窗高度、横屏、小屏和大字体。

Android 返回键和键盘优先收起逻辑位于 `MainActivity.java`；iOS 应基于现有页面关闭入口验证操作是否完整，并验证前后台切换、通知唤起和照片面板返回，不直接移植 Android 事件处理。

## 5. 推荐技术路线

保留现有 `LocalData` 接口，在 iOS 工程内实现并注册同名 Swift 插件。共享层继续调用相同接口，平台层分别完成系统操作。Capacitor 官方支持在应用内注册自定义 Swift 插件，无需先发布独立插件包。[自定义 iOS 插件文档](https://capacitorjs.com/docs/ios/custom-code)

```text
共享 React 界面与 JavaScript 业务逻辑
                    ↓
            现有 LocalData 接口
               ↙          ↘
        Android 实现     iOS 实现
```

| 方案 | 评价 |
| --- | --- |
| 只新增 iOS 工程并打包 | 原生接口缺失，不能完整交付 |
| 保留技术栈与接口，增加 iOS 实现 | 推荐；变更范围集中，可保留 Android 实现 |
| 全面替换为跨平台插件 | 可逐项评估，但会扩大 Android 回归范围，不应作为前置条件 |
| Flutter／React Native／SwiftUI 重写 | 当前业务目标下没有足够收益依据 |

实施时可以在接口内部采用系统 API 或成熟插件，不必为了接口一致而重复实现已有能力。插件版本兼容性、维护状态和具体行为仍需在接入时核验。

## 6. 构建、签名与安装分发

### 6.1 环境要求

截至本次调研，Capacitor 8 官方文档给出的要求为 iOS 15+、Xcode 26.0+；原生构建需要 macOS。Windows 可以继续编辑共享代码，但编译、签名与 iOS 模拟器验证需要本地或远程 Mac 环境。具体 Xcode 对 macOS 的要求，以及上架 SDK 要求，应在实施时再核验。[iOS 平台文档](https://capacitorjs.com/docs/ios)、[环境配置文档](https://capacitorjs.com/docs/getting-started/environment-setup)

实施流程是安装与现有 Capacitor 版本匹配的 `@capacitor/ios`，添加 iOS 工程，补齐原生能力与配置，然后构建前端、同步 iOS 资源，并在 Xcode 中运行、归档和签名。生成工程或编译成功都不等于功能验收完成。

### 6.2 分发选择

**IPA 不是可以任意发给 iPhone 直接安装的通用文件。** 常见选择如下，适用范围需结合实际账号和目标用户确认。

| 场景 | 方式 | 限制 |
| --- | --- | --- |
| 个人初步验证 | 免费 Apple Account + Xcode 真机安装 | Personal Team 需周期性重新签署；官方列出的 App ID、设备有效期为 7 天 |
| 少量固定设备 | 付费开发者账号 + Ad Hoc | 需登记设备，受签名、描述文件有效期及设备额度约束 |
| 邀请用户测试 | TestFlight | 每个构建最多测试 90 天，需要持续更新；应预留适用的测试审核流程 |
| 面向普通用户长期分发 | App Store | 需要开发者账号、上架资料和审核 |

依据：[个人账号与 Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account)、[登记设备分发](https://help.apple.com/xcode/mac/current/en.lproj/dev7ccaf4d3c.html)、[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)。

Apple Developer Program 当前费用为每会员年 99 美元或当地货币价格；实际支付金额以注册页面为准。[Apple 注册说明](https://developer.apple.com/programs/enroll/)

### 6.3 上架准备

若选择 App Store，需要按最终实现准备权限用途说明、隐私政策、相关 API 的 Privacy Manifest、应用图标、截图和审核资料。AI 发送前的提示与授权需要和实际数据流一致。

Capacitor 技术路线不能保证审核通过，也没有因此必须重写成 SwiftUI 的结论。食光已有离线业务流程，最终仍以成品及 Apple 审核为准。[Capacitor 隐私清单](https://capacitorjs.com/docs/ios/privacy-manifest)、[Apple 审核指南](https://developer.apple.com/cn/app-store/review/guidelines/)

## 7. 建议实施阶段与验收门槛

| 阶段 | 工作内容 | 完成标准 |
| --- | --- | --- |
| 1. 最小存储闭环 | iOS 工程、插件注册、状态与图片持久化 | 真机新建菜谱、保存图片、终止后重开数据仍完整 |
| 2. 网络和数据互通 | Keychain、AI、WebDAV、备份导入导出 | Android／iOS 双向数据验证，冲突和失败不丢数据 |
| 3. 系统能力 | 拍照、相册、文件、分享、提醒 | 权限拒绝、取消、后台和通知点击等路径通过 |
| 4. 双平台回归 | iPhone UI、业务测试、Android 回归 | 共享业务和 Android 既有功能无已知回归 |
| 5. 安装分发 | 签名、归档、测试或上架资料 | 通过选定渠道在目标设备上安装并验证 |

现有 Node 业务测试可以继续复用；Android 原生测试需要在 iOS 上建立相应验证。浏览器自动化不能代替 iPhone 真机测试。测试应遵循项目日志要求，不记录凭据、请求头或业务正文。

正式实施前再列出具体目标文件和增量计划，并同步 `AGENTS.md`、产品需求、开发规划及 README 中仅针对 Android 的相关表述和操作说明。

## 8. 未验证项与估算边界

- 尚未创建 iOS 工程、安装 iOS 依赖或运行 Xcode 构建。
- 尚未验证 iPhone 上的照片格式、键盘、文件面板、通知与生命周期。
- 尚未验证 iOS 真实 AI 请求与坚果云同步，以及双平台数据互通。
- 尚未确认可用 Mac、iPhone、开发者账号和最终分发方式。
- 尚未评估具体 iOS 第三方插件的版本兼容性；本文不承诺某个插件可直接替换全部现有行为。
- 未进行 App Store 提交或审核，不能承诺审核结果。

当前证据足以支持“保留技术栈、局部平台适配”的决策，但不足以承诺精确工期或完全兼容。应在最小存储闭环和关键系统能力原型通过后，再据实际问题估算完整交付工作量。
