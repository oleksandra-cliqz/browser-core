import config from '../core/config';
import inject from '../core/kord/inject';
import utils from '../core/utils';
import events from '../core/events';
import console from '../core/console';
import { getMessage } from '../core/i18n';

const BTN_ID = 'cliqz-cc-btn';
const TELEMETRY_TYPE = 'control_center';
const TRIQZ_URL = 'https://cliqz.com/tips';

export default class {
  constructor({ window, background, settings }) {
    this.window = window;
    this.toolbarButton = background.toolbarButton;
    this.pageAction = background.pageAction;

    this.controlCenter = inject.module('control-center');
    this.settings = settings;
    this.channel = settings.channel;
    this.ICONS = settings.ICONS;
    this.BACKGROUNDS = settings.BACKGROUNDS;
    this.createFFhelpMenu = this.createFFhelpMenu.bind(this);
    this.helpMenu = window.document.getElementById('menu_HelpPopup');
    this.geolocation = inject.module('geolocation');
    this.core = inject.module('core');
    this.actions = {
      setBadge: this.setBadge.bind(this),
      getData: this.getData.bind(this),
      getEmptyFrameAndData: this.getEmptyFrameAndData.bind(this),
      openURL: this.openURL.bind(this),
      updatePref: this.updatePref.bind(this),
      updateState: this.updateState.bind(this),
      refreshState: this.refreshState.bind(this),
      resize: this.resizePopup.bind(this),
      'adb-optimized': this.adbOptimized.bind(this),
      'antitracking-activator': this.antitrackingActivator.bind(this),
      'anti-phishing-activator': this.antiphishingActivator.bind(this),
      'adb-activator': this.adbActivator.bind(this),
      'antitracking-strict': this.antitrackingStrict.bind(this),
      'antitracking-clearcache': this.antitrackingClearCache.bind(this),
      sendTelemetry: this.sendTelemetry.bind(this),
      openPopUp: this.openPopUp.bind(this),
      openMockPopUp: this.openMockPopUp.bind(this),
      setMockBadge: this.setMockBadge.bind(this),
      'cliqz-tab': this.cliqzTab.bind(this),
      'complementary-search': this.complementarySearch.bind(this),
      'search-index-country': this.searchIndexCountry.bind(this),
      'type-filter': this.typeFilter.bind(this),
    };

    this.toolbarButton.addWindow(window, this.actions);

    if (this.pageAction) {
      this.pageAction.addWindow(window, this.actions);

      const pageActionBtn = window.document.getElementById(this.pageAction.id);
      window.document.getElementById('urlbar-icons').appendChild(pageActionBtn);
    }
  }

  init() {
    events.sub('core.location_change', this.actions.refreshState);

    if (utils.getPref('toolbarButtonPositionSet', false) === false) {
      this.toolbarButton.setPositionBeforeElement('bookmarks-menu-button');
      utils.setPref('toolbarButtonPositionSet', true);
    }

    this.updateFFHelpMenu();

    setTimeout(this.setState.bind(this), 0, 'active');
  }

  updateFFHelpMenu() {
    if (this.helpMenu && this.settings.helpMenus) {
      this.helpMenu.addEventListener('popupshowing', this.createFFhelpMenu);
    }
  }

  createFFhelpMenu() {
    if (this
        .window
        .document
        .querySelectorAll('#menu_HelpPopup>.cliqz-item')
        .length > 0) return;

    this.helpMenu.insertBefore(this.tipsAndTricks(this.window), this.helpMenu.firstChild);
    this.helpMenu.insertBefore(this.feedback(this.window), this.helpMenu.firstChild);
  }

  simpleBtn(doc, txt, func, action) {
    const item = doc.createElement('menuitem');
    item.setAttribute('label', txt);
    item.setAttribute('action', action);
    item.classList.add('cliqz-item');

    if (func) {
      item.addEventListener(
          'command',
          () => {
            utils.telemetry({
              type: 'activity',
              action: 'cliqz_menu_button',
              button_name: action,
            });
            func();
          },
          false);
    } else {
      item.setAttribute('disabled', 'true');
    }

    return item;
  }

  tipsAndTricks(win) {
    return this.simpleBtn(win.document,
      utils.getLocalizedString('btnTipsTricks'),
      () => utils.openTabInWindow(win, TRIQZ_URL),
      'triqz'
    );
  }

  feedback(win) {
    return this.simpleBtn(win.document,
      utils.getLocalizedString('btnFeedbackFaq'),
      () => {
        // TODO - use the original channel instead of the current one (it will be changed at update)
        utils.openTabInWindow(win, utils.FEEDBACK_URL);
      },
      'feedback'
    );
  }

  unload() {
    this.toolbarButton.removeWindow(this.window);
    this.pageAction && this.pageAction.removeWindow(this.window);

    events.un_sub('core.location_change', this.actions.refreshState);

    // remove custom items from the Help Menu
    const nodes = this.helpMenu.querySelectorAll('.cliqz-item');

    Array.prototype.slice.call(nodes, 0)
      .forEach(node => this.helpMenu.removeChild(node));

    this.helpMenu.removeEventListener('popupshowing', this.createFFhelpMenu);
  }

  refreshState(url) {
    // wait for tab content to load
    if (!url || url === 'about:blank') {
      return;
    }
    this.prepareData().then((data) => {
      this.setState(data.generalState);
    });
  }

  adbOptimized(data) {
    events.pub('control-center:adb-optimized');
    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: 'adblock_fair',
      action: 'click',
      state: data.status === true ? 'on' : 'off'
    });
  }

  antitrackingStrict(data) {
    events.pub('control-center:antitracking-strict');
    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: 'attrack_fair',
      action: 'click',
      state: data.status === true ? 'on' : 'off'
    });
  }

  antitrackingClearCache() {
    events.pub('control-center:antitracking-clearcache');
  }

  cliqzTab(data) {
    events.pub('control-center:cliqz-tab');
    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: 'cliqz_tab',
      action: 'click',
      state: data.status === true ? 'on' : 'off'
    });
  }

  typeFilter(data) {
    utils.setPref(`type_filter_${data.target}`, data.status);
    events.pub('type_filter:change', { target: data.target, status: data.status});
  }

  antitrackingActivator(data) {
    switch (data.status) {
      case 'active':
        this.core.action('enableModule', 'antitracking').then(() => {
          events.pub('antitracking:whitelist:remove', data.hostname);
        });
        break;
      case 'inactive':
        this.core.action('enableModule', 'antitracking').then(() => {
          events.pub('antitracking:whitelist:add', data.hostname);
        });
        break;
      case 'critical':
        events.pub('antitracking:whitelist:remove', data.hostname);
        events.nextTick(() => {
          this.core.action('disableModule', 'antitracking');
        });
        // reset the badge when the anti tracking module gets offline
        this.updateBadge('0');
        break;
      default:
        break;
    }

    let state;
    if (data.type === 'switch') {
      state = data.state === 'active' ? 'on' : 'off';
    } else {
      state = data.state;
    }

    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: `attrack_${data.type}`,
      state,
      action: 'click',
    });
  }

  complementarySearch(data) {
    events.pub('control-center:setDefault-search', data.defaultSearch);
    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: 'complementary_search',
      state: `search_engine_change_${data.defaultSearch}`,
      action: 'click'
    });
  }

  searchIndexCountry(data) {
    events.pub('control-center:setDefault-indexCountry', data.defaultCountry);

    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: 'search-index-country',
      state: `search_index_country_${data.defaultCountry}`,
      action: 'click',
    });
  }

  adbActivator(data) {
    events.pub('control-center:adb-activator', data);
    let state;
    if (data.type === 'switch') {
      state = data.state === 'active' ? 'on' : 'off';
    } else {
      state = data.state;
    }
    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: `adblock_${data.type}`,
      state,
      action: 'click',
    });
  }

  antiphishingActivator(data) {
    const ph = inject.module('anti-phishing');
    ph.action('activator', data.state, data.url);

    let state;
    if (data.type === 'switch') {
      state = data.state === 'active' ? 'on' : 'off';
    } else {
      state = data.state;
    }
    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: `antiphishing_${data.type}`,
      state,
      action: 'click',
    });
  }

  setMockBadge(info) {
    this.updateBadge(info);
  }

  updateBadge(info) {
    if (info !== undefined) {
      this.toolbarButton.setBadgeText(this.window, `${info}`);
    }
  }

  setBadge(info) {
    this.updateBadge(info);
  }

  updateState(state) {

    // set the state of the current window
    this.setState(state);

    // go to all the other windows and refresh the state
    const enumerator = Services.wm.getEnumerator('navigator:browser');
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext();
      if (win !== this.window) {
        setTimeout((win) => {
          this.controlCenter.windowAction(
            win,
            'refreshState'
          );
        }, 3000 /* some modules need time to start eg: antitracking */, win);
      }
    }
  }

  setState(state) {
    this.toolbarButton.setIcon(this.window, this.ICONS[state]);
    this.toolbarButton.setBadgeBackgroundColor(this.window, this.BACKGROUNDS[state]);
  }

  updatePref(data) {
    switch (data.pref) {
      case 'extensions.cliqz.dnt':
        events.pub('control-center:toggleHumanWeb');
        break;
      case 'extensions.cliqz.share_location':
        this.geolocation.action(
          'setLocationPermission',
          data.value
        );

        events.pub('message-center:handlers-freshtab:clear-message', {
          id: 'share-location',
          template: 'share-location'
        });
        break;
      default: {
        let prefValue = data.value;
        if (data.prefType === 'boolean') {
          prefValue = (prefValue === 'true');
        }
        utils.setPref(data.pref, prefValue, '' /* full pref name required! */);
      }
    }

    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: data.target,
      state: data.value,
      action: 'click'
    });
  }

  openURL(data) {
    switch (data.url) {
      case 'history': {
        // use firefox command to ensure compatibility
        this.window.document.getElementById('Browser:ShowAllHistory').click();
        break;
      }
      case 'forget_history': {
        // use firefox command to ensure compatibility
        this.window.document.getElementById('Tools:Sanitize').click();
        break;
      }
      case 'moncomp': {
        try {
          const murl = utils.getPref('moncomp_endpoint', '') + this.window.gBrowser.selectedBrowser.currentURI.spec;
          utils.openTabInWindow(this.window, murl);
        } catch (err) { console.log(err); }
        break;
      }
      default: {
        const tab = utils.openLink(this.window, data.url, true);
        this.window.gBrowser.selectedTab = tab;
      }
    }

    utils.telemetry({
      type: TELEMETRY_TYPE,
      target: data.target,
      action: 'click',
      index: data.index
    });
  }
  // creates the static frame data without any module details
  // re-used for fast first render and onboarding
  getFrameData() {
    let url = this.window.gBrowser.currentURI.spec;
    let friendlyURL = url;
    let isSpecialUrl = false;
    let urlDetails = utils.getDetailsFromUrl(url);

    if (url.indexOf('about:') === 0) {
      friendlyURL = url;
      isSpecialUrl = true;
    } else if (url.indexOf(config.settings.NEW_TAB_URL) === 0) {
      friendlyURL = 'Cliqz Tab';
      isSpecialUrl = true;
    } else if (url.indexOf(utils.CLIQZ_ONBOARDING_URL) === 0) {
      friendlyURL = 'Cliqz';
      isSpecialUrl = true;
    } else if (url.startsWith('chrome://cliqz/content/anti-phishing/phishing-warning.html')) {
      // in case this is a phishing site (and a warning is displayed),
      // we need to get the actual url instead of the warning page
      url = url.split('chrome://cliqz/content/anti-phishing/phishing-warning.html?u=')[1];
      url = decodeURIComponent(url);
      urlDetails = utils.getDetailsFromUrl(url);
      isSpecialUrl = true;
      friendlyURL = getMessage('anti-phishing-txt0');
    }

    return {
      activeURL: url,
      friendlyURL,
      isSpecialUrl,
      domain: urlDetails.domain,
      extraUrl: urlDetails.extra === '/' ? '' : urlDetails.extra,
      hostname: urlDetails.host,
      module: {}, // will be filled later
      generalState: 'active',
      feedbackURL: utils.FEEDBACK_URL,
      debug: utils.getPref('showConsoleLogs', false),
      amo: this.settings.channel === '04',
      funnelCake: this.settings.id === 'funnelcake@cliqz.com' || this.settings.id === 'description_test@cliqz.com'
    };
  }

  prepareData() {
    return this.core.action(
      'getWindowStatus',
      this.window
    ).then((mData) => {
      const moduleData = mData;
      const ccData = this.getFrameData();
      const states = [
        (moduleData.antitracking && moduleData.antitracking.state) || 'critical'
        //,(moduleData['anti-phishing'] && moduleData['anti-phishing'].state) || 'critical'
      ];

      if (states.indexOf('inactive') !== -1) {
        ccData.generalState = 'inactive';
      }
      if (states.indexOf('critical') !== -1) {
        ccData.generalState = 'critical';
      }

      moduleData.adult = { visible: true, state: utils.getAdultFilterState() };
      if (utils.hasPref('browser.privatebrowsing.apt', '') && this.settings.channel === '40') {
        moduleData.apt = { visible: true, state: utils.getPref('browser.privatebrowsing.apt', false, '') };
      }

      moduleData.dnt = { enabled: utils.getPref('dnt', false) };
      moduleData.searchProxy = { enabled: utils.getPref('hpn-query', false) };

      ccData.module = moduleData;

      return ccData;
    });
  }

  numberAnimation() {

  }

  _getMockData() {
    const self = this;
    let numberCounter = 0;
    const ccDataMocked = this.getFrameData();

    ccDataMocked.module = this.mockedData;
    // we also need to override some of the frame Data
    ccDataMocked.activeURL = 'examplepage.de/webpage';
    ccDataMocked.isSpecialUrl = false;
    ccDataMocked.domain = 'examplepage.de';
    ccDataMocked.extraUrl = '/webpage';
    ccDataMocked.onboarding = true;

    const numberAnimation = function () {
      if (numberCounter === 27) {
        return;
      }

      if (numberCounter < 18) {
        ccDataMocked.module.antitracking.totalCount = numberCounter;
      }

      ccDataMocked.module.adblocker.totalCount = numberCounter;

      self.sendMessageToPopup({
        action: 'pushData',
        data: ccDataMocked
      });

      numberCounter += 1;
      setTimeout(numberAnimation, 40);
    };
    numberAnimation();
  }

  openMockPopUp(data) {
    this.mockedData = data;
    this.openPopUp();
  }

  getData() {
    this.prepareData().then((data) => {
      this.sendMessageToPopup({
        action: 'pushData',
        data,
      });
      this.updateBadge(data.module.antitracking.badgeData);
    }).catch(e => utils.log(e.toString(), 'getData error'));
  }

  // used for a first faster rendering
  getEmptyFrameAndData() {
    this.sendMessageToPopup({
      action: 'pushData',
      data: this.getFrameData()
    });

    this.getData();
  }

  sendMessageToPopup(message) {
    const msg = {
      target: 'cliqz-control-center',
      origin: 'window',
      message,
    };
    this.toolbarButton.sendMessage(this.window, msg);
    this.pageAction && this.pageAction.sendMessage(this.window, msg);
  }

  resizePopup({ width, height }) {
    this.toolbarButton.resizePopup(this.window, { width, height });
    this.pageAction && this.pageAction.resizePopup(this.window, { width, height });
  }

  sendTelemetry(data) {
    const signal = {
      type: TELEMETRY_TYPE,
      target: data.target,
      action: 'click'
    };
    const state = data.state;
    if (state) {
      signal.state = state;
    }
    if (data.index) {
      signal.index = data.index;
    }
    utils.telemetry(signal);
  }

  openPopUp() {
    this.window.document.querySelector(`toolbarbutton#${BTN_ID}`).click();
  }
}
