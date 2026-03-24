// ==UserScript==
// @name         X (Twitter) 列表批量隐藏 (终极权限突破版)
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  使用 unsafeWindow 穿透 CSP 拦截，附带实时状态雷达
// @match        *://x.com/*
// @match        *://twitter.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    let stolenHeaders = null;
    let isReady = false;

    // ==========================================
    // 1. 上帝视角拦截：使用 unsafeWindow 彻底穿透 CSP 防御
    // ==========================================
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // 劫持 Fetch
    const originalFetch = targetWindow.fetch;
    targetWindow.fetch = function(...args) {
        try {
            const url = args[0];
            const opts = args[1];
            if (opts && opts.headers) {
                let h = {};
                // 兼容提取不同格式的 Headers
                if (opts.headers instanceof targetWindow.Headers || opts.headers instanceof Headers) {
                    for (let [k, v] of opts.headers.entries()) h[k.toLowerCase()] = v;
                } else {
                    for (let k in opts.headers) h[k.toLowerCase()] = opts.headers[k];
                }

                // 只要发现官方的鉴权和防伪造指纹，立刻偷走！
                if (h['authorization'] && h['x-csrf-token']) {
                    if (h['x-client-transaction-id']) {
                        stolenHeaders = h; // 优先获取带有高级事务 ID 的请求
                        isReady = true;
                    } else if (!stolenHeaders) {
                        stolenHeaders = h; // 后备方案
                        isReady = true;
                    }
                }
            }
        } catch(e) {}
        return originalFetch.apply(this, args);
    };

    // 劫持 XHR (以防万一 X 用了老式请求)
    const originalXHR = targetWindow.XMLHttpRequest;
    targetWindow.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalSetRequestHeader = xhr.setRequestHeader;
        let h = {};
        xhr.setRequestHeader = function(name, value) {
            h[name.toLowerCase()] = value;
            if (h['authorization'] && h['x-csrf-token'] && h['x-client-transaction-id']) {
                stolenHeaders = h;
                isReady = true;
            }
            return originalSetRequestHeader.apply(this, arguments);
        };
        return xhr;
    };

    // ==========================================
    // 2. 状态雷达与日志面板
    // ==========================================
    let loggerDiv = null;
    let statusIndicator = null;

    function updateStatusUI() {
        if (!statusIndicator && document.body) {
            statusIndicator = document.createElement('div');
            statusIndicator.style.cssText = 'position: fixed; bottom: 20px; left: 20px; background: rgba(0,0,0,0.85); color: #fff; font-size: 14px; font-weight: bold; z-index: 999999; padding: 12px 20px; border-radius: 8px; border: 2px solid red; box-shadow: 0 4px 10px rgba(0,0,0,0.5); transition: all 0.3s; pointer-events: none;';
            document.body.appendChild(statusIndicator);
        }
        if (statusIndicator) {
            if (isReady) {
                statusIndicator.innerHTML = '🟢 官方安全凭证已截获！现在可点击隐藏。';
                statusIndicator.style.borderColor = '#00ba7c';
                statusIndicator.style.color = '#00ba7c';
            } else {
                statusIndicator.innerHTML = '🔴 正在等待凭证... 请【往下滚动页面】加载新用户！';
                statusIndicator.style.borderColor = 'red';
                statusIndicator.style.color = '#ff4444';
            }
        }
    }

    function logError(msg) {
        if (loggerDiv) {
            loggerDiv.innerHTML += `<div style="margin-top:8px;">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
            loggerDiv.scrollTop = loggerDiv.scrollHeight;
            return;
        }
        loggerDiv = document.createElement('div');
        loggerDiv.style.cssText = 'position: fixed; bottom: 80px; left: 20px; width: 350px; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.85); color: #0f0; font-size: 13px; font-family: monospace; z-index: 999999; padding: 15px; border-radius: 8px; border: 1px solid #0f0; word-wrap: break-word;';
        loggerDiv.innerHTML = '<strong style="color:red;">⚠️ 错误日志</strong><hr style="border-color:#333;"/>' + `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
        document.body.appendChild(loggerDiv);
    }

    // ==========================================
    // 3. 本地缓存系统
    // ==========================================
    let localCache = [];
    try {
        const raw = localStorage.getItem('mute_cache_v10');
        if (raw) localCache = JSON.parse(raw);
    } catch (e) {}

    function saveToCache(handle) {
        handle = handle.toLowerCase();
        if (!localCache.includes(handle)) {
            localCache.push(handle);
            try { localStorage.setItem('mute_cache_v10', JSON.stringify(localCache)); } catch(e) {}
        }
    }

    // ==========================================
    // 4. API 请求（完美伪装）
    // ==========================================
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function muteUser(screenName) {
        if (!stolenHeaders) {
            logError("❌ 请先看左下角状态，确保变成了【🟢 凭证已截获】再点击！");
            return false;
        }

        const apiUrl = window.location.origin + '/i/api/1.1/mutes/users/create.json';
        const reqHeaders = new targetWindow.Headers(); // 使用页面的 Headers 对象

        // 复制被盗取的护照
        for (let k in stolenHeaders) {
            const key = k.toLowerCase();
            // 过滤掉会引发冲突的 Header
            if (key === 'content-type' || key === 'content-length' || key === 'accept-encoding') continue;
            reqHeaders.append(key, stolenHeaders[key]);
        }
        reqHeaders.append('content-type', 'application/x-www-form-urlencoded');

        try {
            const res = await targetWindow.fetch(apiUrl, {
                method: 'POST',
                headers: reqHeaders,
                credentials: 'include',
                body: `screen_name=${encodeURIComponent(screenName)}`
            });

            if (res.ok) return true;

            const errText = await res.text();
            logError(`API 依然被拒: ${res.status}<br>${errText}`);
            return false;
        } catch (e) {
            logError(`请求拦截报错: ${e.message}`);
            return false;
        }
    }

    // ==========================================
    // 5. 稳定 UI 渲染 (绝对不死)
    // ==========================================
    function processDOM() {
        try {
            const rows = document.querySelectorAll('div[data-testid="cellInnerDiv"]');

            rows.forEach(row => {
                if (row.dataset.yukiMute === "1") return;

                let handle = null;
                let targetDiv = null;

                const spans = row.querySelectorAll('span');
                for (let span of spans) {
                    const text = span.textContent.trim();
                    if (text.startsWith('@') && text.length > 2 && !text.includes(' ')) {
                        handle = text.substring(1);
                        targetDiv = span.parentElement;
                        break;
                    }
                }

                if (!handle || !targetDiv) return;
                row.dataset.yukiMute = "1";

                if (localCache.includes(handle.toLowerCase())) {
                    row.style.opacity = '0.3';
                    row.style.pointerEvents = 'none';
                    return;
                }

                const btn = document.createElement('button');
                btn.innerText = '🔇 隐藏';
                btn.className = 'list-mute-btn';
                btn.style.cssText = 'background: #f91880; color: white; border: none; border-radius: 4px; font-size: 12px; font-weight: bold; margin-left: 10px; padding: 4px 8px; cursor: pointer; z-index: 10;';

                btn.onclick = async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (btn.disabled) return;

                    btn.innerText = '⏳...';
                    btn.style.background = '#71767b';
                    btn.disabled = true;

                    const success = await muteUser(handle);

                    if (success) {
                        btn.innerText = '✔️ 已隐藏';
                        btn.style.background = '#00ba7c';
                        saveToCache(handle);
                        row.style.opacity = '0.3';
                        row.style.pointerEvents = 'none';
                    } else {
                        btn.innerText = '❌ 失败';
                        btn.style.background = 'red';
                        btn.disabled = false;
                    }
                };

                targetDiv.style.display = 'flex';
                targetDiv.style.alignItems = 'center';
                targetDiv.appendChild(btn);
            });
        } catch (e) {}
    }

    // ==========================================
    // 6. 批量按钮
    // ==========================================
    function checkBatchButton() {
        if (document.getElementById('yuki-batch-btn')) return;

        const container = document.createElement('div');
        container.id = 'yuki-batch-btn';
        container.style.cssText = 'position: fixed; bottom: 30px; right: 30px; z-index: 9999;';

        const batchBtn = document.createElement('button');
        batchBtn.innerText = '⚠️ 批量 Mute 当前页';
        batchBtn.style.cssText = 'background: #f91880; color: white; border: none; border-radius: 9999px; padding: 12px 24px; font-size: 15px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(249,24,128,0.4);';

        batchBtn.onclick = async () => {
            if (!isReady) {
                alert("请先看左下角状态，往下滚动页面，等雷达变成【🟢 凭证已截获】后再开始批量操作！");
                return;
            }

            const btns = document.querySelectorAll('.list-mute-btn');
            const activeBtns = Array.from(btns).filter(b => b.innerText === '🔇 隐藏');

            if (activeBtns.length === 0) {
                alert('当前屏幕没有找到可隐藏的用户。\n请向下滚动加载更多。');
                return;
            }

            if (!confirm(`将以 1.5 秒/个 的速度隐藏 ${activeBtns.length} 个用户。`)) return;

            batchBtn.style.background = '#71767b';
            batchBtn.disabled = true;

            let count = 0;
            for (let b of activeBtns) {
                b.click();
                count++;
                batchBtn.innerText = `⏳ 处理中 (${count}/${activeBtns.length})...`;
                await sleep(1500);
            }

            batchBtn.innerText = '✅ 批量执行完毕';
            batchBtn.style.background = '#00ba7c';
            setTimeout(() => {
                batchBtn.innerText = '⚠️ 批量 Mute 当前页';
                batchBtn.style.background = '#f91880';
                batchBtn.disabled = false;
            }, 3000);
        };

        container.appendChild(batchBtn);
        document.body.appendChild(container);
    }

    // 启动引擎
    const initTimer = setInterval(() => {
        if (document.body) {
            clearInterval(initTimer);
            setInterval(() => {
                updateStatusUI();
                processDOM();
                checkBatchButton();
            }, 1000);
        }
    }, 50);

})();