import CliqzUtils from '../core/utils';
import PeerSlave from './peer-slave';
import YoutubeApp from './apps/youtube';
import TabsharingApp from './apps/tabsharing';
import PingPongApp from './apps/pingpong';
import SimpleStorage from '../core/simple-storage';
import PairingObserver from './apps/pairing-observer';
import background from '../core/base/background';

// TODO: remove this!
let CustomizableUI;

const BTN_ID = 'mobilepairing_btn';

export default background({
  init() {
    CustomizableUI = Components.utils.import('resource:///modules/CustomizableUI.jsm', null).CustomizableUI;

    const PeerComm = this.peerSlave = new PeerSlave();
    const pingpong = new PingPongApp();
    PeerComm.addObserver('PINGPONG', pingpong);

    const youtube = new YoutubeApp(() => {}, (video) => {
      CliqzUtils.log(`Received video ${video}`);
      const [, ...rest] = video.split(':');
      const id = rest.join(':');
      const youtubeurl = `https://www.youtube.com/get_video_info?video_id=${id}`;
      CliqzUtils.httpGet(youtubeurl, (x) => {
        if (x && x.responseText) {
          const videos = YoutubeApp.getLinks(x.responseText);
          if (videos.length) {
            CliqzUtils.openLink(CliqzUtils.getWindow(), videos[0].url, true, false, false, true);
          }
        }
      });
    });
    PeerComm.addObserver('YTDOWNLOADER', youtube);

    const tabsharing = new TabsharingApp(() => {}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.isPrivate) {
          CliqzUtils.openLink(CliqzUtils.getWindow(), tab.url, false, false, true);
        } else {
          CliqzUtils.openLink(CliqzUtils.getWindow(), tab.url, true);
        }
      });
    });
    PeerComm.addObserver('TABSHARING', tabsharing);

    CustomizableUI.createWidget({
      id: BTN_ID,
      defaultArea: CustomizableUI.AREA_PANEL,
      label: 'Connect',
      tooltiptext: 'Connect',
      onCommand: () => {
        CliqzUtils.openLink(CliqzUtils.getWindow(), 'about:preferences#connect', true, false, false, true);
        CliqzUtils.telemetry({
          type: 'burger_menu',
          version: 1,
          action: 'click',
          target: 'connect',
        });
      },
    });

    this.storage = new SimpleStorage();

    const observer = new PairingObserver();
    observer.onpaired = () => {
      CliqzUtils.telemetry({
        type: 'connect',
        version: 1,
        action: 'connect',
        is_success: true,
      });
    };
    PeerComm.addObserver('TELEMETRY', observer);

    return this.storage.open('data', ['cliqz', 'pairing'], true, true)
      .then(() => PeerComm.init(this.storage));
  },
  unload() {
    CustomizableUI.destroyWidget(BTN_ID);
    this.peerSlave.unload();
    this.storage.close();
    this.storage = null;
  },

  actions: {
    getPairingPeer() {
      return this.peerSlave;
    }
  }
});
