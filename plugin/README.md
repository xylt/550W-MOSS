# 550W-MOSS

《流浪地球》风格的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 皮肤：
550C 琥珀终端侧栏、深空 HUD 框架、会跟着鼠标转的 MOSS 红瞳、账户芯片上的实时消耗读数。

- 纯客户端实现：一个 `<style>` 节点 + 一个固定定位的 SVG 覆盖层 + 一个账户芯片
- 零运行时依赖（`dependencies` 为空），无安装期脚本
- Host 半边是空实现，只为满足 DSH bundle 的行装载要求

## 安装

```sh
# npm / 本地目录 / tar 包都可以
dsh plugin --profile web add 550w-moss
dsh plugin --profile web add <本目录绝对路径>
```

桌面版（`desktop` profile）只能用 GUI 安装：**Plugins 面板 → 绝对路径或 tar 包 → 重启**。

安装后皮肤立即生效，并自动切到内置暗色方案（`AUTO_ACTIVATE`）。卸载后完全还原。

## 镜头行为

- **机壳静止**：黑盘、红点环、刻度环都不再旋转，雷达扫掠也停住。
- **虹膜呼吸 + 追踪**：中间的红瞳保持呼吸，并跟随鼠标做全局偏移 —— 鼠标在窗口任意位置
  都能带动，指针停下即停帧。
- **开关**：账户芯片的下拉面板里有一行 `MOSS 追踪`（`role="switch"`）。关掉后虹膜缓回
  正中并停止跟随；选择写进 `localStorage` 的 `moss-550c:track`，重启仍然生效。
  没有历史选择时按系统 `prefers-reduced-motion` 自动取舍。

## 结构

```
550W-MOSS\
├── skin.css          # 全部样式与 DSH 设计令牌（唯一真源）
├── lens.svg          # MOSS 镜头几何
├── src\client.js     # 可读源码（无 import/export，构建时内联）
├── lib\
│   ├── client.js     # 构建产物：window.__ModuleLoader__.load({...}) 单文件
│   └── index.js      # Host 半边（空实现）
├── cordis.patch.yml  # profile 层插入行
└── scripts\
    ├── build.mjs     # 生成 lib/client.js 并在 VM 沙箱里自检
    ├── harness.html  # 裸页面：只挂镜头 / 水印 / 芯片
    └── docs-shots.mjs
```

**改完必须重新构建**，否则 `lib/client.js` 不会更新：

```powershell
node scripts\build.mjs
```

构建会校验：loader 格式、导出、色板作用域、镜头挂载、暗色属性、虹膜追踪层，失败即构建失败。

## 关键实现

- 色板写成 CSS，作用域 `body[data-dsh-skin-moss-550c]`（特异性 0,1,1），
  压过内置 `[data-ds-dark-theme]`（0,1,0），不依赖主题注册表。
- 客户端插件必须是单文件 `window.__ModuleLoader__.load({ id, factory })`；
  用 ESM `import` 会让整个 web boot 失败（`1 entry did not activate`）。
- 对话区抬到 `z-index: 2`、镜头留在 0，保证文字永远压在镜头之上。
- 追踪偏移写在 `.m-iris-track` 外层 `<g>`，呼吸缩放留在 `.m-iris` 内层，互不覆盖；
  偏移以 viewBox 用户单位表示，镜头缩放多少都保持比例。
- 消耗读数取自 `[data-composer-stat]` 药丸（`N tok/s`、`缓存命中 N%`），
  金额由 tok/s 积分后按 `PRICE_OUTPUT_PER_MTOK` 估算。

## 已知限制

- 选择器依赖 DSH 内部结构（`sidebarCol`、`_frame`、`data-conversation-region`、
  `data-composer-seat` 等），宿主大版本升级可能需要跟进。
- 金额是估算：DSH 不提供单价与实时 token 总数。
- 只在 DSH `0.2.1-rc.2` 上实测。

## 许可

MIT，见 LICENSE。视觉灵感来自《流浪地球 2》与 550C 开机动画项目
（Voidpoket / yannicksong0106）；不含第三方美术资源，镜头与 HUD 均为手写 SVG/CSS。
