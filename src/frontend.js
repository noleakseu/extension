/**
 * NoLeaks frontend
 * Licensed under MIT
 */
/* global chrome */
"use strict";
(function () {
    const status = document.getElementById('status');
    const header = document.getElementById('header');
    const list = document.getElementById('list');
    const allButton = document.getElementById('allButton');
    const refreshButton = document.getElementById('refreshButton');
    const enableToggle = document.getElementById('enableToggle');

    allButton.textContent = chrome.i18n.getMessage('allButton');
    allButton.addEventListener('click', function () {
        let elements = document.getElementsByTagName('input');
        for (let i = 0; i < elements.length; i++) {
            if (elements[i].type === 'checkbox' && elements[i].checked === false) {
                elements[i].click();
            }
        }
    }, false);


    refreshButton.textContent = chrome.i18n.getMessage('refreshButton');
    refreshButton.addEventListener('click', function () {
        refreshButton.disabled = true;
        while (list.firstChild)
            list.removeChild(list.firstChild);
        chrome.tabs.reload();
    }, false);


    enableToggle.textContent = chrome.i18n.getMessage('enableButton');
    enableToggle.addEventListener('click', toggleEnable, false);

    chrome.runtime.sendMessage({'action': 'getEnabled'}, function (isEnabled) {
        updateButtons(isEnabled);
    });
    chrome.runtime.sendMessage({'action': 'getAffiliates'}, function (affiliates) {
        while (list.firstChild)
            list.removeChild(list.firstChild);
        updateAffiliates(affiliates);
    });
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        switch (message.action) {
            case 'updateAffiliates':
                updateAffiliates(message.affiliates);
                break;
            default:
                console.error('Unsupported action ' + message.action);
        }
    });

    function updateAffiliates(affiliates) {
        if (affiliates === null) {
            return;
        }
        refreshButton.disabled = false;
        if (affiliates.entries.length === 0) {
            return;
        }
        let leaks = 0;
        for (let i = 0; i < affiliates.entries.length; i++) {
            if (!affiliates.entries[i].blocked) {
                leaks++;
            }
            if (document.getElementById(affiliates.entries[i].hostname) !== null) {
                continue;
            }
            let div = document.createElement('div');
            div.setAttribute('class', 'form-check form-control-sm');
            let input = document.createElement('input');
            input.setAttribute('class', 'form-check-input');
            input.setAttribute('type', 'checkbox');
            input.setAttribute('id', affiliates.entries[i].hostname);
            input.addEventListener('change', function () {
                chrome.runtime.sendMessage({
                    'action': 'blockedToggle',
                    'hostname': affiliates.entries[i].hostname
                }, function (o) {
                });
            }, false);
            if (affiliates.entries[i].blocked) {
                input.setAttribute('checked', 'checked');
            }
            let label = document.createElement('label');
            label.setAttribute('class', 'form-check-label');
            label.setAttribute('for', affiliates.entries[i].hostname);
            label.appendChild(document.createTextNode(affiliates.entries[i].hostname));
            div.appendChild(input);
            div.appendChild(label);
            list.appendChild(div);
        }

        if (leaks > 0) {
            status.textContent = chrome.i18n.getMessage('popupCount', [leaks, affiliates.hostname]);
            status.classList.remove('alert-success');
            status.classList.add('alert-danger');
        } else {
            status.textContent = chrome.i18n.getMessage('popupNone', [affiliates.hostname]);
            status.classList.remove('alert-danger');
            status.classList.add('alert-success');
        }
    }

    function updateButtons(isEnabled) {
        if (isEnabled) {
            header.src = '/assets/on-32.png';
            allButton.disabled = false;
            refreshButton.disabled = false;
            status.textContent = chrome.i18n.getMessage('popupEnabled');
            enableToggle.textContent = chrome.i18n.getMessage('disableButton');
            enableToggle.classList.add('btn-danger');
        } else {
            header.src = '/assets/off-32.png';
            allButton.disabled = true;
            refreshButton.disabled = true;
            enableToggle.disabled = false;
            status.textContent = chrome.i18n.getMessage('popupDisabled');
            enableToggle.textContent = chrome.i18n.getMessage('enableButton');
            enableToggle.classList.remove('btn-danger');
        }
    }

    function toggleEnable() {
        chrome.runtime.sendMessage({action: 'toggleEnable'}, function (isEnabled) {
            updateButtons(isEnabled);
        });
    }
})();