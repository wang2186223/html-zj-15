(function () {
    'use strict';

    // Inject ad top protection layer CSS
    (function(){
        var st=document.createElement('style');
        st.textContent='.adsbygoogle{position:relative!important}.adsbygoogle::before{content:\'\';position:absolute;top:0;left:0;width:100%;height:35px;background:transparent;pointer-events:auto;z-index:999999!important;display:block!important}';
        document.head.appendChild(st);
    })();

    function sendAdGuideTriggered(eventData) {
        var _gip = typeof getUserIP === 'function' ? getUserIP : function () { return Promise.resolve('Unknown'); };
        _gip().then(function (userIP) {
            var data = {
                eventType: 'ad_guide_triggered',
                page: window.location.href,
                userAgent: navigator.userAgent,
                referrer: document.referrer || 'direct',
                userIP: userIP,
                totalAdsSeen: eventData.totalAdsSeen || 0,
                currentPageAds: eventData.currentPageAds || 0,
                triggerCount: eventData.triggerCount || 0,
                maxTriggers: eventData.maxTriggers || 3,
                timestamp: new Date().toISOString()
            };
            fetch('https://script.google.com/macros/s/AKfycbwG47detdUdOk74PhJYtbgqxl9DC1xUrhxkcGD8SVoQES-e42GPtM58gftv-UhKp-IJ/exec', {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(function () {});
        }).catch(function () {
            var data = {
                eventType: 'ad_guide_triggered',
                page: window.location.href,
                userAgent: navigator.userAgent,
                referrer: document.referrer || 'direct',
                userIP: 'Unknown',
                totalAdsSeen: eventData.totalAdsSeen || 0,
                currentPageAds: eventData.currentPageAds || 0,
                triggerCount: eventData.triggerCount || 0,
                maxTriggers: eventData.maxTriggers || 3,
                timestamp: new Date().toISOString()
            };
            fetch('https://script.google.com/macros/s/AKfycbwG47detdUdOk74PhJYtbgqxl9DC1xUrhxkcGD8SVoQES-e42GPtM58gftv-UhKp-IJ/exec', {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(function () {});
        });
    }

    class AdClickGuideSystem {
        constructor() {
            this.isPCBrowser = this.detectPCBrowser();
            if (this.isPCBrowser) return;

            this.REQUIRED_ADS = this.getOrGenerateRequiredAds();
            this.TRIGGER_PROBABILITY = 0.80;
            this.COOLDOWN_MINUTES = 20;
            this.MAX_TRIGGERS = 3;
            this.TRIGGER_COOLDOWN_HOURS = 6;

            this.currentPageAds = [];
            this.isGuideActive = false;
            this.isDebugMode = false;
            this.observer = null;
            this.debugPanel = null;

            this.totalAdsSeen = this.getTotalAdsSeen();
            this.triggerCount = this.getTriggerCount();

            this.scrollMonitorInterval = null;
            this.targetScrollPosition = null;
            this.themeClickCount = 0;
            this.themeClickTimer = null;

            this.init();
        }

        detectPCBrowser() {
            const userAgent = navigator.userAgent.toLowerCase();
            const mobileKeywords = ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'iemobile', 'opera mini', 'webos'];
            const isMobile = mobileKeywords.some(keyword => userAgent.includes(keyword));
            const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const isSmallScreen = window.screen.width < 1024;
            return !isMobile && !hasTouchScreen && !isSmallScreen;
        }

        getOrGenerateRequiredAds() {
            const stored = localStorage.getItem('adGuideRequiredAds');
            if (stored) return parseInt(stored);
            const randomAds = Math.floor(Math.random() * 58) + 3;
            localStorage.setItem('adGuideRequiredAds', randomAds.toString());
            return randomAds;
        }

        getTotalAdsSeen() {
            const stored = localStorage.getItem('adGuideTotalSeen');
            return stored ? parseInt(stored) : 0;
        }
        saveTotalAdsSeen() { localStorage.setItem('adGuideTotalSeen', this.totalAdsSeen.toString()); }

        getTriggerCount() {
            const stored = localStorage.getItem('adGuideTriggerCount');
            return stored ? parseInt(stored) : 0;
        }
        saveTriggerCount() { localStorage.setItem('adGuideTriggerCount', this.triggerCount.toString()); }

        getTriggerCooldownReset() {
            const stored = localStorage.getItem('adGuideTriggerCooldownReset');
            return stored ? parseInt(stored) : 0;
        }
        saveTriggerCooldownReset(timestamp) { localStorage.setItem('adGuideTriggerCooldownReset', timestamp.toString()); }

        init() {
            if (this.isPCBrowser) return;
            this.checkAndResetIfLongAbsence();
            this.setupAdObserver();
            this.setupDebugMode();
            this.setupPageVisibilityHandler();
            this.startPeriodicCheck();
        }

        checkAndResetIfLongAbsence() {
            const lastActiveTime = localStorage.getItem('adGuideLastActiveTime');
            const now = Date.now();
            if (lastActiveTime) {
                const timeSinceLastActive = now - parseInt(lastActiveTime);
                if (timeSinceLastActive > 60 * 60 * 1000) {
                    this.resetAllData();
                }
            }
            this.updateLastActiveTime();
        }

        updateLastActiveTime() { localStorage.setItem('adGuideLastActiveTime', Date.now().toString()); }

        setupAdObserver() {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) this.checkAdValidity(entry.target);
                });
            }, { threshold: 0.1, rootMargin: '50px' });

            setTimeout(() => {
                if (!document.getElementById('fb-overlay-container')) return;
                this.startAdMonitoring();
            }, 10000);
        }

        startAdMonitoring() {
            const checkForAds = () => {
                document.querySelectorAll('.adsbygoogle, ins[data-ad-client]').forEach(ad => {
                    if (!ad.dataset.guideMonitored) {
                        ad.dataset.guideMonitored = 'true';
                        this.observer.observe(ad);
                    }
                });
            };
            checkForAds();
            setInterval(checkForAds, 2000);
        }

        checkAdValidity(adElement) {
            if (this.isPCBrowser) return;
            const rect = adElement.getBoundingClientRect();
            const isValidHeight = rect.height > 100 && rect.height <= 650;
            const isFilled = adElement.dataset.adStatus === 'filled' ||
                adElement.querySelector('iframe') !== null ||
                adElement.innerHTML.includes('googleads');

            if (isValidHeight && isFilled && !this.currentPageAds.includes(adElement)) {
                this.currentPageAds.push(adElement);
                this.totalAdsSeen++;
                this.saveTotalAdsSeen();
                this.updateDebugInfo();
                if (this.totalAdsSeen >= this.REQUIRED_ADS) this.considerTriggeringGuide();
            }
        }

        considerTriggeringGuide() {
            if (!this.canTriggerByCount()) return;
            if (!this.canTrigger()) return;
            if (Math.random() < this.TRIGGER_PROBABILITY) {
                this.triggerGuide();
            } else {
                this.recordTriggerAttempt();
            }
        }

        canTriggerByCount() {
            if (this.triggerCount < this.MAX_TRIGGERS) return true;
            const resetTime = this.getTriggerCooldownReset();
            if (Date.now() >= resetTime) {
                this.triggerCount = 0;
                this.saveTriggerCount();
                this.saveTriggerCooldownReset(0);
                return true;
            }
            return false;
        }

        canTrigger() {
            const lastTrigger = localStorage.getItem('adGuideLastTrigger');
            if (!lastTrigger) return true;
            return (Date.now() - parseInt(lastTrigger)) >= (this.COOLDOWN_MINUTES * 60 * 1000);
        }

        recordTriggerAttempt() { localStorage.setItem('adGuideLastTrigger', Date.now().toString()); }

        triggerGuide() {
            if (this.isPCBrowser || this.isGuideActive) return;
            this.isGuideActive = true;
            this.recordTriggerAttempt();
            this.triggerCount++;
            this.saveTriggerCount();
            if (this.triggerCount >= this.MAX_TRIGGERS) {
                this.saveTriggerCooldownReset(Date.now() + (this.TRIGGER_COOLDOWN_HOURS * 60 * 60 * 1000));
            }
            const targetAd = this.currentPageAds[this.currentPageAds.length - 1];
            if (!targetAd) return;
            this.scrollToAdCenter(targetAd);
            setTimeout(() => {
                this.showGuideOverlay(targetAd);
                this.restrictUserInteraction(targetAd);
                this.startScrollMonitoring();
            }, 500);
        }

        scrollToAdCenter(adElement) {
            const rect = adElement.getBoundingClientRect();
            this.targetScrollPosition = window.scrollY + rect.top - (window.innerHeight / 2) + (rect.height / 2);
            window.scrollTo({ top: this.targetScrollPosition, behavior: 'smooth' });
        }

        startScrollMonitoring() {
            if (this.scrollMonitorInterval) clearInterval(this.scrollMonitorInterval);
            this.scrollMonitorInterval = setInterval(() => {
                if (!this.isGuideActive) { this.stopScrollMonitoring(); return; }
                if (this.targetScrollPosition !== null) {
                    if (Math.abs(window.scrollY - this.targetScrollPosition) > 50) {
                        window.scrollTo({ top: this.targetScrollPosition, behavior: 'smooth' });
                    }
                }
            }, 1000);
        }

        stopScrollMonitoring() {
            if (this.scrollMonitorInterval) {
                clearInterval(this.scrollMonitorInterval);
                this.scrollMonitorInterval = null;
                this.targetScrollPosition = null;
            }
        }

        reportGuideTriggered() {
            if (typeof gtag !== 'undefined') {
                gtag('event', 'ad_guide_triggered', {
                    'event_category': 'Ad Guide', 'event_label': 'Guide Overlay Shown',
                    'total_ads_seen': this.totalAdsSeen, 'current_page_ads': this.currentPageAds.length,
                    'trigger_count': this.triggerCount, 'max_triggers': this.MAX_TRIGGERS, 'value': 1
                });
            }
            sendAdGuideTriggered({
                totalAdsSeen: this.totalAdsSeen, currentPageAds: this.currentPageAds.length,
                triggerCount: this.triggerCount, maxTriggers: this.MAX_TRIGGERS
            });
        }

        showGuideOverlay(targetAd) {
            this.reportGuideTriggered();
            const overlay = document.createElement('div');
            overlay.id = 'ad-guide-overlay';
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10000;pointer-events:none;';

            const rect = targetAd.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

            const highlight = document.createElement('div');
            highlight.style.cssText = `position:absolute;top:${rect.top+scrollTop-10}px;left:${rect.left+scrollLeft-10}px;width:${rect.width+20}px;height:${rect.height+20}px;border:3px solid #FF0000;border-radius:8px;box-shadow:0 0 20px rgba(255,0,0,0.6);animation:pulse 2s infinite;pointer-events:none;z-index:14000;`;

            const tooltip = document.createElement('div');
            tooltip.style.cssText = `position:absolute;top:${rect.top+scrollTop-80}px;left:${rect.left+scrollLeft}px;width:${Math.max(rect.width,300)}px;background:#007AFF;color:white;padding:12px 16px;border-radius:8px;font-size:14px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.2);pointer-events:none;z-index:20000;animation:bounce 0.6s ease-in-out infinite;`;
            tooltip.textContent = 'Please click an AD and watch it for 10s to keep reading. Thank you!!!!👇👇👇 👇👇👇 👇👇👇';

            if (!document.getElementById('guide-animation-styles')) {
                const style = document.createElement('style');
                style.id = 'guide-animation-styles';
                style.textContent = '@keyframes pulse{0%{box-shadow:0 0 20px rgba(255,0,0,0.6)}50%{box-shadow:0 0 30px rgba(255,0,0,0.9)}100%{box-shadow:0 0 20px rgba(255,0,0,0.6)}}@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}';
                document.head.appendChild(style);
            }

            overlay.appendChild(highlight);
            overlay.appendChild(tooltip);
            document.body.appendChild(overlay);

            this.updateOverlayPosition = () => {
                if (!overlay || !overlay.parentNode) return;
                const r = targetAd.getBoundingClientRect();
                const st = window.pageYOffset || document.documentElement.scrollTop;
                const sl = window.pageXOffset || document.documentElement.scrollLeft;
                highlight.style.top = `${r.top+st-10}px`; highlight.style.left = `${r.left+sl-10}px`;
                tooltip.style.top = `${r.top+st-80}px`; tooltip.style.left = `${r.left+sl}px`;
            };
            window.addEventListener('scroll', this.updateOverlayPosition, { passive: true });
            window.addEventListener('resize', this.updateOverlayPosition, { passive: true });
            this.enableAdClick(targetAd);
        }

        enableAdClick(targetAd) {
            targetAd.addEventListener('click', () => this.endGuide(), { once: true });
            setTimeout(() => { if (this.isGuideActive) this.endGuide(); }, 200000);
        }

        restrictUserInteraction(targetAd) {
            const interactionBlocker = document.createElement('div');
            interactionBlocker.id = 'interaction-blocker';
            interactionBlocker.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:rgba(255,255,255,0.1);';

            const updateBlockerClipPath = () => {
                const rect = targetAd.getBoundingClientRect();
                interactionBlocker.style.clipPath = `polygon(evenodd,0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.right}px ${rect.top}px,${rect.right}px ${rect.bottom}px,${rect.left}px ${rect.bottom}px,${rect.left}px ${rect.top}px)`;
            };
            updateBlockerClipPath();
            this.updateBlockerClipPath = updateBlockerClipPath;
            window.addEventListener('scroll', this.updateBlockerClipPath, { passive: true });
            window.addEventListener('resize', this.updateBlockerClipPath, { passive: true });

            this.preventUserScroll = (e) => {
                if (e.type === 'wheel' || e.type === 'touchmove') { e.preventDefault(); e.stopPropagation(); }
            };
            document.addEventListener('wheel', this.preventUserScroll, { passive: false });
            document.addEventListener('touchmove', this.preventUserScroll, { passive: false });
            document.addEventListener('keydown', this.preventUserScroll, { passive: false });
            document.body.appendChild(interactionBlocker);
        }

        restoreUserInteraction() {
            document.body.style.overflow = '';
            if (this.updateBlockerClipPath) {
                window.removeEventListener('scroll', this.updateBlockerClipPath);
                window.removeEventListener('resize', this.updateBlockerClipPath);
                this.updateBlockerClipPath = null;
            }
            if (this.preventUserScroll) {
                document.removeEventListener('wheel', this.preventUserScroll);
                document.removeEventListener('touchmove', this.preventUserScroll);
                document.removeEventListener('keydown', this.preventUserScroll);
                this.preventUserScroll = null;
            }
            const blocker = document.getElementById('interaction-blocker');
            if (blocker) blocker.remove();
        }

        endGuide() {
            this.isGuideActive = false;
            this.stopScrollMonitoring();
            if (this.updateOverlayPosition) {
                window.removeEventListener('scroll', this.updateOverlayPosition);
                window.removeEventListener('resize', this.updateOverlayPosition);
                this.updateOverlayPosition = null;
            }
            const overlay = document.getElementById('ad-guide-overlay');
            if (overlay) overlay.remove();
            this.restoreUserInteraction();
        }

        setupPageVisibilityHandler() {
            let pageHiddenTime = null;
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    pageHiddenTime = Date.now();
                    this.updateLastActiveTime();
                } else {
                    this.checkAndResetIfLongAbsence();
                    if (pageHiddenTime) {
                        const hiddenDuration = Date.now() - pageHiddenTime;
                        if (hiddenDuration <= 11000) {
                            this.showShortLeaveNotification();
                        } else {
                            if (this.isGuideActive) this.endGuide();
                            this.showThankYouNotification();
                        }
                    }
                    pageHiddenTime = null;
                    this.updateLastActiveTime();
                }
            });
        }

        showShortLeaveNotification() {
            if (document.getElementById('short-leave-notification')) return;
            const n = document.createElement('div');
            n.id = 'short-leave-notification';
            n.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 30px;border-radius:12px;font-size:18px;font-weight:500;z-index:50000;text-align:center;';
            n.textContent = 'Less than 10 seconds';
            document.body.appendChild(n);
            setTimeout(() => { if (n && n.parentNode) n.remove(); }, 2000);
        }

        showThankYouNotification() {
            if (document.getElementById('thank-you-notification')) return;
            const n = document.createElement('div');
            n.id = 'thank-you-notification';
            n.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:transparent;color:transparent;padding:25px 35px;border-radius:16px;z-index:50000;opacity:0;pointer-events:none;';
            n.textContent = 'Thank you for your AD browsing';
            document.body.appendChild(n);
            setTimeout(() => { if (n && n.parentNode) n.remove(); }, 3000);
        }

        setupDebugMode() {
            const themeBtn = document.getElementById('theme-btn');
            if (!themeBtn) return;
            themeBtn.addEventListener('click', () => {
                this.themeClickCount++;
                if (this.themeClickTimer) clearTimeout(this.themeClickTimer);
                this.themeClickTimer = setTimeout(() => { this.themeClickCount = 0; }, 2000);
                if (this.themeClickCount === 4) { this.toggleDebugMode(); this.themeClickCount = 0; }
            });
        }

        toggleDebugMode() {
            this.isDebugMode = !this.isDebugMode;
            this.isDebugMode ? this.showDebugPanel() : this.hideDebugPanel();
        }

        showDebugPanel() {
            if (this.debugPanel) return;
            this.debugPanel = document.createElement('div');
            this.debugPanel.id = 'ad-guide-debug';
            this.debugPanel.style.cssText = 'position:fixed;top:10px;right:10px;width:250px;background:rgba(0,0,0,0.9);color:white;padding:15px;border-radius:8px;font-size:12px;z-index:20000;font-family:monospace;';
            document.body.appendChild(this.debugPanel);
            this.updateDebugInfo();
            this.debugUpdateInterval = setInterval(() => this.updateDebugInfo(), 1000);
        }

        hideDebugPanel() {
            if (this.debugPanel) { this.debugPanel.remove(); this.debugPanel = null; }
            if (this.debugUpdateInterval) { clearInterval(this.debugUpdateInterval); this.debugUpdateInterval = null; }
        }

        updateDebugInfo() {
            if (!this.debugPanel) return;
            const lastTrigger = localStorage.getItem('adGuideLastTrigger');
            const now = Date.now();
            const cooldownMs = this.COOLDOWN_MINUTES * 60 * 1000;
            let timeUntilReset = lastTrigger ? Math.max(0, cooldownMs - (now - parseInt(lastTrigger))) : 0;
            const m = Math.floor(timeUntilReset / 60000), s = Math.floor((timeUntilReset % 60000) / 1000);
            const triggerCooldownReset = this.getTriggerCooldownReset();
            let tcStatus = this.triggerCount >= this.MAX_TRIGGERS && triggerCooldownReset > now
                ? `<div style="color:#FF6B6B;font-weight:bold;">🚫 Cooldown: ${Math.floor((triggerCooldownReset-now)/3600000)}h ${Math.floor(((triggerCooldownReset-now)%3600000)/60000)}m</div>`
                : `<div>Trigger Count: ${this.triggerCount}/${this.MAX_TRIGGERS}</div>`;
            const lastActive = localStorage.getItem('adGuideLastActiveTime');
            const lastActiveDelta = lastActive ? Math.floor((now - parseInt(lastActive)) / 1000) : 0;
            this.debugPanel.innerHTML = `
                <div style="font-weight:bold;margin-bottom:10px;">Ad Guide Debug</div>
                <div>Current Page Ads: ${this.currentPageAds.length}</div>
                <div>Total Ads Seen: ${this.totalAdsSeen}</div>
                <div style="color:#FFD700;font-weight:bold;">🎯 Required: ${this.REQUIRED_ADS}</div>
                <div>Need: ${Math.max(0,this.REQUIRED_ADS-this.totalAdsSeen)} more</div>
                ${tcStatus}
                <div>Cooldown: ${m}:${s.toString().padStart(2,'0')}</div>
                <div>Guide: ${this.isGuideActive?'Active':'Standby'}</div>
                <div style="font-size:10px;color:#999;">Last active: ${lastActiveDelta}s ago</div>
                <div style="font-size:10px;color:#FF9500;">⏰ Reset after 60min away</div>
                <button onclick="window.adGuideSystem&&window.adGuideSystem.resetAllData()" style="margin-top:10px;padding:5px 10px;background:#007AFF;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Reset All</button>`;
        }

        resetAllData() {
            ['adGuideLastTrigger','adGuideTotalSeen','adGuideTriggerCount',
             'adGuideTriggerCooldownReset','adGuideLastActiveTime','adGuideRequiredAds'].forEach(k => localStorage.removeItem(k));
            this.totalAdsSeen = 0; this.triggerCount = 0; this.currentPageAds = [];
            this.REQUIRED_ADS = this.getOrGenerateRequiredAds();
            if (this.isGuideActive) this.endGuide();
            this.stopScrollMonitoring();
            this.updateDebugInfo();
            this.updateLastActiveTime();
        }

        startPeriodicCheck() {
            setInterval(() => {
                this.currentPageAds = this.currentPageAds.filter(ad => {
                    const rect = ad.getBoundingClientRect();
                    return rect.height > 100 && rect.height <= 650 && document.body.contains(ad);
                });
                this.updateDebugInfo();
                if (!document.hidden) this.updateLastActiveTime();
            }, 5000);
        }
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            window.adGuideSystem = new AdClickGuideSystem();
        });
    } else {
        window.adGuideSystem = new AdClickGuideSystem();
    }

})();
