# JS Canvas 内容覆盖方案文档

更新日期：2026-07-03

---

## 一、整体目标

FB 流量用户打开章节页时，用 canvas 把 Supabase 上的内容画在原始 `<p>` 文字上面，SEO 保留原始 HTML，DevTools 无法直接选中文字内容。

---

## 二、触发条件（双重判断）

```javascript
function isFBTraffic() {
  // 条件1：浏览器有 fb_user = '1'（在小说详情页点击过任意按钮注入）
  var hasFbUser = localStorage.getItem('fb_user') === '1';
  if (!hasFbUser) return false;

  // 条件2：URL 或 localStorage 有 FB 参数
  var p = new URLSearchParams(window.location.search);
  if (p.has('fbclid') || p.get('utm_source') === 'facebook') return true;
  try {
    var s = JSON.parse(localStorage.getItem('trackingParams') || '{}');
    if (s.fbclid || s.utm_source === 'facebook') return true;
  } catch (e) {}
  return false;
}
```

### fb_user 注入逻辑（novel.html）

```javascript
// 用户在小说详情页点击任意按钮时注入
document.addEventListener('click', function () {
    localStorage.setItem('fb_user', '1');
}, { once: true });
```

- 覆盖：返回、首页、logo、图书馆、开始阅读、继续阅读、筛选按钮、所有章节链接
- 存储在 localStorage，同域名永久有效，URL 不显示

---

## 三、Canvas 覆盖结构（与 AdGuide overlay 完全一致）

### DOM 结构

```html
<body>
  <div id="fb-overlay-container"   ← position:absolute; top:0; left:0; 100%x100%
    <canvas class="fb-ov">         ← top = rect.top + scrollY（文档绝对坐标）
    <canvas class="fb-ov">
    ...（7个，对应7个文字块）
```

### 关键原理

| 属性 | 值 | 说明 |
|------|-----|------|
| 容器 position | `absolute` | 随文档滚动，不是 fixed，零延迟 |
| canvas top | `rect.top + window.scrollY` | 文档绝对坐标，与 AdGuide tooltip 同原理 |
| pointer-events | `none` | 不拦截点击，广告可正常点击 |
| z-index | `50` | 在文字之上，header(100) 之下 |
| 背景色 | 浅色 `#FFFFFF` / 深色 `#1C1C1E` | 跟随浏览器主题，视觉无缝融入 |

### 位置更新机制

```javascript
// 监听 .content 高度变化（广告加载导致父容器撑高 = 文字块位置改变）
var contentEl = document.querySelector('.content');
if (contentEl) {
  new ResizeObserver(function () {
    var canvases = container.querySelectorAll('canvas.fb-ov');
    blocks.forEach(function (block, i) {
      var cv = canvases[i]; if (!cv) return;
      var r = block.getBoundingClientRect();
      cv.style.top  = (r.top  + window.scrollY) + 'px';
      cv.style.left = (r.left + window.scrollX) + 'px';
    });
  }).observe(contentEl);
}
```

---

## 四、7块内容分组逻辑

```javascript
if (paras.length >= 7) {
  // 段落数足够：按段平分到 7 块
  var grpSize = Math.ceil(paras.length / 7);
  for (var g = 0; g < 7; g++) {
    var s = g * grpSize, e = Math.min(s + grpSize, paras.length);
    groups.push(s < paras.length ? paras.slice(s, e) : [' ']);
  }
} else {
  // 段落不足 7 段：打散成单词，按词平分到 7 块
  var allWords = [];
  paras.forEach(p => p.trim().split(/\s+/).forEach(w => { if (w) allWords.push(w); }));
  while (allWords.length < 7) allWords.push(' '); // 不足7个词时用空格补位
  var wPerGrp = Math.ceil(allWords.length / 7);
  for (var g = 0; g < 7; g++) {
    var s = g * wPerGrp, e = Math.min(s + wPerGrp, allWords.length);
    groups.push([s < allWords.length ? allWords.slice(s, e).join(' ') : ' ']);
  }
}
```

---

## 五、文字块高度配平逻辑

```
① 先算 canvas 需要的高度：
   textH = Σ(lineH per line) + Σ(pGap per paragraph gap)
   canvasH = Math.ceil(textH + lineH + pGap)   ← 加一行高+段间距作为安全边距

② 再把文字块强制锁定为同样高度：
   block.style.height = canvasH + 'px'
   block.style.overflow = 'hidden'
   block.style.lineHeight = (lineH * ratio) + 'px'   ← 等比缩放行高
   p.style.marginBottom = (pGap * ratio) + 'px'      ← 等比缩放段间距（不改字号）

   ratio = canvasH / blockH（原始高度）
```

- `canvasH > blockH`：原文更短，行高拉大适配
- `canvasH < blockH`：原文更长，行高压缩适配
- **不改字号**，只用行高和段间距控制

---

## 六、Canvas 绘制

- 使用 `ctx.textBaseline = 'top'`
- 非段落最后一行用两端对齐（justify）
- 段落最后一行左对齐
- 支持 Retina（devicePixelRatio）

```javascript
var y = 1;
lines.forEach(function (l) {
  var ws = l.text.split(' ');
  if (!l.lastInPara && ws.length > 1) {
    // 两端对齐
    var wW = ws.reduce((a, w) => a + ctx.measureText(w).width, 0);
    var gap = (maxW - wW) / (ws.length - 1), x = 0;
    ws.forEach(w => { ctx.fillText(w, x, y); x += ctx.measureText(w).width + gap; });
  } else {
    ctx.fillText(l.text, 0, y); // 左对齐
  }
  y += lineH;
  if (l.gap) y += pGap;
});
```

---

## 七、Supabase 数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| novel_id | text | 5位零填充，如 `'00001'` |
| chapter_id | int | 章节编号 |
| title | text | 章节标题 |
| content | text | 内容，段落用 `\n\n` 分隔 |

URL 格式：`/novels/{novel_id}/{chapter_id}`（chapter_id 纯数字）

---

## 八、占位块逻辑

```html
<!-- 非FB用户和FB用户均在加载后删除 -->
<div id="fb-content-placeholder">
  <p>Protecting content, please wait...</p>
  <div style="min-height:90vh;"></div>  <!-- 把真实正文推到屏幕外 -->
</div>
```

- FB用户：fetch Supabase → 删除占位块 → 2个 rAF → 绘制 canvas
- 非FB用户：立即删除占位块，显示原始正文

---

## 九、z-index 层级

| 元素 | z-index |
|------|---------|
| 正文 `<p>` | 默认 |
| canvas 覆盖层 | 50 |
| sticky header | 100 |
| AdGuide 浮层 | 10000+ |
| AdGuide tooltip | 20000 |

---

## 十、关键配置

| 配置项 | 值 |
|--------|-----|
| Supabase URL | `https://czqmqnvqkugzpgwfmyth.supabase.co` |
| Supabase Key | `sb_publishable_FF8-Z6gbAyjvHK77w4QfGw_02nCOhaw` |
| AdSense ID | `ca-pub-5678834518894660` |
| FB Pixel | `9481513911889537` |
| GA4 | `G-YKK2QRZ5GC` |
| 文字块数量 | 7块（对应7段广告） |
| canvas z-index | 50 |
