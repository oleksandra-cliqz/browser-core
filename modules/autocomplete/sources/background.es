import utils from '../core/utils';
import environment from '../platform/environment';
import { isFirefox } from '../core/platform';
import autocomplete from './autocomplete';
import historyCluster from './history-cluster';
import ResultProviders from './result-providers';
import CliqzSearchCountryProviders from './cliqz-backends';
import Result from './result';
import WikipediaDeduplication from './wikipedia-deduplication';
import { background as AutocompleteBackground } from '../platform/auto-complete-component';
import background from '../core/base/background';
import Search from './search';
import ResultCache from './result-cache';

function onReady() {
  return new Promise((resolve) => {
    if (isFirefox && Services.search && Services.search.init) {
      Services.search.init(resolve);
    } else {
      resolve();
    }
  });
}


export default background({

  enabled() {
    return true;
  },

  init() {
    this.resultCache = new ResultCache();
    Search.fetchAndCacheResult = this.resultCache.getResult.bind(this.resultCache);
    Search.clearResultCache = this.resultCache.clear.bind(this.resultCache);
    this.autocomplete = autocomplete;
    this.autocomplete.setup();
    autocomplete.CliqzSearchCountryProviders = new CliqzSearchCountryProviders();
    return onReady().then(() => {
      autocomplete.CliqzResultProviders = new ResultProviders();
      AutocompleteBackground.init();
      if (isFirefox) {
        environment.RERANKERS.push(new WikipediaDeduplication());
      }

      autocomplete.CliqzHistoryCluster = historyCluster;

      // glueing stuff
      utils.autocomplete = autocomplete;
      utils.registerResultProvider({
        ResultProviders: autocomplete.CliqzResultProviders,
        Result,
      });
    });
  },

  unload() {
    AutocompleteBackground.unload();
  },

  beforeBrowserShutdown() {

  },

  actions: {
    search(query, cb) {
      const search = new Search();
      search.search(query, cb);
    },

    clearResultCache() {
      Search.clearResultCache();
    },

    /**
     * fetches extra info for result from rich header
     */
    getSnippet(query, result) {
      const loc = {
        latitude: utils.USER_LAT,
        longitude: utils.USER_LNG,
      };
      const url = utils.RICH_HEADER + utils.getRichHeaderQueryString(
        query,
        loc,
      );
      const resultData = {
        q: query,
        loc,
        results: [
          {
            url: result.url,
            snippet: {
              title: result.data.title,
              description: result.data.description,
            },
          }
        ],
      };
      return new Promise((resolve) => {
        utils.httpPut(url, resolve, JSON.stringify(resultData));
      }).then((request) => {
        const response = JSON.parse(request.response);
        const results = response.results;
        return results[0].snippet;
      });
    },
  },

  events: {
    'control-center:setDefault-search': function setDefaultSearchEngine(engine) {
      this.autocomplete.CliqzResultProviders.setCurrentSearchEngine(engine);
    },
    'control-center:setDefault-indexCountry': function setDefaultIndexCountry(country) {
      utils.setDefaultIndexCountry(country);
    },
    'core:urlbar_focus': function onUrlBarFocus() {
      if (isFirefox) {
        this.resultCache.clear();
      }
    },
    // there are a few places which can change some state and this state
    // must reset the whole result cache
    'core:reset_cache': function onResetCache() {
      if (isFirefox) {
        this.resultCache.clear();
      }
    },
  }
});
