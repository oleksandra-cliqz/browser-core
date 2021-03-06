import ToolbarButtonManager from 'control-center/ToolbarButtonManager';
import inject from '../core/kord/inject';
import { utils, events } from '../core/cliqz';
import { addStylesheet, removeStylesheet } from '../core/helpers/stylesheet';
import Panel from '../core/ui/panel';
import background from './background';
import UITour from '../platform/ui-tour';
import { getMessage } from '../core/i18n';


function toPx(pixels) {
  return `${pixels.toString()}px`;
}


let ORIGIN_NAME = 'offers-cc';
const BTN_ID = 'cliqz-offers-cc-btn';
const PANEL_ID = `${BTN_ID}-panel`;
const firstRunPref = 'cliqz-offers-cc-initialized';
const BTN_LABEL = '';
const TOOLTIP_LABEL = getMessage('offers-hub-title');

const offersHubTrigger = utils.getPref('offersHubTrigger', 'off');
if (offersHubTrigger === 'tooltip') {
  ORIGIN_NAME = 'offers-cc-tooltip';
}

let seenOffersObj = {};
let autoTrigger = false;

export default class {
  constructor(settings) {
    if (!background.is_enabled) {
      return;
    }

    this.window = settings.window;
    this.settings = settings.settings;
    this.channel = settings.settings.channel;
    this.cssUrl = 'chrome://cliqz/content/offers-cc/styles/xul.css';
    this.offersV2 = inject.module('offers-v2');

    this.actions = {
      getData: this.getData.bind(this),
      getEmptyFrameAndData: this.getEmptyFrameAndData.bind(this),
      resize: this.resizePopup.bind(this),
      sendTelemetry: this.sendTelemetry.bind(this),
      closePanel: this.closePanel.bind(this),
      openURL: this.openURL.bind(this),
      seenOffers: this.seenOffers.bind(this),
    };
    this.panel = new Panel(
      this.window,
      'chrome://cliqz/content/offers-cc/index.html',
      PANEL_ID,
      'offers-cc',
      false,
      this.actions,
      null,
      this.onPopupHiding.bind(this),
      this.onPopupShowing.bind(this),
    );

    this.onOffersCoreEvent = this.onOffersCoreEvent.bind(this);
  }

  onPopupShowing() {
    if (autoTrigger) {
      const msg = {
        type: 'action-signal',
        data: {
          action_id: 'hub_pop_up',
        },
      };
      this.sendMessageToOffersCore(msg);
    } else {
      const msg = {
        type: 'action-signal',
        data: {
          action_id: 'hub_open',
        },
      };
      this.sendMessageToOffersCore(msg);
    }
  }

  onPopupHiding() {
    UITour.hideInfo(this.window);
    // check if we need to update the state of all the offers as old
    if (this.panel.shownDurationTime <= 1000) {
      // nothing to do
      return null;
    }

    this.badge.setAttribute('state', '');
    // else we will change the state of all offers

    Object.keys(seenOffersObj).forEach((offer) => {
      const msgSession = {
        type: 'offer-action-signal',
        data: {
          action_id: 'offer_dsp_session',
          offer_id: offer,
        },
      };
      this.sendMessageToOffersCore(msgSession);

      if (!autoTrigger) {
        const msgPulled = {
          type: 'offer-action-signal',
          data: {
            action_id: 'offer_pulled',
            offer_id: offer,
          },
        };
        this.sendMessageToOffersCore(msgPulled);
      }

      const msgShown = {
        type: 'offer-action-signal',
        data: {
          action_id: 'offer_shown',
          offer_id: offer,
          counter: seenOffersObj[offer]
        },
      };
      this.sendMessageToOffersCore(msgShown);
    });

    const msgState = {
      type: 'change-offer-state',
      // no data for now
      data: {
        offers_ids: Object.keys(seenOffersObj),
        new_state: 'old'
      }
    };
    this.sendMessageToOffersCore(msgState);

    const msg = {
      type: 'action-signal',
      data: {
        action_id: 'hub_closed',
      },
    };
    this.sendMessageToOffersCore(msg);

    seenOffersObj = {};
    autoTrigger = false;
    // ORIGIN_NAME = 'offers-cc';

    return null;
  }

  init() {
    if (!background.is_enabled) {
      return;
    }

    this.panel.attach();
    // stylesheet for control center button
    addStylesheet(this.window.document, this.cssUrl);
    this.addCCbutton();
    events.sub('offers-send-ch', this.onOffersCoreEvent);
  }

  unload() {
    if (!background.is_enabled) {
      return;
    }
    events.un_sub('offers-send-ch', this.onOffersCoreEvent);
    this.panel.detach();
    this.button.parentElement.removeChild(this.button);
    removeStylesheet(this.window.document, this.cssUrl);
  }

  getData() {

  }

  // used for a first faster rendering
  getEmptyFrameAndData() {
    const self = this;
    this._getAllOffers().then((aData) => {
      self.sendMessageToPopup({
        action: 'pushData',
        data: aData
      });
    });
    // this.getData();
  }


  sendMessageToPopup(aMessage) {
    this.panel.sendMessage({
      target: 'cliqz-offers-cc',
      origin: 'window',
      message: aMessage
    });
  }


  addCCbutton() {
    const doc = this.window.document;
    const firstRunPrefVal = utils.getPref(firstRunPref, false);
    if (!firstRunPrefVal) {
      utils.setPref(firstRunPref, true);
      ToolbarButtonManager.setDefaultPosition(BTN_ID, 'nav-bar', 'bookmarks-menu-button');
    }

    const button = doc.createElement('toolbarbutton');
    button.setAttribute('id', BTN_ID);
    button.setAttribute('label', TOOLTIP_LABEL);
    button.setAttribute('tooltiptext', TOOLTIP_LABEL);
    button.classList.add('toolbarbutton-1');
    button.classList.add('chromeclass-toolbar-additional');
    this.button = button;

    const div = doc.createElement('div');
    div.setAttribute('class', 'cliqz-offers-cc toolbarbutton-icon');
    div.textContent = BTN_LABEL;
    button.appendChild(div);

    button.addEventListener('command', () => {
      this.panel.open(button);
    });

    ToolbarButtonManager.restorePosition(doc, button);

    this.badge = div;
    this.button = button;
  }

  resizePopup({ width, height }) {
    this.panel.iframe.style.width = toPx(width);
    this.panel.iframe.style.height = toPx(height);
  }

  _getAllOffers() {
    const self = this;
    const args = {
      filters: {
        by_rs_dest: ORIGIN_NAME
      }
    };
    return this.offersV2.action('getStoredOffers', args).then((recentData) => {
      const parsedResult = [];
      recentData.forEach((elem) => {
        if (elem &&
            elem.offer_id &&
            elem.offer_info &&
            elem.offer_info.ui_info) {
          // we need to send the template name and template data here from the
          // ui info
          const uiInfo = elem.offer_info.ui_info;

          let offerState = 'new';
          if (elem.attrs && elem.attrs.state) {
            offerState = elem.attrs.state;
          }
          const data = {
            created: elem.created_ts,
            state: offerState,
            template_name: uiInfo.template_name,
            template_data: uiInfo.template_data,
            offer_id: elem.offer_id,
          };
          parsedResult.push(data);
        }
      });

      // Sort the results by the most recent one
      parsedResult.sort((a, b) => (b.created - a.created));

      self.allOffers = parsedResult;

      return Promise.resolve(parsedResult);
    });
  }

  /**
   * will send a message to the offers-core following the new API:
   * https://cliqztix.atlassian.net/wiki/pages/viewpage.action?pageId=88618158
   * @param  {[type]} msg  object containing the following parameters:
   *                       - type (signal type)
   *                       - data (depending on the type)
   * @return {[type]}      [description]
   */
  sendMessageToOffersCore(msg) {
    if (!msg || !msg.type) {
      utils.log('Error: invalid message');
      return;
    }
    // create the message to be sent
    const message = {
      origin: ORIGIN_NAME,
      type: msg.type,
      data: msg.data
    };
    events.pub('offers-recv-ch', message);
  }

  sendTelemetry(data) {
    // utils.telemetry(data);
    // check the data
    if (!data.signal_type) {
      // error invalid data
      return;
    }

    // we will do a "bridging" here from the current signals to the new API
    // format.
    let msg = null;

    if (data.signal_type === 'action-signal') {
      // This type of signals are just for tracking and information purposes,
      // will not change any logic on the offers module
      // This signals are not related to any offer, just "telemetry"
      msg = {
        type: 'action-signal',
        // no data for now
        data: {
          // this is the signal we want to send
          action_id: data.element_id
        },
      };
    } else if (data.signal_type === 'offer-action-signal') {
      // this signals will be associated to offers but will not affect the behavior
      // or anything on the offer module, just for information purposes.
      msg = {
        type: 'offer-action-signal',
        // no data for now
        data: {
          offer_id: data.offer_id,
          // this is the signal we want to send
          action_id: data.element_id
        },
      };
    } else if (data.signal_type === 'remove-offer') {
      msg = {
        type: 'remove-offer',
        data: {
          offer_id: data.offer_id,
        },
      };
    }


    if (msg) {
      this.sendMessageToOffersCore(msg);
    } else {
      utils.log(`sendTelemetry: error: the message is null? invalid signal type? ${data.signal_type}`);
    }
  }

  //
  // subscribe to the storage events
  //
  onOffersCoreEvent(event) {
    // check if we need to discard the event or not
    if (event.dest && event.dest.length > 0 && (event.dest.indexOf(ORIGIN_NAME) < 0)) {
      // we should not process this message
      return;
    }
    // we also have event data: event.data;
    const eventID = event.type;

    this._getAllOffers().then(() => {
      switch (eventID) {
        case 'push-offer': {
          // Auto open the panel
          autoTrigger = true;
          this.badge.setAttribute('state', 'new-offers');

          if (offersHubTrigger === 'tooltip') {
            UITour.targets.set('cliqz-offers', { query: '#cliqz-offers-cc-btn', widgetName: 'cliqz-offers-cc-btn', allowAdd: true });
            const promise = UITour.getTarget(this.window, 'cliqz-offers');
            const win = this.window;
            const myOptions = {
              closeButtonCallback: () => {
                const data = {
                  signal_type: 'action-signal',
                  element_id: 'tooltip_closed'
                };
                this.sendTelemetry(data);
              }
            };

            promise.then((target) => {
              const offerTooltipTranslation = utils.getLocalizedString('offers_hub_tooltip_new_offer');
              UITour.showInfo(win, target, '', offerTooltipTranslation, '', '', myOptions);
              win.document.querySelector('#UITourTooltip[targetName=cliqz-offers]').addEventListener('click', (e) => {
                if (e.target.matches('#UITourTooltipClose')) {
                  return;
                }
                UITour.hideInfo(this.window);

                const msg = {
                  type: 'action-signal',
                  data: {
                    action_id: 'tooltip_clicked',
                  },
                };
                this.sendMessageToOffersCore(msg);

                this.badge.setAttribute('state', '');
                this.openPanel();
              });
            });

            const msg = {
              type: 'action-signal',
              data: {
                action_id: 'tooltip_shown',
              },
            };
            this.sendMessageToOffersCore(msg);
          } else {
            this.openPanel();
          }
        }
          break;
        default:
          utils.log('invalid event from core type', eventID);
          break;
      }
    }).catch((err) => {
      utils.log('======= event: error: ', err);
    });
  }

  seenOffers(data) {
    seenOffersObj = data;
  }

  openPanel() {
    if (utils.getWindow() !== this.window) {
      return;
    }

    this.closePanel();
    this.panel.open(this.button);
  }

  closePanel(data = {}) {
    UITour.hideInfo(this.window);
    this.panel.hide({ force: data.force });
  }

  openURL(data) {
    const tab = utils.openLink(this.window, data.url, true);
    if (data.closePopup === true) this.panel.hide({ force: true });
    this.window.gBrowser.selectedTab = tab;
  }

}
