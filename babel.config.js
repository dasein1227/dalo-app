// babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
      ['@babel/preset-typescript', { allowDeclareFields: true }], // ← 명시
    ],
    plugins: [
      'react-native-reanimated/plugin', // 항상 마지막
    ],
  };
};
