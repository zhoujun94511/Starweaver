/**
 * Declarative per-world atmospheric & lighting color profiles.
 * Centralizes planet sky, sun/moon, hemisphere fill, and fog palettes so adding
 * new worlds requires only a profile entry rather than duplicating system logic.
 */
export const WORLD_ATMOSPHERE_PROFILES = Object.freeze({
  desert: Object.freeze({
    zenithDay: '#183b6b',
    zenithDusk: '#1d2452',
    zenithStorm: '#6b482e',
    midDay: '#4f7ea8',
    midDusk: '#8c5068',
    overcastMid: '#6c7d91',
    stormMid: '#a86e44',
    horSunDay: '#ffbe78',
    horSunDusk: '#ff6e38',
    horSunStorm: '#e09358',
    horAwayDay: '#6e7399',
    horAwayDusk: '#3b3766',
    horAwayStorm: '#9c6844',
    sunNoon: '#fff0cf',
    sunDusk: '#ff8847',
    moon: '#8ec8ff',
    hemiSkyDay: '#bfdfff',
    hemiSkyNight: '#35568c',
    hemiSkyStorm: '#d49562',
    hemiGndDay: '#9e5632',
    hemiGndNight: '#161e33',
    fogDay: '#d89c72',
    fogDusk: '#965258',
    fogNight: '#0c1730',
    fogStorm: '#c9824b'
  }),
  homeworld: Object.freeze({
    zenithDawn: '#0c3878',
    zenithSunset: '#192858',
    midDawn: '#3b8be0',
    midSunset: '#965070',
    horSunDawn: '#ffe8bc',
    horSunSunset: '#ff7b3d',
    horAwayDawn: '#8ec8f6',
    horAwaySunset: '#4a3c73',
    groundHazeDawn: '#bce8d8',
    groundHazeSunset: '#d98c6c',
    cloudCoolDawn: '#ffffff',
    cloudCoolSunset: '#ffc499',
    cloudDarkDawn: '#88b2db',
    cloudDarkSunset: '#63436e',
    sunDawn: '#fff6df',
    sunSunset: '#ff944d',
    moon: '#96d4ff',
    hemiSkyDawn: '#c8ebff',
    hemiSkySunset: '#ffb58a',
    hemiSkyNight: '#3c68a8',
    hemiGndDawn: '#4c7d42',
    hemiGndSunset: '#5e4838',
    hemiGndNight: '#142b28',
    fogDawn: '#b8e6f8',
    fogSunset: '#e3956e',
    fogNight: '#0d2038'
  })
});
