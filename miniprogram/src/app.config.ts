export default defineAppConfig({
  pages: [
    'pages/notes/index',
    'pages/create/index',
    'pages/mine/index',
    'pages/login/index',
    'pages/editor/index',
    'pages/quiz/index',
    'pages/voice/index',
    'pages/settings/index',
    'pages/users/index',
    'pages/tags-manage/index',
  ],
   usingComponents: {
    // 原生组件：Markdown/HTML 渲染库（仅微信端使用，H5 走自研渲染）
    towxml: 'components/towxml/towxml',
  },
  // 微信同声传译插件：录音页语音实时转文字（免费官方插件）
  plugins: {
    WechatSI: {
      version: '0.3.10',
      provider: 'wx069ba97219f66d99',
    },
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '笔记库',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#0d9488',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/notes/index',
        text: '笔记',
        iconPath: 'assets/tabbar/notes.png',
        selectedIconPath: 'assets/tabbar/notes-selected.png',
      },
      {
        pagePath: 'pages/create/index',
        text: '新建',
        iconPath: 'assets/tabbar/create.png',
        selectedIconPath: 'assets/tabbar/create-selected.png',
      },
      {
        pagePath: 'pages/quiz/index',
        text: '回想',
        iconPath: 'assets/tabbar/quiz.png',
        selectedIconPath: 'assets/tabbar/quiz-selected.png',
      },
      {
        pagePath: 'pages/voice/index',
        text: '录音',
        iconPath: 'assets/tabbar/voice.png',
        selectedIconPath: 'assets/tabbar/voice-selected.png',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.png',
        selectedIconPath: 'assets/tabbar/mine-selected.png',
      },
    ],
  },
});
