/**
 * NoLeaks backend
 * Licensed under MIT
 */
/* global chrome */
"use strict";
(function () {
    let affiliates = {
        hostname: null,
        entries: [],
        enabled: true
    };
    let tabId = null;
    const sensor = chrome.runtime.id;

    // tab switch
    chrome.tabs.onActivated.addListener(function (tab) {
        if (tab.tabId > 0) {
            loadState();
        }
    });

    // new tab, new site, reload
    chrome.webNavigation.onCommitted.addListener(function (tab) {
        if (tab.frameId === 0) {
            affiliates = {
                hostname: null,
                entries: [],
                enabled: true
            };
            tabId = null;
            loadState();
        }
    });

    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        switch (message.action) {
            case 'getAffiliates':
                sendResponse(affiliates);
                break;
            case 'blockedToggle':
                let idx = affiliates.entries.findIndex(item => item.hostname === message.hostname);
                if (idx !== -1) {
                    affiliates.entries[idx].blocked = !affiliates.entries[idx].blocked;
                }
                updateSettings();
                break;
            case 'getEnabled':
                sendResponse(affiliates.enabled);
                break;
            case 'toggleEnable':
                affiliates.enabled = !affiliates.enabled;
                updateSettings();
                updateBadge();
                sendResponse(affiliates.enabled);
                break;
            default:
                console.error('Unsupported action ' + message.action);
        }
    });

    function updateSettings() {
        let settings = {};
        settings[affiliates.hostname] = affiliates;
        chrome.storage.local.set(settings);
    }

    chrome.webRequest.onBeforeRequest.addListener(
        function (request) {
            if (affiliates.enabled && request.tabId === tabId && request.type !== 'main_frame') {
                let url = new URL(request.url);
                if (isAffiliate(affiliates.hostname, url.hostname)) {
                    let idx = affiliates.entries.findIndex(item => item.hostname === url.hostname);
                    let isBlocked = idx !== -1 && affiliates.entries[idx].blocked;
                    if (idx === -1) {
                        let entry = {
                            'hostname': url.hostname,
                            'protocol': url.protocol.replace(":", ""),
                            'blocked': isBlocked
                        };
                        affiliates.entries.push(entry);
                        publish(entry);
                        updateSettings();
                        chrome.runtime.sendMessage({
                            'action': 'updateAffiliates',
                            'affiliates': affiliates
                        }, function () {
                            updateBadge();
                        });
                    }
                    if (isBlocked) {
                        return {cancel: true};
                    }
                }
            }
        },
        {urls: ["<all_urls>"]},
        ["blocking"]
    );

    function hashCode(string) {
        let hash = 0, i;
        for (i = 0; i < string.length; i++) {
            hash = ((hash << 5) - hash) + string.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    let published = {};

    function publish(entry) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return;
        }
        let key = hashCode(affiliates.hostname + entry.hostname);
        if (!published.hasOwnProperty(key) || published[key] !== entry.blocked) {
            published[key] = entry.blocked;
            try {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        console.debug('published', entry);
                    }
                };
                xhr.open('POST', 'https://noleaks.eu/sensor?' + affiliates.hostname, true);
                xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
                entry['sensor'] = sensor;
                xhr.send(JSON.stringify(entry));
            } catch (error) {
                console.error(error);
            }
        }
    }

    function loadState() {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            let hostname = new URL(tabs[0].url).hostname;
            chrome.storage.local.get(hostname, function (settings) {
                if (!settings.hasOwnProperty(hostname)) {
                    affiliates = {
                        'entries': [], // hostname, protocol, blocked
                        'enabled': true,
                        'hostname': hostname
                    };
                    updateSettings();
                } else {
                    affiliates = settings[hostname];
                }
                tabId = tabs[0].id;
                chrome.runtime.sendMessage({'action': 'updateAffiliates', 'affiliates': affiliates}, function () {
                    updateBadge();
                });
            });
        });
    }

    function isAffiliate(host, guest) {
        if (host.indexOf('.') === -1 || guest.indexOf('.') === -1) {
            return false;
        }
        return host !== guest;
    }

    function updateBadge() {
        if (typeof chrome.browserAction.setIcon === 'undefined') {
            return;
        }
        chrome.browserAction.setBadgeBackgroundColor({color: '#808080'});
        if (!affiliates.enabled) {
            chrome.browserAction.setIcon({path: "/assets/off-32.png"});
            chrome.browserAction.setBadgeText({text: ''});
        } else if (affiliates.enabled && affiliates.entries.length > 0) {
            if (affiliates.entries.findIndex(item => item.blocked === false) === -1) {
                chrome.browserAction.setIcon({path: "/assets/on-32.png"});
            } else {
                chrome.browserAction.setBadgeBackgroundColor({color: '#ff2a37'});
                chrome.browserAction.setIcon({path: "/assets/red-32.png"});
            }
            chrome.browserAction.setBadgeText({text: affiliates.entries.length.toString()});
        } else if (affiliates.enabled && (affiliates.entries.length === 0)) {
            chrome.browserAction.setIcon({path: "/assets/on-32.png"});
            chrome.browserAction.setBadgeText({text: ''});
        }
    }
})();