# AdClick 系统外部化改造记录

**日期：** 2026-07-21

---

## 改动概述

将 `AdClickGuideSystem` 从 `chapter.html` 模板中拆出，放入外部文件，仅对满足条件的 FB 用户加载，非 FB 用户浏览器中完全看不到相关代码。

---

## 文件变更

### 1. 新建 `/docs/assets/js/rc.js`

包含以下内容：
- `sendAdGuideTriggered()` 函数（原在 chapter.html 统计脚本块中，移至此处；调用 `window.getUserIP`，该函数仍在页面内联脚本中定义）
- 完整的 `AdClickGuideSystem` 类
- 自动初始化代码（兼容 DOMContentLoaded 已触发的情况）

### 2. 修改 `tools/templates/chapter.html`

**移除：**
- `sendAdGuideTriggered()` 函数定义（从统计脚本块中删除）
- 整个 `AdClickGuideSystem` 类定义及初始化代码

**替换为（混淆 Loader，约 7 行）：**
```javascript
/* v:init */
(function(){
    var _a = navigator.userAgent.toLowerCase();
    var _m = /mobile|android|iphone|ipad|ipod|blackberry|iemobile/.test(_a)
             || 'ontouchstart' in window
             || (navigator.maxTouchPoints || 0) > 0
             || screen.width < 1024;
    if (!_m) return;                                          // 条件1：移动端
    if (localStorage.getItem('fb_user') !== '1') return;     // 条件2：fb_user=1
    var _q = new URLSearchParams(location.search);
    var _f = _q.has('fbclid') || _q.get('utm_source') === 'facebook';
    if (!_f) {
        try {
            var _p = JSON.parse(localStorage.getItem('trackingParams') || '{}');
            _f = !!(_p.fbclid || _p.utm_source === 'facebook');
        } catch(e) {}
    }
    if (!_f) return;                                          // 条件3：FB来源

    var _K='_rc', _T='_rct', _D=6e6, _N=Date.now();          // 100分钟=6000000ms
    var _C = localStorage.getItem(_K);
    var _S = parseInt(localStorage.getItem(_T) || '0');

    function _X(c) {                                          // Blob URL 执行
        try {
            var b = new Blob([c], {type:'text/javascript'});
            var u = URL.createObjectURL(b);
            var s = document.createElement('script');
            s.src = u;
            s.onload = function(){ URL.revokeObjectURL(u); };
            document.head.appendChild(s);
        } catch(e) {}
    }

    if (_C && (_N - _S) < _D) {
        _X(_C);                                               // 缓存未过期：用本地缓存
    } else {
        fetch('/assets/js/rc.js')                             // 缓存不存在或已过期：重新拉取
            .then(function(r){ return r.text(); })
            .then(function(c){
                try {
                    localStorage.setItem(_K, c);              // 写入缓存
                    localStorage.setItem(_T, '' + _N);        // 记录时间戳
                } catch(e) {}
                _X(c);
            }).catch(function(){});
    }
})();
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

| 情况 | 行为 |
|------|------|
| 本地无缓存 | fetch rc.js → 写入 `localStorage['_rc']` + 时间戳 → 执行 |
| 有缓存且 < 100分钟 | 直接读 `localStorage['_rc']` → Blob URL 执行，零网络请求 |
| 有缓存但 ≥ 100分钟 | fetch rc.js → 覆盖缓存 → 执行 |

**相关 localStorage key：**
- `_rc`：缓存的 JS 代码字符串
- `_rct`：上次写入的时间戳（毫秒）

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
