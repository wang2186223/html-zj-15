# chapter.html 改动记录（2026-07-19）

| # | 改动类型 | 位置 | 改动内容 | 目的 |
|---|---|---|---|---|
| 1 | 删除 HTML | `<main>` 内容区 | 删除 `#fb-content-placeholder` div（含"Protecting content..."提示 + 90vh 撑高块） | 去掉内容保护占位逻辑 |
| 2 | 删除 JS | Supabase IIFE | 删除 `removePlaceholder()` 函数及全部 5 处调用 | 配合占位块删除 |
| 3 | 新增 CSS | `<style>` 块 | `.text-block`：`overflow:hidden; position:relative; margin-bottom:20px`（无固定高度，自适应内容） | 文字容器外壳 |
| 4 | 新增 CSS | `<style>` 块 | `.text-inner`：`overflow-y:scroll; padding-right:10px; color:transparent`（隐藏原生滚动条，文字默认透明） | 文字内容层 |
| 5 | 新增 CSS | `<style>` 块 | `.text-scrollbar` + `.text-thumb`：右侧 10px 自定义滚动条，含 dark-mode 变体 | 自定义滚动条轨道和滑块 |
| 6 | 改动 HTML | Jinja 模板循环体 | `.text-block` 内新增 `.text-inner` 包裹 `<p>` 标签，同级加 `.text-scrollbar > .text-thumb` | 三层结构：外壳/内容/滚动条 |
| 7 | 新增 HTML | Jinja 模板循环体 | `.text-inner` 顶部加 `<h2 style="font-size:16px;font-weight:bold;font-style:italic">No.{{ loop.index }}</h2>` | 每块显示 No.1 ~ No.7 标题 |
| 8 | 删除 JS | `applyOverlay()` | 移除 `blockH`、`ratio`、`lineHeight`、`marginBottom` 等文字高度调整逻辑 | 不再需要调整真实文字排版 |
| 9 | 修改 JS | `applyOverlay()` | 改为 `block.style.height = canvasH + 'px'`，隐藏 `.text-scrollbar` | canvas 绘制完直接定容器高，让 overflow:hidden 生效裁剪 |
| 10 | 新增 JS | 自定义滚动条 script | 触摸文字区 → `e.preventDefault()` + `window.scrollBy()` 滚整页 | 触摸文字不滚容器内部 |
| 11 | 新增 JS | 自定义滚动条 script | 鼠标滚轮 → `e.preventDefault()` + `window.scrollBy(0, e.deltaY)` 滚整页 | 滚轮也不滚容器内部 |
| 12 | 新增 JS | 自定义滚动条 script | 拖拽 thumb → 设置 `inner.scrollTop`，实时更新 thumb 位置；`ResizeObserver` 监听内容高度变化 | thumb 驱动容器内文字滚动 |
| 13 | 修改 JS | Supabase IIFE | 全部 5 处 `loadAds()` 改为 `restoreText(); setTimeout(loadAds, 1000)` | 广告请求前 1s 先恢复文字显示 |
| 14 | 新增 JS | Supabase IIFE | `restoreText()` 函数：`querySelectorAll('.text-inner').forEach(el => el.style.color = 'inherit')` | 解除文字透明，触发 0.3s 淡入 |

---

## 关键时间轴（非 FB 流量举例）

```
0s    → CSS color:transparent 生效，文字立即不可见
2s    → restoreText()：文字 0.3s 淡入
3s    → loadAds()：广告请求发出，AdSense 开始渲染
```

## 关键说明

- **`overflow:hidden` 生效条件**：`.text-block` 默认无固定高度，`overflow:hidden` 不裁剪；只有 `applyOverlay` 设置 `block.style.height = canvasH` 后才真正裁剪
- **只改 `.text-block` 高度**：canvas 覆盖时只需父容器高度 = canvasH，`.text-inner` 被父级裁剪即可，无需单独设高
- **canvas 结构**：body 层级 `position:absolute` 容器 + canvas 用文档绝对坐标定位，与 AdSense 无层级关系
