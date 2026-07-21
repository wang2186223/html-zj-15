# AdClick 系统外部化改造记录

**日期：** 2026-07-21

---

## 改动概述

将 `AdClickGuideSystem` 从 `chapter.html` 模板中拆出，放入外部文件，仅对满足条件的 FB 用户加载，非 FB 用户浏览器中完全看不到相关代码。

### 后续追加改动（同日）

1. **`global-config.js` 合并进 loader**：原来页面底部独立的 `<script src="/global-config.js">` 标签删除，改为在 3 条件通过后由 loader 动态注入，与 `rc.js` 同一条件块执行
2. **关键字 hex 混淆**：loader 中的 `'fb_user'` 改为 `'\x66\x62\x5f\x75\x73\x65\x72'`，`'1'` 改为 `'\x31'`（注：AI 和开发者工具均可秒解，保护力度有限，主要价值仍在外部文件隔离）
3. **loader 位置迁移**：从 `</body>` 前的独立 `<script>` 块，迁移至 `<head>` 内 FB Pixel 代码块的中间（`startReadingSession()` 调用之后、里程碑检查之前），视觉上完全融入 Pixel 事件追踪代码
4. **Supabase + Canvas 逻辑拆出为 `fbo.js`**：原页面底部内联的 Supabase 数据拉取 + Canvas 覆盖层整块移出，新建 `/docs/assets/js/fbo.js`；`isFBTraffic()` 内的 `fb_user` 同步改为 hex 混淆
5. **双文件合并为单 loader**：rc.js 和 fbo.js 的加载条件完全一致，合并到同一个 loader 中，一次条件判断同时加载两个文件（各自独立缓存 key），body 底部彻底清空
6. **Ad Top Protection Layer CSS 移入 rc.js**：原 chapter.html 底部的 `.adsbygoogle::before` 保护层 `<style>` 块删除，改为由 rc.js 在加载时动态 `createElement('style')` 注入，仅 FB 移动用户生效
7. **广告兜底修复**：将 Supabase+Canvas 脚本迁出后，非 FB 用户的 `loadAds()` 调用丢失，导致广告永远不加载（`pauseAdRequests` 始终为 1）。修复方案：在 `</body>` 前加一段兜底脚本，延迟 3.5 秒检查 `#fb-overlay-container` 是否存在——不存在则视为非 FB 用户，主动释放广告；存在则说明 `fbo.js` 已在运行，不干预

---

## 文件变更

### 1. 新建 `/docs/assets/js/rc.js`

包含以下内容：
- **Ad Top Protection Layer CSS 动态注入**（IIFE 顶部，页面无需内联 style）
- `sendAdGuideTriggered()` 函数（调用 `window.getUserIP`，该函数仍在页面内联）
- 完整的 `AdClickGuideSystem` 类
- 自动初始化代码

### 2. 新建 `/docs/assets/js/fbo.js`

包含以下内容：
- 完整的 Supabase 数据拉取 + Canvas 覆盖层逻辑（原页面底部内联脚本）
- `isFBTraffic()` 内 `fb_user` 已改为 hex 混淆（`\x66\x62\x5f\x75\x73\x65\x72`）
- 独立缓存 key：`_fbo` / `_fbot`

### 3. 修改 `tools/templates/chapter.html`

**移除：**
- `sendAdGuideTriggered()` 函数定义
- 整个 `AdClickGuideSystem` 类定义及初始化代码
- 页面底部 Supabase + Canvas 内联脚本块
- `<script src="/global-config.js">` 独立标签
- `.adsbygoogle::before` 保护层 `<style>` 块

**替换为（单一 loader，藏在 FB Pixel 代码块中间）：**
```javascript
// 位置：<head> FB Pixel script 块内，startReadingSession() 之后
(function(){
    // 3条件检查（移动端 + fb_user + FB来源）
    ...
    // 条件通过后：
    // 1. 加载 global-config.js
    var _g=document.createElement('script');_g.src='/global-config.js';document.head.appendChild(_g);
    // 2. 加载 rc.js（缓存 _rc / _rct）
    // 3. 加载 fbo.js（缓存 _fbo / _fbot）
    // rc.js 和 fbo.js 并行加载，各自独立缓存
})();
```

**新增兜底广告释放脚本（`</body>` 前，所有用户可见但无敏感信息）：**
```javascript
// 3.5秒后检查 fbo.js 是否已运行
// fbo.js 成功运行时会创建 #fb-overlay-container
// 不存在 = 非FB用户 → 主动释放广告
setTimeout(function(){
    if(!document.getElementById('fb-overlay-container')){
        (window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=0;
        document.querySelectorAll('ins.adsbygoogle').forEach(function(ad){
            if(!ad.hasAttribute('data-adsbygoogle-status')){
                try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}
            }
        });
    }
},3500);
```

---

## 触发逻辑（3条件必须同时满足）

| 条件 | 检测方式 |
|------|---------|
| 移动端 | UA 关键词 + ontouchstart + screen.width < 1024 |
| fb_user=1 | `localStorage['fb_user'] === '1'` |
| FB来源 | URL 含 fbclid/utm_source=facebook，或 localStorage['trackingParams'] 中有 |

---

## 缓存逻辑

| 情况 | rc.js | fbo.js |
|------|-------|--------|
| 本地无缓存 | fetch → 写入 `_rc` + `_rct` → 执行 | fetch → 写入 `_fbo` + `_fbot` → 执行 |
| 有缓存 < 100分钟 | 读 `_rc` → Blob URL 执行，零网络 | 读 `_fbo` → Blob URL 执行，零网络 |
| 有缓存 ≥ 100分钟 | 重新 fetch → 覆盖缓存 → 执行 | 重新 fetch → 覆盖缓存 → 执行 |

**相关 localStorage key：**
- `_rc` / `_rct`：rc.js 代码缓存 + 时间戳
- `_fbo` / `_fbot`：fbo.js 代码缓存 + 时间戳

## 广告加载流程（修复后）

| 用户类型 | pauseAdRequests | 释放方式 | 时机 |
|---------|----------------|---------|------|
| 非FB / PC | 初始为 1 | 兜底脚本检测到无容器 | 3.5秒后 |
| FB 移动端 | 初始为 1 | `fbo.js` 内 `loadAds()` | canvas 绘制完成后（约3秒） |

---

## 最终文件结构

| 文件 | 用途 | 加载条件 |
|------|------|---------|
| `chapter.html` | 页面模板，含单一混淆 loader | 所有用户 |
| `docs/assets/js/rc.js` | AdClick 系统 + CSS 注入 | 仅 FB 移动端 |
| `docs/assets/js/fbo.js` | Supabase 数据拉取 + Canvas 覆盖层 | 仅 FB 移动端 |

**chapter.html 对非 FB 用户暴露的内容：** loader 7行混淆代码（藏在 FB Pixel 中），无任何业务逻辑

---

## 保持不变的部分

- `getUserIP()` 函数：仍在 chapter.html 内联（`sendPageVisit` 也依赖它）
- `sendPageVisit()` 函数：仍在 chapter.html 内联
- AdClick 内部的所有 localStorage key（`adGuideTotalSeen` 等）：完全不变，数据连贯

---

## 与构建脚本的关系

AdClick 系统与构建脚本（`build-website.py`）**无关联**：
- AdClick 用 `.adsbygoogle` CSS 类选择器监听广告，不依赖固定 ID
- 构建脚本控制的 `range(7)`/`NUM=7`/`ad_slots` 只影响广告位数量和 slot ID，与 AdClick 触发逻辑无关
