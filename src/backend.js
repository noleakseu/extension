/**
 * NoLeaks backend
 * Licensed under MIT
 */
/* global chrome */
"use strict";
(function () {
    let isEnabled = true;
    let affiliates = null;
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
            resetState(new URL(tab.url).hostname);
        }
    });

    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        switch (message.action) {
            case 'getAffiliates':
                sendResponse(affiliates);
                break;
            case 'blockedToggle':
                if (affiliates.blocked.findIndex(item => item === message.hostname) === -1) {
                    affiliates.blocked.push(message.hostname);
                } else {
                    affiliates.blocked = affiliates.blocked.filter(item => item !== message.hostname);
                }
                updateSettings();
                break;
            case 'getEnabled':
                sendResponse(isEnabled);
                break;
            case 'toggleEnable':
                isEnabled = !isEnabled;
                updateSettings();
                updateBadge();
                sendResponse(isEnabled);
                break;
            default:
                console.error('Unsupported action ' + message.action);
        }
    });

    function updateSettings() {
        let settings = {};
        if (affiliates !== null) {
            settings[affiliates.hostname] = {'enabled': isEnabled, 'blocked': affiliates.blocked};
            chrome.storage.local.set(settings);
        }
        return settings;
    }

    chrome.webRequest.onBeforeRequest.addListener(
            function (request) {
                if (isEnabled && request.tabId === tabId && request.type !== 'main_frame') {
                    let url = new URL(request.url);
                    if (isAffiliate(affiliates.hostname, url.hostname)) {
                        let isBlocked = affiliates.blocked.findIndex(item => item === url.hostname) !== -1;
                        setEntry(
                                {
                                    'hostname': url.hostname,
                                    'protocol': url.protocol.replace(":", ""),
                                    'blocked': isBlocked
                                }
                        );
                        if (isBlocked) {
                            return {cancel: true};
                        }
                    }
                }
            },
            {urls: ["<all_urls>"]},
            ["blocking"]
            );

    function setEntry(entry) {
        if (affiliates.entries.findIndex(item => item.hostname === entry.hostname) === -1) {
            affiliates.entries.push(entry);
            affiliates.count = affiliates.entries.length;
            sessionStorage.setItem(affiliates.hostname, JSON.stringify(affiliates));
            updateBadge();
            publish(entry);
            chrome.runtime.sendMessage({'action': 'updateAffiliates', 'affiliates': affiliates}, function (e) {
            });
        }
    }

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

    function resetState(hostname) {
        sessionStorage.removeItem(hostname);
        isEnabled = true;
        affiliates = null;
        tabId = null;
        loadState();
    }

    function loadState() {
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            let hostname = new URL(tabs[0].url).hostname;
            chrome.storage.local.get(hostname, function (settings) {
                if (sessionStorage.getItem(hostname)) {
                    affiliates = JSON.parse(sessionStorage.getItem(hostname));
                } else {
                    affiliates = {
                        'entries': [],
                        'blocked': [],
                        'count': 0,
                        'hostname': hostname
                    };
                }
                if (!settings.hasOwnProperty(hostname)) {
                    settings = updateSettings();
                }
                isEnabled = settings[hostname].enabled;
                affiliates.blocked = settings[hostname].blocked;
                tabId = tabs[0].id;
                updateBadge();
                chrome.runtime.sendMessage({'action': 'updateAffiliates', 'affiliates': affiliates}, function (e) {
                });
            });
        });
    }

    function isAffiliate(host, guest) {
        if (host.indexOf('.') === -1 || guest.indexOf('.') === -1) {
            return false;
        }
        return host.split('.').slice(-2).join('.') !== guest.split('.').slice(-2).join('.');
    }

    function updateBadge() {
        if (typeof chrome.browserAction.setIcon === 'undefined') {
            return;
        }
        chrome.browserAction.setBadgeBackgroundColor({color: '#808080'});
        if (!isEnabled) {
            chrome.browserAction.setIcon({path: "/assets/off-32.png"});
            chrome.browserAction.setBadgeText({text: ''});
        } else if (isEnabled && affiliates !== null && affiliates.count > 0) {
            if (affiliates.entries.findIndex(item => item.blocked === false) === -1) {
                chrome.browserAction.setIcon({path: "/assets/on-32.png"});
            } else {
                chrome.browserAction.setBadgeBackgroundColor({color: '#ff2a37'});
                chrome.browserAction.setIcon({path: "/assets/red-32.png"});
            }
            chrome.browserAction.setBadgeText({text: affiliates.count.toString()});
        } else if (isEnabled && (affiliates === null || affiliates.count === 0)) {
            chrome.browserAction.setIcon({path: "/assets/on-32.png"});
            chrome.browserAction.setBadgeText({text: ''});
        }
    }
})();