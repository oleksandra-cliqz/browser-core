import CliqzUnblock from 'unblock/main';
import YoutubeUnblocker from 'unblock/youtube';
import background from "core/base/background";
import { utils, events } from "core/cliqz";

/**
* @class Background
* @namespace unblock
*/
export default background({
  /**
  * @method init
  * @param settings
  */
  init(settings) {
    this.loadPlugins();
    CliqzUnblock.init(settings.unblockUI);
    this.onPrefChange = this.onPrefChange.bind(this);
  },

  enabled() {
    return CliqzUnblock.isEnabled();
  },

  /**
  * @method unload
  */
  unload() {
    CliqzUnblock.unload();
  },

  /**
  * @method loadPlugins
  */
  loadPlugins() {
    if (utils.getPref('unblock.plugin.youtube', true)) {
      CliqzUnblock.unblockers.push(new YoutubeUnblocker());
    }
  },

  /**
  * @method onPrefChange
  * @param pref
  */
  onPrefChange(pref) {
    if(pref == CliqzUnblock.PREF_MODE) {
      CliqzUnblock.onModeChanged();
    }
  },

  events: {
    "core.location_change": function(url) {
      CliqzUnblock.pageObserver(url);
    },
    "prefchange": function(pref) {
      this.onPrefChange(pref);
    }
  }
});
