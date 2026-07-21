# AdClick 系统外部化改造记录

**日期：** 2026-07-21

---

## 最终文件结构

| 文件 | 用途 | 加载条件 |
|------|------|---------|
| `chapter.html` | 页面模板，含单一混淆 loader | 所有用户 |
| `docs/assets/js/rc.js` | AdClick 系统（sendAdGuideTriggered + AdClickGuideSystem） | 仅 FB 移动端 |
| `docs/assets/js/fbo.js` | Supabase 数据拉取 + Canvas 覆盖层 | 仅 FB 移动端 |

---

## 触发逻辑（3条件必须同时满足）

| 条件 | 检测方式 |
|------|---------|
| 移动端 | UA 关键词 + ontouchstart + screen.width < 1024 |
| fb_user=1 | `localStorage['\x66\x62\x5f\x75\x73\x65\x72'] === '\x31'` |
| FB来源 | URL 含 fbclid/utm_source=facebook，或 localStorage['trackingParams'] 中有 |

---

## chapter.html 关键结构

### `<head>` 内（按顺序）

**1. Ad Click Monitoring CSS（静态，对所有用户生效）**
```css
.adsbygoogle { position: relative !important }
.adsbygoogle::before { content:""; position:absolute; top:0; left:0;
    width:100%; height:35px; background:transparent;
    pointer-events:auto; z-index:999999!important; display:block!important }
```

**2. FB 文字隐藏（3条件全满足才生效）**
```javascript
// 检查：移动端 + fb_user=1 + FB来源
document.documentElement.classList.add('fb-hide-text');
// CSS: html.fb-hide-text .text-inner { color: var(--bg-color) }
// → 白底白字 / 黑底黑字，文字视觉上不可见
```

**3. FB Pixel 代码块中间（混淆 loader，3条件才触发）**
```javascript
// 条件通过后：
// 1. 动态加载 global-config.js
// 2. 加载 rc.js（缓存 _rc / _rct，100分钟有效）
// 3. 加载 fbo.js（缓存 _fbo / _fbot，100分钟有效）
// 两文件并行加载，Blob URL 执行
```

### `</body>` 前（15秒兜底，对所有用户）

```javascript
setTimeout(function(){
    // 无论如何先复原文字
    document.documentElement.classList.remove('fb-hide-text');
    document.querySelectorAll('.text-inner').forEach(el => el.style.color='');
    // 如果 fbo.js 没有运行（非FB用户），主动释放广告
    if(!document.getElementById('fb-overlay-container')){
        pauseAdRequests = 0;
        push all ads;
    }
}, 15000);
```

---

## 广告加载流程

| 用户类型 | pauseAdRequests 初始 | 释放方式 | 时机 |
|---------|---------------------|---------|------|
| 非FB / PC | 1（阻断） | 兜底脚本（无容器） | 15秒后 |
| FB 移动端 | 1（阻断） | `fbo.js` 内 `loadAds()` | canvas 绘制完成后（约3秒） |

**防双重加载：** 兜底脚本检查 `#fb-overlay-container`，fbo.js 正常运行时容器已存在，兜底跳过广告释放。

---

## 缓存逻辑

| 情况 | 行为 |
|------|------|
| 本地无缓存 | fetch 文件 → 写入 localStorage + 时间戳 → 执行 |
| 有缓存 < 100分钟 | 直接读 localStorage → Blob URL 执行，零网络请求 |
| 有缓存 ≥ 100分钟 | 重新 fetch → 覆盖缓存 → 执行 |

**localStorage key：** `_rc`/`_rct`（rc.js）、`_fbo`/`_fbot`（fbo.js）

---

## 保持不变的部分

- `getUserIP()` / `sendPageVisit()`：仍在 chapter.html 内联（所有用户需要）
- AdClick 的 localStorage key（`adGuideTotalSeen` 等）：完全不变，数据连贯
- 构建脚本（`build-website.py`）：AdClick 用 `.adsbygoogle` 类选择器，与构建脚本无关联

