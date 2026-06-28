import * as realLeaderboard from './leaderboard.js';
import * as realMap from './map.js';
import * as realProfile from './profile.js';
import * as realRealm from './realm.js';
import * as realShop from './shop.js';
import * as realStudy from './study.js';
import * as mockLeaderboard from './mock/leaderboard.js';
import * as mockMap from './mock/map.js';
import * as mockProfile from './mock/profile.js';
import * as mockRealm from './mock/realm.js';
import * as mockShop from './mock/shop.js';
import * as mockStudy from './mock/study.js';

const useMock = import.meta.env.VITE_USE_MOCK === 'true';

export const profileService = useMock ? mockProfile : realProfile;
export const realmService = useMock ? mockRealm : realRealm;
export const studyService = useMock ? mockStudy : realStudy;
export const shopService = useMock ? mockShop : realShop;
export const mapService = useMock ? mockMap : realMap;
export const leaderboardService = useMock ? mockLeaderboard : realLeaderboard;
