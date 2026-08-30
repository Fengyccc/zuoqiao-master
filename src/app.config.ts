export default defineAppConfig({
  pages: ['pages/index/index', 'pages/timer/index'],
  lazyCodeLoading: 'requiredComponents',
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#1a1a2e',
    navigationBarTitleText: '左桥大师',
    navigationBarTextStyle: 'white'
  }
})
