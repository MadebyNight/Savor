# 食光 · Android 本地膳食规划

MVP 开发中。React + Vite 高保真界面，通过 Capacitor 封装为 Android APK。核心菜谱、采购、周菜单和库存离线工作；热量功能已移除。

需求见 [产品需求确认](docs/产品需求确认.md)，实施及验收见 [开发规划](docs/开发规划.md)，当前证据和外部待办见 [开发进度](docs/开发进度.md)。

## 本地开发

Node.js 22.12+。在项目根目录执行：

```powershell
npm install
npm run dev
npm run build
node --test src/domain.test.js src/sync.test.js
```

浏览器预览仅用于开发，业务状态使用 localStorage；API Key 只保留在内存。Android 使用 SQLite、私有图片目录、SharedPreferences 和 Keystore。

## Android 构建

需要 JDK21、Android SDK36、Build Tools36，`android/local.properties` 指向 SDK，文件不提交。

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。本工作区工具放 `.android-tools/`，设置 `JAVA_HOME` 与 `GRADLE_USER_HOME` 到工作区相应路径后执行。构建不等于真机验收，详见进度文档。

本工作区也可执行 `./scripts/android-build.ps1`，自动使用 `.android-tools/jdk21/` 下的 JDK 21 和 `.android-tools/sdk/`，依次构建前端、同步 Capacitor、构建 APK 并运行单元测试。连接设备或启动模拟器后加 `-ConnectedTests` 运行 Android 仪器测试；Gradle 缓存和 AVD 状态均限定在 `.android-tools/`。

## 测试

- `node --test src/domain.test.js src/sync.test.js`：采购、日期、迁移、备份、并发同步与图片完整性。
- `python tests/e2e.py`：启动 Vite 后运行，覆盖核心浏览器流程。
- `python tests/e2e_ai.py`：AI模拟响应、错误、草稿、取消和手机导航。
- Android：设备连接后 `android/gradlew.bat connectedDebugAndroidTest`（在 android 目录运行）。原生测试覆盖SQLite错误不覆盖、偏好、路径和图片类型等。

浏览器测试输出留 `.android-tools/e2e/`，Python Playwright 和浏览器需可用；测试脚本将浏览器缓存限定到工作区。模拟服务测试不等于真实AI或坚果云账户验收。

## 使用与限制

- 设置与备份：配置 DeepSeek 接口及模型（当前官方文档模型 `deepseek-flash`），每次发送前确认文字与图片。
- AI提取只生成草稿，逐项编辑勾选后保存；失败保留输入。取消只停止等待，不保证服务端未计费。
- 公开链接正文复用 Mozilla Readability；小红书需要登录或返回空壳时改用粘贴/截图。暂不支持登录态评论抓取，不部署额外MCP服务。
- 坚果云：配置 WebDAV 根地址、账号和应用密码，手动检查并选择方向。双方变更不自动合并，恢复前保留本地备份；发布用条件写入，失败副本可恢复。
- PNG、HTML `.doc` 和 JSON 备份在 Android 通过系统文件保存；分享使用系统分享面板。
- 备份不含API Key、WebDAV密码和本机草稿。原型旧菜单ID迁移为快照，缺失内容明确标记。

## 开源与文档

- [Mozilla Readability](https://github.com/mozilla/readability)：Apache-2.0，公开网页正文提取。
- [DeepSeek 图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision/)：Chat Completions 图文格式。
- [小红书 MCP](https://github.com/xpzouying/xiaohongshu-mcp)、[小红书 skill](https://github.com/DeliciousBuding/xiaohongshu-skill)：已评估，依赖外部浏览器/登录，不直接嵌入 APK。

不提交SDK、JDK、node_modules、dist、密钥及本地配置。当前为个人安装调试APK流程，正式签名升级与真实服务验证结果以进度文档为准。
